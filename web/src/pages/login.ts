import { ApiRequestError, login, setToken } from "../api";
import { el, pageTitle, renderHeader } from "../ui";
import { navigate } from "../router";

export async function renderLoginPage(
  _params: Record<string, string>,
  _query: URLSearchParams,
  container: HTMLElement
): Promise<void> {
  container.append(pageTitle("ログイン"));

  const idInput = el("input", { type: "text", placeholder: "ユーザーID" }) as HTMLInputElement;
  const passwordInput = el("input", { type: "password", placeholder: "パスワード" }) as HTMLInputElement;
  const status = el("p", { class: "hint" }, []);
  const submitBtn = el("button", { class: "btn", type: "submit" }, ["ログイン"]) as HTMLButtonElement;

  const form = el("form", {}, [
    el("div", { class: "form-field" }, [el("label", {}, ["ユーザーID"]), idInput]),
    el("div", { class: "form-field" }, [el("label", {}, ["パスワード"]), passwordInput]),
    submitBtn,
    status
  ]) as HTMLFormElement;

  container.append(el("div", { class: "card" }, [form]));
  container.append(
    el("p", { class: "hint" }, [
      "アカウントをお持ちでない方は ",
      el("a", { href: "/register", "data-link": true }, ["こちらから登録"]),
      "。"
    ])
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const publicId = idInput.value.trim();
    const password = passwordInput.value;
    if (!publicId || !password) {
      status.textContent = "ユーザーIDとパスワードを入力してください。";
      return;
    }
    submitBtn.disabled = true;
    status.textContent = "ログインしています…";
    try {
      const res = await login(publicId, password);
      setToken(res.token);
      renderHeader();
      navigate("/me");
    } catch (err) {
      submitBtn.disabled = false;
      if (err instanceof ApiRequestError) {
        status.textContent = "ログインに失敗しました。ユーザーIDまたはパスワードが正しくありません。";
      } else {
        status.textContent = "ログインに失敗しました。";
      }
    }
  });
}
