import {
  StoryDetail,
  StorySummary,
  getReactions,
  getStory,
  isLoggedIn,
  listPhotos,
  listStories,
  reactToStory
} from "../api";
import { PREF_BY_CODE, storyMetaText } from "../prefectures";
import { el, errorNode, yearOptions } from "../ui";
import { navigate } from "../router";
import type { CleanupFn } from "../router";
import { buildAdjacentNav, buildViewerShareRow, openReportModal } from "./story";
import { buildMetIcon } from "../icon";

// ---- シーン定数 ----
const HORIZON = 0.44; // 地平線（シーン高さに対する割合）
const GROUND_NEAR = 0.96; // 一番手前の足元位置
const ROAD_HALF_TOP = 0.008; // 消失点付近の道の半幅（幅に対する割合）
const ROAD_HALF_BOTTOM = 0.34; // 画面下端での道の半幅（幅に対する割合）
const BASE_AVATAR_H = 118; // 手前(t=1)のアバターの高さ(px)
const MAX_CHUNK = 160;
const EDGE_OUT = 0.12; // 画面外とみなす左右マージン（幅に対する割合）

// ---- 白塗りスプライトの階調（「まっしろな旅人」） ----
interface SpriteScheme {
  base: string; // 白
  light: string; // 明るいグレー
  mid: string; // 中間グレー
}

const SPRITE_OUTLINE = "#3a3a4a";

const AVATAR_SCHEMES: SpriteScheme[] = [
  { base: "#f8f8f0", light: "#d8d8d0", mid: "#b8b8b0" }, // ニュートラル
  { base: "#f8f4e8", light: "#dcd4c4", mid: "#bcb4a4" }, // わずかに暖色
  { base: "#f0f4f8", light: "#d0d8e0", mid: "#b0b8c0" } // わずかに寒色
];

type WalkerState = "enter" | "wander" | "leave";

interface Walker {
  btn: HTMLButtonElement;
  svg: SVGSVGElement;
  bubble: HTMLElement;
  story: StorySummary;
  scheme: SpriteScheme;
  t: number; // 奥行き 0=遠い 1=近い
  x: number; // 現在の横位置 0..1（幅に対する割合）
  homeX: number; // 滞在の中心位置
  targetX: number; // いま歩いて向かっている先
  exitX: number; // 退場先（画面外）
  state: WalkerState;
  mode: "walk" | "stand"; // wander 中: 横歩き / 正面を向いて立ち止まり
  standUntil: number; // 立ち止まり終了時刻(sec)
  walkSpeed: number; // 入退場の歩行速度（幅割合/秒）
  wanderSpeed: number; // 滞在中の歩行速度
  bobSpeed: number;
  phase: number;
  facing: 1 | -1;
  dead: boolean;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// シード付き乱数（都道府県コードで風景を固定し、再訪時に同じ景色にする）
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

function groundY(t: number): number {
  return HORIZON + Math.pow(t, 1.35) * (GROUND_NEAR - HORIZON);
}

function scaleAt(t: number): number {
  return 0.3 + 0.7 * t;
}

// ---- ドット絵スプライト（16×24、白塗り+暗色輪郭） ----
// O=輪郭 W=白 L=明グレー D=中間グレー .=透過
// ポーズは「正面（立ち止まり）」と「横向き（歩行2フレーム）」の2系統

// 正面の頭〜肩（rows 0..9）
const FRONT_HEAD: string[] = [
  "......OOOO......",
  ".....OWWWWO.....",
  "....OWWWWWWO....",
  "....OWWWWWWO....",
  "....OWWWWLWO....",
  "....OWWWWLWO....",
  "....OWWWWWWO....",
  ".....OWWWWO.....",
  ".....OWDDWO.....",
  "....OWWWWWWO...."
];

// 正面の直立ポーズ（rows 10..23）: 両腕を下ろし、脚を揃える
const FRONT_STAND: string[] = [
  "..OWOWWWWWWOWO..",
  "..OWOWWWWWWOWO..",
  "..OWOWWLLWWOWO..",
  "..OWOWWLLWWOWO..",
  "..OLOWWLLWWOLO..",
  "..OOOWWLLWWOOO..",
  "....OWWWWWWO....",
  "....OWWOOWWO....",
  "....OWWOOWWO....",
  "....OWWOOWWO....",
  "....OWWOOWWO....",
  "....OWWOOWWO....",
  "....OWWOOWWO....",
  "....OOOOOOOO...."
];

// 横向きの頭〜肩（rows 0..9）: 1px の鼻先で向きを出す（scaleX で左右反転）
const SIDE_HEAD: string[] = [
  "......OOOO......",
  ".....OWWWWO.....",
  "....OWWWWWWO....",
  "....OWWWWWWO....",
  "....OWWWWWWWO...",
  "....OWWWWWWWO...",
  "....OWWWWWWO....",
  ".....OWWWWO.....",
  ".....OWDWWO.....",
  ".....OWWWWO....."
];

// 横向きの歩幅ポーズ（rows 10..23）: 脚を前後に開き、腕を前後に振る
const SIDE_STRIDE: string[] = [
  ".....OWWWWO.....",
  ".....OWWWWO.....",
  ".....OWLLWO.....",
  "...OWOWLLWOWO...",
  "...OWOWLLWOWO...",
  "...OLOWLLWOLO...",
  "...OOOWWWWOOO...",
  ".....OWWWWO.....",
  "....OWWOOWWO....",
  "...OWWO..OWWO...",
  "...OWWO..OWWO...",
  "..OWWO....OWWO..",
  "..OWWO....OWWO..",
  "..OOOO....OOOO.."
];

// 横向きの通過ポーズ（rows 10..23）: 脚が交差して重なる瞬間
const SIDE_PASS: string[] = [
  ".....OWWWWO.....",
  ".....OWWWWO.....",
  ".....OWLLWO.....",
  ".....OWLLWO.....",
  ".....OWLLWO.....",
  ".....OLLLWO.....",
  ".....OWWWWO.....",
  ".....OWWWWO.....",
  ".....OWWWWO.....",
  ".....OWWWO......",
  ".....OWWWO......",
  ".....OWWWO......",
  ".....OWWWO......",
  ".....OOOO......."
];

function spriteColor(ch: string, scheme: SpriteScheme): string | null {
  switch (ch) {
    case "O":
      return SPRITE_OUTLINE;
    case "W":
      return scheme.base;
    case "L":
      return scheme.light;
    case "D":
      return scheme.mid;
    default:
      return null;
  }
}

// 行内の同色連続セルをまとめて rect にする
function appendSpriteRows(
  ns: string,
  parent: SVGElement,
  rows: string[],
  yOffset: number,
  scheme: SpriteScheme
): void {
  rows.forEach((row, ry) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      const color = spriteColor(ch, scheme);
      if (!color) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < row.length && row[x + run] === ch) run++;
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(yOffset + ry));
      rect.setAttribute("width", String(run));
      rect.setAttribute("height", "1");
      rect.setAttribute("fill", color);
      parent.append(rect);
      x += run;
    }
  });
}

