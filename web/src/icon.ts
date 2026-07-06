// 自動生成: WorldTale アイコン（地球+白いヒト型、ドット絵32×32・左右対称）
// tools/generate-icon.py で再生成できる。ヘッダーのブランドマークに使う。

const ICON_N = 32;
const ICON_COLORS: Record<string, string> = {
  K: "#141414",
  B: "#3b5bd0",
  G: "#2fa84a",
  W: "#ffffff",
};

const ICON_ROWS: string[] = [
  "................................",
  "...........KKKKKKKKKK...........",
  "........KKKKKKKKKKKKKKKK........",
  ".......KKKKGGGBBBBGGGKKKK.......",
  "......KKKGGGGGGBBGGGGGGKKK......",
  ".....KKKGGGGGGGBBGGGGGGGKKK.....",
  "....KKKGGGGGGKKKKKKGGGGGGKKK....",
  "...KKKBGGGGGKKWWWWKKGGGGGBKKK...",
  "..KKKKKKKKGGKWWWWWWKGGKKKKKKKK..",
  "..KKKKWWWKKKKWWWWWWKKKKWWWKKKK..",
  "..KKKWWWWWWKKWWWWWWKKWWWWWWKKK..",
  ".KKBKWWWWWWWKWWWWWWKWWWWWWWKBKK.",
  ".KKGKKWWWWWWWKWWWWKWWWWWWWKKGKK.",
  ".KKGGKKWWWWWWWWWWWWWWWWWWKKGGKK.",
  ".KKGGBKKWWWWWWWWWWWWWWWWKKBGGKK.",
  ".KKGGBBKKKWWWWWWWWWWWWKKKBBGGKK.",
  ".KKGGBBBBKKWWWWWWWWWWKKBBBBGGKK.",
  ".KKGBBBBBBKKWWWWWWWWKKBBBBBBGKK.",
  ".KKBBBBBBBKKWWWWWWWWKKBBBBBBBKK.",
  ".KKBBBBBBBKWWWWWWWWWWKBBBBBBBKK.",
  ".KKBBBBBBBKWWWWWWWWWWKBBBBBBBKK.",
  "..KKGGBBBBKKWWWWWWWWKKBBBBGGKK..",
  "..KKGGGBBBBKWWWWWWWWKBBBBGGGKK..",
  "..KKKGGBBGBKWWWWWWWWKBGBBGGKKK..",
  "...KKKBGGGGKKWWWWWWKKGGGGBKKK...",
  "....KKKGGGGGKWWWWWWKGGGGGKKK....",
  ".....KKKGGGGKKKWWKKKGGGGKKK.....",
  "......KKKGGGBBKKKKBBGGGKKK......",
  ".......KKKKBBBBBBBBBBKKKK.......",
  "........KKKKKKKKKKKKKKKK........",
  "...........KKKKKKKKKK...........",
  "................................",
];

export function buildWorldTaleIcon(sizePx: number): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${ICON_N} ${ICON_N}`);
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", String(sizePx));
  svg.setAttribute("height", String(sizePx));
  svg.style.imageRendering = "pixelated";
  for (let y = 0; y < ICON_N; y++) {
    const row = ICON_ROWS[y];
    let x = 0;
    while (x < ICON_N) {
      const c = row[x];
      if (c === ".") { x++; continue; }
      let run = 1;
      while (x + run < ICON_N && row[x + run] === c) run++;
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", String(run));
      rect.setAttribute("height", "1");
      rect.setAttribute("fill", ICON_COLORS[c]);
      svg.append(rect);
      x += run;
    }
  }
  return svg;
}
// 「出会ってたかも」アイコン: すれ違いざまに袖が触れ合う2人（ドット絵・単色）。
// 手描きラフを整えたもの。currentColor を継承し、ボタン文字色になじむ。
const MET_W = 28;
const MET_H = 18;
const MET_ROWS: string[] = [
  "............................",
  "..........X......X..........",
  ".........XXX....XXX.........",
  ".........XXX....XXX.........",
  "..........X......X..........",
  ".........XXX....XXX.........",
  "........XXXXX..XXXXX........",
  "........XXXXX..XXXXX........",
  "........XXXXX..XXXXX........",
  "........XXXXX..XXXXX........",
  ".........XXXX..XXXX.........",
  ".........XXXXXXXXXX.........",
  ".........X.X....X.X.........",
  ".........X.X....X.X.........",
  ".........X.X....X.X.........",
  "........XX.XX..XX.XX........",
  "........XX.XX..XX.XX........",
  "............................",
];

export function buildMetIcon(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${MET_W} ${MET_H}`);
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("met-icon");
  for (let y = 0; y < MET_H; y++) {
    const row = MET_ROWS[y];
    let x = 0;
    while (x < MET_W) {
      if (row[x] !== "X") { x++; continue; }
      let run = 1;
      while (x + run < MET_W && row[x + run] === "X") run++;
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", String(run));
      rect.setAttribute("height", "1");
      rect.setAttribute("fill", "currentColor");
      svg.append(rect);
      x += run;
    }
  }
  return svg;
}
