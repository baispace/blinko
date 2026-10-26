import type { PrismaClient } from "@prisma/client";
import { safeFetch, type SafeFetchResult } from "./safeFetch";
import { publicPublicationWhere } from "./publication";
import { readBlogSiteSettings } from "./blogSiteSettings";
import { readTrackingStates } from "./blogTrackingState";

/**
 * 站点检查。
 *
 * 每一项都真的发请求或真的查数据库，得出「通过 / 警告 / 失败 / 当前环境无法验证」。
 * HTTP 200 不等于通过：文章地址返回首页、API 返回 HTML、资源返回登录页，
 * 都要单独识别出来。检查不到的项目给出手动步骤，不假报成功。
 */

export type SiteCheckState = "pass" | "warn" | "fail" | "manual";

export type SiteCheckItem = {
  id: string;
  name: string;
  state: SiteCheckState;
  /** 一句话证据：看到了什么 */
  evidence: string;
  /** 修复建议 */
  suggestion?: string;
};

export type SiteCheckReport = {
  /** 检查目标地址 */
  target: string;
  /** 当前实际生效地址 */
  effective: string;
  /** 检查时间 */
  checkedAt: string;
  items: SiteCheckItem[];
};

const VENDOR_LABEL: Record<string, string> = {
  ga4: "Google Analytics 4",
  baidu: "百度统计",
};

/**
 * 本服务自己的 origin（启动时写入）。
 *
 * 站点检查需要能检查「当前这个站点」，包括还没配域名的本机环境。
 * 豁免只认完全一致的 origin —— 端口不同不放行，不会变成内网端口扫描。
 */
let selfOrigin = "";
export function setSiteCheckSelfOrigin(origin: string) {
  selfOrigin = origin.replace(/\/+$/, "");
}

/** 同一账号两次检查之间的最小间隔，避免被当成压测入口。 */
const MIN_INTERVAL_MS = 15_000;
const lastRunAt = new Map<number, number>();

export function siteCheckRateLimited(accountId: number) {
  const last = lastRunAt.get(accountId) ?? 0;
  const wait = MIN_INTERVAL_MS - (Date.now() - last);
  return wait > 0 ? Math.ceil(wait / 1000) : 0;
}

function joinUrl(origin: string, path: string) {
  return origin.replace(/\/+$/, "") + (path.startsWith("/") ? path : "/" + path);
}

/** 从 HTML 里取出 <title>、canonical、og:url、robots。 */
function readHtmlMeta(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
  const canonical =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ??
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)?.[1] ??
    "";
  const ogUrl =
    html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']*)["']/i)?.[1] ??
    "";
  const robots =
    html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i)?.[1] ??
    "";
  const ogTitle =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i)?.[1] ??
    "";
  return { title, canonical, ogUrl, robots, ogTitle };
}

/** 判断响应体是不是登录页 / 工作区页面，而不是公开博客。 */
function looksLikeWorkspace(html: string) {
  return (
    html.includes("/signin") ||
    html.includes("登录") && html.includes("password") ||
    html.includes("data-ink-app-shell")
  );
}

function resultSummary(result: SafeFetchResult) {
  if (!result.ok && result.status === 0)
    return result.error || "请求失败";
  return `HTTP ${result.status}`;
}

async function fetchText(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
  } = {},
) {
  return safeFetch(url, { ...options, allowSelfOrigin: selfOrigin });
}

