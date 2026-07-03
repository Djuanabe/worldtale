import { mapSummary } from "../api";
import { PREFECTURES } from "../prefectures";
import { el, errorNode, loadingNode, yearOptions } from "../ui";

function colorFor(count: number, max: number): string {
  if (count <= 0 || max <= 0) return "#fffdf7";
  const ratio = Math.min(1, count / max);
  // 生成り(255,253,247) → 深緑(91,110,79) へ補間
  const from = [255, 253, 247];
  const to = [91, 110, 79];
  const rgb = from.map((c, i) => Math.round(c + (to[i] - c) * (0.15 + ratio * 0.85)));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function textColorFor(count: number, max: number): string {
  const ratio = max > 0 ? count / max : 0;
  return ratio > 0.45 ? "#fffdf7" : "#3a3226";
}

export async function renderHome(
  _params: Record<string, string>,
  query: URLSearchParams,
  container: HTMLElement
): Promise<void> {
  const currentYear = new Date().getFullYear();
  const initialYear = query.get("year") ?? "";

  container.append(
    el("div", { class: "concept" }, [
      el("p", { class: "concept-text" }, ["世界はたくさんの物語でできている"]),
      el("p", { class: "hint" }, [
        "都道府県をえらぶと、そこに残された物語を読むことができます。"
      ])
    ])
  );

  const controls = el("div", { class: "map-controls" });
  const yearSelect = el("select", { "aria-label": "年で絞り込む" }) as HTMLSelectElement;
  yearSelect.append(el("option", { value: "" }, ["すべての年"]));
  for (const y of yearOptions(currentYear - 60)) {
    const opt = el("option", { value: String(y) }, [`${y}年`]) as HTMLOptionElement;
    if (String(y) === initialYear) opt.selected = true;
    yearSelect.append(opt);
  }
  controls.append(yearSelect);
  container.append(controls);

  const mapHost = el("div");
  container.append(mapHost);

  async function loadMap(year: string) {
    mapHost.innerHTML = "";
    mapHost.append(loadingNode("地図を読み込み中…"));
    try {
      const summary = await mapSummary(year ? Number(year) : undefined);
      mapHost.innerHTML = "";
      mapHost.append(buildMap(summary.counts, year));
    } catch (e) {
      mapHost.innerHTML = "";
      mapHost.append(errorNode("地図の読み込みに失敗しました。"));
    }
  }

  function buildMap(counts: Record<string, number>, year: string): HTMLElement {
    const max = Math.max(0, ...Object.values(counts));
    const wrap = el("div", { class: "map-wrap" });
    const grid = el("div", { class: "pref-map" });

    for (const pref of PREFECTURES) {
      const count = counts[String(pref.code)] ?? 0;
      const tile = el(
        "a",
        {
          href: year ? `/p/${pref.code}?year=${year}` : `/p/${pref.code}`,
          "data-link": true,
          class: "pref-tile",
          title: `${pref.name}: ${count}件の物語`
        },
        [pref.short]
      );
      tile.style.setProperty("--col", String(pref.col));
      tile.style.setProperty("--row", String(pref.row));
      tile.style.background = colorFor(count, max);
      tile.style.color = textColorFor(count, max);
      if (pref.code === 47) tile.dataset.okinawa = "true";
      grid.append(tile);
    }
    wrap.append(grid);

    const legend = el("div", { class: "map-legend" }, [
      el("span", { class: "legend-swatch", style: "background:#fffdf7" }),
      "少ない",
      el("span", { class: "legend-swatch", style: "background:rgb(91,110,79)" }),
      "多い"
    ]);
    wrap.append(legend);
    return wrap;
  }

  yearSelect.addEventListener("change", () => {
    const y = yearSelect.value;
    history.replaceState({}, "", y ? `/?year=${y}` : "/");
    void loadMap(y);
  });

  await loadMap(initialYear);
}
