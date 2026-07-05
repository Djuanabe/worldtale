import { MapSummary, StorySummary, isLoggedIn, listStories, mapSummary, myStories } from "../api";
import { prefName, seasonLabel, storyMetaText } from "../prefectures";
import type { CleanupFn } from "../router";
import { el, pageTitle } from "../ui";

// ---- ドット絵カプセル(20×20 の rect グリッドで自前描画。上半分が金・下半分が白・輪郭暗色) ----

const CAPSULE_N = 20;
const CAPSULE_OUTLINE = "#2a2418";
const CAPSULE_GOLD = "#e8c860";
const CAPSULE_WHITE = "#f8f8f0";
const CAPSULE_SHINE = "#fbead0";

function buildCapsuleGrid(): (string | null)[][] {
  const n = CAPSULE_N;
  const c = (n - 1) / 2;
  const r = n / 2 - 0.5;
  const grid: (string | null)[][] = [];
  for (let y = 0; y < n; y++) {
    const row: (string | null)[] = [];
    for (let x = 0; x < n; x++) {
      const dx = x - c;
      const dy = y - c;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > r) {
        row.push(null);
      } else if (d > r - 1.3 || Math.abs(dy) < 0.85) {
        // 外周の輪郭 と 上下を分ける赤道線
        row.push(CAPSULE_OUTLINE);
      } else if (dx > -6 && dx < -2 && dy > -7 && dy < -3) {
        // 左上のハイライト（つや）
        row.push(CAPSULE_SHINE);
      } else {
        row.push(dy < 0 ? CAPSULE_GOLD : CAPSULE_WHITE);
      }
    }
    grid.push(row);
  }
  return grid;
}

const CAPSULE_GRID = buildCapsuleGrid();

