import "./style.css";
import { addRoute, initRouter, setNotFound } from "./router";
import { renderFooter, renderHeader, errorNode, pageTitle } from "./ui";
import { renderHome } from "./pages/home";
import { renderPrefPage } from "./pages/prefPage";
import { renderStoryPage } from "./pages/story";
import { renderUserPage } from "./pages/userPage";
import { renderSearchPage } from "./pages/search";
import { renderWritePage } from "./pages/write";
import { renderCapsulePage } from "./pages/capsule";
import { renderEditPage } from "./pages/edit";
import { renderLoginPage } from "./pages/login";
import { renderRegisterPage } from "./pages/register";
import { renderMePage } from "./pages/me";

addRoute("/", renderHome);
addRoute("/p/:pref", renderPrefPage);
addRoute("/story/:id", renderStoryPage);
addRoute("/story/:id/edit", renderEditPage);
addRoute("/u/:handle", renderUserPage);
addRoute("/search", renderSearchPage);
addRoute("/write", renderWritePage);
addRoute("/capsule", renderCapsulePage);
addRoute("/login", renderLoginPage);
addRoute("/register", renderRegisterPage);
addRoute("/me", renderMePage);

setNotFound((_params, _query, container) => {
  container.append(pageTitle("ページが見つかりません"));
  container.append(errorNode("お探しのページは見つかりませんでした。"));
});

renderHeader();
renderFooter();

const appRoot = document.getElementById("app");
if (appRoot) {
  initRouter(appRoot);
}
