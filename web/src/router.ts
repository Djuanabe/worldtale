export type CleanupFn = () => void;

export type RouteHandler = (
  params: Record<string, string>,
  query: URLSearchParams,
  container: HTMLElement
) => void | CleanupFn | Promise<void | CleanupFn>;

interface RouteDef {
  regex: RegExp;
  keys: string[];
  handler: RouteHandler;
}

const routes: RouteDef[] = [];
let notFoundHandler: RouteHandler = (_p, _q, container) => {
  container.textContent = "ページが見つかりませんでした。";
};

let rootEl: HTMLElement | null = null;
let currentToken = 0;
let currentCleanup: CleanupFn | null = null;

export function addRoute(path: string, handler: RouteHandler): void {
  const keys: string[] = [];
  const pattern = path
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        keys.push(segment.slice(1));
        return "([^/]+)";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  routes.push({ regex: new RegExp(`^${pattern}$`), keys, handler });
}

export function setNotFound(handler: RouteHandler): void {
  notFoundHandler = handler;
}

export function navigate(path: string, replace = false): void {
  if (replace) {
    history.replaceState({}, "", path);
  } else {
    history.pushState({}, "", path);
  }
  void renderCurrent();
}

export function initRouter(root: HTMLElement): void {
  rootEl = root;
  window.addEventListener("popstate", () => {
    void renderCurrent();
  });
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    const anchor = target?.closest("a[data-link]") as HTMLAnchorElement | null;
    if (!anchor) return;
    if (anchor.target === "_blank") return;
    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin) return;
    e.preventDefault();
    navigate(url.pathname + url.search);
  });
  void renderCurrent();
}

function runCleanup(): void {
  if (currentCleanup) {
    try {
      currentCleanup();
    } catch {
      // ignore cleanup errors
    }
    currentCleanup = null;
  }
}

async function renderCurrent(): Promise<void> {
  if (!rootEl) return;
  const token = ++currentToken;
  const path = location.pathname;
  const query = new URLSearchParams(location.search);
  window.scrollTo({ top: 0 });

  runCleanup();

  for (const route of routes) {
    const match = path.match(route.regex);
    if (match) {
      const params: Record<string, string> = {};
      route.keys.forEach((key, i) => {
        params[key] = decodeURIComponent(match[i + 1]);
      });
      rootEl.innerHTML = "";
      const result = await route.handler(params, query, rootEl);
      if (token !== currentToken) return; // 途中で別ページへ遷移した場合は破棄
      if (typeof result === "function") currentCleanup = result;
      document.dispatchEvent(new CustomEvent("wt:navigated"));
      return;
    }
  }
  rootEl.innerHTML = "";
  await notFoundHandler({}, query, rootEl);
}
