import {
  ApiRequestError,
  StoryDetail,
  fetchMe,
  getStory,
  isLoggedIn,
  updateStory
} from "../api";
import { el, errorNode, loadingNode, pageTitle } from "../ui";
import { navigate } from "../router";
import { buildStoryFormFields, storyNoticeBox } from "./storyForm";

export async function renderEditPage(
  params: Record<string, string>,
  _query: URLSearchParams,
  container: HTMLElement
): Promise<void> {
  const id = params.id;

  if (!isLoggedIn()) {
    navigate("/login", true);
    return;
  }

  container.append(loadingNode("読み込み中…"));

  let story: StoryDetail;
  try {
    const [storyRes, meRes] = await Promise.all([getStory(id), fetchMe()]);
    story = storyRes;
    if (story.userHandle !== meRes.user.handle) {
      // 本人以外は物語ページへ戻す
      navigate(`/story/${id}`, true);
      return;
    }
  } catch (e) {
    container.innerHTML = "";
    if (e instanceof ApiRequestError && e.status === 404) {
      container.append(errorNode("物語が見つかりませんでした。"));
    } else if (e instanceof ApiRequestError && e.status === 401) {
      navigate("/login", true);
    } else {
      container.append(errorNode("読み込みに失敗しました。"));
    }
    return;
  }

  container.innerHTML = "";
  container.append(pageTitle("物語を編集する"));

  const { titleInput, bodyInput, prefSelect, municipalityInput, yearSelect, seasonSelect, fieldRows } =
    buildStoryFormFields({
      title: story.title,
      body: story.body,
      prefecture: story.prefecture,
      municipality: story.municipality,
      year: story.year,
      season: story.season
    });

  const submitBtn = el("button", { class: "btn", type: "submit" }, ["保存する"]) as HTMLButtonElement;
  const status = el("p", { class: "hint" }, []);

  const form = el(
    "form",
    {},
    [
      ...fieldRows,
      storyNoticeBox(),
      el("div", { style: "margin-top:16px", class: "share-row" }, [
        submitBtn,
        el(
          "a",
          { class: "btn btn-outline", href: `/story/${id}`, "data-link": true },
          ["キャンセル"]
        )
      ]),
      status
    ]
  ) as HTMLFormElement;

  container.append(el("div", { class: "card" }, [form]));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
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
    submitBtn.disabled = true;
    status.textContent = "保存しています…";
    try {
      await updateStory(id, {
        title,
        body,
        prefecture: Number(prefSelect.value),
        municipality,
        year: Number(yearSelect.value),
        season: seasonSelect.value
      });
      navigate(`/story/${id}`);
    } catch (err) {
      submitBtn.disabled = false;
      if (err instanceof ApiRequestError && err.code === "STORY_SLOT_TAKEN") {
        status.textContent =
          "この場所・季節にはすでにあなたの物語があります。1つの場所×季節に書けるのは1つまでです。";
      } else if (err instanceof ApiRequestError) {
        status.textContent = `保存に失敗しました: ${err.message}`;
      } else {
        status.textContent = "保存に失敗しました。";
      }
    }
  });
}
