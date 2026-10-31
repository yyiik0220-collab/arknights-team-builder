/**
 * qr.js — 外部ライブラリ非依存の QR コード（Model 2）エンコーダーと Canvas 描画。
 *
 * 方針:
 *   - バイトモード（8-bit byte mode）のみ対応。編成共有URLのような短い文字列を想定。
 *   - 誤り訂正レベルは M（約15%復元）。URL用途には十分な冗長性。
 *   - バージョン 1〜13 をサポート（最大 334 データコードワード、byteモードで数百バイト）。
 *   - Reed-Solomon 誤り訂正、マスク選択（8種のペナルティ評価）、
 *     形式情報・バージョン情報の埋め込みまで一通り自前実装する。
 *   - 描画は Canvas 2D を使い、黒モジュールを濃色、背景を白で塗る（読取精度を優先）。
 */

// 誤り訂正レベルの形式情報用 2bit インジケータ（ISO/IEC 18004 表25）。
const EC_LEVEL_BITS = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };

const MAX_VERSION = 13;

/**
 * Reed-Solomon ブロック構成表（バージョン 1〜13）。
 * 各エントリは `{ L: {ec, groups}, M: {...}, Q: {...}, H: {...} }` の形で、
 * `groups` は `[ブロック数, ブロックあたりデータコードワード数]` の組の配列。
 * `ec` はブロックあたりの誤り訂正コードワード数。
 * 出典: ISO/IEC 18004 表9（バイトモード容量）。
 */
const RS_BLOCK_TABLE = [
  { L: { ec: 7,  groups: [[1, 19]] },               M: { ec: 10, groups: [[1, 16]] },               Q: { ec: 13, groups: [[1, 13]] },               H: { ec: 17, groups: [[1, 9]] } },
  { L: { ec: 10, groups: [[1, 34]] },               M: { ec: 16, groups: [[1, 28]] },               Q: { ec: 22, groups: [[1, 22]] },               H: { ec: 28, groups: [[1, 16]] } },
  { L: { ec: 15, groups: [[1, 55]] },               M: { ec: 26, groups: [[1, 44]] },               Q: { ec: 18, groups: [[2, 17]] },               H: { ec: 22, groups: [[2, 13]] } },
  { L: { ec: 20, groups: [[1, 80]] },               M: { ec: 18, groups: [[2, 32]] },               Q: { ec: 26, groups: [[2, 24]] },               H: { ec: 16, groups: [[4, 9]] } },
  { L: { ec: 26, groups: [[1, 108]] },              M: { ec: 24, groups: [[2, 43]] },               Q: { ec: 18, groups: [[2, 15], [2, 16]] },      H: { ec: 22, groups: [[2, 11], [2, 12]] } },
  { L: { ec: 18, groups: [[2, 68]] },               M: { ec: 16, groups: [[4, 27]] },               Q: { ec: 24, groups: [[4, 19]] },               H: { ec: 28, groups: [[4, 15]] } },
  { L: { ec: 20, groups: [[2, 78]] },               M: { ec: 18, groups: [[4, 31]] },               Q: { ec: 18, groups: [[2, 14], [4, 15]] },      H: { ec: 26, groups: [[4, 13], [1, 14]] } },
  { L: { ec: 24, groups: [[2, 97]] },               M: { ec: 22, groups: [[2, 38], [2, 39]] },      Q: { ec: 22, groups: [[4, 18], [2, 19]] },      H: { ec: 26, groups: [[4, 14], [2, 15]] } },
  { L: { ec: 30, groups: [[2, 116]] },              M: { ec: 22, groups: [[3, 36], [2, 37]] },      Q: { ec: 20, groups: [[4, 16], [4, 17]] },      H: { ec: 24, groups: [[4, 12], [4, 13]] } },
  { L: { ec: 18, groups: [[2, 68], [2, 69]] },      M: { ec: 26, groups: [[4, 43], [1, 44]] },      Q: { ec: 24, groups: [[6, 19], [2, 20]] },      H: { ec: 28, groups: [[6, 15], [2, 16]] } },
  { L: { ec: 20, groups: [[4, 81]] },               M: { ec: 30, groups: [[1, 50], [4, 51]] },      Q: { ec: 28, groups: [[4, 22], [4, 23]] },      H: { ec: 24, groups: [[3, 12], [8, 13]] } },
  { L: { ec: 24, groups: [[2, 92], [2, 93]] },      M: { ec: 22, groups: [[6, 36], [2, 37]] },      Q: { ec: 26, groups: [[4, 20], [6, 21]] },      H: { ec: 28, groups: [[7, 14], [4, 15]] } },
  { L: { ec: 26, groups: [[4, 107]] },              M: { ec: 22, groups: [[8, 37], [1, 38]] },      Q: { ec: 24, groups: [[8, 20], [4, 21]] },      H: { ec: 22, groups: [[12, 11], [4, 12]] } },
];

