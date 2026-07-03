import { PREFECTURES } from "../prefectures";
import { el, yearOptions } from "../ui";

// /write と /story/:id/edit で共有する物語フォームの部品
export interface StoryFormFields {
  titleInput: HTMLInputElement;
  bodyInput: HTMLTextAreaElement;
  prefSelect: HTMLSelectElement;
  yearSelect: HTMLSelectElement;
  fieldRows: HTMLElement[];
}

export function buildStoryFormFields(initial?: {
  title?: string;
  body?: string;
  prefecture?: number;
  year?: number;
}): StoryFormFields {
  const titleInput = el("input", { type: "text", maxlength: "100" }) as HTMLInputElement;
  const bodyInput = el("textarea", { maxlength: "20000" }) as HTMLTextAreaElement;

  const prefSelect = el("select") as HTMLSelectElement;
  for (const p of PREFECTURES) {
    prefSelect.append(el("option", { value: String(p.code) }, [p.name]));
  }

  const yearSelect = el("select") as HTMLSelectElement;
  const currentYear = new Date().getFullYear();
  for (const y of yearOptions(currentYear - 100)) {
    yearSelect.append(el("option", { value: String(y) }, [`${y}年`]));
  }

  if (initial?.title !== undefined) titleInput.value = initial.title;
  if (initial?.body !== undefined) bodyInput.value = initial.body;
  prefSelect.value = String(initial?.prefecture ?? 1);
  yearSelect.value = String(initial?.year ?? currentYear);

  const fieldRows = [
    el("div", { class: "form-field" }, [el("label", {}, ["タイトル"]), titleInput]),
    el("div", { class: "form-field" }, [el("label", {}, ["本文"]), bodyInput]),
    el("div", { class: "form-field" }, [el("label", {}, ["都道府県"]), prefSelect]),
    el("div", { class: "form-field" }, [el("label", {}, ["年"]), yearSelect])
  ];

  return { titleInput, bodyInput, prefSelect, yearSelect, fieldRows };
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
