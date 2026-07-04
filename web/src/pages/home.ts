import { mapSummary } from "../api";
import {
  JAPAN_MAP_CHARS,
  JAPAN_MAP_H,
  JAPAN_MAP_ROWS,
  JAPAN_MAP_W,
  OKINAWA_INSET
} from "../japanMap";
import { buildPrefCellIndex, drawJapanMapBase, drawPrefHighlight, MapGridData } from "../mapRender";
import { PREF_BY_CODE, PREFECTURES } from "../prefectures";
import { navigate } from "../router";
import type { CleanupFn } from "../router";
import { el, errorNode, loadingNode, yearOptions } from "../ui";

const GRID: MapGridData = {
  rows: JAPAN_MAP_ROWS,
  w: JAPAN_MAP_W,
  h: JAPAN_MAP_H,
  chars: JAPAN_MAP_CHARS
};

// 都道府県コード→そのセル一覧。地図データは不変なのでモジュール読み込み時に一度だけ作る。
const PREF_CELLS = buildPrefCellIndex(GRID);

export async function renderHome(
  _params: Record<string, string>,
  query: URLSearchParams,
  container: HTMLElement
): Promise<void | CleanupFn> {
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

  const mapHost = el("div", { class: "jp-map-wrap" });
  container.append(mapHost);

  // ---- canvas 2枚重ね: ベース地図(海・陸・海岸線)は1回だけ描画し、
  //      ハイライト(hover中の都道府県)だけを上のレイヤーに描き直す ----
  const mapFrame = el("div", { class: "jp-map-frame" });
  const baseCanvas = el("canvas", {
    class: "jp-map-canvas",
    width: String(JAPAN_MAP_W),
    height: String(JAPAN_MAP_H)
  }) as HTMLCanvasElement;
  const hiCanvas = el("canvas", {
    class: "jp-map-canvas jp-map-highlight",
    width: String(JAPAN_MAP_W),
    height: String(JAPAN_MAP_H),
    role: "img",
    "aria-label": "日本地図。都道府県ごとの物語数を色の濃淡で表す"
  }) as HTMLCanvasElement;
  mapFrame.append(baseCanvas, hiCanvas);
  mapHost.append(mapFrame);

  const msgBox = el("div", { class: "map-msg", "aria-live": "polite" });
  mapHost.append(msgBox);

  const legend = el("div", { class: "map-legend" }, [
    el("span", { class: "legend-swatch", style: "background:#a8c890" }),
    "少ない",
    el("span", { class: "legend-swatch", style: "background:#4a7a3a" }),
    "多い"
  ]);
  mapHost.append(legend);

  // ---- アクセシビリティ用: 都道府県プルダウン ----
  const a11yRow = el("div", { class: "map-select-row" });
  const prefSelect = el("select", { "aria-label": "都道府県をえらぶ" }) as HTMLSelectElement;
  prefSelect.append(el("option", { value: "" }, ["都道府県をえらぶ"]));
  for (const p of PREFECTURES) {
    prefSelect.append(el("option", { value: String(p.code) }, [p.name]));
  }
  const goBtn = el("button", { class: "btn", type: "button" }, ["この都道府県へ"]) as HTMLButtonElement;
  a11yRow.append(prefSelect, goBtn);
  mapHost.append(a11yRow);

  let counts: Record<string, number> = {};
  let max = 0;

  function goToPref(code: number): void {
    const y = yearSelect.value;
    navigate(y ? `/p/${code}?year=${y}` : `/p/${code}`);
  }

  goBtn.addEventListener("click", () => {
    const code = Number(prefSelect.value);
    if (code) goToPref(code);
  });

  // ---- hover状態: 都道府県が変わったときだけ再描画する ----
  let hoverCode: number | null = null;

  function setHover(code: number | null): void {
    if (code === hoverCode) return;
    hoverCode = code;
    const hctx = hiCanvas.getContext("2d");
    if (hctx) drawPrefHighlight(hctx, JAPAN_MAP_W, JAPAN_MAP_H, code != null ? PREF_CELLS.get(code) : undefined);
    if (code != null) {
      const pref = PREF_BY_CODE[code];
      const count = counts[String(code)] ?? 0;
      msgBox.textContent = `${pref?.name ?? "不明"} ・ ${count}件の物語`;
    } else {
      msgBox.textContent = "";
    }
  }

  function cellFromEvent(e: { clientX: number; clientY: number }): [number, number] | null {
    const rect = hiCanvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    if (relX < 0 || relX >= 1 || relY < 0 || relY >= 1) return null;
    const cx = Math.min(JAPAN_MAP_W - 1, Math.max(0, Math.floor(relX * JAPAN_MAP_W)));
    const cy = Math.min(JAPAN_MAP_H - 1, Math.max(0, Math.floor(relY * JAPAN_MAP_H)));
    return [cx, cy];
  }

  function codeFromCell(cell: [number, number] | null): number | null {
    if (!cell) return null;
    const [x, y] = cell;
    const row = JAPAN_MAP_ROWS[y];
    if (!row) return null;
    const ch = row[x];
    if (!ch || ch === ".") return null;
    const i = JAPAN_MAP_CHARS.indexOf(ch);
    return i >= 0 ? i + 1 : null;
  }

  // マウス等ホバー可能な端末のみ hover ハイライトを追従させる。
  // タッチ端末はホバー概念がないため、タップ即遷移でよい（シンプルな実装を優先）。
  const supportsHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const onPointerMove = (e: PointerEvent) => {
    if (!supportsHover) return;
    setHover(codeFromCell(cellFromEvent(e)));
  };
  const onPointerLeave = () => setHover(null);
  const onClick = (e: MouseEvent) => {
    const code = codeFromCell(cellFromEvent(e));
    if (code != null) goToPref(code);
  };

  hiCanvas.addEventListener("pointermove", onPointerMove);
  hiCanvas.addEventListener("pointerleave", onPointerLeave);
  hiCanvas.addEventListener("click", onClick);

  async function loadAndDraw(year: string): Promise<void> {
    msgBox.textContent = "";
    hoverCode = null;
    try {
      const summary = await mapSummary(year ? Number(year) : undefined);
      counts = summary.counts;
    } catch {
      // 件数が取れなくても地図自体は描く（濃淡なし）
      counts = {};
      mapHost.insertBefore(errorNode("物語数の読み込みに失敗しました。"), mapFrame);
    }
    max = Math.max(0, ...Object.values(counts));
    const ctx = baseCanvas.getContext("2d");
    if (ctx) drawJapanMapBase(ctx, GRID, counts, max, OKINAWA_INSET);
    const hctx = hiCanvas.getContext("2d");
    if (hctx) hctx.clearRect(0, 0, JAPAN_MAP_W, JAPAN_MAP_H);
  }

  yearSelect.addEventListener("change", () => {
    const y = yearSelect.value;
    history.replaceState({}, "", y ? `/?year=${y}` : "/");
    void loadAndDraw(y);
  });

  const loading = loadingNode("地図を読み込み中…");
  mapHost.insertBefore(loading, mapFrame);
  await loadAndDraw(initialYear);
  loading.remove();

  return () => {
    hiCanvas.removeEventListener("pointermove", onPointerMove);
    hiCanvas.removeEventListener("pointerleave", onPointerLeave);
    hiCanvas.removeEventListener("click", onClick);
  };
}
