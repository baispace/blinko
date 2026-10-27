/**
 * 公开站的基础路径、路由前缀与资源地址。
 *
 * 公开域名下博客挂载在哪里（/blog 还是 /）、API 在哪个域名，
 * 都由服务端下发的运行时配置决定。各组件不再各自拼 "/blog/..."，
 * 换域名或改挂载路径时不需要再逐个组件找。
 */

export type BlogRuntimeConfig = {
  /** 公开站的基础路径，例如 /blog */
  basePath: string;
  /** 前后端分开部署时公开前端访问的 API 基础地址 */
  apiOrigin: string;
  /** 当前生效的公开站点地址 */
  publicOrigin: string;
  /** 部署方式 */
  deploymentMode: "proxy" | "separate";
};

declare global {
  interface Window {
    __INK_BLOG_RUNTIME__?: Partial<BlogRuntimeConfig>;
  }
}

function runtime(): Partial<BlogRuntimeConfig> {
  if (typeof window === "undefined") return {};
  return window.__INK_BLOG_RUNTIME__ || {};
}

function normalize(value: string | undefined | null) {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw.startsWith("/")) return "";
  if (/[\s?#\\]/.test(raw)) return "";
  const trimmed = raw.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/**
 * 公开前端的基础路径。
 *
 * 运行时配置优先（服务端注入），其次构建期变量（公开前端单独部署时用），
 * 最后退回应用内部的 /blog。
 */
export function publicBasePath(): string {
  const injected = normalize(runtime().basePath);
  if (injected) return injected;
  const build = normalize(import.meta.env.VITE_BLOG_BASE_PATH);
  if (build) return build;
  return "/blog";
}

/** React Router 的 basename：根路径时传空串。 */
export function publicBasename(): string {
  const base = publicBasePath();
  return base === "/" ? "" : base;
}

/**
 * 把应用内部路径换成路由路径（相对 basename）。
 *
 * "/blog/topics" → "/topics"，"/blog" → "/"。
 */
export function blogRoute(path: string): string {
  const raw = path || "/blog";
  const rest = raw.startsWith("/blog")
    ? raw.slice("/blog".length)
    : raw;
  if (!rest) return "/";
  return rest.startsWith("/") ? rest : "/" + rest;
}

/**
 * 当前路由相对公开根的路径。
 *
 * 公开前端用 basename 挂载，useLocation() 返回的是去掉 basename 的路径；
 * 工作区里内嵌的公开页面则是完整路径。两种都归一到同一形状再比较。
 */
export function blogRoutePath(pathname: string): string {
  const p = pathname || "/";
  const base = publicBasePath();
  if (base !== "/" && (p === base || p.startsWith(base + "/"))) {
    return p.slice(base.length) || "/";
  }
  if (p === "/blog" || p.startsWith("/blog/")) return p.slice("/blog".length) || "/";
  return p;
}

/**
 * 应用内部路径（服务端一律按 /blog 路由解析）。
 *
 * 服务端的公开 SEO、站点地图、RSS 都以内部路径为输入，
 * 公开地址只是它的一层外壳。
 */
export function blogInternalPath(pathname: string): string {
  const rest = blogRoutePath(pathname);
  return rest === "/" ? "/blog" : "/blog" + rest;
}

/** 公开资源的完整路径（用于 href、canonical、RSS 等）。 */
export function publicAsset(path: string): string {
  const base = publicBasePath();
  const rest = blogRoute(path);
  if (base === "/") return rest;
  if (rest === "/") return base;
  return base.replace(/\/+$/, "") + rest;
}

/**
 * 公开 API 的基础地址。
 *
 * 前后端分开部署时，运行时配置里的 API 地址会真正生效；
 * 公开前端是纯静态产物（没有服务端注入）时，退回构建期变量。
 */
export function publicApiOrigin(): string {
  const injected = runtime().apiOrigin;
  if (typeof injected === "string" && /^https?:\/\//i.test(injected))
    return injected.replace(/\/+$/, "");
  const build = import.meta.env.VITE_BLOG_API_ORIGIN;
  if (typeof build === "string" && /^https?:\/\//i.test(build))
    return build.replace(/\/+$/, "");
  return "";
}

/** 公开 API 的 tRPC 入口。 */
export function publicTrpcUrl(): string {
  const origin = publicApiOrigin();
  return origin ? origin + "/api/trpc" : "/api/trpc";
}

/** 当前生效的公开站点地址（运行时拿不到时退回当前 origin）。 */
export function publicSiteOrigin(): string {
  const injected = runtime().publicOrigin;
  if (typeof injected === "string" && /^https?:\/\//i.test(injected))
    return injected.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}