// カプセルのドット絵 SVG を生成する（sizePx: 表示ピクセルサイズ）。
// タイムカプセルページの主役演出にも、地図の入口ボタンにも同じ絵を使う。
export function buildCapsuleSvg(sizePx: number): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${CAPSULE_N} ${CAPSULE_N}`);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.classList.add("capsule-svg");
  // width/height は属性(プレゼンテーション既定値)として設定する。
  // インラインstyleにすると .capsule-half 内でのクリップ表示や
  // レスポンシブなサイズ調整をCSSで上書きできなくなるため。
  svg.setAttribute("width", String(sizePx));
  svg.setAttribute("height", String(sizePx));
  for (let y = 0; y < CAPSULE_N; y++) {
    let x = 0;
    while (x < CAPSULE_N) {
      const color = CAPSULE_GRID[y][x];
      if (!color) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < CAPSULE_N && CAPSULE_GRID[y][x + run] === color) run++;
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", String(run));
      rect.setAttribute("height", "1");
      rect.setAttribute("fill", color);
      svg.append(rect);
      x += run;
    }
  }
  return svg;
}

// ---- 抽選ロジック ----

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 件数で重み付けした都道府県コードをランダムに1つ選ぶ
function weightedPickPref(entries: [string, number][]): number {
  const total = entries.reduce((sum, [, c]) => sum + c, 0);
  let r = Math.random() * total;
  for (const [key, c] of entries) {
    r -= c;
    if (r <= 0) return Number(key);
  }
  return Number(entries[entries.length - 1][0]);
}

type CapsuleResult =
  | { kind: "same"; story: StorySummary; prefecture: number; season: string }
  | { kind: "random"; story: StorySummary }
  | { kind: "empty" };

async function drawCapsule(): Promise<CapsuleResult> {
  // ---- ログイン中で自分の物語がある場合: 同じ場所×季節の他人の物語を狙う ----
  if (isLoggedIn()) {
    try {
      const { stories: mine } = await myStories();
      const seasoned = mine.filter((s) => !!s.season);
      if (seasoned.length > 0) {
        const seed = pick(seasoned);
        const myHandle = seed.userHandle;
        const res = await listStories({ prefecture: seed.prefecture, limit: 50 });
        const candidates = res.stories.filter(
          (s) => s.season === seed.season && s.userHandle !== myHandle
        );
        if (candidates.length > 0) {
          return {
            kind: "same",
            story: pick(candidates),
            prefecture: seed.prefecture,
            season: seed.season as string
          };
        }
      }
    } catch {
      // 失敗しても全体抽選にフォールバックする
    }
  }

  // ---- 該当なし・未ログイン・自分の物語なし: 全体から重み付きランダム ----
  try {
    const summaryRes: MapSummary = await mapSummary();
    const entries = Object.entries(summaryRes.counts).filter(([, c]) => c > 0);
    if (entries.length === 0) return { kind: "empty" };
    const prefCode = weightedPickPref(entries);
    const res = await listStories({ prefecture: prefCode, limit: 50 });
    if (res.stories.length === 0) return { kind: "empty" };
    return { kind: "random", story: pick(res.stories) };
  } catch {
    return { kind: "empty" };
  }
}

export async function renderCapsulePage(
  _params: Record<string, string>,
  _query: URLSearchParams,
  container: HTMLElement
): Promise<void | CleanupFn> {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let disposed = false;
  const timers = new Set<number>();

  function later(fn: () => void, ms: number): number {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (!disposed) fn();
    }, ms);
    timers.add(id);
    return id;
  }

  container.append(pageTitle("タイムカプセル"));
  container.append(
    el("p", { class: "hint" }, [
      "あなたが過ごした「場所 × 季節」に眠る、誰かの物語をひとつ引き当てます。何度でも引き直せます。"
    ])
  );

  const stage = el("div", { class: "capsule-stage" });
  const visual = el("div", { class: "capsule-visual" });
  const topHalf = el("div", { class: "capsule-half capsule-top" }, [buildCapsuleSvg(160)]);
  const bottomHalf = el("div", { class: "capsule-half capsule-bottom" }, [buildCapsuleSvg(160)]);
  visual.append(topHalf, bottomHalf);

  const openBtn = el("button", { class: "btn capsule-open-btn" }, ["あける"]) as HTMLButtonElement;
  const capsuleMsg = el("p", { class: "capsule-msg", "aria-live": "polite" }, [
    "カプセルを開いて、誰かの物語に出会いましょう。"
  ]);

  stage.append(visual, openBtn, capsuleMsg);

  const resultHost = el("div", { class: "capsule-result-host" });
  container.append(stage, resultHost);

  function resetVisual(): void {
    visual.classList.remove("shaking", "opening");
    void visual.offsetWidth; // 強制リフロー: 連続で引いてもアニメーションを最初からやり直せるようにする
  }

  function showResult(result: CapsuleResult): void {
    resultHost.innerHTML = "";

    if (result.kind === "empty") {
      capsuleMsg.textContent = "まだカプセルは空っぽのようです。";
      resultHost.append(
        el("div", { class: "card capsule-result" }, [
          el("p", {}, ["まだこの世界に物語がひとつも残されていないようです。"]),
          el("p", {}, [
            el("a", { href: "/write", "data-link": true }, ["最初の物語を書いてみませんか →"])
          ])
        ])
      );
      return;
    }

    // 一度開けたら「あける」は消し、引き直しは結果カードの「もういちど回す」に任せる
    openBtn.style.display = "none";

    const isSame = result.kind === "same";
    capsuleMsg.textContent = isSame
      ? `あなたが ${prefName(result.prefecture)} の${seasonLabel(result.season)}を過ごした頃、同じ場所にいた誰かの物語`
      : "世界のどこかの物語";

    const s = result.story;
    resultHost.append(
      el("div", { class: "card capsule-result" }, [
        el("p", { class: "capsule-mode-tag" }, [isSame ? "同じ場所 × 季節" : "世界のどこか"]),
        el("h3", {}, [s.title]),
        el("div", { class: "story-meta" }, [
          `${storyMetaText(s)} ・ `,
          el("a", { href: `/u/${s.userHandle}`, "data-link": true }, [s.username])
        ]),
        el("p", { class: "story-excerpt" }, [s.excerpt]),
        el("div", { class: "capsule-result-actions" }, [
          // 道画面の読書モード(ふきだし)で開く: /p/:pref?story= は直接読書モードになる
          el(
            "a",
            { href: `/p/${s.prefecture}?story=${s.id}`, "data-link": true, class: "btn" },
            ["この物語を読む"]
          ),
          el("button", { class: "btn btn-outline", onclick: () => void runDraw() }, [
            "もういちど回す"
          ])
        ])
      ])
    );
    resultHost.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  }

  async function runDraw(): Promise<void> {
    if (openBtn.disabled) return;
    openBtn.disabled = true;
    resultHost.innerHTML = "";
    capsuleMsg.textContent = "カプセルを開いています…";
    resetVisual();

    const resultPromise = drawCapsule();

    if (reduceMotion) {
      const result = await resultPromise;
      if (disposed) return;
      showResult(result);
      openBtn.disabled = false;
      return;
    }

    const shakeMs = 800 + Math.random() * 400; // 0.8〜1.2秒
    visual.classList.add("shaking");

    const [result] = await Promise.all([
      resultPromise,
      new Promise<void>((resolve) => later(resolve, shakeMs))
    ]);
    if (disposed) return;

    visual.classList.remove("shaking");
    visual.classList.add("opening");

    later(() => {
      showResult(result);
      openBtn.disabled = false;
    }, 480);
  }

  openBtn.addEventListener("click", () => void runDraw());

  return () => {
    disposed = true;
    for (const id of timers) window.clearTimeout(id);
    timers.clear();
  };
}
