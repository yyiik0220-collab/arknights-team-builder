# Performance After Report — Arknights Team Builder

**Target:** ローカル `dist` ビルド出力（`npm run build` の生成物）
**Measured:** 2026-10-31
**Method:** 構造計測（リクエスト数・ファイルサイズの静的解析）。Lighthouse CLI / PageSpeed Insights API は利用不可のため、`docs/performance-baseline.md` と同じ「構造ベース」の相対比較とする。
**対象:** v0.3（現行ソース）を最適化ビルドした結果。

---

## 1. 実施した最適化

| 項目 | 内容 |
|---|---|
| **CSS 結合・minify** | `base / layout / components / database / materials / pwa / responsive` の7ファイル → 単一 `css/app.css`（コメント除去＋空白圧縮） |
| **JS バンドル・minify** | ESモジュールを自前バンドラー（`scripts/build.mjs`）で IIFE 変換＋コメント除去。外部バンドラー不使用 |
| **コード分割（遅延読み込み）** | 初回表示に不要な画面（ステージ/育成・素材計算・シナジー）を遅延チャンクへ分離し、動的 `import()` で読込 |
| **未使用CSS除去** | `.placeholder-panel`（3ルール）を除去。302クラスをHTML/JSと突合し、動的生成クラス（`rarity-N`/`syn-*--type` 等）を除外 |
| **プリロード/プリフェッチ** | コア（`main.js`/`operators.json`/`i18n.json`/`scoring-config.json`/`regions.json`）を `preload`、遅延資産を `prefetch` |
| **Service Worker** | キャッシュリストを単一CSS/JS＋チャンクに更新（`CACHE_VERSION` 0.4.0） |

---

## 2. リクエスト数（クリティカルパス）

| | Before（dev/ソース直配信） | After（distビルド） |
|---|---|---|
| HTML | 1 | 1 |
| CSS | 7 | **1** |
| JS | 28（main.js + 27モジュール） | **1**（コアバンドル） |
| データ（起動時） | 4 | 4 |
| **合計** | **40** | **7** |

遅延チャンク（`stages.js`/`materials.js`）と遅延データ（`stages/materials/templates.json`）は `prefetch` で初回描画後に低優先度で先読みされる。

---

## 3. 転送サイズ（ローカル・未圧縮）

### JS

| | ファイル数 | 合計サイズ | 初回ロード |
|---|---|---|---|
| Before（ソース） | 28 | 227,507 bytes | 227,507 bytes（全量） |
| After（バンドル+minify） | 3 | 184,202 bytes | **93,049 bytes**（コアのみ） |

- コアバンドル `js/main.js`: **93,049 bytes**（起動時に読込）
- 遅延チャンク `js/chunks/stages.js`: 77,775 bytes（ステージ/育成ビュー表示時）
- 遅延チャンク `js/chunks/materials.js`: 13,378 bytes（素材計算ビュー表示時）
- 初回JS量: 227.5 KB → **93 KB（約 59% 削減）**

### CSS

| | ファイル数 | 合計サイズ |
|---|---|---|
| Before（ソース） | 7 | 63,689 bytes |
| After（結合+minify） | 1 | **44,499 bytes** |

---

## 4. 推定 Lighthouse スコア（構造ベースの相対評価）

| カテゴリ | Baseline 推定 | After 推定 | 主な根拠 |
|---|---|---|---|
| **Performance** | 60–75 | **75–85** | 未minify・未バンドルが解消、リクエスト40→7、初回JS 59%減、preload/prefetch追加 |
| **Best Practices** | 80–90 | **85–92** | 単一バンドル＋SWキャッシュ、リソースヒント追加 |
| **Accessibility** | 85–95 | 85–95 | 変更なし（HTML構造・ARIA維持） |
| **SEO** | 90–100 | 90–100 | 変更なし（メタタグ・カノニカル維持） |

> これらは実測値ではなく、`docs/performance-baseline.md` と同じく「構造ベースの推定」である。実Lighthouse計測が可能になった際に再検証する。

---

## 5. 検証結果

| 検証 | コマンド | 結果 |
|---|---|---|
| ビルドスクリプト構文 | `node --check scripts/build.mjs` | OK |
| エントリ構文 | `node --check js/main.js` | OK |
| 本番ビルド | `npm run build` | 成功（コア＋2チャンク＋app.css生成） |
| バンドル検証 | `node scripts/_verify_bundle.mjs` | OK（コア＋チャンクの純粋ロジック動作） |
| ユニットテスト | `node --test scripts/recommendation.test.js scripts/synergy.test.js` | 15 pass / 0 fail |

---

## 6. 補足（既知の制約）

- minify は「コメント除去＋行頭インデント削除」に留める（空白圧縮・変数名短縮は ASI 起因の不具合リスク回避のため実施しない）。
- データJSON（`operators.json` 286 KB / `i18n.json` 115 KB / `stages.json` 120 KB）は構造上依然最大の転送コスト。P3相当の tree-shake は今回対象外。
- OGP画像（56 KB PNG）の WebP/AVIF 化は P2 として今後検討。