// アライメントパターン中心座標（バージョンごと、最後は size-7）。バージョン1は無し。
const ALIGNMENT_POSITIONS = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
];

// バージョン情報（18bit）。バージョン 7〜13 のみ。ISO/IEC 18004 表D.1 の既知値。
const VERSION_INFO = {
  7: 0x07C94,
  8: 0x085BC,
  9: 0x09A99,
  10: 0x0A4D3,
  11: 0x0BBF6,
  12: 0x0C762,
  13: 0x0D847,
};

// 8種のマスクパターン。引数は (row, col)、true ならビット反転。
const MASK_FUNCTIONS = [
  (r, c) => (r + c) % 2 === 0,
  (r, c) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

// 形式情報（15bit）の埋め込み座標。bits[0] が MSB。第1コピー（左上ファインダー周辺）。
const FORMAT_POSITION_1 = [
  [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
  [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
];

// ---- Galois Field GF(256)（原始多項式 0x11D） ---------------------------------
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11D;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
}

function gfMultiply(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** 生成多項式 g(x)=∏(x+α^i) を「定数項から昇べき」の配列で返す（length = degree+1）。 */
function generatorPolynomial(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= gfMultiply(poly[j], EXP[i]); // poly[j] * α^i（同次数）
      next[j + 1] ^= poly[j];                 // poly[j] * x（次数+1）
    }
    poly = next;
  }
  return poly;
}

/** data の RS 剰余（誤り訂正コードワード）を昇べき配列で返す。 */
function reedSolomonRemainder(data, ecCount) {
  const gen = generatorPolynomial(ecCount);
  const buffer = data.concat(new Array(ecCount).fill(0));
  for (let i = buffer.length - 1; i >= ecCount; i -= 1) {
    const coef = buffer[i];
    if (coef === 0) continue;
    for (let j = 0; j <= ecCount; j += 1) {
      buffer[i - ecCount + j] ^= gfMultiply(gen[j], coef);
    }
  }
  return buffer.slice(0, ecCount);
}

// ---- データコードワードの生成 -------------------------------------------------

function totalDataCodewords(version, ecLevel) {
  return RS_BLOCK_TABLE[version - 1][ecLevel].groups
    .reduce((sum, [count, dataCodewords]) => sum + count * dataCodewords, 0);
}

/** 指定バイト長を収容できる最小バージョンを返す。無ければ null。 */
function chooseVersion(byteLength, ecLevel) {
  for (let version = 1; version <= MAX_VERSION; version += 1) {
    const countBits = version <= 9 ? 8 : 16;
    const capacityBits = totalDataCodewords(version, ecLevel) * 8;
    if (capacityBits >= 4 + countBits + byteLength * 8) return version;
  }
  return null;
}

/** バイト列を QR のデータコードワード（終端・パディング込み）へ変換する。 */
function encodeDataBytes(bytes, version, ecLevel) {
  const capacityBits = totalDataCodewords(version, ecLevel) * 8;
  const bits = [];
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };
  push(0b0100, 4);                              // モード指示子: バイトモード
  push(bytes.length, version <= 9 ? 8 : 16);    // 文字数（バイト数）
  for (const byte of bytes) push(byte, 8);
  const terminator = Math.min(4, capacityBits - bits.length);
  for (let i = 0; i < terminator; i += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);   // バイト境界へ
  const pads = [0xEC, 0x11];                    // 交互のパディングコードワード
  let padIndex = 0;
  while (bits.length < capacityBits) {
    push(pads[padIndex % 2], 8);
    padIndex += 1;
  }
  const out = [];
  for (let i = 0; i < capacityBits; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
    out.push(byte);
  }
  return out;
}

