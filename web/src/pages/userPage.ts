import { ApiRequestError, StorySummary, UserProfile, getUser, listStories, toggleFollow } from "../api";
import { compareChronological, storyMetaText } from "../prefectures";
import { el, errorNode, loadingNode } from "../ui";
import { navigate } from "../router";

export async function renderUserPage(
  params: Record<string, string>,
  _query: URLSearchParams,
  container: HTMLElement
): Promise<void> {
  const handle = params.handle;
  container.append(loadingNode("読み込み中…"));

  try {
    const [user, storyResult] = await Promise.all([
      getUser(handle),
      listStories({ userId: handle, page: 1, limit: 50 })
    ]);

    container.innerHTML = "";
    container.append(
      el("div", { class: "card" }, [
        el("h1", { class: "page-title", style: "border-bottom:none" }, [user.username]),
        el("p", { class: "hint" }, [`物語 ${user.storyCount}件 ・ 古い順にたどれます`]),
        buildWatchButton(user)
      ])
    );

    // 時系列（年→季節）で古い順に並べ、その人の歩みをたどれるようにする
    const stories = [...storyResult.stories].sort(compareChronological);

    if (stories.length === 0) {
      container.append(el("p", { class: "empty-text" }, ["まだ物語がありません。"]));
      return;
    }

    // 紙風のタイムライン（一枚の紙に綴じられた日記のように）
    const scroll = el("div", { class: "paper-scroll" });
    for (const s of stories) {
      scroll.append(buildPaperEntry(s));
    }
    container.append(scroll);
  } catch (e) {
    container.innerHTML = "";
    if (e instanceof ApiRequestError && e.status === 404) {
      container.append(errorNode("ユーザーが見つかりませんでした。"));
    } else {
      container.append(errorNode("読み込みに失敗しました。"));
    }
  }
}

// 「見守る」ボタン。本人には出さない。未ログインならログインへ誘導。
// フォロー/フォロワー数は本人のみ（マイページ）で確認できるので、ここには出さない。
function buildWatchButton(user: UserProfile): HTMLElement {
  if (user.isSelf) return el("span", {});

  const notLoggedIn = user.isFollowing === null; // 本人でなく null＝未ログイン
  let following = user.isFollowing === true;

  const btn = el("button", { class: "btn watch-btn" }, []) as HTMLButtonElement;
  const paint = () => {
    btn.textContent = following ? "見守り中（やめる）" : "見守る";
    btn.classList.toggle("btn-outline", following);
  };
  paint();

  btn.addEventListener("click", async () => {
    if (notLoggedIn) {
      navigate("/login");
      return;
    }
    btn.disabled = true;
    try {
      const res = await toggleFollow(user.handle);
      following = res.isFollowing;
      paint();
    } catch {
      window.alert("見守る操作に失敗しました。時間をおいてお試しください。");
    } finally {
      btn.disabled = false;
    }
  });

  return el("div", { class: "watch-row" }, [btn]);
}

function buildPaperEntry(s: StorySummary): HTMLElement {
  return el("a", { class: "paper-entry", href: `/story/${s.id}`, "data-link": true }, [
    el("div", { class: "paper-entry-meta" }, [storyMetaText(s)]),
    el("h3", { class: "paper-entry-title" }, [s.title]),
    el("p", { class: "paper-entry-excerpt" }, [s.excerpt])
  ]);
}
