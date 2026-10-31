/**
 * scripts/build.mjs — 本番（dist）向けパフォーマンス最適化ビルド。
 *
 * 外部バンドラー（webpack / vite / esbuild 等）を使わず、Node.js 標準APIだけで：
 *   1. ESモジュール（js/main.js + js/modules/*.js）を「コア＋遅延チャンク」へ分割バンドル
 *   2. JS を軽量 minify（コメント除去＋行頭インデント削除）
 *   3. CSS 7ファイルを単一ファイルへ結合して minify
 *   4. index.html の参照を単一CSS/JSへ差し替え、リソースヒント（preload/prefetch）を追加
 *   5. Service Worker（sw.js）のキャッシュリストとバージョンを更新
 * を行う。
 *
 * 設計判断（理由）:
 *   - 外部依存を増やさないため、バンドルは「各モジュールを IIFE で包み、import/export を
 *     レジストリ参照へ書き換える」自前実装とする。当該コードは named import/export のみで
 *     default / export * / 循環参照が無いことを確認済みのため、シンプルな変換で成立する。
 *   - minify は意味を変えうる空白圧縮や変数名短縮を行わず、「コメント除去＋行頭インデント
 *     削除」に留める。改行を保持するため ASI（自動セミコロン挿入）起因の不具合を避け、
 *     既存機能を壊さないことを最優先する。
 *   - コード分割は「初回表示に不要な画面（ステージ/育成・素材計算）」を遅延チャンクへ分離し、
 *     初期表示で落とすJS量を削減する。チャンクはネイティブESモジュールとして動的 import()
 *     で読み込まれ、共有レジストリ（globalThis.__AK_MODS）と基準URL（__AK_BASE__）を
 *     コアバンドルと共有することで、i18n / app-state / storage 等の単一インスタンスを保つ。
 *   - 開発時（ルートを直接配信）はソース（未minify・未バンドル）をそのまま使い、本番（dist）
 *     だけが minify される。dist は本スクリプトの出力のみで構築する。
 */
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(projectRoot, 'dist');
const excluded = new Set(['.git', '.verdent', 'dist', 'node_modules', 'docs', 'scripts', 'verdent-design', '.gitignore', '.verdentc.json', 'LICENSE', 'README.md', 'package.json', 'package-lock.json']);

// CSS の結合順序。index.html の <link> 順（カスケード順）と一致させること。
const CSS_FILES = ['base.css', 'layout.css', 'components.css', 'database.css', 'materials.css', 'responsive.css', 'pwa.css'];

// バンドル対象のエントリ。js/main.js の静的 import を辿ってコアモジュールを回収する。
const ENTRY = 'js/main.js';

// ---------------------------------------------------------------------------
// 遅延チャンク定義。初期表示に不要な画面（ステージ/育成・素材計算・シナジー）を分離する。
//   entries: チャンクの依存閉包を決める入口モジュール（コアに含まれる共有モジュールは除外）
//   expose:  main.js が動的 import() で受け取る公開API（[export名, 定義モジュール]）
// ---------------------------------------------------------------------------
const CHUNKS = [
  {
    name: 'stages',
    outFile: 'js/chunks/stages.js',
    entries: ['js/modules/growth-ui.js', 'js/modules/stages.js', 'js/modules/templates.js'],
    expose: [
      ['initializeGrowthUI', 'js/modules/growth-ui.js'],
      ['initializeStagesUI', 'js/modules/stages.js'],
      ['loadTemplates', 'js/modules/templates.js']
    ]
  },
  {
    name: 'materials',
    outFile: 'js/chunks/materials.js',
    entries: ['js/modules/materials-ui.js'],
    expose: [
      ['initializeMaterialsUI', 'js/modules/materials-ui.js']
    ]
  }
];

// 動的 import() の解決済みモジュールID → チャンク の対応表（main.js の import 書換に使う）。
const dynamicImportMap = new Map();
for (const chunk of CHUNKS) {
  for (const entry of chunk.entries) dynamicImportMap.set(entry, chunk);
}

// ---------------------------------------------------------------------------
// 1. ソースを dist へコピー（従来挙動。その後で生成物を上書きする）
// ---------------------------------------------------------------------------
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
for (const entry of await readdir(projectRoot, { withFileTypes: true })) {
  if (excluded.has(entry.name)) continue;
  await cp(path.join(projectRoot, entry.name), path.join(outputDirectory, entry.name), { recursive: true });
}