// 白塗りドット人間スプライト。
// pose: "front"=正面で立ち止まり / "walk"=横向き歩行（2フレームをCSSで交互表示）
function buildPersonSvg(
  scheme: SpriteScheme,
  heightPx: number,
  pose: "front" | "walk"
): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.classList.add("walker-svg", pose);
  svg.style.height = `${heightPx}px`;
  svg.style.width = `${(heightPx * 16) / 24}px`;

  const makePose = (cls: string, headRows: string[], bodyRows: string[]): SVGGElement => {
    const g = document.createElementNS(ns, "g");
    g.setAttribute("class", cls);
    appendSpriteRows(ns, g, headRows, 0, scheme);
    appendSpriteRows(ns, g, bodyRows, 10, scheme);
    return g;
  };

  svg.append(
    makePose("pose-front", FRONT_HEAD, FRONT_STAND),
    makePose("pose-side-a", SIDE_HEAD, SIDE_STRIDE),
    makePose("pose-side-b", SIDE_HEAD, SIDE_PASS)
  );
  return svg;
}

function setPose(walker: Walker, pose: "front" | "walk"): void {
  walker.svg.classList.toggle("front", pose === "front");
  walker.svg.classList.toggle("walk", pose === "walk");
}

// ---- ドット絵の背景（低解像度 canvas に1ドットずつ描き pixelated 拡大） ----

function roadHalfPx(y: number, horizonY: number, H: number, W: number): number {
  const fr = (y - horizonY) / Math.max(1, H - horizonY);
  return (ROAD_HALF_TOP + (ROAD_HALF_BOTTOM - ROAD_HALF_TOP) * fr) * W;
}

function pickSeeded(rnd: () => number, arr: string[]): string {
  return arr[Math.floor(rnd() * arr.length) % arr.length];
}

