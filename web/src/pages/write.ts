import { ApiRequestError, StoryDetail, createStory, isLoggedIn, uploadPhoto } from "../api";
import { PREFECTURES, SEASONS } from "../prefectures";
import { el, pageTitle } from "../ui";
import { navigate } from "../router";
import { buildStoryFormFields, storyNoticeBox } from "./storyForm";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export async function renderWritePage(
  _params: Record<string, string>,
  _query: URLSearchParams,
  container: HTMLElement
): Promise<void> {
  if (!isLoggedIn()) {
    navigate("/login", true);
    return;
  }

  container.append(pageTitle("物語を書く"));

  const { titleInput, bodyInput, prefSelect, yearSelect, fieldRows } = buildStoryFormFields();

  const agreeCheckbox = el("input", { type: "checkbox" }) as HTMLInputElement;
  const submitBtn = el("button", { class: "btn", type: "submit", disabled: true }, [
    "投稿する"
  ]) as HTMLButtonElement;
  const status = el("p", { class: "hint" }, []);

  agreeCheckbox.addEventListener("change", () => {
    submitBtn.disabled = !agreeCheckbox.checked;
  });

  const form = el(
    "form",
    {},
    [
      ...fieldRows,
      storyNoticeBox(),
      el("div", { class: "checkbox-row" }, [
        agreeCheckbox,
        el("label", {}, ["注意事項を読み、同意しました"])
      ]),
      el("div", { style: "margin-top:16px" }, [submitBtn]),
      status
    ]
  ) as HTMLFormElement;

  container.append(el("div", { class: "card" }, [form]));

  const photoHost = el("div");
  container.append(photoHost);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!agreeCheckbox.checked) return;
    const title = titleInput.value.trim();
    const body = bodyInput.value;
    if (title.length < 1) {
      status.textContent = "タイトルを入力してください。";
      return;
    }
    if (body.length < 1) {
      status.textContent = "本文を入力してください。";
      return;
    }
    submitBtn.disabled = true;
    status.textContent = "投稿しています…";
    try {
      const story: StoryDetail = await createStory({
        title,
        body,
        prefecture: Number(prefSelect.value),
        year: Number(yearSelect.value)
      });
      status.textContent = "投稿しました。";
      form.querySelectorAll("input, textarea, select, button").forEach((elm) => {
        (elm as HTMLInputElement).disabled = true;
      });
      photoHost.append(buildPhotoUploadSection(story));
    } catch (err) {
      submitBtn.disabled = false;
      if (err instanceof ApiRequestError) {
        status.textContent = `投稿に失敗しました: ${err.message}`;
      } else {
        status.textContent = "投稿に失敗しました。";
      }
    }
  });
}

function buildPhotoUploadSection(story: StoryDetail): HTMLElement {
  const wrap = el("div", { class: "card" }, [
    el("h3", {}, ["風景写真を添える（任意）"]),
    el("p", { class: "hint" }, [
      "その場所・季節の風景写真を1枚添えられます。顔が写っている写真は投稿しないでください（5MBまで）。"
    ])
  ]);

  const prefSelect = el("select") as HTMLSelectElement;
  for (const p of PREFECTURES) {
    const opt = el("option", { value: String(p.code) }, [p.name]) as HTMLOptionElement;
    if (p.code === story.prefecture) opt.selected = true;
    prefSelect.append(opt);
  }

  const seasonSelect = el("select") as HTMLSelectElement;
  for (const s of SEASONS) {
    seasonSelect.append(el("option", { value: s.key }, [s.label]));
  }

  const fileInput = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp" }) as HTMLInputElement;
  const uploadStatus = el("p", { class: "hint" }, []);
  const uploadBtn = el("button", { class: "btn" }, ["写真をアップロード"]) as HTMLButtonElement;

  uploadBtn.addEventListener("click", async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      uploadStatus.textContent = "写真を選んでください。";
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      uploadStatus.textContent = "5MBを超える写真はアップロードできません。";
      return;
    }
    uploadBtn.disabled = true;
    uploadStatus.textContent = "アップロード中…";
    try {
      await uploadPhoto({
        file,
        prefecture: Number(prefSelect.value),
        season: seasonSelect.value,
        storyId: story.id
      });
      uploadStatus.textContent = "写真をアップロードしました。";
      uploadBtn.disabled = true;
      fileInput.disabled = true;
      prefSelect.disabled = true;
      seasonSelect.disabled = true;
    } catch (err) {
      uploadBtn.disabled = false;
      if (err instanceof ApiRequestError && err.code === "PHOTO_SLOT_TAKEN") {
        uploadStatus.textContent = "この場所・季節にはすでにあなたの写真があります。";
      } else if (err instanceof ApiRequestError) {
        uploadStatus.textContent = `アップロードに失敗しました: ${err.message}`;
      } else {
        uploadStatus.textContent = "アップロードに失敗しました。";
      }
    }
  });

  wrap.append(
    el("div", { class: "form-field" }, [el("label", {}, ["都道府県"]), prefSelect]),
    el("div", { class: "form-field" }, [el("label", {}, ["季節"]), seasonSelect]),
    el("div", { class: "form-field" }, [el("label", {}, ["写真ファイル"]), fileInput]),
    uploadBtn,
    uploadStatus,
    el("p", { style: "margin-top:16px" }, [
      el("a", { href: `/story/${story.id}`, "data-link": true }, ["投稿した物語を見る →"])
    ])
  );

  return wrap;
}
