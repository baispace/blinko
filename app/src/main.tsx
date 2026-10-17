import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import { silenceKnownDevNoise } from "./lib/devConsole";
import { FontManager } from "./lib/fontManager";

silenceKnownDevNoise();

/**
 * 首屏字体恢复：必须在 React 渲染之前跑。
 *
 * `index.html` 的内联脚本已经把 font-family 套好了，这里补的是字形本身 ——
 * 从 IndexedDB 缓存取上次用过的字体灌进 document.fonts，完全不走网络。
 * 配 `font-display: optional`，浏览器只给约 100ms 阻塞窗口：赶得上就无跳变，
 * 赶不上就一直用 fallback，绝不出现「系统字体 → 自定义字体」的闪变。
 *
 * 带 200ms 超时，缓存读取再慢也不会挡住首屏；失败时静默让位给后续的正常加载路径
 * （UserStore.initializeFonts）。
 */
await FontManager.restoreSavedFont().catch(() => false);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />
);
