import { ApiRequestError, StorySummary, getUser, listStories } from "../api";
import { compareChronological, storyMetaText } from "../prefectures";
import { el, errorNode, loadingNode } from "../ui";

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
        el("p", { class: "hint" }, [`物語 ${user.storyCount}件 ・ 古い順にたどれます`])
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

function buildPaperEntry(s: StorySummary): HTMLElement {
  return el("a", { class: "paper-entry", href: `/story/${s.id}`, "data-link": true }, [
    el("div", { class: "paper-entry-meta" }, [storyMetaText(s)]),
    el("h3", { class: "paper-entry-title" }, [s.title]),
    el("p", { class: "paper-entry-excerpt" }, [s.excerpt])
  ]);
}
