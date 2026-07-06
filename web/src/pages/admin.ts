import {
  AdminReport,
  ApiRequestError,
  adminDeleteTarget,
  adminReports,
  adminSetReportStatus,
  adminSetVisibility,
  adminWarn,
  isLoggedIn
} from "../api";
import { el, errorNode, loadingNode, pageTitle } from "../ui";
import { navigate } from "../router";

const REASON_LABEL: Record<string, string> = {
  personal_info: "個人を特定できる情報",
  face: "顔が写った写真",
  harmful: "不快・有害な内容",
  other: "その他"
};
const STATUS_LABEL: Record<string, string> = {
  open: "未対応",
  resolved: "対応済み",
  dismissed: "却下"
};

export async function renderAdminPage(
  _params: Record<string, string>,
  query: URLSearchParams,
  container: HTMLElement
): Promise<void> {
  if (!isLoggedIn()) {
    navigate("/login", true);
    return;
  }

  container.append(pageTitle("報告の管理"));

  const status = query.get("status") ?? "open";
  const filterRow = el("div", { class: "admin-filter" });
  for (const s of ["open", "resolved", "dismissed", "all"]) {
    const label = s === "all" ? "すべて" : STATUS_LABEL[s];
    const a = el(
      "a",
      { class: "btn btn-small" + (s === status ? "" : " btn-outline"), href: `/admin?status=${s}`, "data-link": true },
      [label]
    );
    filterRow.append(a);
  }
  container.append(filterRow);

  const listHost = el("div", { class: "admin-list" }, [loadingNode("読み込み中…")]);
  container.append(listHost);

  let data: { reports: AdminReport[] };
  try {
    data = await adminReports(status);
  } catch (e) {
    listHost.innerHTML = "";
    if (e instanceof ApiRequestError && (e.status === 403 || e.status === 401)) {
      listHost.append(errorNode("この画面は管理者のみ利用できます。"));
    } else {
      listHost.append(errorNode("読み込みに失敗しました。"));
    }
    return;
  }

  listHost.innerHTML = "";
  if (data.reports.length === 0) {
    listHost.append(el("p", { class: "empty-text" }, ["該当する報告はありません。"]));
    return;
  }
  for (const r of data.reports) {
    listHost.append(buildReportCard(r));
  }
}

function buildReportCard(r: AdminReport): HTMLElement {
  const card = el("div", { class: "admin-card" });

  const head = el("div", { class: "admin-card-head" }, [
    el("span", { class: "admin-badge" }, [REASON_LABEL[r.reason] ?? r.reason]),
    el("span", { class: "admin-status admin-status-" + r.status }, [STATUS_LABEL[r.status] ?? r.status]),
    el("span", { class: "admin-when" }, [new Date(r.createdAt).toLocaleString("ja-JP")])
  ]);
  card.append(head);

  // 対象コンテンツ
  const targetBox = el("div", { class: "admin-target" });
  if (!r.target.exists) {
    targetBox.append(el("p", { class: "hint" }, ["対象は既に削除されています。"]));
  } else {
    const t = r.target;
    if (t.isHidden) targetBox.append(el("span", { class: "admin-hidden-badge" }, ["非表示中"]));
    if (r.targetType === "story") {
      targetBox.append(
        el("h3", {}, [
          el("a", { href: `/story/${r.targetId}`, "data-link": true, target: "_blank" }, [t.title ?? "(無題)"])
        ]),
        el("p", { class: "admin-excerpt" }, [t.excerpt ?? ""])
      );
    } else if (t.url) {
      targetBox.append(el("img", { class: "admin-photo", src: t.url, alt: "報告された写真" }));
    }
    targetBox.append(
      el("p", { class: "admin-author" }, [
        "投稿者: ",
        el("a", { href: `/u/${t.authorHandle}`, "data-link": true }, [t.authorUsername || t.authorHandle])
      ])
    );
  }
  card.append(targetBox);

  if (r.detail) {
    card.append(el("p", { class: "admin-detail" }, [`報告者コメント: ${r.detail}`]));
  }
  card.append(el("p", { class: "admin-reporter" }, [`報告者: ${r.reporterHandle}`]));

  // 操作
  const ops = el("div", { class: "admin-ops" });
  const feedback = el("span", { class: "admin-feedback" }, []);

  if (r.target.exists) {
    const author = r.target.authorHandle;
    const hidden = r.target.isHidden;
    const hideBtn = el("button", { class: "btn btn-small btn-outline" }, [hidden ? "再表示する" : "非表示にする"]) as HTMLButtonElement;
    hideBtn.addEventListener("click", async () => {
      hideBtn.disabled = true;
      try {
        const res = await adminSetVisibility(r.targetType, r.targetId, !hidden);
        feedback.textContent = res.isHidden ? "非表示にしました" : "再表示しました";
        window.setTimeout(() => navigate(location.pathname + location.search, true), 700);
      } catch {
        feedback.textContent = "失敗しました";
        hideBtn.disabled = false;
      }
    });

    const delBtn = el("button", { class: "btn btn-small btn-danger" }, ["削除する"]) as HTMLButtonElement;
    delBtn.addEventListener("click", async () => {
      if (!window.confirm("この投稿を完全に削除します。取り消せません。よろしいですか？")) return;
      delBtn.disabled = true;
      try {
        await adminDeleteTarget(r.targetType, r.targetId);
        feedback.textContent = "削除しました";
        window.setTimeout(() => navigate(location.pathname + location.search, true), 700);
      } catch {
        feedback.textContent = "失敗しました";
        delBtn.disabled = false;
      }
    });

    const warnBtn = el("button", { class: "btn btn-small" }, ["作者に警告"]) as HTMLButtonElement;
    warnBtn.addEventListener("click", async () => {
      const msg = window.prompt(
        "作者に送る警告メッセージを入力してください。\n（本人がログイン時にアプリ内で表示されます）",
        "ガイドラインに反する内容が報告されています。ご確認ください。"
      );
      if (!msg || !msg.trim()) return;
      warnBtn.disabled = true;
      try {
        await adminWarn(author, msg.trim());
        feedback.textContent = "警告を送りました";
      } catch {
        feedback.textContent = "失敗しました";
      } finally {
        warnBtn.disabled = false;
      }
    });

    ops.append(hideBtn, delBtn, warnBtn);
  }

  // ステータス操作
  if (r.status !== "resolved") {
    ops.append(buildStatusBtn(r.id, "resolved", "対応済みにする"));
  }
  if (r.status !== "dismissed") {
    ops.append(buildStatusBtn(r.id, "dismissed", "却下する"));
  }

  card.append(ops, feedback);
  return card;
}

function buildStatusBtn(id: string, status: "resolved" | "dismissed", label: string): HTMLButtonElement {
  const btn = el("button", { class: "btn btn-small btn-outline" }, [label]) as HTMLButtonElement;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      await adminSetReportStatus(id, status);
      navigate(location.pathname + location.search, true);
    } catch {
      btn.disabled = false;
    }
  });
  return btn;
}