// ---------------------------------------------------------------------------
// 2. JS バンドル
// ---------------------------------------------------------------------------

// このコードベースで使われている構文に限定した正規表現。
// （named import / named export のみ。default / export * / 循環参照は存在しない）
const IMPORT_RE = /import\s*\{([\s\S]*?)\}\s*from\s*(['"])([^'"]+)\2\s*;?/g;
const EXPORT_ASYNC_FN_RE = /export\s+async\s+function\s+([A-Za-z_$][\w$]*)/g;
const EXPORT_FN_RE = /export\s+function\s+([A-Za-z_$][\w$]*)/g;
const EXPORT_VAR_RE = /export\s+(const|let|var)\s+([A-Za-z_$][\w$]*(?:\s*,\s*[A-Za-z_$][\w$]*)*)/g;
const EXPORT_BRACE_RE = /export\s*\{([\s\S]*?)\}\s*;?/g;
const NEW_URL_META_RE = /new URL\(\s*(['"])([^'"]*)\1\s*,\s*import\.meta\.url\s*\)/g;
const DYNAMIC_IMPORT_RE = /import\(\s*(['"])([^'"]+)\1\s*\)/g;

/**
 * モジュールID（プロジェクトルートからの相対パス）から、import 指定子を解決する。
 * 例: js/main.js + ./modules/i18n.js → js/modules/i18n.js
 */
function resolveSpecifier(fromId, spec) {
  return path.posix.normalize(path.posix.join(path.posix.dirname(fromId), spec));
}

/**
 * import.meta.url を基準にした new URL('REL', import.meta.url) を、
 * バンドル共通のルート基準（__BASE__）へ解決し直す。バンドル後は import.meta.url が
 * js/main.js を指すため、元の ../../ 相対は成立しなくなる点を吸収する。
 */
function resolveDataUrl(fromId, rel) {
  const dir = path.posix.dirname(fromId); // 例: js/modules
  const resolved = path.posix.normalize(path.posix.join(dir, rel));
  return resolved === '.' || resolved === '' ? './' : resolved;
}

/** モジュールIDから、動的 import() 先チャンクへの相対指定子を求める。 */
function chunkSpecifier(fromId, outFile) {
  let rel = path.posix.relative(path.posix.dirname(fromId), outFile);
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

/**
 * エントリから到達可能な全モジュールを DFS で回収し、依存先が先に来る順（post-order）を返す。
 * @returns {{ modules: Map<string, string>, order: string[] }}
 */
function collectModules(entryId) {
  const modules = new Map();
  const order = [];
  (function visit(id) {
    if (modules.has(id)) return;
    const code = readFileSync(path.join(projectRoot, id), 'utf8');
    modules.set(id, code);
    for (const match of code.matchAll(IMPORT_RE)) {
      visit(resolveSpecifier(id, match[3]));
    }
    order.push(id);
  })(entryId);
  return { modules, order };
}

/**
 * 遅延チャンクの依存閉包を回収する。コアバンドルに含まれる共有モジュール（coreIds）は
 * 重複登録を避けるためスキップし、実行時に共有レジストリ経由で参照させる。
 */
function collectChunkModules(entryIds, coreIds) {
  const modules = new Map();
  const order = [];
  const visit = (id) => {
    if (modules.has(id)) return;
    if (coreIds.has(id)) return;
    const code = readFileSync(path.join(projectRoot, id), 'utf8');
    modules.set(id, code);
    for (const match of code.matchAll(IMPORT_RE)) {
      visit(resolveSpecifier(id, match[3]));
    }
    order.push(id);
  };
  for (const entryId of entryIds) visit(entryId);
  return { modules, order };
}

/** import の波括弧内（"a, b as c"）を {imported, local} の配列へ分解する。 */
function parseImportList(specList) {
  return specList.split(',').map((item) => {
    const [imported, local] = item.trim().split(/\s+as\s+/);
    return { imported: imported.trim(), local: (local ?? imported).trim() };
  }).filter((b) => b.imported);
}

/** 動的 import('./modules/x.js') を、対応する遅延チャンクへの相対 import に書き換える。 */
function rewriteDynamicImports(id, code, importMap) {
  return code.replace(DYNAMIC_IMPORT_RE, (match, _q, spec) => {
    const chunk = importMap.get(resolveSpecifier(id, spec));
    if (!chunk) return match;
    return `import(${JSON.stringify(chunkSpecifier(id, chunk.outFile))})`;
  });
}

/**
 * 1モジュールをバンドル用の IIFE へ変換する。
 *   - import {...} → const {...} = __mods['依存先'];
 *   - export 宣言 → 通常の宣言へ戻し、export 名を収集して末尾の return に列挙
 *   - export { a } → ローカル束縛 a をそのまま再輸出（return に列挙）
 *   - import('./modules/x.js') → 遅延チャンクへの相対 import へ書換
 */
function transformModule(id, code, importMap) {
  const imports = [];
  const exports = [];

  code = code.replace(IMPORT_RE, (_m, specList, _q, spec) => {
    imports.push({ resolved: resolveSpecifier(id, spec), bindings: parseImportList(specList) });
    return '';
  });
  if (importMap) code = rewriteDynamicImports(id, code, importMap);
  code = code.replace(EXPORT_ASYNC_FN_RE, (_m, name) => { exports.push([name, name]); return `async function ${name}`; });
  code = code.replace(EXPORT_FN_RE, (_m, name) => { exports.push([name, name]); return `function ${name}`; });
  code = code.replace(EXPORT_VAR_RE, (_m, kind, names) => {
    for (const name of names.split(',')) { const n = name.trim(); if (n) exports.push([n, n]); }
    return `${kind} ${names}`;
  });
  code = code.replace(EXPORT_BRACE_RE, (_m, list) => {
    for (const item of list.split(',')) {
      const parts = item.trim().split(/\s+as\s+/);
      const local = parts[0].trim();
      const exported = (parts[1] ?? parts[0]).trim();
      if (local) exports.push([exported, local]);
    }
    return '';
  });

  let metaWarned = false;
  code = code.replace(NEW_URL_META_RE, (_m, _q, rel) => `new URL('${resolveDataUrl(id, rel)}', __BASE__)`);
  code = code.replace(/import\.meta\.url/g, () => {
    if (!metaWarned) { metaWarned = true; console.warn(`  [build] 未処理の import.meta.url を __BASE__ へ置換: ${id}`); }
    return '__BASE__';
  });

  const importLines = imports.map(({ resolved, bindings }) => {
    const entries = bindings.map(({ imported, local }) => imported === local ? local : `${imported}: ${local}`).join(', ');
    return `const { ${entries} } = __mods['${resolved}'];`;
  }).join('\n');

  const exportObj = exports.length
    ? `{ ${exports.map(([e, l]) => (e === l ? e : `${e}: ${l}`)).join(', ')} }`
    : '{}';

  const body = [
    `__mods['${id}'] = (() => {`,
    importLines,
    code.trim(),
    `return ${exportObj};`,
    '})();'
  ].filter((line) => line !== '').join('\n');

  return body;
}

/** コアバンドルを組み立てる（globalThis 上の共有レジストリと基準URLを初期化）。 */
function bundleCore(core) {
  const header = [
    'const __mods = globalThis.__AK_MODS || (globalThis.__AK_MODS = {});',
    "const __BASE__ = globalThis.__AK_BASE__ || (globalThis.__AK_BASE__ = new URL('../', import.meta.url).href);"
  ].join('\n');
  const parts = [header];
  for (const id of core.order) {
    parts.push(transformModule(id, core.modules.get(id), dynamicImportMap));
  }
  return parts.join('\n\n');
}

/** 遅延チャンクを組み立てる。共有レジストリへ登録しつつ、公開APIを named export で返す。 */
function bundleChunk(chunk, coreIds) {
  const { modules, order } = collectChunkModules(chunk.entries, coreIds);
  const header = [
    'const __mods = globalThis.__AK_MODS || (globalThis.__AK_MODS = {});',
    'const __BASE__ = globalThis.__AK_BASE__;'
  ].join('\n');
  const parts = [header];
  for (const id of order) {
    parts.push(transformModule(id, modules.get(id)));
  }
  for (const [exportName, moduleId] of chunk.expose) {
    parts.push(`export const ${exportName} = __mods['${moduleId}'].${exportName};`);
  }
  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// 3. JS minify（コメント除去＋行頭インデント削除。文字列・テンプレートは追跡して安全に）
// ---------------------------------------------------------------------------

/**
 * コメント（// と /* *&#47;）を除去する。文字列リテラル・テンプレートリテラル
 * （${} 補間の入れ子含む）の中は追跡して、URL 等の "//" を誤って削らないようにする。
 * 改行は保持する（ASI 起因の不具合を避ける）。
 */
function stripJsComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;

  // 行コメント判定。正規表現リテラル /\//g（スラッシュをエスケープしてマッチ）は
  // 連続した "//" を含むため、直前がバックスラッシュ（エスケープされた / ）の場合は
  // コメントと見なさない。エスケープされない "/" が正規表現本体に現れることは無い。
  const isLineCommentStart = (pos) => src[pos] === '/' && src[pos + 1] === '/' && src[pos - 1] !== '\\';

  const readEscaped = () => {
    // バックスラッシュ＋次の1文字をそのまま写す
    out += src[i];
    i += 1;
    if (i < n) { out += src[i]; i += 1; }
  };

  const readQuoted = (quote) => {
    out += quote;
    i += 1;
    while (i < n) {
      const ch = src[i];
      out += ch;
      i += 1;
      if (ch === '\\') { if (i < n) { out += src[i]; i += 1; } continue; }
      if (ch === quote) break;
    }
  };

  const readTemplate = () => {
    out += '`';
    i += 1;
    while (i < n) {
      const ch = src[i];
      if (ch === '\\') { readEscaped(); continue; }
      if (ch === '`') { out += ch; i += 1; return; }
      if (ch === '$' && src[i + 1] === '{') {
        out += '${';
        i += 2;
        readInterpolation();
        continue;
      }
      out += ch;
      i += 1;
    }
  };

  // ${...} 補間内は通常コードとして扱う（波括弧の深さを追跡し、入れ子の文字列・
  // テンプレート・コメントにも対応する）。
  const readInterpolation = () => {
    let depth = 1;
    while (i < n) {
      const ch = src[i];
      if (isLineCommentStart(i)) { i += 2; while (i < n && src[i] !== '\n') i += 1; continue; }
      if (ch === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1; i += 2; continue; }
      if (ch === "'" || ch === '"') { readQuoted(ch); continue; }
      if (ch === '`') { readTemplate(); continue; }
      if (ch === '{') { depth += 1; out += ch; i += 1; continue; }
      if (ch === '}') { depth -= 1; out += ch; i += 1; if (depth === 0) return; continue; }
      out += ch;
      i += 1;
    }
  };

  while (i < n) {
    const ch = src[i];
    if (isLineCommentStart(i)) { i += 2; while (i < n && src[i] !== '\n') i += 1; continue; }
    if (ch === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1; i += 2; continue; }
    if (ch === "'" || ch === '"') { readQuoted(ch); continue; }
    if (ch === '`') { readTemplate(); continue; }
    out += ch;
    i += 1;
  }
  return out;
}

/** コメント除去＋行単位の前後空白削除（改行は保持）。 */
function minifyJs(code) {
  return stripJsComments(code)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

// ---------------------------------------------------------------------------
// 4. CSS 結合・minify
// ---------------------------------------------------------------------------

/** CSS コメント除去＋空白圧縮。このコードベースの文字列は content: ""（空）のみで、
 *  有意な空白を含む文字列や url() が無いことを確認済み。 */
function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>+~])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

async function buildCss() {
  const parts = [];
  for (const file of CSS_FILES) {
    parts.push(await readFile(path.join(outputDirectory, 'css', file), 'utf8'));
  }
  return minifyCss(parts.join('\n'));
}

// ---------------------------------------------------------------------------
// 5. index.html の差し替え（単一CSS/JS 参照＋リソースヒント）
// ---------------------------------------------------------------------------

const HTML_LINKS = [
  '    <link rel="modulepreload" href="./js/main.js">',
  '    <link rel="preload" href="./data/operators.json" as="fetch">',
  '    <link rel="preload" href="./data/i18n.json" as="fetch">',
  '    <link rel="preload" href="./data/scoring-config.json" as="fetch">',
  '    <link rel="preload" href="./data/regions.json" as="fetch">',
  '    <link rel="prefetch" href="./js/chunks/stages.js" as="script">',
  '    <link rel="prefetch" href="./js/chunks/materials.js" as="script">',
  '    <link rel="prefetch" href="./data/stages.json" as="fetch">',
  '    <link rel="prefetch" href="./data/materials.json" as="fetch">',
  '    <link rel="prefetch" href="./data/templates.json" as="fetch">',
  '    <link rel="stylesheet" href="./css/app.css">'
].join('\n');

async function rewriteHtml() {
  const file = path.join(outputDirectory, 'index.html');
  let html = await readFile(file, 'utf8');
  html = html.replace(
    /<link rel="stylesheet" href="\.\/css\/base\.css">[\s\S]*?<link rel="stylesheet" href="\.\/css\/pwa\.css">/,
    HTML_LINKS
  );
  await writeFile(file, html);
}

// ---------------------------------------------------------------------------
// 6. Service Worker のキャッシュリスト更新
// ---------------------------------------------------------------------------

const SW_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './sw.js',
  './favicon.svg',
  './assets/favicon.ico',
  './assets/favicon.png',
  './assets/apple-touch-icon.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-192.png',
  './assets/icon-maskable-512.png',
  './css/app.css',
  './data/i18n.json',
  './data/materials.json',
  './data/operators.json',
  './data/regions.json',
  './data/scoring-config.json',
  './data/stages.json',
  './data/templates.json',
  './js/main.js',
  ...CHUNKS.map((chunk) => `./${chunk.outFile}`)
];

async function rewriteSw() {
  const file = path.join(outputDirectory, 'sw.js');
  let sw = await readFile(file, 'utf8');
  // キャッシュバージョンはビルド成果物の内容ハッシュから導出する。
  // アセットが変われば必ずハッシュも変わるため、過去の「固定バージョンで
  // SWキャッシュが更新されず、修正が反映されない」問題を防ぐ。
  // ハッシュ対象からはディレクトリ（'./'）と sw.js 自身を除く。
  const hash = createHash('sha256');
  for (const asset of SW_ASSETS) {
    if (asset === './' || asset === './sw.js') continue;
    const assetPath = path.join(outputDirectory, asset.replace(/^\.\//, ''));
    hash.update(await readFile(assetPath));
  }
  const cacheVersion = hash.digest('hex').slice(0, 12);
  sw = sw.replace(/const CACHE_VERSION = '[^']+';/, `const CACHE_VERSION = '${cacheVersion}';`);
  const assets = SW_ASSETS.map((asset) => `  '${asset}'`).join(',\n');
  sw = sw.replace(/const APP_ASSETS = \[[\s\S]*?\];/, `const APP_ASSETS = [\n${assets}\n];`);
  await writeFile(file, sw);
}

// ---------------------------------------------------------------------------
// 7. 実行
// ---------------------------------------------------------------------------
const core = collectModules(ENTRY);
const coreIds = new Set(core.modules.keys());

await writeFile(
  path.join(outputDirectory, 'js', 'main.js'),
  '/* Arknights Team Builder — bundled JS (generated by scripts/build.mjs, do not edit). Source: js/main.js + js/modules/*.js */\n' + minifyJs(bundleCore(core))
);

await writeFile(path.join(outputDirectory, 'css', 'app.css'), await buildCss());

// 遅延チャンクを生成（初回表示に不要な画面のモジュール群）。
await mkdir(path.join(outputDirectory, 'js', 'chunks'), { recursive: true });
for (const chunk of CHUNKS) {
  await writeFile(
    path.join(outputDirectory, chunk.outFile),
    `/* Arknights Team Builder — lazy chunk "${chunk.name}" (generated by scripts/build.mjs, do not edit). */\n` + minifyJs(bundleChunk(chunk, coreIds))
  );
}

// 個別CSSとモジュール群はバンドル後は不要なので dist から除去する。
for (const file of CSS_FILES) await rm(path.join(outputDirectory, 'css', file), { force: true });
await rm(path.join(outputDirectory, 'js', 'modules'), { recursive: true, force: true });

await rewriteHtml();
await rewriteSw();

console.log('[build] dist を最適化ビルドしました:');
console.log(`  - js/main.js            (コアバンドル + minify)`);
for (const chunk of CHUNKS) {
  console.log(`  - ${chunk.outFile}  (遅延チャンク + minify)`);
}
console.log('  - css/app.css           (結合 + minify)');
console.log('  - index.html            (単一参照 + preload/prefetch)');
console.log('  - sw.js                 (キャッシュリスト更新)');
