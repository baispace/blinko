import ReactDOM from "react-dom/client";
import "./styles/globals.css";
import { silenceKnownDevNoise } from "./lib/devConsole";

silenceKnownDevNoise();

/**
 * Cached fonts get at most 120ms before React renders. Cache misses and slow
 * font decoding must not block the entire application. Network loading remains
 * in UserStore.initializeFonts after the page has started.
 *
 * 注意：这里必须用 async IIFE 而不是顶层 await —— vite build 的默认 target
 * （chrome87 / edge88 / safari14 等）不支持顶层 await，写成 `await ...` 会让
 * 生产构建直接失败，而 dev server 不做这项转译、照跑不误，问题会被藏住。
 */
void (async () => {
  /**
   * 公开站和工作区分流。
   *
   * 公开域名可以把博客挂在根路径上，所以不能再写死 /blog：
   * 优先用服务端注入的运行时配置（基础路径、公开地址、部署方式），
   * 拿不到时退回 /blog —— 和改造前的行为完全一致。
   */
  const runtime = window.__INK_BLOG_RUNTIME__;
  const basePath =
    typeof runtime?.basePath === "string" && runtime.basePath.startsWith("/")
      ? runtime.basePath.replace(/\/+$/, "") || "/"
      : "/blog";
  const separate =
    runtime?.deploymentMode === "separate" &&
    typeof runtime?.publicOrigin === "string" &&
    runtime.publicOrigin.length > 0;
  const publicOnlyBuild = import.meta.env.VITE_BLOG_PUBLIC_ONLY === "true";
  const publicBlog = publicOnlyBuild
    ? true
    : separate
      ? window.location.origin === runtime?.publicOrigin
      : window.location.pathname === basePath ||
        window.location.pathname.startsWith(basePath + "/");
  const { default: App } = publicBlog
    ? await import("./PublicBlogApp")
    : await import("./App");
  if (publicBlog) {
    const { initializeBlogDevice } = await import("./lib/blogDevice");
    await initializeBlogDevice();
  }
  if (!publicBlog) {
    const [{ FontManager }, { waitForStartupFont }] = await Promise.all([
      import("./lib/fontManager"),
      import("./lib/fontStartup"),
    ]);
    await waitForStartupFont(FontManager.restoreSavedFont());
  }
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <App />,
  );
})();
