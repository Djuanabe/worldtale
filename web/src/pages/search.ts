import { StorySummary, listStories } from "../api";
import { PREFECTURES, prefName } from "../prefectures";
import { el, errorNode, loadingNode, pageTitle, yearOptions } from "../ui";

export async function renderSearchPage(
  _params: Record<string, string>,
  query: URLSearchParams,
  container: HTMLElement
): Promise<void> {
  container.append(pageTitle("さがす"));
  container.append(
    el("p", { class: "hint" }, ["自分が過ごした場所と時期から、そのころの物語をさがせます。"])
  );

  const prefSelect = el("select", { "aria-label": "都道府県" }) as HTMLSelectElement;
  prefSelect.append(el("option", { value: "" }, ["都道府県を選ぶ"]));
  for (const p of PREFECTURES) {
    prefSelect.append(el("option", { value: String(p.code) }, [p.name]));
  }

  const yearSelect = el("select", { "aria-label": "年" }) as HTMLSelectElement;
  yearSelect.append(el("option", { value: "" }, ["年を選ぶ"]));
  const currentYear = new Date().getFullYear();
  for (const y of yearOptions(currentYear - 100)) {
    yearSelect.append(el("option", { value: String(y) }, [`${y}年`]));
  }

  const initialPref = query.get("prefecture") ?? "";
  const initialYear = query.get("year") ?? "";
  prefSelect.value = initialPref;
  yearSelect.value = initialYear;

  const searchBtn = el("button", { class: "btn" }, ["さがす"]);
  const form = el("form", { class: "search-form" }, [
    el("div", { class: "form-field" }, [el("label", {}, ["都道府県"]), prefSelect]),
    el("div", { class: "form-field" }, [el("label", {}, ["年"]), yearSelect]),
    searchBtn
  ]) as HTMLFormElement;

  container.append(form);

  const resultHost = el("div");
  container.append(resultHost);

  let currentPage = 1;

  async function runSearch(page: number) {
    resultHost.innerHTML = "";
    resultHost.append(loadingNode("さがしています…"));
    try {
      const result = await listStories({
        prefecture: prefSelect.value ? Number(prefSelect.value) : undefined,
        year: yearSelect.value ? Number(yearSelect.value) : undefined,
        page,
        limit: 20
      });
      resultHost.innerHTML = "";
      resultHost.append(buildResults(result.stories, result.total));
      if (result.total > 20) {
        resultHost.append(buildPagination(page, result.total, 20));
      }
    } catch {
      resultHost.innerHTML = "";
      resultHost.append(errorNode("検索に失敗しました。"));
    }
  }

  function buildResults(stories: StorySummary[], total: number): HTMLElement {
    if (stories.length === 0) {
      return el("p", { class: "empty-text" }, ["条件に合う物語が見つかりませんでした。"]);
    }
    const wrap = el("div");
    wrap.append(el("p", { class: "hint" }, [`${total}件見つかりました`]));
    const list = el("div", { class: "story-list" });
    for (const s of stories) {
      list.append(
        el("div", { class: "story-item" }, [
          el("h3", {}, [el("a", { href: `/story/${s.id}`, "data-link": true }, [s.title])]),
          el("div", { class: "story-meta" }, [
            `${prefName(s.prefecture)} ・ ${s.year}年 ・ `,
            el("a", { href: `/u/${s.userHandle}`, "data-link": true }, [s.username])
          ]),
          el("p", { class: "story-excerpt" }, [s.excerpt])
        ])
      );
    }
    wrap.append(list);
    return wrap;
  }

  function buildPagination(page: number, total: number, limit: number): HTMLElement {
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const wrap = el("div", { class: "pagination" });
    const prev = el(
      "button",
      { class: "btn btn-outline", onclick: () => { currentPage--; void runSearch(currentPage); } },
      ["前へ"]
    ) as HTMLButtonElement;
    prev.disabled = page <= 1;
    const next = el(
      "button",
      { class: "btn btn-outline", onclick: () => { currentPage++; void runSearch(currentPage); } },
      ["次へ"]
    ) as HTMLButtonElement;
    next.disabled = page >= totalPages;
    wrap.append(prev, el("span", {}, [`${page} / ${totalPages}`]), next);
    return wrap;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    currentPage = 1;
    const sp = new URLSearchParams();
    if (prefSelect.value) sp.set("prefecture", prefSelect.value);
    if (yearSelect.value) sp.set("year", yearSelect.value);
    const qstr = sp.toString();
    history.replaceState({}, "", `/search${qstr ? `?${qstr}` : ""}`);
    void runSearch(currentPage);
  });

  if (initialPref || initialYear) {
    await runSearch(currentPage);
  } else {
    resultHost.append(el("p", { class: "empty-text" }, ["条件を選んでさがしてみましょう。"]));
  }
}
