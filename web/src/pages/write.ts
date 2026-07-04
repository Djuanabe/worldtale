import { ApiRequestError, StoryDetail, createStory, isLoggedIn, uploadPhoto } from "../api";
import { el, pageTitle } from "../ui";
import { navigate } from "../router";
import { buildStoryFormFields, storyNoticeBox } from "./storyForm";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

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

  const { titleInput, bodyInput, prefSelect, municipalityInput, yearSelect, seasonSelect, fieldRows } =
    buildStoryFormFields();

  const photoInput = el("input", {
    type: "file",
    accept: "image/jpeg,image/png,image/webp"
  }) as HTMLInputElement;
  const photoField = el("div", { class: "form-field" }, [
    el("label", {}, ["風景写真（任意）"]),
    photoInput,
    el("p", { class: "hint" }, [
      "その土地・季節の風景写真を1枚添えられます。顔が写っているものは投稿しないでください。",
      el("br"),
      "1ユーザーにつき1場所×1季節1枚まで。5MBまで（JPEG/PNG/WebP）。"
    ])
  ]);

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
      photoField,
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

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!agreeCheckbox.checked) return;
    const title = titleInput.value.trim();
    const body = bodyInput.value;
    const municipality = municipalityInput.value.trim();
    if (title.length < 1) {
      status.textContent = "タイトルを入力してください。";
      return;
    }
    if (body.length < 1) {
      status.textContent = "本文を入力してください。";
      return;
    }
    if (municipality.length < 1 || municipality.length > 50) {
      status.textContent = "市区町村を1〜50文字で入力してください。";
      return;
    }

    const photoFile = photoInput.files?.[0] ?? null;
    if (photoFile) {
      if (photoFile.size > MAX_PHOTO_BYTES) {
        status.textContent = "写真は5MBまでです。別のファイルを選んでください。";
        return;
      }
      if (!ALLOWED_PHOTO_TYPES.includes(photoFile.type)) {
        status.textContent = "写真はJPEG/PNG/WebPのみ対応しています。";
        return;
      }
    }

    submitBtn.disabled = true;
    status.textContent = "投稿しています…";
    let story: StoryDetail;
    try {
      story = await createStory({
        title,
        body,
        prefecture: Number(prefSelect.value),
        municipality,
        year: Number(yearSelect.value),
        season: seasonSelect.value
      });
    } catch (err) {
      submitBtn.disabled = false;
      if (err instanceof ApiRequestError && err.code === "STORY_SLOT_TAKEN") {
        status.textContent =
          "この場所・季節にはすでにあなたの物語があります。1つの場所×季節に書けるのは1つまでです。";
      } else if (err instanceof ApiRequestError) {
        status.textContent = `投稿に失敗しました: ${err.message}`;
      } else {
        status.textContent = "投稿に失敗しました。";
      }
      return;
    }

    // 物語の投稿はここで成功。以降、写真アップロードの失敗は物語投稿の成功と区別して案内する。
    if (!photoFile) {
      navigate(`/story/${story.id}`);
      return;
    }

    status.textContent = "投稿しました。写真をアップロードしています…";
    try {
      await uploadPhoto({
        file: photoFile,
        prefecture: story.prefecture,
        season: story.season ?? seasonSelect.value,
        storyId: story.id
      });
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "PHOTO_SLOT_TAKEN") {
        window.alert(
          "物語は投稿されました。写真はこの場所・季節にすでにあなたの1枚があるため追加されませんでした。"
        );
      } else {
        window.alert("物語は投稿されました。写真のアップロードには失敗しました。");
      }
    }
    navigate(`/story/${story.id}`);
  });
}
