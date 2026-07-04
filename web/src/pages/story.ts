import {
  ApiRequestError,
  StoryDetail,
  deleteStory,
  fetchMe,
  getReactions,
  getStory,
  isLoggedIn,
  reactToStory,
  submitReport
} from "../api";
import { storyMetaText } from "../prefectures";
import { el, errorNode, loadingNode, openModal } from "../ui";
import { navigate } from "../router";

function twitterIntentUrl(text: string, url: string): string {
  const sp = new URLSearchParams({ text, url });
  return `https://twitter.com/intent/tweet?${sp.toString()}`;
}

const QUIET_TEXT = "世界のどこかに私の物語を追加しました #WorldTale";

// 「そっと共有」のみ（閲覧画面用: /story/:id と読書モード）
export function buildQuietShareRow(): HTMLElement {
  const anonUrl = `${location.origin}/`;
  const shareRow = el("div", { class: "share-row" });
  shareRow.append(
    el(
      "a",
      {
        class: "btn btn-outline",
        href: twitterIntentUrl(QUIET_TEXT, anonUrl),
        target: "_blank",
        rel: "noopener noreferrer"
      },
      ["そっと共有"]
    )
  );
  if (typeof navigator.share === "function") {
    shareRow.append(
      el(
        "button",
        {
          class: "btn btn-outline",
          onclick: () => {
            void navigator.share({ text: QUIET_TEXT, url: anonUrl }).catch(() => {});
          }
        },
        ["この端末でそっと共有"]
      )
    );
  }
  return shareRow;
}

// 作者用（マイページの自分の物語ごと）: 「私の物語として共有」+「そっと共有」
export function buildAuthorShareRow(title: string, storyId: string): HTMLElement {
  const origin = location.origin;
  const asAuthorText = `「${title}」 — わたしの物語 #WorldTale`;
  const asAuthorUrl = `${origin}/story/${storyId}`;

  const shareRow = el("div", { class: "share-row share-row-compact" });
  shareRow.append(
    el(
      "a",
      {
        class: "btn btn-outline btn-small",
        href: twitterIntentUrl(asAuthorText, asAuthorUrl),
        target: "_blank",
        rel: "noopener noreferrer"
      },
      ["私の物語として共有"]
    )
  );
  if (typeof navigator.share === "function") {
    shareRow.append(
      el(
        "button",
        {
          class: "btn btn-outline btn-small",
          onclick: () => {
            void navigator.share({ text: asAuthorText, url: asAuthorUrl }).catch(() => {});
          }
        },
        ["この端末で共有"]
      )
    );
  }
  const quiet = buildQuietShareRow();
  quiet.querySelectorAll(".btn").forEach((b) => b.classList.add("btn-small"));
  for (const child of Array.from(quiet.children)) shareRow.append(child);
  return shareRow;
}