function buildSceneBackground(
  prefCode: number,
  cssW: number,
  cssH: number,
  photo: HTMLImageElement | null
): HTMLCanvasElement {
  const W = 320;
  const H = Math.min(400, Math.max(120, Math.round((W * cssH) / Math.max(1, cssW))));
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  cv.classList.add("scene-bg");
  cv.setAttribute("aria-hidden", "true");
  const ctx = cv.getContext("2d");
  if (!ctx) return cv;

  const rnd = mulberry32(prefCode * 7919 + 17);
  const horizonY = Math.round(H * HORIZON);
  const cx = W / 2;

  const px = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  };
  const fill = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  };

  // --- 空（バンド + 境目は市松ディザ） ---
  const skyCols = ["#8cc0d8", "#9ccee2", "#acdaec", "#bee6f2"];
  const skyEdges = [
    0,
    Math.round(horizonY * 0.3),
    Math.round(horizonY * 0.58),
    Math.round(horizonY * 0.82),
    horizonY
  ];
  for (let i = 0; i < skyCols.length; i++) {
    fill(0, skyEdges[i], W, skyEdges[i + 1] - skyEdges[i], skyCols[i]);
  }
  for (let i = 1; i < skyCols.length; i++) {
    const yb = skyEdges[i];
    for (let y = yb - 1; y <= yb; y++) {
      if (y < 0 || y >= horizonY) continue;
      for (let x = 0; x < W; x++) {
        if ((x + y) % 2 === 0) px(x, y, y < yb ? skyCols[i] : skyCols[i - 1]);
      }
    }
  }

  // --- 太陽（明るい中心 + 縁。縁はディザでなじませる） ---
  const sunX = Math.round(W * 0.78);
  const sunY = Math.round(horizonY * 0.28);
  for (let dy = -8; dy <= 8; dy++) {
    for (let dx = -8; dx <= 8; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= 4) px(sunX + dx, sunY + dy, "#f8f0c0");
      else if (d <= 6) px(sunX + dx, sunY + dy, "#f0dc88");
      else if (d <= 7.2 && (dx + dy + 16) % 2 === 0) px(sunX + dx, sunY + dy, "#e4c868");
    }
  }

  // --- ドット雲（角の丸い2ロブの塊 + 下面に淡い陰） ---
  for (let c = 0; c < 3; c++) {
    const cxc = Math.round(rnd() * (W - 60)) + 30;
    const cyc = Math.round(horizonY * (0.12 + rnd() * 0.5));
    const rx = 9 + Math.round(rnd() * 7);
    const ry = 3 + Math.round(rnd() * 2);
    for (let dy = -ry - 2; dy <= ry + 1; dy++) {
      for (let dx = -rx - 5; dx <= rx + 5; dx++) {
        const inMain = (dx / rx) ** 2 + (dy / ry) ** 2 <= 1;
        const inLobe =
          ((dx - rx * 0.5) / (rx * 0.6)) ** 2 + ((dy + ry * 0.6) / (ry * 0.9)) ** 2 <= 1;
        if (!inMain && !inLobe) continue;
        const shade = dy > ry * 0.35;
        px(cxc + dx, cyc + dy, shade ? "#dce8f0" : "#f6fafc");
      }
    }
  }

  // --- 遠景: 写真があればドット処理して地平線の上の帯に合成、なければ山 ---
  // （乱数消費を写真の有無に依らず同じにするため、稜線は常に計算する）
  let ridge = 6 + Math.round(rnd() * 7);
  const ridgeYs: number[] = [];
  let step = 0;
  for (let x = 0; x < W; x++) {
    if (step <= 0) {
      step = 2 + Math.floor(rnd() * 5);
      ridge += Math.floor(rnd() * 5) - 2;
      ridge = Math.max(3, Math.min(15, ridge));
    }
    step--;
    ridgeYs.push(horizonY - ridge);
  }

  const drawMountains = () => {
    for (let x = 0; x < W; x++) {
      const top = ridgeYs[x];
      for (let y = top; y < horizonY; y++) {
        let c = "#7a8a9a";
        if (y === top) c = "#8e9eae"; // 稜線のハイライト
        else if (y > top + 2 && (x + y) % 2 === 0) c = "#6c7c8c"; // 面のディザ陰影
        px(x, y, c);
      }
    }
  };

  let photoDrawn = false;
  if (photo && photo.naturalWidth > 0) {
    try {
      // 地平線の上の帯に cover でトリミングして描画
      const top = Math.round(horizonY * 0.32);
      const stripH = horizonY - top;
      const scale = Math.max(W / photo.naturalWidth, stripH / photo.naturalHeight);
      const sw = W / scale;
      const sh = stripH / scale;
      const sx = (photo.naturalWidth - sw) / 2;
      const sy = (photo.naturalHeight - sh) * 0.4;
      ctx.drawImage(photo, sx, sy, sw, sh, 0, top, W, stripH);

      // 背景と同じドット感になるよう色数を量子化（各ch 24階調刻み）
      const img = ctx.getImageData(0, top, W, stripH);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = Math.min(255, Math.round(d[i] / 24) * 24);
        d[i + 1] = Math.min(255, Math.round(d[i + 1] / 24) * 24);
        d[i + 2] = Math.min(255, Math.round(d[i + 2] / 24) * 24);
      }
      ctx.putImageData(img, 0, top);

      // 上端は空とディザでなじませる（25% → 50% → 25% の市松）
      const skyC = skyCols[skyCols.length - 1];
      for (let x = 0; x < W; x++) {
        if ((x + top) % 4 !== 0) px(x, top, skyC);
        if ((x + top + 1) % 2 === 0) px(x, top + 1, skyC);
        if ((x + top + 2) % 4 === 0) px(x, top + 2, skyC);
      }
      photoDrawn = true;
    } catch {
      photoDrawn = false; // CORS等で読めなければ山にフォールバック
    }
  }
  if (!photoDrawn) drawMountains();

  // --- 草原（バンド + ディザ境目） ---
  const grassCols = ["#96be7c", "#88b06a", "#7aa25e", "#6f965a"];
  const gH = H - horizonY;
  const gEdges = [
    horizonY,
    horizonY + Math.round(gH * 0.22),
    horizonY + Math.round(gH * 0.5),
    horizonY + Math.round(gH * 0.78),
    H
  ];
  for (let i = 0; i < grassCols.length; i++) {
    fill(0, gEdges[i], W, gEdges[i + 1] - gEdges[i], grassCols[i]);
  }
  for (let i = 1; i < grassCols.length; i++) {
    const yb = gEdges[i];
    for (let y = yb - 1; y <= yb; y++) {
      if (y <= horizonY || y >= H) continue;
      for (let x = 0; x < W; x++) {
        if ((x + y) % 2 === 0) px(x, y, y < yb ? grassCols[i] : grassCols[i - 1]);
      }
    }
  }

  // --- 道（土色 + 縁 + 破線の中央線 + 小石・轍） ---
  for (let y = horizonY; y < H; y++) {
    const half = roadHalfPx(y, horizonY, H, W);
    const xL = Math.round(cx - half);
    const xR = Math.round(cx + half);
    const e = Math.max(1, Math.round(half * 0.08));
    fill(xL, y, xR - xL + 1, 1, "#c8a86a");
    fill(xL, y, e, 1, "#a8885a");
    fill(xR - e + 1, y, e, 1, "#a8885a");
    // 道と草の境目をディザでなじませる
    if ((xL + y) % 2 === 0) px(xL - 1, y, "#a8885a");
    if ((xR + y) % 2 === 0) px(xR + 1, y, "#a8885a");
    // 中央線（破線）
    if (y % 6 < 3) {
      const cw = Math.max(1, Math.round(half * 0.05));
      fill(cx - cw / 2, y, cw, 1, "#dcc088");
    }
    // 轍（うっすらディザの2本線）
    const rutOff = half * 0.5;
    const rw = Math.max(1, Math.round(half * 0.06));
    for (let i = 0; i < rw; i++) {
      const xr1 = Math.round(cx - rutOff) + i;
      const xr2 = Math.round(cx + rutOff) - i;
      if ((xr1 + y) % 2 === 0) px(xr1, y, "#b49460");
      if ((xr2 + y) % 2 === 0) px(xr2, y, "#b49460");
    }
    // 小石（手前ほど多い）
    if (rnd() < (half / W) * 1.6) {
      const gx = xL + e + 1 + Math.round(rnd() * Math.max(1, xR - xL - e * 2 - 2));
      const pc = pickSeeded(rnd, ["#b89858", "#d8b878", "#9c8050"]);
      px(gx, y, pc);
      if (rnd() < 0.4) px(gx + 1, y, pc);
    }
  }

  // --- 草むらのタフト（奥は小さく、手前は大きめ。道の上は避ける） ---
  const tuftCount = Math.round((W * gH) / 240);
  for (let i = 0; i < tuftCount; i++) {
    const gx = Math.round(rnd() * W);
    const fr = Math.pow(rnd(), 1.2);
    const gy = horizonY + 2 + Math.round(fr * (gH - 5));
    const half = roadHalfPx(gy, horizonY, H, W);
    if (Math.abs(gx - cx) < half + 2) continue; // 道の上は避ける
    const c = rnd() < 0.6 ? "#5c8a4c" : "#a4c886";
    const size = fr < 0.35 ? 1 : fr < 0.7 ? 2 : 3;
    if (size === 1) {
      px(gx, gy, c);
    } else if (size === 2) {
      px(gx, gy, c);
      px(gx - 1, gy, c);
      px(gx, gy - 1, c);
    } else {
      px(gx - 1, gy, c);
      px(gx, gy, c);
      px(gx + 1, gy, c);
      px(gx - 1, gy - 1, c);
      px(gx + 1, gy - 1, c);
      px(gx, gy - 2, c);
    }
  }

  return cv;
}

