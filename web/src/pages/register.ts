import { ApiRequestError, register, setToken } from "../api";
import { el, pageTitle, renderHeader } from "../ui";
import { navigate } from "../router";

export async function renderRegisterPage(
  _params: Record<string, string>,
  _query: URLSearchParams,
  container: HTMLElement
): Promise<void> {
  container.append(pageTitle("はじめる"));

  const usernameInput = el("input", { type: "text", maxlength: "30" }) as HTMLInputElement;
  const passwordInput = el("input", { type: "password", minlength: "8" }) as HTMLInputElement;
  const status = el("p", { class: "hint" }, []);
  const submitBtn = el("button", { class: "btn", type: "submit" }, ["登録する"]) as HTMLButtonElement;

  const form = el("form", {}, [
    el("div", { class: "form-field" }, [
      el("label", {}, ["ユーザー名（公開されます・一意でなくてよい）"]),
      usernameInput
    ]),
    el("div", { class: "form-field" }, [
      el("label", {}, ["パスワード（8文字以上）"]),
      passwordInput
    ]),
    submitBtn,
    status
  ]) as HTMLFormElement;

  container.append(el("div", { class: "card" }, [form]));
  container.append(
    el("p", { class: "hint" }, [
      "メールアドレスは使用しません。パスワードを忘れると再設定できませんのでご注意ください。",
      " すでにアカウントをお持ちの方は ",
      el("a", { href: "/login", "data-link": true }, ["ログイン"]),
      "。"
    ])
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (username.length < 1) {
      status.textContent = "ユーザー名を入力してください。";
      return;
    }
    if (password.length < 8) {
      status.textContent = "パスワードは8文字以上で入力してください。";
      return;
    }
    submitBtn.disabled = true;
    status.textContent = "登録しています…";
    try {
      const res = await register(username, password);
      setToken(res.token);
      renderHeader();
      showIdReveal(container, res.user.publicId, res.user.username);
    } catch (err) {
      submitBtn.disabled = false;
      if (err instanceof ApiRequestError) {
        status.textContent = `登録に失敗しました: ${err.message}`;
      } else {
        status.textContent = "登録に失敗しました。";
      }
    }
  });
}

function showIdReveal(container: HTMLElement, publicId: string, username: string): void {
  container.innerHTML = "";
  container.append(pageTitle("登録が完了しました"));

  const confirmCheckbox = el("input", { type: "checkbox" }) as HTMLInputElement;
  const continueBtn = el(
    "button",
    { class: "btn", disabled: true, onclick: () => navigate("/write") },
    ["さっそく物語を書く"]
  ) as HTMLButtonElement;

  confirmCheckbox.addEventListener("change", () => {
    continueBtn.disabled = !confirmCheckbox.checked;
  });

  container.append(
    el("div", { class: "card id-reveal" }, [
      el("p", {}, [`ようこそ、${username} さん。`]),
      el("p", { class: "id-warning" }, [
        "このユーザーIDがあなたのログインIDです。再発行はできません。必ず控えてください。"
      ]),
      el("div", { class: "id-value" }, [publicId]),
      el("p", { class: "hint" }, [
        "これはログイン用のIDで、他の人には見えません。メモやスクリーンショットなどで安全な場所に保管してください。パスワードとあわせて忘れると、二度とこのアカウントにログインできなくなります。"
      ]),
      el("div", { class: "checkbox-row" }, [
        confirmCheckbox,
        el("label", {}, ["ユーザーIDを控えました"])
      ]),
      el("div", { style: "margin-top:16px" }, [continueBtn])
    ])
  );
}
