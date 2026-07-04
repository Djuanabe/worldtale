import { PREFECTURES, SEASONS } from "../prefectures";
import { el, yearOptions } from "../ui";

// /write と /story/:id/edit で共有する物語フォームの部品
export interface StoryFormFields {
  titleInput: HTMLInputElement;
  bodyInput: HTMLTextAreaElement;
  prefSelect: HTMLSelectElement;
  municipalityInput: HTMLInputElement;
  yearSelect: HTMLSelectElement;
  seasonSelect: HTMLSelectElement;
  fieldRows: HTMLElement[];
}

export function buildStoryFormFields(initial?: {
  title?: string;
  body?: string;
  prefecture?: number;
  municipality?: string | null;
  year?: number;
  season?: string | null;
}): StoryFormFields {
  const titleInput = el("input", { type: "text", maxlength: "100" }) as HTMLInputElement;
  const bodyInput = el("textarea", { maxlength: "20000" }) as HTMLTextAreaElement;

  const prefSelect = el("select") as HTMLSelectElement;
  for (const p of PREFECTURES) {
    prefSelect.append(el("option", { value: String(p.code) }, [p.name]));
  }

  const municipalityInput = el("input", {
    type: "text",
    maxlength: "50",
    placeholder: "例: 世田谷区"
  }) as HTMLInputElement;

  const yearSelect = el("select") as HTMLSelectElement;
  const currentYear = new Date().getFullYear();
  for (const y of yearOptions(currentYear - 100)) {
    yearSelect.append(el("option", { value: String(y) }, [`${y}年`]));
  }

  const seasonSelect = el("select") as HTMLSelectElement;
  for (const s of SEASONS) {
    seasonSelect.append(el("option", { value: s.key }, [s.label]));
  }

  if (initial?.title !== undefined) titleInput.value = initial.title;
  if (initial?.body !== undefined) bodyInput.value = initial.body;
  prefSelect.value = String(initial?.prefecture ?? 1);
  municipalityInput.value = initial?.municipality ?? "";
  yearSelect.value = String(initial?.year ?? currentYear);
  seasonSelect.value = initial?.season ?? "spring";

  const fieldRows = [
    el("div", { class: "form-field" }, [el("label", {}, ["タイトル"]), titleInput]),
    el("div", { class: "form-field" }, [el("label", {}, ["本文"]), bodyInput]),
    el("div", { class: "form-field" }, [el("label", {}, ["都道府県"]), prefSelect]),
    el("div", { class: "form-field" }, [
      el("label", {}, ["市区町村"]),
      municipalityInput,
      el("p", { class: "hint" }, [
        "市区町村まで。番地・建物名・施設名などは書かないでください"
      ])
    ]),
    el("div", { class: "form-field" }, [el("label", {}, ["年"]), yearSelect]),
    el("div", { class: "form-field" }, [el("label", {}, ["季節"]), seasonSelect])
  ];

  return { titleInput, bodyInput, prefSelect, municipalityInput, yearSelect, seasonSelect, fieldRows };
}

export function storyNoticeBox(): HTMLElement {
  return el("div", { class: "notice-box" }, [
    el("h3", {}, ["投稿する前に"]),
    el("ul", {}, [
      el("li", {}, ["個人を特定できる情報（学校名・職場名・住所・実名など）を書かない"]),
      el("li", {}, ["他者を害する内容を書かない"]),
      el("li", {}, ["顔が写った写真は投稿しない"])
    ])
  ]);
}