// 本文をふきだし用チャンクに分割（空行・改行で分割、長い段落は句点で ≤160字）
export function chunkBody(body: string): string[] {
  const parts = body
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const chunks: string[] = [];
  for (const part of parts) {
    if (part.length <= MAX_CHUNK) {
      chunks.push(part);
      continue;
    }
    const sentences = part.split(/(?<=。)/);
    let cur = "";
    for (const sentence of sentences) {
      if (cur && cur.length + sentence.length > MAX_CHUNK) {
        chunks.push(cur);
        cur = "";
      }
      cur += sentence;
      while (cur.length > MAX_CHUNK) {
        chunks.push(cur.slice(0, MAX_CHUNK));
        cur = cur.slice(MAX_CHUNK);
      }
    }
    if (cur) chunks.push(cur);
  }
  return chunks.length > 0 ? chunks : ["…"];
}

export async function renderPrefPage(
  params: Record<string, string>,
  query: URLSearchParams,
  container: HTMLElement
): Promise<void | CleanupFn> {
  const prefCode = Number(params.pref);
  const pref = PREF_BY_CODE[prefCode];

  if (!pref) {
    container.append(errorNode("都道府県が見つかりませんでした。"));
    return;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- 後始末の仕組み（ルート変更・popstate で必ず止める） ----
  let disposed = false;
  const ac = new AbortController();
  const timers = new Set<number>();
  let rafId = 0;
  let readerEl: HTMLElement | null = null;
  let readerLightboxEl: HTMLElement | null = null;

  function later(fn: () => void, ms: number): number {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (!disposed) fn();
    }, ms);
    timers.add(id);
    return id;
  }

  function clearAllTimers(): void {
    for (const id of timers) window.clearTimeout(id);
    timers.clear();
  }

  // ---- シーン DOM ----
  const scene = el("div", { class: "road-scene" });
  const sceneInner = el("div", { class: "road-scene-inner" });
  const walkersLayer = el("div", { class: "walkers-layer" });
  sceneInner.append(walkersLayer);

  // 1文字ずつ縦に積む（writing-mode はフォント環境によって字送りが崩れるため使わない）
  const prefLabel = el(
    "div",
    { class: "scene-pref-name", "aria-label": pref.name },
    [...pref.name].map((ch) => el("span", {}, [ch]))
  );

  const yearWrap = el("div", { class: "scene-year" });
  const yearSelect = el("select", { "aria-label": "年で絞り込む" }) as HTMLSelectElement;
  yearSelect.append(el("option", { value: "" }, ["すべての年"]));
  const currentYear = new Date().getFullYear();
  for (const y of yearOptions(currentYear - 60)) {
    yearSelect.append(el("option", { value: String(y) }, [`${y}年`]));
  }
  yearSelect.value = query.get("year") ?? "";
  yearWrap.append(yearSelect);

  const sceneMsg = el("div", { class: "scene-msg" });

  scene.append(sceneInner, prefLabel, yearWrap, sceneMsg);
  container.append(scene);
  container.classList.add("full-bleed");

  // 背景ドット絵（初回1回のみ描画。サイズが大きく変わったとき・写真が届いたときだけ再生成）
  let bgCanvas: HTMLCanvasElement | null = null;
  let bgW = 0;
  let bgH = 0;
  let scenePhoto: HTMLImageElement | null = null;

  function regenBackground(): void {
    const w = scene.clientWidth;
    const h = scene.clientHeight;
    if (!w || !h) return;
    if (bgCanvas && Math.abs(w - bgW) < 48 && Math.abs(h - bgH) < 48) return;
    const next = buildSceneBackground(prefCode, w, h, scenePhoto);
    if (bgCanvas) {
      bgCanvas.replaceWith(next);
    } else {
      sceneInner.prepend(next);
    }
    bgCanvas = next;
    bgW = w;
    bgH = h;
  }

  // この県の写真があれば1枚をランダムに選び、ドット処理して遠景に合成する
  void (async () => {
    try {
      const res = await listPhotos(prefCode);
      if (disposed || res.photos.length === 0) return;
      const chosen = res.photos[Math.floor(Math.random() * res.photos.length)];
      const img = new Image();
      img.crossOrigin = "anonymous"; // 量子化(getImageData)に必要
      img.onload = () => {
        if (disposed) return;
        scenePhoto = img;
        bgW = 0; // 強制再生成
        bgH = 0;
        regenBackground();
      };
      img.src = chosen.url;
    } catch {
      // 写真は飾りなので失敗しても何もしない（山のまま）
    }
  })();

  function updateSceneHeight(): void {
    const headerH = document.getElementById("header")?.offsetHeight ?? 60;
    scene.style.height = `calc(100vh - ${headerH}px)`;
    regenBackground();
  }
  updateSceneHeight();
  window.addEventListener("resize", updateSceneHeight, { signal: ac.signal });

  // ---- 物語プールとアバター ----
  let storyPool: StorySummary[] = [];
  let walkers: Walker[] = [];
  let zooming = false;

  function yearQS(storyId?: string): string {
    const sp = new URLSearchParams();
    if (yearSelect.value) sp.set("year", yearSelect.value);
    if (storyId) sp.set("story", storyId);
    const s = sp.toString();
    return s ? `?${s}` : "";
  }

  async function loadStoryPool(): Promise<void> {
    sceneMsg.innerHTML = "";
    try {
      const res = await listStories({
        prefecture: prefCode,
        year: yearSelect.value ? Number(yearSelect.value) : undefined,
        page: 1,
        limit: 50
      });
      storyPool = res.stories;
      if (storyPool.length === 0) {
        sceneMsg.append(
          el("p", {}, ["まだこの場所の物語はありません。"]),
          el("p", {}, [
            el("a", { href: "/write", "data-link": true }, ["最初の物語を書いてみませんか →"])
          ])
        );
      }
    } catch {
      storyPool = [];
      sceneMsg.textContent = "物語の読み込みに失敗しました。";
    }
  }

  function applyWalkerX(w: Walker): void {
    w.btn.style.left = `${(w.x * 100).toFixed(3)}%`;
  }

  // 同時に出ているヒトは全員別ユーザーの物語を持つ
  const activeUsers = new Set<string>();

  function availableStories(): StorySummary[] {
    return storyPool.filter((s) => !activeUsers.has(s.userHandle));
  }

  function spawnWalker(): void {
    if (disposed) return;
    const candidates = availableStories();
    if (candidates.length === 0) return; // 空きユーザーがいなければ増やさない
    const story = pick(candidates);
    activeUsers.add(story.userHandle);
    const scheme = pick(AVATAR_SCHEMES);
    const t = rand(0.15, 0.95);
    const yFrac = groundY(t);
    // 道の上に限らず、野原も含めた画面全幅を歩く
    const homeX = rand(0.06, 0.94);
    const size = BASE_AVATAR_H * scaleAt(t);

    const svg = buildPersonSvg(scheme, size, reduceMotion ? "front" : "walk");
    const bubble = el("span", { class: "walker-bubble" }, [story.title]);
    bubble.style.fontSize = `${(0.66 + 0.24 * t).toFixed(2)}rem`;

    const btn = el("button", {
      class: "walker",
      "aria-label": `物語「${story.title}」を読む`
    }) as HTMLButtonElement;
    btn.append(bubble, svg);
    btn.style.top = `${(yFrac * 100).toFixed(2)}%`;
    btn.style.zIndex = String(10 + Math.round(t * 100));

    const fromLeft = Math.random() < 0.5;
    const startX = reduceMotion ? homeX : fromLeft ? -EDGE_OUT : 1 + EDGE_OUT;

    const walkSpeed = rand(0.05, 0.1) * (0.55 + 0.55 * t);
    const walker: Walker = {
      btn,
      svg,
      bubble,
      story,
      scheme,
      t,
      x: startX,
      homeX,
      targetX: homeX,
      exitX: 0,
      state: reduceMotion ? "wander" : "enter",
      mode: "stand",
      standUntil: reduceMotion ? Number.POSITIVE_INFINITY : 0,
      walkSpeed,
      wanderSpeed: walkSpeed * rand(0.4, 0.7),
      bobSpeed: rand(2.0, 3.2),
      phase: rand(0, Math.PI * 2),
      facing: fromLeft ? 1 : -1,
      dead: false
    };
    applyWalkerX(walker);

    btn.addEventListener("click", () => openStoryFromWalker(walker), { signal: ac.signal });

    walkersLayer.append(btn);
    walkers.push(walker);

    if (reduceMotion) {
      // 静止配置 + フェードの従来演出
      requestAnimationFrame(() => btn.classList.add("alive"));
      scheduleBubble(walker, rand(1500, 9000));
      later(() => {
        retireWalkerFade(walker);
        later(() => spawnWalker(), rand(400, 1800));
      }, rand(15000, 40000));
    } else {
      // 画面外から歩いて入場（フェードなし）
      btn.classList.add("alive");
    }
  }

  // 入場完了: まず正面を向いてひと休み → 横歩きと立ち止まりを繰り返す
  function beginWander(walker: Walker, nowSec: number): void {
    walker.state = "wander";
    walker.x = walker.homeX;
    walker.mode = "stand";
    walker.standUntil = nowSec + rand(1.2, 3.5);
    setPose(walker, "front");
    scheduleBubble(walker, rand(1000, 7000));
    later(() => beginExit(walker), rand(15000, 40000));
  }

  function beginExit(walker: Walker): void {
    if (walker.dead || walker.state === "leave") return;
    walker.state = "leave";
    walker.exitX = walker.x < 0.5 ? -EDGE_OUT : 1 + EDGE_OUT; // 近い方の端へ歩き去る
    walker.bubble.classList.remove("show");
    setPose(walker, "walk");
  }

  function despawnWalker(walker: Walker): void {
    if (walker.dead) return;
    walker.dead = true;
    activeUsers.delete(walker.story.userHandle);
    walker.btn.remove();
    walkers = walkers.filter((w) => w !== walker);
    later(() => spawnWalker(), rand(400, 1800));
  }

  // reduced-motion 用: フェードで退場
  function retireWalkerFade(walker: Walker): void {
    if (walker.dead) return;
    walker.dead = true;
    activeUsers.delete(walker.story.userHandle);
    walker.btn.classList.remove("alive");
    later(() => {
      walker.btn.remove();
      walkers = walkers.filter((w) => w !== walker);
    }, 1500);
  }

  function scheduleBubble(walker: Walker, delay: number): void {
    later(() => {
      if (walker.dead || walker.state === "leave") return;
      walker.bubble.classList.add("show");
      const durMs = rand(3200, 5600);
      // 話すあいだは立ち止まって正面を向く
      if (walker.state === "wander" && !reduceMotion) {
        walker.mode = "stand";
        walker.standUntil = Math.max(
          walker.standUntil,
          performance.now() / 1000 + durMs / 1000 + rand(0.4, 1.4)
        );
        setPose(walker, "front");
      }
      later(() => {
        walker.bubble.classList.remove("show");
        if (!walker.dead && walker.state !== "leave") {
          scheduleBubble(walker, rand(5000, 16000));
        }
      }, durMs);
    }, delay);
  }

  function resetWalkers(): void {
    clearAllTimers();
    for (const w of walkers) {
      w.dead = true;
      w.btn.remove();
    }
    walkers = [];
    activeUsers.clear();
  }

  function spawnInitialWalkers(): void {
    if (storyPool.length === 0) return;
    const uniqueUsers = new Set(storyPool.map((s) => s.userHandle)).size;
    const n = Math.min(8, uniqueUsers);
    for (let i = 0; i < n; i++) {
      later(() => spawnWalker(), i * rand(150, 700));
    }
  }

  // ---- 歩行・うろうろ（rAF。reduced-motion 時は回さない） ----
  let lastNow = 0;

  function frame(now: number): void {
    if (disposed) return;
    const sec = now / 1000;
    const dt = lastNow ? Math.min(0.1, sec - lastNow) : 0;
    lastNow = sec;

    const walkedOut: Walker[] = [];
    for (const w of walkers) {
      if (w.dead) continue;

      if (w.state === "enter") {
        const dir: 1 | -1 = w.homeX >= w.x ? 1 : -1;
        w.x += dir * w.walkSpeed * dt;
        w.facing = dir;
        if ((dir === 1 && w.x >= w.homeX) || (dir === -1 && w.x <= w.homeX)) {
          beginWander(w, sec);
        }
      } else if (w.state === "leave") {
        const dir: 1 | -1 = w.exitX >= w.x ? 1 : -1;
        w.x += dir * w.walkSpeed * dt;
        w.facing = dir;
        if ((dir === 1 && w.x >= w.exitX) || (dir === -1 && w.x <= w.exitX)) {
          walkedOut.push(w);
          continue;
        }
      } else if (w.mode === "stand") {
        // 正面を向いて立ち止まり。時間が来たら次の目的地へ横歩き
        if (sec >= w.standUntil) {
          let target = Math.min(0.94, Math.max(0.06, w.homeX + rand(-0.22, 0.22)));
          if (Math.abs(target - w.x) < 0.03) {
            target = Math.min(
              0.94,
              Math.max(0.06, w.x + (Math.random() < 0.5 ? -1 : 1) * rand(0.08, 0.2))
            );
          }
          w.targetX = target;
          w.mode = "walk";
          setPose(w, "walk");
        }
      } else {
        // 横歩きで目的地へ。着いたら正面を向いて立ち止まる
        const dir: 1 | -1 = w.targetX >= w.x ? 1 : -1;
        w.x += dir * w.wanderSpeed * dt;
        w.facing = dir;
        if ((dir === 1 && w.x >= w.targetX) || (dir === -1 && w.x <= w.targetX)) {
          w.mode = "stand";
          w.standUntil = sec + rand(1.5, 4.5);
          setPose(w, "front");
        }
      }

      applyWalkerX(w);
      const walking = w.state !== "wander" || w.mode === "walk";
      if (walking) {
        const bob = Math.sin(sec * w.bobSpeed * Math.PI + w.phase) * 2.0 * scaleAt(w.t);
        w.svg.style.transform = `translateY(${bob.toFixed(2)}px) scaleX(${w.facing})`;
      } else {
        w.svg.style.transform = "scaleX(1)";
      }
    }
    for (const w of walkedOut) despawnWalker(w);

    rafId = requestAnimationFrame(frame);
  }

  // ---- ズーム → 読書モード ----
  function openStoryFromWalker(walker: Walker): void {
    if (zooming || readerEl) return;
    zooming = true;
    history.pushState({}, "", `/p/${prefCode}${yearQS(walker.story.id)}`);

    if (reduceMotion) {
      openReader(walker.story.id, walker.scheme, true);
      zooming = false;
      return;
    }

    const btnRect = walker.btn.getBoundingClientRect();
    const innerRect = sceneInner.getBoundingClientRect();
    const ox = btnRect.left - innerRect.left + btnRect.width / 2;
    const oy = btnRect.top - innerRect.top + btnRect.height / 2;
    const k = Math.min(3.2, Math.max(1.8, 2.2 / scaleAt(walker.t)));
    const cx = innerRect.width / 2;
    const cy = innerRect.height * 0.55;

    sceneInner.style.transformOrigin = `${ox.toFixed(1)}px ${oy.toFixed(1)}px`;
    sceneInner.classList.add("zooming");
    sceneInner.style.transform = `translate(${(cx - ox).toFixed(1)}px, ${(cy - oy).toFixed(1)}px) scale(${k.toFixed(2)})`;

    later(() => {
      openReader(walker.story.id, walker.scheme, true);
      zooming = false;
    }, 720);
  }

  function resetZoom(): void {
    sceneInner.classList.remove("zooming");
    sceneInner.style.transform = "";
  }

  // ---- 読書モード（オーバーレイ） ----
  function openReader(storyId: string, scheme: SpriteScheme, openedByPush: boolean): void {
    if (readerEl) return;

    const overlay = el("div", { class: "reader-overlay" });
    readerEl = overlay;

    // 背景: 道シーンにズームインした「てい」を保つ。
    // 同じ都道府県コード（シード）で生成するので、道画面と同じ風景の拡大になる。
    const sceneBg = el("div", { class: "reader-scene" });
    const sceneBgCv = buildSceneBackground(
      prefCode,
      scene.clientWidth || window.innerWidth,
      scene.clientHeight || window.innerHeight,
      scenePhoto
    );
    sceneBg.append(sceneBgCv);

    const bg = el("div", { class: "reader-bg" }); // 添付写真（あれば半透明で重ねる）
    const dim = el("div", { class: "reader-dim" });
    const paper = el("div", { class: "reader-paper" });

    const closeBtn = el(
      "button",
      {
        class: "reader-close",
        "aria-label": "閉じる",
        "data-noadvance": "true",
        onclick: () => closeReader()
      },
      ["✕"]
    );

    const stage = el("div", { class: "reader-stage" });
    const stream = el("div", { class: "reader-stream" });
    const bottomRow = el("div", { class: "reader-bottom" });
    const avatarSvg = buildPersonSvg(scheme, 170, "front"); // 大アバターは正面で静止
    avatarSvg.classList.add("reader-avatar");
    // アバターの下にユーザー名（物語読み込み後に埋める）
    const avatarName = el("a", { class: "reader-avatar-name", "data-noadvance": "true" });
    const avatarWrap = el("div", { class: "reader-avatar-wrap" }, [avatarSvg, avatarName]);
    const bottomRight = el("div", { class: "reader-bottom-right" });
    const nextBtn = el("button", { class: "btn reader-advance" }, ["つづき"]) as HTMLButtonElement;
    bottomRight.append(nextBtn);
    bottomRow.append(avatarWrap, bottomRight);
    stage.append(stream, bottomRow);

    overlay.append(sceneBg, bg, dim, paper, closeBtn, stage);
    document.body.append(overlay);

    // チュートリアル用: 人をクリックして物語を開いた合図
    document.dispatchEvent(new CustomEvent("wt:reader-open"));

    // ---- 写真ライトボックス（サムネイルクリックで拡大表示） ----
    function openLightbox(url: string, alt: string): void {
      if (readerLightboxEl) return;
      const box = el("div", { class: "photo-lightbox", "data-noadvance": "true" });
      const frame = el("div", { class: "photo-lightbox-frame" });
      const img = el("img", { src: url, alt });
      const lbCloseBtn = el(
        "button",
        { class: "photo-lightbox-close", "aria-label": "閉じる", onclick: () => closeLightbox() },
        ["✕"]
      );
      frame.append(img, lbCloseBtn);
      box.append(frame);
      // 暗幕（frame の外側）クリックで閉じる
      box.addEventListener("click", (e) => {
        if (e.target === box) closeLightbox();
      });
      overlay.append(box);
      readerLightboxEl = box;
    }

    function closeLightbox(): void {
      readerLightboxEl?.remove();
      readerLightboxEl = null;
    }

    function closeReader(): void {
      closeLightbox();
      if (openedByPush) {
        history.back(); // popstate → ルーターが道のシーンを再描画（cleanup 済み）
      } else {
        navigate(`/p/${prefCode}${yearQS()}`, true);
      }
    }

    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Escape" || !readerEl) return;
        // 報告モーダルが開いているときは、そちらの Esc（モーダルを閉じる）に譲る
        if (document.querySelector(".modal-overlay")) return;
        // ライトボックスが開いているときは、まずそちらを閉じる
        if (readerLightboxEl) {
          closeLightbox();
          return;
        }
        closeReader();
      },
      { signal: ac.signal }
    );

    // 本文読み込み（このリクエストで閲覧数が加算される）
    let chunks: string[] = [];
    let idx = 0;
    let story: StoryDetail | null = null;
    let finished = false;

    const loadingBubble = el("div", { class: "reader-bubble current" }, ["……"]);
    stream.append(loadingBubble);

    void (async () => {
      let loaded: StoryDetail;
      try {
        loaded = await getStory(storyId);
      } catch {
        loadingBubble.textContent = "物語を読み込めませんでした。";
        return;
      }
      if (disposed || readerEl !== overlay) return;
      story = loaded;

      // アバターの下に主人公のユーザー名（ユーザーページへのリンク）
      avatarName.textContent = story.username;
      avatarName.setAttribute("href", `/u/${story.userHandle}`);
      avatarName.setAttribute("data-link", "true");

      if (story.photos.length > 0) {
        const photoUrl = story.photos[0].url;
        bg.style.backgroundImage = `url("${photoUrl}")`;
        overlay.classList.add("has-photo");

        // つづきボタンの左に「写真」ボタンを表示。クリックでライトボックス拡大
        const photoBtn = el(
          "button",
          {
            class: "btn reader-photo-btn",
            "aria-label": "写真を拡大",
            "data-noadvance": "true",
            onclick: () => openLightbox(photoUrl, `${story!.title} の風景写真`)
          },
          ["写真"]
        ) as HTMLButtonElement;
        bottomRight.insertBefore(photoBtn, nextBtn);
      }
      chunks = chunkBody(story.body);
      loadingBubble.remove();
      const titleBubble = el("div", { class: "reader-bubble reader-title" }, [
        `「${story.title}」`,
        el("div", { class: "reader-meta" }, [storyMetaText(story)])
      ]);
      pushBubble(titleBubble);
    })();

    // 直前の1〜2個は薄く残し、古いものは消す
    function pushBubble(bubble: HTMLElement): void {
      const existing = Array.from(stream.querySelectorAll(".reader-bubble"));
      for (const b of existing) {
        b.classList.remove("current", "past1", "past2");
        b.querySelector(".msg-cursor")?.remove();
      }
      const all = [...existing, bubble];
      for (const b of all.slice(0, -3)) {
        b.classList.add("gone");
        window.setTimeout(() => b.remove(), 600);
      }
      const keep = all.slice(-3);
      if (keep.length >= 3) keep[0].classList.add("past2");
      if (keep.length >= 2) keep[keep.length - 2].classList.add("past1");
      bubble.classList.add("current");
      // つづきがある間は ▼ 点滅インジケータを文末に出す
      bubble.append(el("span", { class: "msg-cursor", "aria-hidden": "true" }, ["▼"]));
      stream.append(bubble);
      stream.scrollTop = stream.scrollHeight;
    }

    function showActions(s: StoryDetail): void {
      finished = true;
      nextBtn.style.display = "none";
      // 最後のチャンク: つづきインジケータを消す
      stream.querySelectorAll(".msg-cursor").forEach((c) => c.remove());

      const actions = el("div", { class: "reader-actions", "data-noadvance": "true" });

      const likeBtn = el("button", { class: "reaction-btn" }, ["♡ いいね"]) as HTMLButtonElement;
      const metLabel = el("span", {}, ["出会ってたかも"]);
      const metBtn = el("button", { class: "reaction-btn" }, [
        buildMetIcon(),
        metLabel
      ]) as HTMLButtonElement;

      function paint(
        likeCount: number,
        metCount: number,
        reacted: { like: boolean; met: boolean }
      ): void {
        likeBtn.textContent = `♡ いいね (${likeCount})`;
        metLabel.textContent = `出会ってたかも (${metCount})`;
        likeBtn.classList.toggle("active", reacted.like);
        metBtn.classList.toggle("active", reacted.met);
      }
      paint(s.likeCount, s.metCount, { like: false, met: false });
      void getReactions(s.id)
        .then((r) => paint(r.likeCount, r.metCount, r.reacted))
        .catch(() => {});

      function bind(btn: HTMLButtonElement, type: "like" | "met"): void {
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          try {
            const r = await reactToStory(s.id, type);
            paint(r.likeCount, r.metCount, r.reacted);
          } catch {
            window.alert("リアクションの送信に失敗しました。");
          } finally {
            btn.disabled = false;
          }
        });
      }
      bind(likeBtn, "like");
      bind(metBtn, "met");

      const reportBtn = el(
        "button",
        {
          class: "report-link",
          onclick: () => {
            if (!isLoggedIn()) {
              navigate("/login");
              return;
            }
            openReportModal(s.id);
          }
        },
        ["この物語を報告する"]
      );

      // そのまえ／そのご: 同じ都道府県の時系列で前後の物語を、この読書モードのまま切り替える
      const adjNav = buildAdjacentNav(s.id, (nextId) => {
        navigate(`/p/${prefCode}${yearQS(nextId)}`, true);
      });

      actions.append(
        el("div", { class: "reaction-row" }, [likeBtn, metBtn]),
        adjNav,
        buildViewerShareRow(PREF_BY_CODE[s.prefecture]?.name ?? "", s.id), // 「〜県でこんな物語を見つけました。」
        el("p", {}, [
          el("a", { href: `/story/${s.id}`, "data-link": true, class: "reader-bookmark" }, [
            "しおりページで読む →"
          ]),
          " ",
          reportBtn
        ])
      );
      stream.append(actions);
      actions.scrollIntoView({ block: "end", behavior: reduceMotion ? "auto" : "smooth" });
    }

    function advance(): void {
      if (!story || finished) return;
      if (idx < chunks.length) {
        pushBubble(el("div", { class: "reader-bubble" }, [chunks[idx]]));
        idx++;
      }
      if (idx >= chunks.length) {
        showActions(story);
      }
    }

    nextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      advance();
    });
    overlay.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-noadvance], a, .reaction-btn, .report-link, .reader-close")) return;
      advance();
    });
  }

  // ---- 年セレクタ（変更時はアバター総入れ替え） ----
  yearSelect.addEventListener(
    "change",
    async () => {
      history.replaceState({}, "", `/p/${prefCode}${yearQS()}`);
      resetWalkers();
      await loadStoryPool();
      if (disposed) return;
      spawnInitialWalkers();
    },
    { signal: ac.signal }
  );

  // ---- 起動 ----
  await loadStoryPool();
  if (disposed) return;
  spawnInitialWalkers();
  if (!reduceMotion) {
    rafId = requestAnimationFrame(frame);
  }

  // ?story= 付きで直接ロード/popstate された場合は最初から読書モード
  const directStory = query.get("story");
  if (directStory) {
    openReader(directStory, pick(AVATAR_SCHEMES), false);
  }

  return () => {
    disposed = true;
    if (rafId) cancelAnimationFrame(rafId);
    clearAllTimers();
    ac.abort();
    if (readerLightboxEl) {
      readerLightboxEl.remove();
      readerLightboxEl = null;
    }
    if (readerEl) {
      readerEl.remove();
      readerEl = null;
    }
    resetZoom();
    container.classList.remove("full-bleed");
  };
}
