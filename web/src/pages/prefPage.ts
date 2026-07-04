import {
  StoryDetail,
  StorySummary,
  getReactions,
  getStory,
  isLoggedIn,
  listStories,
  reactToStory
} from "../api";
import { PREF_BY_CODE } from "../prefectures";
import { el, errorNode, yearOptions } from "../ui";
import { navigate } from "../router";
import type { CleanupFn } from "../router";
import { buildQuietShareRow, openReportModal } from "./story";

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
  exitX: number; // 退場先（画面外）
  state: WalkerState;
  wanderT0: number; // うろうろ開始時刻(sec)
  amp: number;
  speed: number; // うろうろの周期
  walkSpeed: number; // 入退場の歩行速度（幅割合/秒）
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

// ---- ドット絵スプライト（16×24、白塗り+暗色輪郭、歩行4フェーズ） ----
// O=輪郭 W=白 L=明グレー D=中間グレー .=透過

// 頭〜肩（全フレーム共通、rows 0..9）
const SPRITE_HEAD: string[] = [
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

// 直立/通過ポーズ（rows 10..23）: 腕は下ろし、脚は揃える
const SPRITE_PASS: string[] = [
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

// 歩幅ポーズ（rows 10..23）: 脚を開き、腕を前後に振る（左右非対称）
const SPRITE_STRIDE: string[] = [
  "..OWOWWWWWWOWO..",
  "..OWOWWWWWWOWO..",
  "..OLOWWLLWWOWO..",
  "..OOOWWLLWWOWO..",
  "....OWWLLWWOWO..",
  "....OWWLLWWOLO..",
  "....OWWWWWWO....",
  "....OWWOOWWO....",
  "...OWWO..OWWO...",
  "...OWWO..OWWO...",
  "..OWWO....OWWO..",
  "..OWWO....OWWO..",
  ".OWWO......OWWO.",
  ".OOOO......OOOO."
];

function mirrorRows(rows: string[]): string[] {
  return rows.map((r) => [...r].reverse().join(""));
}

// 反対側の歩幅（腕振りも反転して2〜4フレーム相当のサイクルにする）
const SPRITE_STRIDE_M = mirrorRows(SPRITE_STRIDE);

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

// 白塗りドット人間スプライト。walk=true で歩行4フェーズ（CSSで切り替え）
function buildPersonSvg(scheme: SpriteScheme, heightPx: number, walk: boolean): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.classList.add("walker-svg");
  if (walk) svg.classList.add("sprite-walk");
  svg.style.height = `${heightPx}px`;
  svg.style.width = `${(heightPx * 16) / 24}px`;

  const head = document.createElementNS(ns, "g");
  appendSpriteRows(ns, head, SPRITE_HEAD, 0, scheme);

  const makeFrame = (cls: string, rows: string[]): SVGGElement => {
    const g = document.createElementNS(ns, "g");
    g.setAttribute("class", cls);
    appendSpriteRows(ns, g, rows, 10, scheme);
    return g;
  };

  svg.append(
    head,
    makeFrame("frame-s1", SPRITE_STRIDE),
    makeFrame("frame-p", SPRITE_PASS),
    makeFrame("frame-s2", SPRITE_STRIDE_M)
  );
  return svg;
}

// ---- ドット絵の背景（低解像度 canvas に1ドットずつ描き pixelated 拡大） ----

function roadHalfPx(y: number, horizonY: number, H: number, W: number): number {
  const fr = (y - horizonY) / Math.max(1, H - horizonY);
  return (ROAD_HALF_TOP + (ROAD_HALF_BOTTOM - ROAD_HALF_TOP) * fr) * W;
}

function pickSeeded(rnd: () => number, arr: string[]): string {
  return arr[Math.floor(rnd() * arr.length) % arr.length];
}

function buildSceneBackground(prefCode: number, cssW: number, cssH: number): HTMLCanvasElement {
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

  // --- 遠くの山（階段状の稜線 + 面にディザの陰影） ---
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
  for (let x = 0; x < W; x++) {
    const top = ridgeYs[x];
    for (let y = top; y < horizonY; y++) {
      let c = "#7a8a9a";
      if (y === top) c = "#8e9eae"; // 稜線のハイライト
      else if (y > top + 2 && (x + y) % 2 === 0) c = "#6c7c8c"; // 面のディザ陰影
      px(x, y, c);
    }
  }

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

  // 背景ドット絵（初回1回のみ描画。サイズが大きく変わったときだけ再生成）
  let bgCanvas: HTMLCanvasElement | null = null;
  let bgW = 0;
  let bgH = 0;

  function regenBackground(): void {
    const w = scene.clientWidth;
    const h = scene.clientHeight;
    if (!w || !h) return;
    if (bgCanvas && Math.abs(w - bgW) < 48 && Math.abs(h - bgH) < 48) return;
    const next = buildSceneBackground(prefCode, w, h);
    if (bgCanvas) {
      bgCanvas.replaceWith(next);
    } else {
      sceneInner.prepend(next);
    }
    bgCanvas = next;
    bgW = w;
    bgH = h;
  }

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

  function spawnWalker(): void {
    if (disposed || storyPool.length === 0) return;
    const story = pick(storyPool);
    const scheme = pick(AVATAR_SCHEMES);
    const t = rand(0.15, 0.95);
    const yFrac = groundY(t);
    // 道の上に限らず、野原も含めた画面全幅を歩く
    const homeX = rand(0.06, 0.94);
    const size = BASE_AVATAR_H * scaleAt(t);

    const svg = buildPersonSvg(scheme, size, !reduceMotion);
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

    const walker: Walker = {
      btn,
      svg,
      bubble,
      story,
      scheme,
      t,
      x: startX,
      homeX,
      exitX: 0,
      state: reduceMotion ? "wander" : "enter",
      wanderT0: performance.now() / 1000,
      amp: rand(0.008, 0.035) * (0.4 + 0.6 * t),
      speed: rand(0.05, 0.16),
      walkSpeed: rand(0.05, 0.1) * (0.55 + 0.55 * t),
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

  // 入場完了: うろうろ開始 + ふきだし + 寿命（退場開始）を予約
  function beginWander(walker: Walker, nowSec: number): void {
    walker.state = "wander";
    walker.wanderT0 = nowSec;
    walker.x = walker.homeX;
    scheduleBubble(walker, rand(1000, 7000));
    later(() => beginExit(walker), rand(15000, 40000));
  }

  function beginExit(walker: Walker): void {
    if (walker.dead || walker.state === "leave") return;
    walker.state = "leave";
    walker.exitX = walker.x < 0.5 ? -EDGE_OUT : 1 + EDGE_OUT; // 近い方の端へ歩き去る
    walker.bubble.classList.remove("show");
  }

  function despawnWalker(walker: Walker): void {
    if (walker.dead) return;
    walker.dead = true;
    walker.btn.remove();
    walkers = walkers.filter((w) => w !== walker);
    later(() => spawnWalker(), rand(400, 1800));
  }

  // reduced-motion 用: フェードで退場
  function retireWalkerFade(walker: Walker): void {
    if (walker.dead) return;
    walker.dead = true;
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
      later(() => {
        walker.bubble.classList.remove("show");
        if (!walker.dead && walker.state !== "leave") {
          scheduleBubble(walker, rand(5000, 16000));
        }
      }, rand(3200, 5600));
    }, delay);
  }

  function resetWalkers(): void {
    clearAllTimers();
    for (const w of walkers) {
      w.dead = true;
      w.btn.remove();
    }
    walkers = [];
  }

  function spawnInitialWalkers(): void {
    if (storyPool.length === 0) return;
    const n = Math.min(8, Math.max(3, storyPool.length));
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
      } else {
        // wander: 滞在位置のまわりをゆっくり行き来（sin(0)=0 から滑らかに）
        const ph = (sec - w.wanderT0) * w.speed * Math.PI * 2;
        w.x = w.homeX + Math.sin(ph) * w.amp;
        w.facing = Math.cos(ph) >= 0 ? 1 : -1;
      }

      applyWalkerX(w);
      const bob = Math.sin(sec * w.bobSpeed * Math.PI + w.phase) * 2.0 * scaleAt(w.t);
      w.svg.style.transform = `translateY(${bob.toFixed(2)}px) scaleX(${w.facing})`;
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

    const bg = el("div", { class: "reader-bg" });
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
    const avatarSvg = buildPersonSvg(scheme, 170, false); // 大アバターは静止フレーム
    avatarSvg.classList.add("reader-avatar");
    const nextBtn = el("button", { class: "btn reader-advance" }, ["つづき"]) as HTMLButtonElement;
    bottomRow.append(avatarSvg, nextBtn);
    stage.append(stream, bottomRow);

    overlay.append(bg, dim, paper, closeBtn, stage);
    document.body.append(overlay);

    function closeReader(): void {
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

      if (story.photos.length > 0) {
        bg.style.backgroundImage = `url("${story.photos[0].url}")`;
        overlay.classList.add("has-photo");
      }
      chunks = chunkBody(story.body);
      loadingBubble.remove();
      const titleBubble = el("div", { class: "reader-bubble reader-title" }, [
        `「${story.title}」`
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
      const metBtn = el("button", { class: "reaction-btn" }, [
        "⛩ 出会ってたかも"
      ]) as HTMLButtonElement;

      function paint(
        likeCount: number,
        metCount: number,
        reacted: { like: boolean; met: boolean }
      ): void {
        likeBtn.textContent = `♡ いいね (${likeCount})`;
        metBtn.textContent = `⛩ 出会ってたかも (${metCount})`;
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

      actions.append(
        el("div", { class: "reaction-row" }, [likeBtn, metBtn]),
        buildQuietShareRow(), // 閲覧画面は「そっと共有」のみ
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
    if (readerEl) {
      readerEl.remove();
      readerEl = null;
    }
    resetZoom();
    container.classList.remove("full-bleed");
  };
}