export async function runSiteChecks(
  db: PrismaClient,
  accountId: number,
  input: { target: string; effective: string },
): Promise<SiteCheckReport> {
  const target = input.target.replace(/\/+$/, "");
  const effective = input.effective.replace(/\/+$/, "");
  const items: SiteCheckItem[] = [];
  const push = (item: SiteCheckItem) => items.push(item);

  const stored = await readBlogSiteSettings(db, accountId);
  const settings = stored.configured ? stored.data : null;

  // ---- DNS 与 HTTPS ------------------------------------------------------
  const dnsResult = await safeFetch(target + "/robots.txt", {
    method: "HEAD",
    timeoutMs: 6000,
    allowSelfOrigin: selfOrigin,
  });
  if (dnsResult.errorCode === "dns-failed") {
    push({
      id: "dns",
      name: "DNS 与 HTTPS",
      state: "fail",
      evidence: "域名解析失败：" + (dnsResult.error ?? ""),
      suggestion: "在 DNS 服务商处确认该域名已添加解析记录。",
    });
  } else if (dnsResult.errorCode === "blocked-host") {
    push({
      id: "dns",
      name: "DNS 与 HTTPS",
      state: "fail",
      evidence: dnsResult.error ?? "目标地址被安全策略拒绝",
      suggestion: "请填写公网可访问的域名，不要使用回环或内网地址。",
    });
  } else {
    const scheme = target.startsWith("https://") ? "https" : "http";
    push({
      id: "dns",
      name: "DNS 与 HTTPS",
      state: scheme === "https" ? "pass" : "warn",
      evidence:
        scheme === "https"
          ? `域名可解析并完成 HTTPS 握手（${resultSummary(dnsResult)}）`
          : `域名可解析，但目标用的是 http（${resultSummary(dnsResult)}）；公开站点应当只走 https。`,
      suggestion:
        scheme === "https"
          ? undefined
          : "给公开域名配置证书并强制跳转 https，否则分享链接与 canonical 会走明文。",
    });
  }

  // ---- 首页是否返回预期公开内容 -----------------------------------------
  const home = await fetchText(target + "/blog");
  if (!home.ok) {
    push({
      id: "home",
      name: "首页公开内容",
      state: "fail",
      evidence: resultSummary(home),
      suggestion: "确认网关已把公开域名映射到 /blog，且服务已启动。",
    });
  } else {
    const meta = readHtmlMeta(home.body);
    const hasSeo = home.body.includes("data-ink-blog-seo");
    const workspace = looksLikeWorkspace(home.body);
    if (workspace) {
      push({
        id: "home",
        name: "首页公开内容",
        state: "fail",
        evidence: "首页返回的是工作区 / 登录页内容，不是公开博客。",
        suggestion: "网关只应映射公开博客路径，不要把工作区根路径暴露到公开域名。",
      });
    } else if (!hasSeo) {
      push({
        id: "home",
        name: "首页公开内容",
        state: "warn",
        evidence: "首页返回 200，但没有服务端注入的 SEO 元信息。",
        suggestion:
          "确认该地址由本服务托管（服务端首屏注入），静态部署不会有首屏元信息。",
      });
    } else {
      push({
        id: "home",
        name: "首页公开内容",
        state: "pass",
        evidence: `首页返回公开内容，标题「${meta.title.slice(0, 40)}」。`,
      });
    }
  }

  // ---- 文章与专题直访 ---------------------------------------------------
  const article = await db.notes.findFirst({
    where: { ...publicPublicationWhere, accountId },
    select: { publishId: true },
    orderBy: { id: "desc" },
  });
  if (!article?.publishId) {
    push({
      id: "article",
      name: "文章直访与刷新",
      state: "manual",
      evidence: "还没有已发布的文章，无法验证文章直访。",
      suggestion: "发布一篇文章后重新运行检查。",
    });
  } else {
    const res = await fetchText(joinUrl(target, "/blog/" + article.publishId));
    if (!res.ok) {
      push({
        id: "article",
        name: "文章直访与刷新",
        state: "fail",
        evidence: `文章地址返回 ${resultSummary(res)}`,
        suggestion: "确认文章路径在网关规则里被放行。",
      });
    } else {
      const meta = readHtmlMeta(res.body);
      const pointsHome = meta.canonical && !meta.canonical.includes(article.publishId);
      if (pointsHome) {
        push({
          id: "article",
          name: "文章直访与刷新",
          state: "fail",
          evidence: "文章地址返回了首页内容（canonical 指向首页）。",
          suggestion: "SPA fallback 把所有路径都兜到了首页，需要为 /blog/:id 单独配置。",
        });
      } else if (!meta.canonical) {
        push({
          id: "article",
          name: "文章直访与刷新",
          state: "warn",
          evidence: "文章地址返回 200，但没有 canonical 标签。",
          suggestion: "确认响应来自服务端首屏注入，而不是纯静态产物。",
        });
      } else {
        push({
          id: "article",
          name: "文章直访与刷新",
          state: "pass",
          evidence: `文章直访返回 200，canonical 指向自身（${meta.canonical}）。`,
        });
      }
    }
  }

  const topic = await db.blogTopic.findFirst({
    where: { accountId, isPublished: true },
    select: { slug: true },
    orderBy: { id: "asc" },
  });
  if (!topic?.slug) {
    push({
      id: "topic",
      name: "专题直访与刷新",
      state: "manual",
      evidence: "没有已公开的专题，无法验证专题直访。",
      suggestion: "公开一个专题后重新运行检查。",
    });
  } else {
    const res = await fetchText(joinUrl(target, "/blog/t/" + topic.slug));
    if (!res.ok) {
      push({
        id: "topic",
        name: "专题直访与刷新",
        state: "fail",
        evidence: `专题地址返回 ${resultSummary(res)}`,
        suggestion: "确认 /blog/t/:slug 在网关规则里被放行。",
      });
    } else {
      const meta = readHtmlMeta(res.body);
      if (meta.canonical && !meta.canonical.includes(topic.slug)) {
        push({
          id: "topic",
          name: "专题直访与刷新",
          state: "fail",
          evidence: "专题地址返回了其它页面内容（canonical 不匹配）。",
          suggestion: "确认网关没有把 /blog/t/* 兜底到首页。",
        });
      } else {
        push({
          id: "topic",
          name: "专题直访与刷新",
          state: "pass",
          evidence: `专题直访返回 200（${meta.canonical || "无 canonical"}）。`,
        });
      }
    }
  }

  // ---- 不存在页面与撤回内容 ---------------------------------------------
  const missing = await fetchText(joinUrl(target, "/blog/__no_such_note__"));
  if (missing.status === 404 || missing.status === 410) {
    push({
      id: "missing",
      name: "不存在页面状态",
      state: "pass",
      evidence: `不存在的文章地址返回 ${missing.status}。`,
    });
  } else if (!missing.ok) {
    push({
      id: "missing",
      name: "不存在页面状态",
      state: "fail",
      evidence: `不存在的文章地址返回 ${resultSummary(missing)}，应返回 404。`,
      suggestion: "检查网关是否把未知路径兜底成 200。",
    });
  } else {
    push({
      id: "missing",
      name: "不存在页面状态",
      state: "fail",
      evidence: "不存在的文章地址返回 200，应当返回 404。",
      suggestion: "确认服务端对未知 /blog 路径返回 404 而不是首页。",
    });
  }

  const withdrawn = await db.notes.findFirst({
    where: { accountId, isPublished: false, publishId: { not: null } },
    select: { publishId: true },
    orderBy: { id: "desc" },
  });
  if (!withdrawn?.publishId) {
    push({
      id: "withdrawn",
      name: "撤回内容不再公开",
      state: "manual",
      evidence: "没有可验证的已撤回文章。",
      suggestion: "撤回一篇文章后重新运行检查。",
    });
  } else {
    const res = await fetchText(joinUrl(target, "/blog/" + withdrawn.publishId));
    if (res.status === 404 || res.status === 410) {
      push({
        id: "withdrawn",
        name: "撤回内容不再公开",
        state: "pass",
        evidence: "已撤回文章的地址返回 404，不再对外输出。",
      });
    } else {
      push({
        id: "withdrawn",
        name: "撤回内容不再公开",
        state: "fail",
        evidence: `已撤回文章返回 ${resultSummary(res)}，仍可访问。`,
        suggestion: "确认公开查询过滤了 isPublished=false 的内容。",
      });
    }
  }

  // ---- 公开 API ----------------------------------------------------------
  const apiPath = "/api/trpc/blog.publicIndex?input=" + encodeURIComponent(JSON.stringify({ json: { page: 1 } }));
  const api = await fetchText(joinUrl(target, apiPath), {
    headers: { accept: "application/json" },
  });
  const apiType = api.headers.get("content-type") || "";
  if (!api.ok) {
    push({
      id: "api",
      name: "公开 API 可用性",
      state: "fail",
      evidence: `公开 API 返回 ${resultSummary(api)}`,
      suggestion: "确认 /api/trpc 路由已暴露到公开域名。",
    });
  } else if (!apiType.includes("json")) {
    push({
      id: "api",
      name: "公开 API 可用性",
      state: "fail",
      evidence: `公开 API 返回的是 ${apiType || "未知类型"}，不是 JSON。`,
      suggestion: "API 路径被网关兜底成了前端页面，检查代理规则。",
    });
  } else {
    push({
      id: "api",
      name: "公开 API 可用性",
      state: "pass",
      evidence: `公开 API 返回 JSON（${apiType.split(";")[0]}）。`,
    });
  }

  // ---- 目标域名的实际 CORS 行为 ----------------------------------------
  const apiOriginConfigured = settings?.apiOrigin || "";
  const apiHost = apiOriginConfigured ? safeOrigin(apiOriginConfigured) : target;
  if (apiHost === target) {
    push({
      id: "cors",
      name: "目标域名实际 CORS 行为",
      state: "manual",
      evidence: "公开前端与 API 同源，不依赖 CORS。",
      suggestion: "若之后把 API 拆到别的域名，需要为公开 API 配置跨域白名单。",
    });
  } else {
    const preflight = await fetchText(joinUrl(apiHost, apiPath), {
      method: "OPTIONS",
      headers: {
        origin: target,
        "access-control-request-method": "GET",
        "access-control-request-headers": "content-type",
      },
    });
    const allowOrigin = preflight.headers.get("access-control-allow-origin");
    if (!preflight.ok) {
      push({
        id: "cors",
        name: "目标域名实际 CORS 行为",
        state: "fail",
        evidence: `预检请求返回 ${resultSummary(preflight)}`,
        suggestion: "确认 API 侧允许 OPTIONS 预检。",
      });
    } else if (!allowOrigin) {
      push({
        id: "cors",
        name: "目标域名实际 CORS 行为",
        state: "fail",
        evidence: "预检响应里没有 Access-Control-Allow-Origin，浏览器会拦截跨域请求。",
        suggestion: `把 ${target} 加入公开 API 的跨域白名单。`,
      });
    } else if (allowOrigin !== target && allowOrigin !== "*") {
      push({
        id: "cors",
        name: "目标域名实际 CORS 行为",
        state: "warn",
        evidence: `允许的来源是 ${allowOrigin}，与目标域名 ${target} 不一致。`,
        suggestion: "把目标域名加入公开 API 的跨域白名单。",
      });
    } else {
      push({
        id: "cors",
        name: "目标域名实际 CORS 行为",
        state: "pass",
        evidence: `预检响应允许来源 ${allowOrigin}。`,
      });
    }
  }

  // ---- 图片、字体与分享图 -----------------------------------------------
  const assetTargets: { label: string; url: string }[] = [];
  const shareImage = settings?.shareImage || "";
  if (shareImage) assetTargets.push({ label: "默认分享图", url: shareImage });
  const published = await db.notes.findFirst({
    where: { ...publicPublicationWhere, accountId },
    select: {
      publication: { select: { coverAttachment: { select: { path: true } } } },
    },
    orderBy: { id: "desc" },
  });
  const coverPath = published?.publication?.coverAttachment?.path;
  if (coverPath)
    assetTargets.push({ label: "文章封面", url: joinUrl(target, coverPath) });
  assetTargets.push({ label: "站点图标", url: joinUrl(target, "/icons/Square310x310Logo.png") });
  const assetResults: string[] = [];
  let assetFail = 0;
  for (const asset of assetTargets.slice(0, 4)) {
    const url = /^https?:/i.test(asset.url) ? asset.url : joinUrl(target, asset.url);
    const res = await fetchText(url, { method: "GET", timeoutMs: 6000 });
    if (res.ok) assetResults.push(`${asset.label} ${res.status}`);
    else {
      assetFail += 1;
      assetResults.push(`${asset.label} ${resultSummary(res)}`);
    }
  }
  if (!assetResults.length) {
    push({
      id: "assets",
      name: "图片字体与缓存",
      state: "manual",
      evidence: "没有可用于验证的公开图片地址。",
      suggestion: "给站点或文章设置公开封面后重新检查。",
    });
  } else if (assetFail > 0) {
    push({
      id: "assets",
      name: "图片字体与缓存",
      state: "fail",
      evidence: assetResults.join("；"),
      suggestion: "确认公开资源路径在网关上被放行，且存储桶允许公开读取。",
    });
  } else {
    push({
      id: "assets",
      name: "图片字体与缓存",
      state: "pass",
      evidence: assetResults.join("；"),
    });
  }

  // ---- Canonical 与分享地址 --------------------------------------------
  if (!home.ok) {
    push({
      id: "canonical",
      name: "Canonical 与分享地址",
      state: "fail",
      evidence: "首页不可访问，无法核对 canonical。",
      suggestion: "先让首页可访问。",
    });
  } else {
    const meta = readHtmlMeta(home.body);
    const canonicalHost = canonicalHostOf(meta.canonical);
    if (!meta.canonical) {
      push({
        id: "canonical",
        name: "Canonical 与分享地址",
        state: "fail",
        evidence: "首页没有 canonical 标签。",
        suggestion: "确认公开页面由服务端注入首屏元信息。",
      });
    } else if (canonicalHost && canonicalHost !== safeOrigin(target)) {
      push({
        id: "canonical",
        name: "Canonical 与分享地址",
        state: "warn",
        evidence: `canonical 指向 ${canonicalHost}，与检查目标 ${safeOrigin(target)} 不一致。`,
        suggestion: "检查 BLOG_PUBLIC_URL 是否与目标域名一致。",
      });
    } else if (meta.ogUrl && safeOrigin(meta.ogUrl) !== safeOrigin(meta.canonical)) {
      push({
        id: "canonical",
        name: "Canonical 与分享地址",
        state: "warn",
        evidence: "og:url 与 canonical 指向不同地址。",
        suggestion: "两者应指向同一个规范地址。",
      });
    } else {
      push({
        id: "canonical",
        name: "Canonical 与分享地址",
        state: "pass",
        evidence: `canonical 与 og:url 均指向 ${safeOrigin(meta.canonical)}。`,
      });
    }
  }

  // ---- Sitemap / RSS / robots ------------------------------------------
  const sitemap = await fetchText(joinUrl(target, "/sitemap.xml"));
  if (!sitemap.ok) {
    push({
      id: "sitemap",
      name: "Sitemap / RSS / robots",
      state: "fail",
      evidence: `sitemap.xml 返回 ${resultSummary(sitemap)}`,
      suggestion: "确认 /sitemap.xml 在公开域名上可访问。",
    });
  } else if (!sitemap.body.includes("<sitemapindex")) {
    push({
      id: "sitemap",
      name: "Sitemap / RSS / robots",
      state: "fail",
      evidence: "sitemap.xml 没有返回 sitemapindex。",
      suggestion: "检查站点地图生成逻辑。",
    });
  } else if (sitemap.body.includes(effective) && !sitemap.body.includes(target)) {
    push({
      id: "sitemap",
      name: "Sitemap / RSS / robots",
      state: "warn",
      evidence: "sitemap 里仍是旧地址，尚未切换到目标域名。",
      suggestion: "部署完成后更新 BLOG_PUBLIC_URL，让站点地图使用当前生效域名。",
    });
  } else {
    push({
      id: "sitemap",
      name: "Sitemap / RSS / robots",
      state: "pass",
      evidence: "sitemap.xml 正常返回分片索引。",
    });
  }

  const rss = await fetchText(joinUrl(target, "/blog/feed.xml"));
  if (!rss.ok) {
    push({
      id: "rss",
      name: "RSS 订阅源",
      state: "fail",
      evidence: `feed.xml 返回 ${resultSummary(rss)}`,
      suggestion: "确认 /blog/feed.xml 可访问。",
    });
  } else if (!rss.body.includes("<rss")) {
    push({
      id: "rss",
      name: "RSS 订阅源",
      state: "fail",
      evidence: "feed.xml 没有返回 RSS 结构。",
      suggestion: "检查订阅源生成逻辑。",
    });
  } else {
    push({
      id: "rss",
      name: "RSS 订阅源",
      state: "pass",
      evidence: "feed.xml 返回 RSS 内容。",
    });
  }

  const robots = await fetchText(joinUrl(target, "/robots.txt"));
  if (!robots.ok) {
    push({
      id: "robots",
      name: "robots.txt",
      state: "fail",
      evidence: `robots.txt 返回 ${resultSummary(robots)}`,
      suggestion: "确认 /robots.txt 可访问。",
    });
  } else if (!robots.body.includes("Sitemap:")) {
    push({
      id: "robots",
      name: "robots.txt",
      state: "warn",
      evidence: "robots.txt 没有声明 Sitemap 地址。",
      suggestion: "在 robots.txt 中加上 Sitemap 行。",
    });
  } else if (!robots.body.includes("Allow: /blog")) {
    push({
      id: "robots",
      name: "robots.txt",
      state: "warn",
      evidence: "robots.txt 没有放行 /blog 路径。",
      suggestion: "放行公开博客路径，否则搜索引擎无法抓取。",
    });
  } else {
    push({
      id: "robots",
      name: "robots.txt",
      state: "pass",
      evidence: "robots.txt 放行了公开路径并声明了站点地图。",
    });
  }

  // ---- 旧地址永久跳转 ---------------------------------------------------
  const legacyBase = settings?.legacyBasePath || "";
  if (!settings?.legacyRedirectEnabled) {
    push({
      id: "redirect",
      name: "旧链接永久跳转",
      state: "manual",
      evidence: "尚未启用旧地址跳转开关。",
      suggestion:
        "目标站点部署验证通过后，在「域名与部署」里打开旧地址永久跳转。",
    });
  } else if (!legacyBase) {
    push({
      id: "redirect",
      name: "旧链接永久跳转",
      state: "fail",
      evidence: "跳转已开启，但没有填写旧地址前缀。",
      suggestion: "填写旧公开路径前缀，例如 /blog。",
    });
  } else {
    const oldUrl = joinUrl(effective, legacyBase + "/__redirect_probe__");
    const res = await fetchText(oldUrl);
    if (res.status === 301 || res.status === 308) {
      const location = res.headers.get("location") || "";
      if (location.startsWith(target)) {
        push({
          id: "redirect",
          name: "旧链接永久跳转",
          state: "pass",
          evidence: `旧地址返回 301 并指向 ${location}。`,
        });
      } else {
        push({
          id: "redirect",
          name: "旧链接永久跳转",
          state: "warn",
          evidence: `旧地址返回 301，但目标地址是 ${location || "空"}。`,
          suggestion: "确认目标域名配置与跳转规则一致。",
        });
      }
    } else {
      push({
        id: "redirect",
        name: "旧链接永久跳转",
        state: "fail",
        evidence: `旧地址返回 ${resultSummary(res)}，没有 301。`,
        suggestion: "确认旧地址前缀配置正确，且跳转开关已生效。",
      });
    }
  }

  // ---- 统计脚本与路由上报 ----------------------------------------------
  const states = await readTrackingStates(db, accountId);
  const enabledVendors = Object.entries(states).filter(
    ([, state]) => state.enabled,
  );
  if (!enabledVendors.length) {
    push({
      id: "tracking",
      name: "统计脚本与路由上报",
      state: "manual",
      evidence: "未启用第三方统计。",
      suggestion: "在「站点设置 → 统计接入」里启用后再验证。",
    });
  } else {
    const notes: string[] = [];
    let warn = false;
    for (const [vendor, state] of enabledVendors) {
      const label = VENDOR_LABEL[vendor] || vendor;
      if (!state.scriptLoadedAt) {
        warn = true;
        notes.push(`${label}：公开页尚未上报脚本加载`);
      } else if (!state.eventSentAt) {
        warn = true;
        notes.push(`${label}：脚本已加载，尚未上报事件`);
      } else {
        notes.push(`${label}：脚本已加载（${state.scriptLoadedAt}），已上报事件`);
      }
    }
    notes.push("服务商是否已收数需到服务商实时报告人工确认");
    push({
      id: "tracking",
      name: "统计脚本与路由上报",
      state: warn ? "warn" : "pass",
      evidence: notes.join("；"),
      suggestion: warn ? "在公开站打开一次页面后重新检查。" : undefined,
    });
  }

  lastRunAt.set(accountId, Date.now());
  return {
    target,
    effective,
    checkedAt: new Date().toISOString(),
    items,
  };
}

function safeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

function canonicalHostOf(value: string) {
  if (!value) return "";
  return safeOrigin(value);
}
