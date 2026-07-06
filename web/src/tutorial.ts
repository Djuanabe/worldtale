// 未ログイン時のチュートリアル。
// 地図 → 人をクリック → 登録 → 書く、へと誘導する RPG 風メッセージウィンドウ。
// - ログイン中は表示しない
// - 「スキップ」はそのセッション中のみ非表示（新しい訪問では再び出る＝毎回表示）
// - 「ログイン」はいつでも押せる
import { isLoggedIn } from "./api";
import { el } from "./ui";
import { navigate } from "./router";
import { buildWorldTaleIcon } from "./icon";

const SKIP_KEY = "wt_tutorial_skipped";

let root: HTMLElement | null = null;
let hasReadStory = false; // 一度でも人をクリックして物語を開いたか

type Step = "map" | "pref" | "invite";

function isSkipped(): boolean {
  return sessionStorage.getItem(SKIP_KEY) === "1";
}

function currentStep(): Step | null {
  const path = location.pathname;
  if (path === "/") return "map";
  if (path.startsWith("/p/")) return hasReadStory ? "invite" : "pref";
  return null;
}

function teardown(): void {
  if (root) {
    root.remove();
    root = null;
  }
}

const STEP_TEXT: Record<Step, string> = {
  map: "ここにはたくさんの物語が眠っています。それぞれが主人公のみんなの物語です。",
  pref: "この土地を歩いている人をタップすると、その人の物語を読むことができます。",
  invite: "あなたも主人公の一人です。よければ私たちに教えていただけませんか？"
};

const STEP_HINT: Partial<Record<Step, string>> = {
  map: "地図から地方をえらんでみましょう（例：近畿 → 京都）",
  pref: "白い人かげをタップ"
};

function render(): void {
  if (isLoggedIn() || isSkipped()) {
    teardown();
    return;
  }
  const step = currentStep();
  if (!step) {
    teardown();
    return;
  }
  // 読書オーバーレイ表示中は没入を妨げないよう隠す（閉じたら再評価で招待ステップが出る）
  if (document.querySelector(".reader-overlay")) {
    teardown();
    return;
  }

  teardown();

  const speaker = el("div", { class: "tut-speaker" }, [buildWorldTaleIcon(20), "WorldTale"]);
  const text = el("p", { class: "tut-text" }, [STEP_TEXT[step]]);
  const bodyChildren: HTMLElement[] = [speaker, text];
  const hint = STEP_HINT[step];
  if (hint) bodyChildren.push(el("p", { class: "tut-hint" }, [`▶ ${hint}`]));

  const actions = el("div", { class: "tut-actions" });
  if (step === "invite") {
    actions.append(
      el("button", { class: "btn tut-primary", onclick: () => navigate("/register") }, ["登録する"])
    );
  }
  actions.append(
    el("button", { class: "btn btn-outline tut-btn", onclick: () => navigate("/login") }, ["ログイン"]),
    el(
      "button",
      {
        class: "btn btn-outline tut-btn tut-skip",
        onclick: () => {
          sessionStorage.setItem(SKIP_KEY, "1");
          teardown();
        }
      },
      ["スキップ"]
    )
  );
  bodyChildren.push(actions);

  const win = el("div", { class: "tut-window" }, bodyChildren);
  root = el("div", { class: "tutorial-overlay" }, [win]);
  document.body.append(root);
}

export function initTutorial(): void {
  // 人をクリックして物語を開いたら、招待ステップへ
  document.addEventListener("wt:reader-open", () => {
    hasReadStory = true;
    render();
  });
  // 画面遷移のたびに再評価
  document.addEventListener("wt:navigated", () => render());
  render();
}
