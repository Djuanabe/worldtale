import { mapSummary } from "../api";
import {
  JAPAN_MAP_CHARS,
  JAPAN_MAP_H,
  JAPAN_MAP_ROWS,
  JAPAN_MAP_W,
  OKINAWA_INSET
} from "../japanMap";
import { buildPrefCellIndex, drawJapanMapBase, drawPrefHighlight, MapGridData } from "../mapRender";
import { PREF_BY_CODE, PREFECTURES, REGIONS, REGION_BY_PREF, Region } from "../prefectures";
import { navigate } from "../router";
import type { CleanupFn } from "../router";
import { el, errorNode, loadingNode, yearOptions } from "../ui";
import { buildCapsuleSvg } from "./capsule";

const GRID: MapGridData = {
  rows: JAPAN_MAP_ROWS,
  w: JAPAN_MAP_W,
  h: JAPAN_MAP_H,
  chars: JAPAN_MAP_CHARS
};

// 都道府県コード→そのセル一覧。地図データは不変なのでモジュール読み込み時に一度だけ作る。
const PREF_CELLS = buildPrefCellIndex(GRID);

// 地方id→所属県の全セル（全国図での地方ハイライト用）
const REGION_CELLS = new Map<string, Array<[number, number]>>();
for (const p of PREFECTURES) {
  const region = REGION_BY_PREF[p.code];
  if (!region) continue;
  const arr = REGION_CELLS.get(region.id) ?? [];
  arr.push(...(PREF_CELLS.get(p.code) ?? []));
  REGION_CELLS.set(region.id, arr);
}

// 地方id→バウンディングボックス（セル座標）。ズーム変換の計算に使う。
interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const REGION_BBOX = new Map<string, BBox>();
for (const [id, cells] of REGION_CELLS) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of cells) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  REGION_BBOX.set(id, { x0, y0, x1: x1 + 1, y1: y1 + 1 });
}
// 沖縄はインセット枠全体をズーム範囲にする（枠内の海も含めて拡大表示）
REGION_BBOX.set("okinawa", {
  x0: OKINAWA_INSET.x,
  y0: OKINAWA_INSET.y,
  x1: OKINAWA_INSET.x + OKINAWA_INSET.w,
  y1: OKINAWA_INSET.y + OKINAWA_INSET.h
});

