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
const ROAD_HALF_BOTTOM = 0.34; // 画面下端での道の半幅（幅に対する割合）
const BASE_AVATAR_H = 118; // 手前(t=1)のアバターの高さ(px)
const MAX_CHUNK = 160;

// ドット絵スプライトの配色（服・ズボンの組。肌・髪は共通で色数を絞る）
interface SpriteScheme {
  shirt: string;
  pants: string;
}

const AVATAR_SCHEMES: SpriteScheme[] = [
  { shirt: "#7098c8", pants: "#3a4a6a" },
  { shirt: "#88b06a", pants: "#4a5a3a" },
  { shirt: "#d86060", pants: "#5a3030" },
  { shirt: "#e8c860", pants: "#6a5a30" },
  { shirt: "#a080c0", pants: "#4a3a60" },
  { shirt: "#e8e8e0", pants: "#4a4a5a" }
];

interface Walker {
  btn: HTMLButtonElement;
  svg: SVGSVGElement;
  bubble: HTMLElement;
  story: StorySummary;
  scheme: SpriteScheme;
  t: number; // 奥行き 0=遠い 1=近い
  baseX: number; // 0..1（幅に対する割合）
  amp: number;
  speed: number;
  bobSpeed: number;
  phase: number;
  dead: boolean;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function groundY(t: number): number {
  return HORIZON + Math.pow(t, 1.35) * (GROUND_NEAR - HORIZON);
}

function scaleAt(t: number): number {
  return 0.3 + 0.7 * t;
}

function roadHalfAt(yFrac: number): number {
  return (ROAD_HALF_BOTTOM * (yFrac - HORIZON)) / (1 - HORIZON);
}

// ---- ドット絵スプライト（8×12 グリッド、歩行2フレーム） ----
// H=髪 S=肌 T=服 P=ズボン .=透過
const SPRITE_SHARED: string[] = [
  "..HHHH..",
  "..HHHH..",
  "..SSSS..",
  "..SSSS..",
  ".TTTTTT.",
  ".TTTTTT.",
  ".TTTTTT.",
  "..TTTT..",
  "..PPPP..",
  "..PPPP.."
];
const SPRITE_LEGS_A: string[] = [".PP..PP.", ".PP..PP."]; // 脚を開く
const SPRITE_LEGS_B: string[] = ["..PPPP..", "..P..P.."]; // 脚を閉じる

const HAIR_COLOR = "#503828";
const SKIN_COLOR = "#f0c8a0";

function spriteColor(ch: string, scheme: SpriteScheme): string | null {
  switch (ch) {
    case "H":
      return HAIR_COLOR;
    case "S":
      return SKIN_COLOR;
    case "T":
      return scheme.shirt;
    case "P":
      return scheme.pants;
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

// ドット人間スプライト。walk=true で2フレーム歩行（CSSで交互表示）
function buildPersonSvg(scheme: SpriteScheme, heightPx: number, walk: boolean): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 8 12");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.classList.add("walker-svg");
  if (walk) svg.classList.add("sprite-walk");
  svg.style.height = `${heightPx}px`;
  svg.style.width = `${(heightPx * 8) / 12}px`;

  const shared = document.createElementNS(ns, "g");
  appendSpriteRows(ns, shared, SPRITE_SHARED, 0, scheme);

  const frameA = document.createElementNS(ns, "g");
  frameA.setAttribute("class", "frame-a");
  appendSpriteRows(ns, frameA, SPRITE_LEGS_A, 10, scheme);

  const frameB = document.createElementNS(ns, "g");
  frameB.setAttribute("class", "frame-b");
  appendSpriteRows(ns, frameB, SPRITE_LEGS_B, 10, scheme);

  svg.append(shared, frameA, frameB);
  return svg;
}

// 道・野原・空の背景（レトロRPGフィールド調。バンド状のべた塗り、外部アセット不使用）
function buildSceneBackground(): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.classList.add("scene-bg");
  svg.setAttribute("aria-hidden", "true");

  const hY = HORIZON * 100;

  function shape(tag: string, attrs: Record<string, string>): SVGElement {
    const node = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  }

  function band(y0: number, y1: number, fill: string): SVGElement {
    return shape("rect", {
      x: "0",
      y: String(y0),
      width: "100",
      height: String(y1 - y0),
      fill
    });
  }

  const roadLeft = 50 - ROAD_HALF_BOTTOM * 100;
  const roadRight = 50 + ROAD_HALF_BOTTOM * 100;

  // 空（3バンド: 上ほど濃い水色）
  svg.append(band(0, 14, "#98cce0"), band(14, 28, "#a8d8e8"), band(28, hY, "#bce4f0"));

  // ドット調の太陽（四角を重ねる）
  svg.append(
    shape("rect", { x: "72", y: "6", width: "10", height: "10", fill: "#e8c860" }),
    shape("rect", { x: "74", y: "8", width: "6", height: "6", fill: "#f8f0b8" })
  );

  // ブロック雲 ×2
  svg.append(
    shape("rect", { x: "14", y: "10", width: "10", height: "3", fill: "#f4fafc" }),
    shape("rect", { x: "11", y: "13", width: "16", height: "3", fill: "#f4fafc" }),
    shape("rect", { x: "52", y: "18", width: "8", height: "2.5", fill: "#f4fafc" }),
    shape("rect", { x: "49", y: "20.5", width: "14", height: "2.5", fill: "#f4fafc" })
  );

  // 遠くの山（カクカクした稜線）
  svg.append(
    shape("polygon", {
      points:
        `0,${hY} 6,${hY - 8} 12,${hY - 4} 20,${hY - 11} 28,${hY - 5} ` +
        `36,${hY - 9} 44,${hY - 3} 54,${hY - 10} 62,${hY - 4} 72,${hY - 8} ` +
        `80,${hY - 3} 90,${hY - 7} 100,${hY - 2} 100,${hY}`,
      fill: "#7a8a9a"
    })
  );

  // 草原（3バンド: 手前ほど濃い緑）
  svg.append(
    band(hY, hY + 10, "#90ba74"),
    band(hY + 10, hY + 26, "#88b06a"),
    band(hY + 26, 100, "#7aa25e")
  );

  // 土の道（消失点へ延びる台形）+ 両端の縁 + 中央線
  svg.append(
    shape("polygon", {
      points: `49.2,${hY} 50.8,${hY} ${roadRight},100 ${roadLeft},100`,
      fill: "#c8a86a"
    }),
    shape("polygon", {
      points: `49.2,${hY} 49.55,${hY} ${roadLeft + 3},100 ${roadLeft},100`,
      fill: "#a8885a"
    }),
    shape("polygon", {
      points: `50.45,${hY} 50.8,${hY} ${roadRight},100 ${roadRight - 3},100`,
      fill: "#a8885a"
    }),
    shape("polygon", {
      points: `49.9,${hY + 2} 50.1,${hY + 2} 50.6,100 49.4,100`,
      fill: "#dcc088"
    })
  );
  return svg;
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
  sceneInner.append(buildSceneBackground(), walkersLayer);

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

  function updateSceneHeight(): void {
    const headerH = document.getElementById("header")?.offsetHeight ?? 60;
    scene.style.height = `calc(100vh - ${headerH}px)`;
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

  function spawnWalker(): void {
    if (disposed || storyPool.length === 0) return;
    const story = pick(storyPool);
    const scheme = pick(AVATAR_SCHEMES);
    const t = rand(0.15, 0.95);
    const yFrac = groundY(t);
    const half = roadHalfAt(yFrac) * 0.82;
    const baseX = 0.5 + rand(-1, 1) * half;
    const size = BASE_AVATAR_H * scaleAt(t);

    const svg = buildPersonSvg(scheme, size, !reduceMotion);
    const bubble = el("span", { class: "walker-bubble" }, [story.title]);
    bubble.style.fontSize = `${(0.66 + 0.24 * t).toFixed(2)}rem`;

    const btn = el("button", {
      class: "walker",
      "aria-label": `物語「${story.title}」を読む`
    }) as HTMLButtonElement;
    btn.append(bubble, svg);
    btn.style.left = `${(baseX * 100).toFixed(2)}%`;
    btn.style.top = `${(yFrac * 100).toFixed(2)}%`;
    btn.style.zIndex = String(10 + Math.round(t * 100));

    const walker: Walker = {
      btn,
      svg,
      bubble,
      story,
      scheme,
      t,
      baseX,
      amp: rand(0.008, 0.035) * (0.4 + 0.6 * t),
      speed: rand(0.05, 0.16),
      bobSpeed: rand(2.0, 3.2),
      phase: rand(0, Math.PI * 2),
      dead: false
    };

    btn.addEventListener("click", () => openStoryFromWalker(walker), { signal: ac.signal });

    walkersLayer.append(btn);
    walkers.push(walker);
    requestAnimationFrame(() => btn.classList.add("alive")); // フェードイン

    scheduleBubble(walker, rand(1500, 9000));
    scheduleLifespan(walker);
  }

  function scheduleBubble(walker: Walker, delay: number): void {
    later(() => {
      if (walker.dead) return;
      walker.bubble.classList.add("show");
      later(() => {
        walker.bubble.classList.remove("show");
        if (!walker.dead) scheduleBubble(walker, rand(5000, 16000));
      }, rand(3200, 5600));
    }, delay);
  }

  function scheduleLifespan(walker: Walker): void {
    later(() => {
      retireWalker(walker);
      // 少し間をおいて、別のランダムな物語のヒトが現れる
      later(() => spawnWalker(), rand(400, 1800));
    }, rand(15000, 40000));
  }

  function retireWalker(walker: Walker): void {
    if (walker.dead) return;
    walker.dead = true;
    walker.btn.classList.remove("alive"); // フェードアウト
    later(() => {
      walker.btn.remove();
      walkers = walkers.filter((w) => w !== walker);
    }, 1500);
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
      later(() => spawnWalker(), i * rand(150, 500));
    }
  }

  // ---- うろうろ+歩行の揺れ（rAF。reduced-motion 時は静止） ----
  function frame(now: number): void {
    if (disposed) return;
    const sec = now / 1000;
    for (const w of walkers) {
      if (w.dead) continue;
      const x = w.baseX + Math.sin(sec * w.speed * Math.PI * 2 + w.phase) * w.amp;
      w.btn.style.left = `${(x * 100).toFixed(3)}%`;
      const bob = Math.sin(sec * w.bobSpeed * Math.PI + w.phase) * 2.4 * scaleAt(w.t);
      w.svg.style.transform = `translateY(${bob.toFixed(2)}px)`;
    }
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
