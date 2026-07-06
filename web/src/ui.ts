import { isAdminCached, isLoggedIn, setToken } from "./api";
import { navigate } from "./router";
import { buildWorldTaleIcon } from "./icon";

// ---- 要素生成ヘルパー（XSS対策のため textContent を用いる） ----

type Attrs = Record<string, string | boolean | undefined | ((e: Event) => void)>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === "class") {
      node.className = String(value);
    } else if (typeof value === "boolean") {
      if (value) node.setAttribute(key, "");
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export function link(href: string, text: string, className?: string): HTMLAnchorElement {
  const a = el("a", { href, "data-link": true }, [text]);
  if (className) a.className = className;
  return a;
}

export function clear(node: HTMLElement): void {
  node.innerHTML = "";
}

// ---- ヘッダー ----

export function renderHeader(): void {
  const host = document.getElementById("header");
  if (!host) return;
  clear(host);

  const inner = el("div", { class: "header-inner" });

  const brandMark = el("span", { class: "brand-mark" });
  brandMark.append(buildWorldTaleIcon(30));
  const brand = el("a", { href: "/", "data-link": true, class: "brand" }, [
    brandMark,
    el("span", { class: "brand-text" }, ["WorldTale"])
  ]);

  const nav = el("nav", { class: "nav" });
  nav.append(link("/", "地図"), link("/search", "さがす"), link("/capsule", "カプセル"));

  if (isLoggedIn()) {
    nav.append(link("/write", "書く"), link("/me", "マイページ"));
    if (isAdminCached()) nav.append(link("/admin", "管理"));
    nav.append(
      el(
        "button",
        {
          class: "nav-button",
          onclick: () => {
            setToken(null);
            renderHeader();
            navigate("/");
          }
        },
        ["ログアウト"]
      )
    );
  } else {
    nav.append(link("/login", "ログイン"), link("/register", "はじめる"));
  }

  inner.append(brand, nav);
  host.append(inner);
}

export function renderFooter(): void {
  const host = document.getElementById("footer");
  if (!host) return;
  clear(host);
  host.append(
    el("div", { class: "footer-inner" }, [
      el("p", {}, ["世界はたくさんの物語でできている ― WorldTale"])
    ])
  );
}

// ---- 汎用パーツ ----

export function pageTitle(text: string): HTMLElement {
  return el("h1", { class: "page-title" }, [text]);
}

export function loadingNode(text = "読み込み中…"): HTMLElement {
  return el("p", { class: "loading" }, [text]);
}

export function errorNode(message: string): HTMLElement {
  return el("p", { class: "error-text" }, [message]);
}

export function card(children: (Node | string)[] = []): HTMLElement {
  return el("div", { class: "card" }, children);
}

// ---- モーダル ----

export function openModal(build: (close: () => void) => HTMLElement): () => void {
  const overlay = el("div", { class: "modal-overlay" });
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  const content = build(close);
  content.classList.add("modal-content");
  overlay.append(content);
  document.body.append(overlay);
  return close;
}

// ---- 年セレクタ ----

export function yearOptions(fromYear = 1900): number[] {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current; y >= fromYear; y--) years.push(y);
  return years;
}