export async function renderStoryPage(
  params: Record<string, string>,
  _query: URLSearchParams,
  container: HTMLElement
): Promise<void> {
  const id = params.id;
  container.append(loadingNode("物語を読み込み中…"));

  let story: StoryDetail;
  try {
    story = await getStory(id);
  } catch (e) {
    container.innerHTML = "";
    if (e instanceof ApiRequestError && e.status === 404) {
      container.append(errorNode("物語が見つかりませんでした。削除されたか、非公開になった可能性があります。"));
    } else {
      container.append(errorNode("物語の読み込みに失敗しました。"));
    }
    return;
  }

  container.innerHTML = "";

  let reacted = { like: false, met: false };
  try {
    const r = await getReactions(id);
    reacted = r.reacted;
    story.likeCount = r.likeCount;
    story.metCount = r.metCount;
  } catch {
    // 匿名リアクション状態が取得できなくても閲覧は継続
  }

  const header = el("div", { class: "story-header" }, [
    el("h1", { class: "page-title", style: "border-bottom:none" }, [story.title]),
    el("p", { class: "story-meta" }, [
      `${storyMetaText(story)} ・ `,
      el("a", { href: `/u/${story.userPublicId}`, "data-link": true }, [story.username])
    ])
  ]);
  container.append(header);

  const bodyEl = el("div", { class: "story-body" }, [story.body]);
  container.append(bodyEl);

  if (story.photos.length > 0) {
    const photoWrap = el("div", { class: "story-photos" });
    for (const p of story.photos) {
      const img = el("img", { src: p.url, alt: `${story.title} の風景写真` });
      photoWrap.append(img);
    }
    container.append(photoWrap);
  }

  // ---- リアクション ----
  const reactionRow = el("div", { class: "reaction-row" });
  const likeBtn = el(
    "button",
    { class: "reaction-btn" + (reacted.like ? " active" : "") },
    [`♡ いいね (${story.likeCount})`]
  ) as HTMLButtonElement;
  const metBtn = el(
    "button",
    { class: "reaction-btn" + (reacted.met ? " active" : "") },
    [`⛩ 出会ってたかも (${story.metCount})`]
  ) as HTMLButtonElement;

  function bindReaction(btn: HTMLButtonElement, type: "like" | "met") {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        const res = await reactToStory(id, type);
        story.likeCount = res.likeCount;
        story.metCount = res.metCount;
        reacted = res.reacted;
        likeBtn.textContent = `♡ いいね (${story.likeCount})`;
        metBtn.textContent = `⛩ 出会ってたかも (${story.metCount})`;
        likeBtn.classList.toggle("active", reacted.like);
        metBtn.classList.toggle("active", reacted.met);
      } catch {
        window.alert("リアクションの送信に失敗しました。もう一度お試しください。");
      } finally {
        btn.disabled = false;
      }
    });
  }
  bindReaction(likeBtn, "like");
  bindReaction(metBtn, "met");
  reactionRow.append(likeBtn, metBtn);
  container.append(reactionRow);

  // ---- 共有（閲覧画面は「そっと共有」のみ） ----
  container.append(buildQuietShareRow());

  // ---- 編集・削除（本人のみ） ----
  if (isLoggedIn()) {
    try {
      const me = await fetchMe();
      if (me.user.publicId === story.userPublicId) {
        const editLink = el(
          "a",
          { class: "btn btn-outline", href: `/story/${story.id}/edit`, "data-link": true },
          ["この物語を編集する"]
        );
        const deleteBtn = el(
          "button",
          {
            class: "btn btn-danger",
            onclick: async () => {
              if (!window.confirm("この物語を削除します。よろしいですか？（添付写真も削除されます）")) return;
              try {
                await deleteStory(story.id);
                navigate("/me");
              } catch {
                window.alert("削除に失敗しました。");
              }
            }
          },
          ["この物語を削除する"]
        );
        container.append(el("div", { class: "share-row" }, [editLink, deleteBtn]));
      }
    } catch {
      // 本人確認に失敗しても閲覧は継続
    }
  }

  // ---- 報告 ----
  const reportLink = el(
    "button",
    {
      class: "report-link",
      onclick: () => {
        if (!isLoggedIn()) {
          navigate("/login");
          return;
        }
        openReportModal(id);
      }
    },
    ["この物語を報告する"]
  );
  container.append(el("p", {}, [reportLink]));
}

export function openReportModal(storyId: string): void {
  openModal((close) => {
    const reasonSelect = el("select", {}) as HTMLSelectElement;
    const reasons: { value: string; label: string }[] = [
      { value: "personal_info", label: "個人を特定できる情報が含まれている" },
      { value: "face", label: "顔が写った写真が含まれている" },
      { value: "harmful", label: "不快・有害な内容" },
      { value: "other", label: "その他" }
    ];
    for (const r of reasons) {
      reasonSelect.append(el("option", { value: r.value }, [r.label]));
    }
    const detail = el("textarea", {
      placeholder: "詳細（任意）",
      style: "min-height:100px"
    }) as HTMLTextAreaElement;
    const status = el("p", { class: "hint" }, []);

    const submitBtn = el(
      "button",
      {
        class: "btn",
        onclick: async () => {
          submitBtn.setAttribute("disabled", "true");
          try {
            await submitReport({
              targetType: "story",
              targetId: storyId,
              reason: reasonSelect.value as any,
              detail: detail.value || undefined
            });
            status.textContent = "報告を受け付けました。ご協力ありがとうございます。";
            window.setTimeout(close, 1200);
          } catch {
            status.textContent = "報告の送信に失敗しました。時間をおいて再度お試しください。";
            submitBtn.removeAttribute("disabled");
          }
        }
      },
      ["送信する"]
    ) as HTMLButtonElement;

    return el("div", {}, [
      el("h3", {}, ["この物語を報告する"]),
      el("div", { class: "form-field" }, [el("label", {}, ["理由"]), reasonSelect]),
      el("div", { class: "form-field" }, [el("label", {}, ["詳細（任意）"]), detail]),
      status,
      el("div", { class: "share-row" }, [
        submitBtn,
        el("button", { class: "btn btn-outline", onclick: close }, ["キャンセル"])
      ])
    ]);
  });
}