/** データコードワードをブロック分割→RS付与→インターリーブする。 */
function buildCodewords(dataBytes, version, ecLevel) {
  const spec = RS_BLOCK_TABLE[version - 1][ecLevel];
  const blocks = [];
  let offset = 0;
  for (const [count, dataCodewords] of spec.groups) {
    for (let b = 0; b < count; b += 1) {
      const data = dataBytes.slice(offset, offset + dataCodewords);
      offset += dataCodewords;
      blocks.push({ data, ec: reedSolomonRemainder(data, spec.ec) });
    }
  }
  const dataOut = [];
  const maxDataLength = Math.max(...blocks.map((block) => block.data.length));
  for (let i = 0; i < maxDataLength; i += 1) {
    for (const block of blocks) if (i < block.data.length) dataOut.push(block.data[i]);
  }
  const ecOut = [];
  for (let i = 0; i < spec.ec; i += 1) {
    for (const block of blocks) ecOut.push(block.ec[i]);
  }
  return dataOut.concat(ecOut);
}

// ---- マトリクス構築 ------------------------------------------------------------

function matrixSize(version) {
  return 17 + 4 * version;
}

function placeFinder(modules, row, col) {
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || rr >= modules.length || cc < 0 || cc >= modules.length) continue;
      const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      const dark = inside && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      modules[rr][cc] = dark;
    }
  }
}

function placeAlignment(modules, centerRow, centerCol) {
  for (let r = -2; r <= 2; r += 1) {
    for (let c = -2; c <= 2; c += 1) {
      const dark = Math.max(Math.abs(r), Math.abs(c)) !== 1;
      modules[centerRow + r][centerCol + c] = dark;
    }
  }
}

/** ファインダー・タイミング・アライメント・ダークモジュール・形式/版情報領域を配置し、
 *  関数パターンセルの位置（isFunction）を返す。 */
function buildFunctionMatrix(version) {
  const size = matrixSize(version);
  const modules = Array.from({ length: size }, () => new Array(size).fill(null));

  placeFinder(modules, 0, 0);
  placeFinder(modules, 0, size - 7);
  placeFinder(modules, size - 7, 0);

  // タイミングパターン
  for (let i = 8; i < size - 8; i += 1) {
    modules[6][i] = i % 2 === 0;
    modules[i][6] = i % 2 === 0;
  }

  // アライメントパターン（ファインダーと重なる3角を除く）
  if (version > 1) {
    const positions = ALIGNMENT_POSITIONS[version - 1];
    for (const r of positions) {
      for (const c of positions) {
        const isCorner = (r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6);
        if (!isCorner) placeAlignment(modules, r, c);
      }
    }
  }

  // ダークモジュール（常に暗）
  modules[size - 8][8] = true;

  // 形式情報・バージョン情報のセルを予約（関数パターン扱い）。後で上書きする。
  const formatCells = formatCellsCoordinates(size);
  for (const [r, c] of formatCells) modules[r][c] = false;
  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const row = i % 6;
      const col = Math.floor(i / 6);
      modules[row][size - 11 + col] = false;
      modules[size - 11 + col][row] = false;
    }
  }

  const isFunction = modules.map((row) => row.map((value) => value !== null));
  return { modules, isFunction, size };
}

