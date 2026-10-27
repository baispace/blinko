import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { blogStatsEnabled } from "@/lib/blogDevice";
import { api } from "@/lib/publicBlogClient";

type Config =
  | { gaId: string; baiduId: string; excludeOwner: boolean; iconUrl: string }
  | null
  | undefined;

const GA_SCRIPT_ID = "ink-ga-tracking";
const BAIDU_SCRIPT_ID = "ink-baidu-tracking";

/**
 * 已上报过的页面键（路径 + 编号）。
 *
 * 模块级变量：React 18 的 StrictMode 会把 effect 跑两遍，重渲染也会重跑，
 * 没有这个键就会把同一个页面浏览报两次。
 */
let lastPage = "";
/** 当前已插入脚本的编号。换编号时先摘掉旧脚本，避免两份数据重复采集。 */
let loadedGaId = "";
let loadedBaiduId = "";

/** 上报脚本状态：只证明「脚本加载了」「事件发出去了」，不证明服务商已收数。 */
function reportState(
  vendor: "ga" | "baidu",
  scriptLoaded: boolean,
  eventSent: boolean,
) {
  try {
    void api.blog.reportTrackingState
      .mutate({
        vendor,
        scriptLoaded,
        eventSent,
        path: location.pathname + location.search,
        host: location.hostname,
      })
      .catch(() => {});
  } catch {
    /* 状态上报失败不影响统计脚本本身 */
  }
}

function removeScript(id: string) {
  document.getElementById(id)?.remove();
}

/**
 * 装载 GA4。
 *
 * send_page_view: false —— 关掉脚本自带的自动上报，改由路由变化手动上报，
 * 否则 SPA 每次跳转会被算两次（一次自动、一次手动）。
 */
function ensureGaScript(gaId: string) {
  if (loadedGaId === gaId && document.getElementById(GA_SCRIPT_ID)) return;
  // 编号变了：旧脚本与旧队列都要清掉，否则新旧编号会同时收数。
  removeScript(GA_SCRIPT_ID);
  const w = window as any;
  w.dataLayer = [];
  w.gtag =
    w.gtag ||
    function () {
      w.dataLayer.push(arguments);
    };
  loadedGaId = gaId;
  const script = document.createElement("script");
  script.id = GA_SCRIPT_ID;
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=" + gaId;
  script.onload = () => reportState("ga", true, false);
  document.head.append(script);
  w.gtag("js", new Date());
  w.gtag("config", gaId, { send_page_view: false });
}

function stopGa() {
  if (!loadedGaId && !document.getElementById(GA_SCRIPT_ID)) return;
  removeScript(GA_SCRIPT_ID);
  loadedGaId = "";
  const w = window as any;
  w.dataLayer = [];
}

/**
 * 装载百度统计。
 *
 * _setAutoPageview false —— 同样关掉脚本自带的自动上报，由路由变化手动推事件。
 */
function ensureBaiduScript(baiduId: string) {
  if (loadedBaiduId === baiduId && document.getElementById(BAIDU_SCRIPT_ID))
    return;
  removeScript(BAIDU_SCRIPT_ID);
  const w = window as any;
  w._hmt = [];
  loadedBaiduId = baiduId;
  const script = document.createElement("script");
  script.id = BAIDU_SCRIPT_ID;
  script.async = true;
  script.src = "https://hm.baidu.com/hm.js?" + baiduId;
  script.onload = () => reportState("baidu", true, false);
  document.head.append(script);
  w._hmt.push(["_setAutoPageview", false]);
}

function stopBaidu() {
  if (!loadedBaiduId && !document.getElementById(BAIDU_SCRIPT_ID)) return;
  removeScript(BAIDU_SCRIPT_ID);
  loadedBaiduId = "";
  const w = window as any;
  w._hmt = [];
}

export function BlogTracking({ config }: { config: Config }) {
  const { pathname, search } = useLocation();
  useEffect(() => {
    if (!config?.iconUrl) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const created = !link,
      previous = link?.href;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.append(link);
    }
    link.href = config.iconUrl;
    return () => {
      if (created) link?.remove();
      else if (link && previous) link.href = previous;
    };
  }, [config?.iconUrl]);

  useEffect(() => {
    if (!config) return;
    // 访客主动关闭统计后，第一方与第三方都不再上报。
    if (!blogStatsEnabled()) {
      stopGa();
      stopBaidu();
      return;
    }

    const gaId = (config.gaId ?? "").trim();
    const baiduId = (config.baiduId ?? "").trim();
    if (gaId) ensureGaScript(gaId);
    else stopGa();
    if (baiduId) ensureBaiduScript(baiduId);
    else stopBaidu();

    const page = pathname + search;
    const key = page + "|" + gaId + "|" + baiduId;
    if (lastPage === key) return;
    lastPage = key;

    const w = window as any;
    if (gaId) {
      w.gtag?.("event", "page_view", {
        send_to: gaId,
        page_path: page,
        page_location: location.href,
      });
      reportState("ga", false, true);
    }
    if (baiduId) {
      w._hmt?.push(["_trackPageview", page]);
      reportState("baidu", false, true);
    }
  }, [config, pathname, search]);
  return null;
}
