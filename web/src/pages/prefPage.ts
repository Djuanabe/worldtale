import { listPhotos, listStories, Photo, StorySummary } from "../api";
import { PREF_BY_CODE, SEASONS } from "../prefectures";
import { el, errorNode, loadingNode, yearOptions } from "../ui";
import type { CleanupFn } from "../router";

const SLIDE_INTERVAL_MS = 8000;

export async function renderPrefPage(
  params: Record<string, string>,
  query: URLSearchParams,
  container: HTMLElement
): Promise<void | CleanupFn> {
  const prefCode = Number(params.pref);
  const pref = PREF_BY_CODE[prefCode];

  if (!pref) {
    container.append(errorNode("都道府県が見つかりませんでした。"));
    return;
  }

  const initialYear = query.get("year") ?? "";
  let currentSeason = query.get("season") ?? "";
  let currentPage = 1;
  let slideTimer: number | undefined;

  // ---- 背景スライドショー（ヒーロー領域） ----
  const hero = el("div", { class: "pref-hero" });
  const slideHost = el("div", { class: "slideshow-host" });
  const paper = el("div", { class: "slideshow-paper" });
  const heroContent = el("div", { class: "pref-hero-content" });

  const seasonTabs = el("div", { class: "season-tabs" });
  const allTab = makeSeasonTab("すべて", "");
  seasonTabs.append(allTab);
  for (const s of SEASONS) {
    seasonTabs.append(makeSeasonTab(s.label, s.key));
  }

  heroContent.append(pageTitleForPref(pref.name), seasonTabs);
  hero.append(slideHost, paper, heroContent);

  const photoCredit = el("p", { class: "photo-credit" });

  const controls = el("div", { class: "map-controls" });
  const yearSelect = el("select", { "aria-label": "年で絞り込む" }) as HTMLSelectElement;
  yearSelect.append(el("option", { value: "" }, ["すべての年"]));
  const currentYear = new Date().getFullYear();
  for (const y of yearOptions(currentYear - 60)) {
    const opt = el("option", { value: String(y) }, [`${y}年`]) as HTMLOptionElement;
    if (String(y) === initialYear) opt.selected = true;
    yearSelect.append(opt);
  }
  controls.append(yearSelect);

  const listHost = el("div");

  container.append(hero, photoCredit, controls, listHost);

  function makeSeasonTab(label: string, key: string): HTMLElement {
    const tab = el(
      "button",
      {
        class: "season-tab" + (currentSeason === key ? " active" : ""),
        onclick: () => {
          currentSeason = key;
          updateUrl();
          for (const child of Array.from(seasonTabs.children)) {
            child.classList.remove("active");
          }
          tab.classList.add("active");
          void loadPhotos();
        }
      },
      [label]
    );
    return tab;
  }

  function pageTitleForPref(name: string): HTMLElement {
    return el("h1", { class: "page-title", style: "border-bottom:none" }, [name]);
  }

  function updateUrl() {
    const sp = new URLSearchParams();
    if (yearSelect.value) sp.set("year", yearSelect.value);
    if (currentSeason) sp.set("season", currentSeason);
    const qstr = sp.toString();
    history.replaceState({}, "", `/p/${prefCode}${qstr ? `?${qstr}` : ""}`);
  }

  async function loadPhotos() {
    slideHost.innerHTML = "";
    if (slideTimer) window.clearInterval(slideTimer);
    photoCredit.textContent = "";
    try {
      const res = await listPhotos(prefCode, currentSeason || undefined);
      setupSlideshow(res.photos);
    } catch {
      // 写真が取れなくても本文閲覧は継続できるようにする
    }
  }

  function setupSlideshow(photos: Photo[]) {
    if (photos.length === 0) return;
    let index = 0;
    const layers = photos.map((p) => {
      const layer = el("div", { class: "slideshow-layer" });
      layer.style.backgroundImage = `url("${p.url}")`;
      return layer;
    });
    layers.forEach((l) => slideHost.append(l));
    layers[0].classList.add("active");
    updateCredit(photos[0]);

    if (photos.length > 1) {
      slideTimer = window.setInterval(() => {
        layers[index].classList.remove("active");
        index = (index + 1) % layers.length;
        layers[index].classList.add("active");
        updateCredit(photos[index]);
      }, SLIDE_INTERVAL_MS);
    }
  }

  function updateCredit(photo: Photo) {
    photoCredit.textContent = photo.username ? `写真: ${photo.username}` : "";
  }

  async function loadStories(page: number) {
    listHost.innerHTML = "";
    listHost.append(loadingNode("物語を読み込み中…"));
    try {
      const year = yearSelect.value ? Number(yearSelect.value) : undefined;
      const result = await listStories({ prefecture: prefCode, year, page, limit: 20 });
      listHost.innerHTML = "";
      listHost.append(buildStoryList(result.stories));
      if (result.total > result.stories.length || page > 1) {
        listHost.append(buildPagination(page, result.total, 20));
      }
    } catch {
      listHost.innerHTML = "";
      listHost.append(errorNode("物語の読み込みに失敗しました。"));
    }
  }

  function buildStoryList(stories: StorySummary[]): HTMLElement {
    if (stories.length === 0) {
      return el("p", { class: "empty-text" }, ["まだこの場所の物語はありません。"]);
    }
    const list = el("div", { class: "story-list" });
    for (const s of stories) {
      const item = el("div", { class: "story-item" }, [
        el("h3", {}, [el("a", { href: `/story/${s.id}`, "data-link": true }, [s.title])]),
        el("div", { class: "story-meta" }, [
          `${s.year}年 ・ `,
          el("a", { href: `/u/${s.userPublicId}`, "data-link": true }, [s.username]),
          ` ・ ♡${s.likeCount} ・ 出会ってたかも${s.metCount}`
        ]),
        el("p", { class: "story-excerpt" }, [s.excerpt])
      ]);
      list.append(item);
    }
    return list;
  }

  function buildPagination(page: number, total: number, limit: number): HTMLElement {
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const wrap = el("div", { class: "pagination" });
    const prev = el(
      "button",
      { class: "btn btn-outline", disabled: page <= 1, onclick: () => { currentPage--; void loadStories(currentPage); } },
      ["前へ"]
    ) as HTMLButtonElement;
    prev.disabled = page <= 1;
    const info = el("span", {}, [`${page} / ${totalPages}`]);
    const next = el(
      "button",
      { class: "btn btn-outline", onclick: () => { currentPage++; void loadStories(currentPage); } },
      ["次へ"]
    ) as HTMLButtonElement;
    next.disabled = page >= totalPages;
    wrap.append(prev, info, next);
    return wrap;
  }

  yearSelect.addEventListener("change", () => {
    updateUrl();
    currentPage = 1;
    void loadStories(currentPage);
  });

  void loadPhotos();
  void loadStories(currentPage);

  // ページ離脱時にタイマーを止める
  return () => {
    if (slideTimer) window.clearInterval(slideTimer);
  };
}
