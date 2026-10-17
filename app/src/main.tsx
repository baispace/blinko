import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import { silenceKnownDevNoise } from "./lib/devConsole";
import { FontManager } from "./lib/fontManager";
import { waitForStartupFont } from "./lib/fontStartup";

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
  await waitForStartupFont(FontManager.restoreSavedFont());
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <App />
  );
})();