/** 形式情報 15bit の座標一覧（第1・第2コピー）。 */
function formatCellsCoordinates(size) {
  const second = [
    [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8], [size - 5, 8], [size - 6, 8], [size - 7, 8],
    [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1],
  ];
  return FORMAT_POSITION_1.concat(second);
}

/** データビットをジグザグ走査で配置する。 */
function placeData(modules, isFunction, codewords) {
  const size = modules.length;
  let bitIndex = 0;
  let col = size - 1;
  let upward = true;
  const getBit = (byteIndex, bitOffset) => (codewords[byteIndex] >> bitOffset) & 1;
  while (col > 0) {
    if (col === 6) col -= 1; // タイミング列をスキップ
    for (let i = 0; i < size; i += 1) {
      const row = upward ? size - 1 - i : i;
      for (let c = 0; c < 2; c += 1) {
        const cc = col - c;
        if (modules[row][cc] === null) {
          const byteIndex = Math.floor(bitIndex / 8);
          const bitOffset = 7 - (bitIndex % 8);
          modules[row][cc] = Boolean(getBit(byteIndex, bitOffset));
          bitIndex += 1;
        }
      }
    }
    upward = !upward;
    col -= 2;
  }
}

/** 形式情報（15bit）を計算する。 */
function formatInfo(ecLevel, mask) {
  const data5 = (EC_LEVEL_BITS[ecLevel] << 3) | mask;
  // BCH(15,5)：生成多項式 0x537 で剰余を求め、0x5412 でマスク。
  let dividend = data5 << 10;
  const divisor = 0x537;
  for (let i = 14; i >= 10; i -= 1) {
    if ((dividend >> i) & 1) dividend ^= divisor << (i - 10);
  }
  const remainder = dividend & 0x3FF;
  return ((data5 << 10) | remainder) ^ 0x5412;
}

function writeFormatInfo(modules, ecLevel, mask) {
  const value = formatInfo(ecLevel, mask);
  const bits = [];
  for (let i = 14; i >= 0; i -= 1) bits.push((value >> i) & 1);
  const coordinates = formatCellsCoordinates(modules.length);
  for (let i = 0; i < 15; i += 1) {
    const [r, c] = coordinates[i];
    modules[r][c] = bits[i] === 1;
  }
}

function writeVersionInfo(modules, version) {
  if (version < 7) return;
  const value = VERSION_INFO[version];
  const bits = [];
  for (let i = 17; i >= 0; i -= 1) bits.push((value >> i) & 1);
  const size = modules.length;
  for (let i = 0; i < 18; i += 1) {
    const row = i % 6;
    const col = Math.floor(i / 6);
    modules[row][size - 11 + col] = bits[i] === 1;
    modules[size - 11 + col][row] = bits[i] === 1;
  }
}

// ---- マスク評価（ISO/IEC 18004 §8.8.2 のペナルティ） ---------------------------

