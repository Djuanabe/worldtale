import { ApiRequestError, StorySummary, getUser, listStories } from "../api";
import { prefName } from "../prefectures";
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
        el("p", { class: "hint" }, [`ID: ${user.handle} ・ 物語 ${user.storyCount}件`])
      ])
    );

    const stories = [...storyResult.stories].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.createdAt.localeCompare(b.createdAt);
    });

    if (stories.length === 0) {
      container.append(el("p", { class: "empty-text" }, ["まだ物語がありません。"]));
      return;
    }

    const timeline = el("div", { class: "story-list" });
    for (const s of stories) {
      timeline.append(buildTimelineItem(s));
    }
    container.append(timeline);
  } catch (e) {
    container.innerHTML = "";
    if (e instanceof ApiRequestError && e.status === 404) {
      container.append(errorNode("ユーザーが見つかりませんでした。"));
    } else {
      container.append(errorNode("読み込みに失敗しました。"));
    }
  }
}

function buildTimelineItem(s: StorySummary): HTMLElement {
  return el("div", { class: "story-item" }, [
    el("h3", {}, [el("a", { href: `/story/${s.id}`, "data-link": true }, [s.title])]),
    el("div", { class: "story-meta" }, [`${s.year}年 ・ ${prefName(s.prefecture)}`]),
    el("p", { class: "story-excerpt" }, [s.excerpt])
  ]);
}
