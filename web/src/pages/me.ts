import { MyStory, Photo, deletePhoto, isLoggedIn, myPhotos, myStories } from "../api";
import { prefName, seasonLabel } from "../prefectures";
import { el, errorNode, loadingNode, pageTitle } from "../ui";
import { navigate } from "../router";

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
    storySection.append(el("h2", {}, ["投稿した物語"]), buildStoryTable(stories));
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

function buildStoryTable(stories: MyStory[]): HTMLElement {
  if (stories.length === 0) {
    return el("p", { class: "empty-text" }, ["まだ物語を投稿していません。"]);
  }
  const table = el("table", { class: "stat-table" });
  const thead = el("thead", {}, [
    el("tr", {}, [
      el("th", {}, ["タイトル"]),
      el("th", {}, ["場所・年"]),
      el("th", {}, ["閲覧数"]),
      el("th", {}, ["いいね"]),
      el("th", {}, ["出会ってたかも"]),
      el("th", {}, ["状態"]),
      el("th", {}, ["操作"])
    ])
  ]);
  const tbody = el("tbody", {});
  for (const s of stories) {
    tbody.append(
      el("tr", {}, [
        el("td", {}, [el("a", { href: `/story/${s.id}`, "data-link": true }, [s.title])]),
        el("td", {}, [`${prefName(s.prefecture)} ・ ${s.year}年`]),
        el("td", {}, [String(s.views)]),
        el("td", {}, [String(s.likeCount)]),
        el("td", {}, [String(s.metCount)]),
        el("td", {}, [s.isHidden ? "非公開" : "公開中"]),
        el("td", {}, [el("a", { href: `/story/${s.id}/edit`, "data-link": true }, ["編集"])])
      ])
    );
  }
  table.append(thead, tbody);
  return table;
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