function penaltyScore(matrix) {
  const size = matrix.length;
  let score = 0;

  // N1: 行・列の同色連続（5以上で 3 + (長さ-5)）
  const runPenalty = (cells) => {
    let run = 1;
    let prev = cells[0];
    let total = 0;
    for (let i = 1; i < cells.length; i += 1) {
      if (cells[i] === prev) run += 1;
      else {
        if (run >= 5) total += 3 + (run - 5);
        run = 1;
        prev = cells[i];
      }
    }
    if (run >= 5) total += 3 + (run - 5);
    return total;
  };
  for (let r = 0; r < size; r += 1) score += runPenalty(matrix[r]);
  for (let c = 0; c < size; c += 1) {
    const column = [];
    for (let r = 0; r < size; r += 1) column.push(matrix[r][c]);
    score += runPenalty(column);
  }

  // N2: 2×2 同色ブロック
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      if (matrix[r][c] === matrix[r][c + 1] && matrix[r][c] === matrix[r + 1][c] && matrix[r][c] === matrix[r + 1][c + 1]) {
        score += 3;
      }
    }
  }

  // N3: ファインダー類似パターン 1:1:3:1:1（前後に4連続の明を含む）を 40 加点
  const isFinderLike = (line) => {
    let count = 0;
    for (let i = 0; i + 6 < line.length; i += 1) {
      if (line[i] && !line[i + 1] && line[i + 2] && line[i + 3] && line[i + 4] && !line[i + 5] && line[i + 6]) {
        const beforeLight = i === 0 || (!line[i - 4] && !line[i - 3] && !line[i - 2] && !line[i - 1]);
        const afterLight = i + 10 >= line.length || (!line[i + 7] && !line[i + 8] && !line[i + 9] && !line[i + 10]);
        if (beforeLight || afterLight) count += 1;
      }
    }
    return count;
  };
  for (let r = 0; r < size; r += 1) score += isFinderLike(matrix[r]) * 40;
  for (let c = 0; c < size; c += 1) {
    const column = [];
    for (let r = 0; r < size; r += 1) column.push(matrix[r][c]);
    score += isFinderLike(column) * 40;
  }

  // N4: 暗モジュールの割合が 50% から離れるほど加点
  let dark = 0;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) if (matrix[r][c]) dark += 1;
  }
  const percent = (dark * 100) / (size * size);
  const lower = Math.floor(percent / 5) * 5;
  const upper = lower + 5;
  score += Math.min(Math.abs(lower - 50) / 5, Math.abs(upper - 50) / 5) * 10;
  return score;
}

function applyMask(modules, isFunction, mask) {
  const size = modules.length;
  const out = modules.map((row) => row.slice());
  const maskFn = MASK_FUNCTIONS[mask];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (!isFunction[r][c]) out[r][c] = Boolean(out[r][c] ^ maskFn(r, c));
    }
  }
  return out;
}

// ---- 公開 API -----------------------------------------------------------------

/**
 * 文字列を QR コードのモジュール行列へ変換する。
 * @param {string} text 符号化する文字列
 * @param {{ecc?: 'L'|'M'|'Q'|'H'}} options
 * @returns {{version: number, size: number, modules: boolean[][], mask: number} | null}
 */
export function encodeQr(text, { ecc = 'M' } = {}) {
  const bytes = Array.from(new TextEncoder().encode(text));
  const version = chooseVersion(bytes.length, ecc);
  if (version === null) return null;

  const dataBytes = encodeDataBytes(bytes, version, ecc);
  const codewords = buildCodewords(dataBytes, version, ecc);

  const { modules, isFunction, size } = buildFunctionMatrix(version);
  placeData(modules, isFunction, codewords);

  let best = null;
  for (let mask = 0; mask < 8; mask += 1) {
    const masked = applyMask(modules, isFunction, mask);
    writeFormatInfo(masked, ecc, mask);
    const score = penaltyScore(masked);
    if (best === null || score < best.score) best = { mask, score, matrix: masked };
  }
  writeVersionInfo(best.matrix, version);
  return { version, size, modules: best.matrix, mask: best.mask };
}

/**
 * 文字列から QR コードを描画した Canvas を生成する。
 * 読取精度のため黒（#000）を濃色・背景を白で描画する。
 * @param {string} text 符号化する文字列
 * @param {{scale?: number, margin?: number}} options 1モジュールのピクセル数と静粛領域（モジュール数）
 * @returns {HTMLCanvasElement | null}
 */
export function renderQrCanvas(text, { scale = 4, margin = 4 } = {}) {
  const qr = encodeQr(text);
  if (!qr) return null;
  const full = qr.size + margin * 2;
  const canvas = document.createElement('canvas');
  canvas.width = full * scale;
  canvas.height = full * scale;
  const context = canvas.getContext('2d');
  const styles = getComputedStyle(document.documentElement);
  context.fillStyle = styles.getPropertyValue('--ak-qr-background').trim();
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = styles.getPropertyValue('--ak-qr-foreground').trim();
  for (let r = 0; r < qr.size; r += 1) {
    for (let c = 0; c < qr.size; c += 1) {
      if (qr.modules[r][c]) {
        context.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
      }
    }
  }
  return canvas;
}
