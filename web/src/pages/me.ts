import { MyStory, Photo, deletePhoto, followStats, isLoggedIn, myPhotos, myStories } from "../api";
import { compareChronological, prefName, seasonLabel, storyMetaText } from "../prefectures";
import { el, errorNode, loadingNode, pageTitle } from "../ui";
import { navigate } from "../router";
import { buildAuthorShareRow } from "./story";
import { buildMetIcon } from "../icon";

export async function renderMePage(
  _params: Record<string, string>,
  _query: URLSearchParams,
  container: HTMLElement
): Promise<void> {
  if (!isLoggedIn()) {
    navigate("/login", true);
    return;
  }

  container.append(pageTitle("マイページ"));

  // 見守り数（本人のみ表示）
  const watchStats = el("p", { class: "watch-stats" }, [loadingNode("　")]);
  container.append(watchStats);
  void followStats()
    .then((s) => {
      watchStats.innerHTML = "";
      watchStats.append(
        el("span", { class: "watch-stat" }, [`${s.followingCount}人を見守り中`]),
        el("span", { class: "watch-stat-sep" }, ["・"]),
        el("span", { class: "watch-stat" }, [`${s.followerCount}人に見守られ中`])
      );
    })
    .catch(() => {
      watchStats.remove();
    });

  const storySection = el("section", {}, [
    el("h2", {}, ["投稿した物語"]),
    loadingNode("読み込み中…")
  ]);
  const photoSection = el("section", { style: "margin-top:32px" }, [
    el("h2", {}, ["投稿した写真"]),
    loadingNode("読み込み中…")
  ]);
  container.append(storySection, photoSection);

  try {
    const { stories } = await myStories();
    storySection.innerHTML = "";
    storySection.append(el("h2", {}, ["投稿した物語"]), buildStoryList(stories));
  } catch {
    storySection.innerHTML = "";
    storySection.append(el("h2", {}, ["投稿した物語"]), errorNode("読み込みに失敗しました。"));
  }

  try {
    const { photos } = await myPhotos();
    photoSection.innerHTML = "";
    photoSection.append(el("h2", {}, ["投稿した写真"]), buildPhotoGrid(photos, photoSection));
  } catch {
    photoSection.innerHTML = "";
    photoSection.append(el("h2", {}, ["投稿した写真"]), errorNode("読み込みに失敗しました。"));
  }
}

function buildStoryList(stories: MyStory[]): HTMLElement {
  if (stories.length === 0) {
    return el("p", { class: "empty-text" }, ["まだ物語を投稿していません。"]);
  }
  // 時系列（年→季節）で古い順に。紙風のカードで綴じる
  const sorted = [...stories].sort(compareChronological);
  const scroll = el("div", { class: "paper-scroll" });
  for (const s of sorted) {
    const meta = el("div", { class: "paper-entry-meta" }, [
      storyMetaText(s),
      s.isHidden ? " ・ 非公開" : ""
    ]);
    const stats = el("div", { class: "paper-entry-stats" }, [
      el("span", {}, [`👁 ${s.views}`]),
      el("span", {}, [`♡ ${s.likeCount}`]),
      el("span", { class: "stat-met" }, [buildMetIcon(), ` ${s.metCount}`])
    ]);
    const ops = el("div", { class: "me-ops" }, [
      el("a", { class: "btn btn-small", href: `/story/${s.id}/edit`, "data-link": true }, ["編集"]),
      buildAuthorShareRow(s.title, s.id) // 私の物語として共有 + そっと共有
    ]);
    scroll.append(
      el("div", { class: "paper-entry paper-entry-static" }, [
        meta,
        el("h3", { class: "paper-entry-title" }, [
          el("a", { href: `/story/${s.id}`, "data-link": true }, [s.title])
        ]),
        stats,
        ops
      ])
    );
  }
  return scroll;
}

function buildPhotoGrid(photos: Photo[], sectionHost: HTMLElement): HTMLElement {
  if (photos.length === 0) {
    return el("p", { class: "empty-text" }, ["まだ写真を投稿していません。"]);
  }
  const grid = el("div", { class: "photo-grid" });
  for (const p of photos) {
    const figure = el("figure", {}, [
      el("img", { src: p.url, alt: "投稿した風景写真" }),
      el("figcaption", {}, [
        el("span", {}, [`${p.prefecture ? prefName(p.prefecture) : ""} ${seasonLabel(p.season)}`]),
        el(
          "button",
          {
            class: "nav-button",
            onclick: async () => {
              if (!window.confirm("この写真を削除しますか？")) return;
              try {
                await deletePhoto(p.id);
                figure.remove();
                if (grid.children.length === 0) {
                  const empty = el("p", { class: "empty-text" }, ["まだ写真を投稿していません。"]);
                  sectionHost.replaceChild(empty, grid);
                }
              } catch {
                window.alert("削除に失敗しました。");
              }
            }
          },
          ["削除"]
        )
      ])
    ]);
    grid.append(figure);
  }
  return grid;
}
