// 日本地図（実形状のドット絵マップ）の低解像度 canvas 描画ロジック。
//
// トップページの全国図・将来のズームイン（市区町村単位で高解像度に再ラスタライズした
// 都道府県内グリッド）の両方から呼べるよう、対象の「グリッドデータ」を引数で受け取る
// 形にしてある（japanMap.ts の全国グリッドに直接依存しない）。
//
// 将来: 都道府県をズームインする際は、
//   1) その都道府県のセル範囲だけを高解像度に再ラスタライズした MapGridData を用意し、
//   2) 表示領域の変換（scale / offsetX / offsetY）を別引数として渡して
//      キャンバス座標 ⇔ グリッド座標の対応を切り替える
// という拡張を想定している。今回は全国1枚・等倍描画のみを実装し、
// 変換引数は追加していない（現状は「グリッド全体をそのまま描く」という単位変換のみ）。

export interface MapGridData {
  rows: string[];
  w: number;
  h: number;
  chars: string; // rows 中の1文字 → 都道府県コードのエンコード表（'.' は海）
}

export interface MapInsetRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// 海（暗い沖 → 淡い沿岸）。道画面の空パレットと同系の淡い青系。
const SEA_BANDS = ["#6f9cb8", "#7ea8c2", "#8cc0d8", "#9ccee2"];
const WAVE_DOT = "#c8ecf4";

// 陸: 物語数 0件 → 多いで5段階。道画面の草原パレットに調和させた牧歌的な緑。
const LAND_LEVELS = ["#a8c890", "#96be7c", "#88b06a", "#6f965a", "#4a7a3a"];
// 陸のドット感（草むらのフレック）用に少し明るくした対応色
const LAND_FLECKS = ["#bcd8a4", "#a8ce8c", "#98c07a", "#88ac72", "#5c8a4c"];

// 海岸線（陸セルの上下左右いずれかが海）
const COAST_COLORS = ["#3a4a3a", "#445248"];

const OKINAWA_FRAME = "#e8c860";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function landLevel(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0;
  const ratio = Math.min(1, count / max);
  return Math.min(LAND_LEVELS.length - 1, 1 + Math.floor(ratio * (LAND_LEVELS.length - 1)));
}

// グリッド上のセル(x,y)が海(または範囲外)かどうか
function codeAt(grid: MapGridData, x: number, y: number): number {
  if (x < 0 || x >= grid.w || y < 0 || y >= grid.h) return 0;
  const ch = grid.rows[y][x];
  if (!ch || ch === ".") return 0;
  const i = grid.chars.indexOf(ch);
  return i >= 0 ? i + 1 : 0;
}

// 都道府県コード → そのコードが占める全セル座標。
// pointermove のたびに全セルを走査しなくて済むよう、ハイライト用に一度だけ作る。
export function buildPrefCellIndex(grid: MapGridData): Map<number, Array<[number, number]>> {
  const index = new Map<number, Array<[number, number]>>();
  for (let y = 0; y < grid.h; y++) {
    const row = grid.rows[y];
    for (let x = 0; x < grid.w; x++) {
      const ch = row[x];
      if (!ch || ch === ".") continue;
      const code = grid.chars.indexOf(ch) + 1;
      if (code <= 0) continue;
      let arr = index.get(code);
      if (!arr) {
        arr = [];
        index.set(code, arr);
      }
      arr.push([x, y]);
    }
  }
  return index;
}

// ベース地図（海・陸・海岸線・沖縄インセット枠）を一度だけ描く。
// 物語数（counts）が変わったとき（= 年セレクタ変更時）だけ呼び直せばよい。
export function drawJapanMapBase(
  ctx: CanvasRenderingContext2D,
  grid: MapGridData,
  counts: Record<string, number>,
  max: number,
  okinawaInset: MapInsetRect
): void {
  const { w, h } = grid;
  const rnd = mulberry32(0xc0ffee);
  const img = ctx.createImageData(w, h);
  const d = img.data;

  const setPx = (x: number, y: number, hex: string) => {
    const [r, g, b] = hexToRgb(hex);
    const i = (y * w + x) * 4;
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = 255;
  };

  for (let y = 0; y < h; y++) {
    const bandF = (y / h) * SEA_BANDS.length;
    const bandIdx = Math.min(SEA_BANDS.length - 1, Math.floor(bandF));
    const nextIdx = Math.min(SEA_BANDS.length - 1, bandIdx + 1);
    const bandFrac = bandF - bandIdx;
    for (let x = 0; x < w; x++) {
      const code = codeAt(grid, x, y);
      if (code === 0) {
        // --- 海: バンド境目は市松ディザでなじませ、まばらな波ドットを散らす ---
        let c = bandFrac > 0.8 && (x + y) % 2 === 0 ? SEA_BANDS[nextIdx] : SEA_BANDS[bandIdx];
        if (rnd() < 0.015) c = WAVE_DOT;
        setPx(x, y, c);
        continue;
      }
      const coastal =
        codeAt(grid, x - 1, y) === 0 ||
        codeAt(grid, x + 1, y) === 0 ||
        codeAt(grid, x, y - 1) === 0 ||
        codeAt(grid, x, y + 1) === 0;
      if (coastal) {
        // --- 海岸線: 暗色の輪郭ドット（2色をディザして質感を出す） ---
        setPx(x, y, (x + y) % 2 === 0 ? COAST_COLORS[0] : COAST_COLORS[1]);
        continue;
      }
      // --- 陸: 物語数に応じた草原系の濃淡 + まばらな草むらフレック ---
      const lvl = landLevel(counts[String(code)] ?? 0, max);
      const c = rnd() < 0.012 ? LAND_FLECKS[lvl] : LAND_LEVELS[lvl];
      setPx(x, y, c);
    }
  }

  ctx.putImageData(img, 0, 0);

  // --- 沖縄インセット枠（putImageData の後に通常の2D APIで重ねる） ---
  const { x, y, w: iw, h: ih } = okinawaInset;
  ctx.fillStyle = OKINAWA_FRAME;
  ctx.fillRect(x - 1, y - 1, iw + 2, 1);
  ctx.fillRect(x - 1, y + ih, iw + 2, 1);
  ctx.fillRect(x - 1, y - 1, 1, ih + 2);
  ctx.fillRect(x + iw, y - 1, 1, ih + 2);
}

// ハイライト層（都道府県1件分のセルを明るく重ねる）。ベースは再描画しない。
export function drawPrefHighlight(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cells: Array<[number, number]> | undefined
): void {
  ctx.clearRect(0, 0, w, h);
  if (!cells || cells.length === 0) return;
  ctx.fillStyle = "rgba(248, 248, 240, 0.4)";
  for (const [x, y] of cells) {
    ctx.fillRect(x, y, 1, 1);
  }
}