// 地方のバウンディングボックスから、全国図(136×150)を基準にした
// CSS transform(scale + translate) を求める。フレーム内に余白 pad を残して収める。
function regionTransform(bbox: BBox): { scale: number; tx: number; ty: number } {
  const pad = 0.08;
  const fx0 = bbox.x0 / JAPAN_MAP_W;
  const fy0 = bbox.y0 / JAPAN_MAP_H;
  const fx1 = bbox.x1 / JAPAN_MAP_W;
  const fy1 = bbox.y1 / JAPAN_MAP_H;
  const bw = fx1 - fx0;
  const bh = fy1 - fy0;
  const scale = Math.min((1 - 2 * pad) / bw, (1 - 2 * pad) / bh);
  const cx = (fx0 + fx1) / 2;
  const cy = (fy0 + fy1) / 2;
  // 変換後フラクション = f*scale + t を中心 0.5 に合わせる
  return { scale, tx: 0.5 - cx * scale, ty: 0.5 - cy * scale };
}

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
  // ズームレイヤー: canvas 2枚をまとめ、地方ズーム時にこれへ transform をかける
  // （カプセル入口や戻るボタンはこの外に置くのでズームの影響を受けない）
  const zoomLayer = el("div", { class: "jp-map-zoom" });
  zoomLayer.append(baseCanvas, hiCanvas);
  mapFrame.append(zoomLayer);

  // ---- 「日本全体へ戻る」ボタン（地方ズーム中のみ表示） ----
  const backBtn = el(
    "button",
    { class: "map-back-btn", type: "button", "aria-label": "日本全体へ戻る" },
    ["◀ 日本全体"]
  ) as HTMLButtonElement;
  backBtn.style.display = "none";
  mapFrame.append(backBtn);

  // ---- タイムカプセルの入口: 地図右下の空いた海域にドット絵カプセルを重ねる ----
  const capsuleEntryWrap = el("div", { class: "capsule-entry-wrap" });
  const capsuleEntryBtn = el(
    "button",
    {
      class: "capsule-entry",
      type: "button",
      "aria-label": "タイムカプセル",
      title: "タイムカプセル",
      onclick: (e: Event) => {
        e.stopPropagation();
        navigate("/capsule");
      }
    },
    [buildCapsuleSvg(40)]
  ) as HTMLButtonElement;
  const capsuleEntryLabel = el("span", { class: "capsule-entry-label", "aria-hidden": "true" }, [
    "タイムカプセル"
  ]);
  capsuleEntryWrap.append(capsuleEntryBtn, capsuleEntryLabel);
  mapFrame.append(capsuleEntryWrap);

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

  // ---- 2段階選択の状態: null=全国図（地方選択） / Region=地方ズーム中（都道府県選択） ----
  let zoomedRegion: Region | null = null;
  // hover 対象: 全国図では地方id、ズーム中では都道府県コード。変化時だけ再描画する。
  let hoverKey: string | number | null = null;

  function regionStoryCount(region: Region): number {
    return region.codes.reduce((sum, c) => sum + (counts[String(c)] ?? 0), 0);
  }

  function clearHighlight(): void {
    const hctx = hiCanvas.getContext("2d");
    if (hctx) drawPrefHighlight(hctx, JAPAN_MAP_W, JAPAN_MAP_H, undefined);
  }

  function setHover(key: string | number | null): void {
    if (key === hoverKey) return;
    hoverKey = key;
    const hctx = hiCanvas.getContext("2d");
    if (!hctx) return;
    if (key == null) {
      drawPrefHighlight(hctx, JAPAN_MAP_W, JAPAN_MAP_H, undefined);
      msgBox.textContent = zoomedRegion ? `${zoomedRegion.name}地方 — 都道府県をえらぶ` : "";
      return;
    }
    if (typeof key === "string") {
      // 全国図: 地方ハイライト
      const region = REGIONS.find((r) => r.id === key);
      drawPrefHighlight(hctx, JAPAN_MAP_W, JAPAN_MAP_H, REGION_CELLS.get(key));
      if (region) msgBox.textContent = `${region.name} ・ ${regionStoryCount(region)}件の物語`;
    } else {
      // ズーム中: 都道府県ハイライト
      drawPrefHighlight(hctx, JAPAN_MAP_W, JAPAN_MAP_H, PREF_CELLS.get(key));
      const pref = PREF_BY_CODE[key];
      const count = counts[String(key)] ?? 0;
      msgBox.textContent = `${pref?.name ?? "不明"} ・ ${count}件の物語`;
    }
  }

  function cellFromEvent(e: { clientX: number; clientY: number }): [number, number] | null {
    // getBoundingClientRect は CSS transform(ズーム) を反映するのでズーム中も式は共通
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

  // セルが沖縄インセットの枠内かどうか（枠内の海を含めて沖縄地方として扱う）
  function inOkinawaInset(cell: [number, number] | null): boolean {
    if (!cell) return false;
    const [x, y] = cell;
    return (
      x >= OKINAWA_INSET.x &&
      x < OKINAWA_INSET.x + OKINAWA_INSET.w &&
      y >= OKINAWA_INSET.y &&
      y < OKINAWA_INSET.y + OKINAWA_INSET.h
    );
  }

  // 全国図で、セルからその地方を解決する（沖縄はインセット枠全体を対象にする）
  function regionAtCell(cell: [number, number] | null): Region | undefined {
    if (inOkinawaInset(cell)) return REGIONS.find((r) => r.id === "okinawa");
    const code = codeFromCell(cell);
    return code != null ? REGION_BY_PREF[code] : undefined;
  }

  function enterRegion(region: Region): void {
    zoomedRegion = region;
    hoverKey = null;
    const { scale, tx, ty } = regionTransform(REGION_BBOX.get(region.id)!);
    zoomLayer.style.transformOrigin = "0 0";
    zoomLayer.style.transform = `translate(${(tx * 100).toFixed(3)}%, ${(ty * 100).toFixed(3)}%) scale(${scale.toFixed(4)})`;
    clearHighlight();
    backBtn.style.display = "";
    capsuleEntryWrap.style.display = "none"; // ズーム中は入口を隠す
    msgBox.textContent = `${region.name}地方 — 都道府県をえらぶ`;
    hiCanvas.setAttribute("aria-label", `${region.name}地方。都道府県をえらぶ`);
  }

  function exitRegion(): void {
    zoomedRegion = null;
    hoverKey = null;
    zoomLayer.style.transform = "";
    clearHighlight();
    backBtn.style.display = "none";
    capsuleEntryWrap.style.display = "";
    msgBox.textContent = "";
    hiCanvas.setAttribute("aria-label", "日本地図。地方をえらぶ");
  }

  backBtn.addEventListener("click", () => exitRegion());

  // マウス等ホバー可能な端末のみ hover ハイライトを追従させる。
  const supportsHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const onPointerMove = (e: PointerEvent) => {
    if (!supportsHover) return;
    const cell = cellFromEvent(e);
    if (zoomedRegion) {
      // ズーム中: その地方に属する都道府県のみ反応（沖縄はインセット枠内も可）
      const code = codeFromCell(cell);
      if (zoomedRegion.id === "okinawa" && inOkinawaInset(cell)) setHover(47);
      else setHover(code != null && zoomedRegion.codes.includes(code) ? code : null);
    } else {
      // 全国図: セル→地方でハイライト（沖縄はインセット枠全体）
      const region = regionAtCell(cell);
      setHover(region ? region.id : null);
    }
  };
  const onPointerLeave = () => setHover(null);
  const onClick = (e: MouseEvent) => {
    const cell = cellFromEvent(e);
    if (zoomedRegion) {
      const code = codeFromCell(cell);
      if (code != null && zoomedRegion.codes.includes(code)) goToPref(code);
      else if (zoomedRegion.id === "okinawa" && inOkinawaInset(cell)) goToPref(47);
    } else {
      const region = regionAtCell(cell);
      if (region) enterRegion(region);
    }
  };

  hiCanvas.addEventListener("pointermove", onPointerMove);
  hiCanvas.addEventListener("pointerleave", onPointerLeave);
  hiCanvas.addEventListener("click", onClick);

  async function loadAndDraw(year: string): Promise<void> {
    if (!zoomedRegion) msgBox.textContent = "";
    hoverKey = null;
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
