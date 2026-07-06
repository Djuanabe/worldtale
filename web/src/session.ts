// ログイン状態の初期化: 管理者フラグの取得と、運営からの警告バナー表示。
import { Warning, ackWarning, fetchMe, isLoggedIn, myWarnings, setAdminCached } from "./api";
import { el, renderHeader } from "./ui";

export async function initSession(): Promise<void> {
  if (!isLoggedIn()) return;

  try {
    const { user } = await fetchMe();
    setAdminCached(!!user.isAdmin);
    if (user.isAdmin) renderHeader(); // 「管理」リンクを反映
  } catch {
    // トークン失効などは無視（各ページ側で未ログインとして扱われる）
    return;
  }

  try {
    const { warnings } = await myWarnings();
    if (warnings.length) showWarningBanner(warnings);
  } catch {
    // 警告取得の失敗は致命的ではない
  }
}

function showWarningBanner(warnings: Warning[]): void {
  document.getElementById("warning-banner")?.remove();
  const banner = el("div", { id: "warning-banner", class: "warning-banner" });

  for (const w of warnings) {
    const item = el("div", { class: "warning-item" }, [
      el("p", { class: "warning-msg" }, [`⚠ 運営からのお知らせ: ${w.message}`]),
      el(
        "button",
        {
          class: "btn btn-small",
          onclick: async (e: Event) => {
            const btn = e.currentTarget as HTMLButtonElement;
            btn.disabled = true;
            try {
              await ackWarning(w.id);
              item.remove();
              if (!banner.querySelector(".warning-item")) banner.remove();
            } catch {
              btn.disabled = false;
            }
          }
        },
        ["確認しました"]
      )
    ]);
    banner.append(item);
  }
  document.body.prepend(banner);
}
