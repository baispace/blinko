/**
 * 公开 SEO 的唯一解析规则。
 *
 * 服务端首屏 HTML、客户端路由切换、管理端预览、分享标签、站点地图全部走这一份，
 * 避免「公开页一套拼接、管理页另一套拼接」导致预览和实际展示对不上。
 *
 * 每个字段独立按四级优先级判定：
 *   1. override —— 内容显式覆盖（文章 / 专题 / 固定页面自己的 SEO）
 *   2. content  —— 内容自身的公开信息（公开标题 / 概要 / 封面）
 *   3. site     —— 站点默认规则（标题模板 / 站点描述 / 默认分享图）
 *   4. default  —— 系统安全默认值
 *
 * 「恢复默认」= 清空 override 回到继承，不是把当前默认文本复制进字段。
 */

/** 某个字段的最终取值来自哪一级。管理端用它显示「继承默认 / 自定义」。 */
export type SeoSource = "override" | "content" | "site" | "default";

export type SeoSourceMap = {
  title: SeoSource;
  description: SeoSource;
  image: SeoSource;
  imageAlt: SeoSource;
};

/** 内容显式覆盖的 SEO 字段。空字符串表示「这一项没有覆盖」。 */
export type SeoOverrideInput = {
  title?: string | null;
  description?: string | null;
  image?: string | null;
  imageAlt?: string | null;
};

/** 内容自身的公开信息（第 2 级继承来源）。 */
export type SeoContentFacts = {
  title?: string | null;
  summary?: string | null;
  coverUrl?: string | null;
};

/** 站点默认规则（第 3 级继承来源）。 */
export type SeoSiteRules = {
  /** 站点名称，用于标题模板里的 {站点名称} */
  siteName?: string | null;
  /** 标题模板，必须含 {标题} */
  titleTemplate?: string | null;
  /** 站点默认描述 */
  description?: string | null;
  /** 站点默认分享图 */
  shareImage?: string | null;
  /** 是否允许收录 */
  allowIndex?: boolean | null;
};

export type ResolvedSeoFields = {
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  sources: SeoSourceMap;
};

const text = (value: string | null | undefined) =>
  typeof value === "string" ? value.trim() : "";

/** 标题模板占位符：{标题} 与 {站点名称}。没有占位符时原样返回标题。 */
export function applyTitleTemplate(
  template: string | null | undefined,
  title: string,
  siteName: string,
) {
  const tpl = text(template);
  const base = text(title);
  if (!tpl) return base;
  let out = tpl;
  if (out.includes("{标题}")) out = out.split("{标题}").join(base);
  else if (out.includes("{title}")) out = out.split("{title}").join(base);
  if (out.includes("{站点名称}")) out = out.split("{站点名称}").join(siteName);
  else if (out.includes("{siteName}")) out = out.split("{siteName}").join(siteName);
  return text(out) || base;
}

/**
 * 解析单个内容的 SEO 字段。
 *
 * @param override 内容显式覆盖（可为空）
 * @param content  内容自身的公开信息（可为空）
 * @param site     站点默认规则
 * @param fallbackTitle       内容没有公开标题时使用的兜底标题
 * @param fallbackDescription 内容没有概要、站点也没写描述时的兜底描述
 * @param defaultImage        没有封面、站点也没配分享图时的兜底图片
 */
export function resolveSeoFields(input: {
  override?: SeoOverrideInput | null;
  content?: SeoContentFacts | null;
  site?: SeoSiteRules | null;
  fallbackTitle?: string | null;
  fallbackDescription?: string | null;
  defaultImage?: string | null;
}): ResolvedSeoFields {
  const override = input.override ?? {};
  const content = input.content ?? {};
  const site = input.site ?? {};
  const siteName = text(site.siteName) || "Ink";

  const overrideTitle = text(override.title);
  const contentTitle = text(content.title);
  const fallbackTitle = text(input.fallbackTitle);

  let title = "";
  let titleSource: SeoSource = "default";
  if (overrideTitle) {
    title = overrideTitle;
    titleSource = "override";
  } else if (contentTitle) {
    title = applyTitleTemplate(site.titleTemplate, contentTitle, siteName);
    titleSource = "content";
  } else {
    title = applyTitleTemplate(
      site.titleTemplate,
      fallbackTitle,
      siteName,
    );
    titleSource = fallbackTitle ? "site" : "default";
  }

  const overrideDescription = text(override.description);
  const contentSummary = text(content.summary);
  const siteDescription = text(site.description);
  const fallbackDescription = text(input.fallbackDescription);

  let description = "";
  let descriptionSource: SeoSource = "default";
  if (overrideDescription) {
    description = overrideDescription;
    descriptionSource = "override";
  } else if (contentSummary) {
    description = contentSummary;
    descriptionSource = "content";
  } else if (siteDescription) {
    description = siteDescription;
    descriptionSource = "site";
  } else {
    description = fallbackDescription;
  }

  const overrideImage = text(override.image);
  const contentCover = text(content.coverUrl);
  const siteShareImage = text(site.shareImage);

  let image = "";
  let imageSource: SeoSource = "default";
  if (overrideImage) {
    image = overrideImage;
    imageSource = "override";
  } else if (contentCover) {
    image = contentCover;
    imageSource = "content";
  } else if (siteShareImage) {
    image = siteShareImage;
    imageSource = "site";
  } else {
    image = text(input.defaultImage);
  }

  const overrideImageAlt = text(override.imageAlt);
  const imageAlt = overrideImageAlt || title;
  const imageAltSource: SeoSource = overrideImageAlt ? "override" : "default";

  return {
    title,
    description,
    image,
    imageAlt,
    sources: {
      title: titleSource,
      description: descriptionSource,
      image: imageSource,
      imageAlt: imageAltSource,
    },
  };
}

/** 来源级别的中文标签，管理端与发布检查共用。 */
export const SEO_SOURCE_LABELS: Record<SeoSource, string> = {
  override: "自定义",
  content: "继承内容",
  site: "继承站点",
  default: "系统默认",
};

/** 某个字段是否处于「继承」状态（没有显式覆盖）。 */
export function isInherited(source: SeoSource) {
  return source !== "override";
}

/**
 * 把图片地址补成绝对地址。
 *
 * 分享元信息必须能被公开读取，所以这里拒绝带凭据的地址，
 * 解析失败时回退到站点图标而不是抛错 —— 一张坏图不该让整页 500。
 */
export function absoluteSeoImage(
  value: string | null | undefined,
  origin: string,
  fallback = "/icons/Square310x310Logo.png",
) {
  const safeFallback = origin.replace(/\/+$/, "") + fallback;
  const raw = text(value);
  if (!raw) return safeFallback;
  try {
    const url = new URL(raw, origin);
    if (!/^https?:$/.test(url.protocol)) return safeFallback;
    if (url.username || url.password) return safeFallback;
    return url.href;
  } catch {
    return safeFallback;
  }
}

/** 页面级 override 的键：首页 / 专题索引 / 关于页。 */
export const BLOG_FIXED_PAGES = [
  { key: "home", label: "首页", path: "/blog" },
  { key: "topics", label: "专题索引", path: "/blog/topics" },
  { key: "about", label: "关于页", path: "/blog/about" },
  { key: "friends", label: "友情链接", path: "/blog/friends" },
  { key: "moments", label: "动态", path: "/blog/moments" },
  { key: "subscribe", label: "订阅更新", path: "/blog/subscribe" },
] as const;

export type BlogFixedPageKey = (typeof BLOG_FIXED_PAGES)[number]["key"];

export const BLOG_FIXED_PAGE_KEYS = BLOG_FIXED_PAGES.map((p) => p.key);

/**
 * 归一化基础路径：必须为空或以 / 开头，不带协议、凭据和空白。
 * 尾斜杠会被去掉，"/" 保留为根路径。
 */
export function normalizeBasePath(value: string | null | undefined) {
  const raw = text(value);
  if (!raw) return "";
  if (!raw.startsWith("/")) return "";
  if (/[\s?#\\]/.test(raw)) return "";
  if (raw.includes("://") || raw.includes("@")) return "";
  const trimmed = raw.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/** 把基础路径和相对路径拼起来，避免出现双斜杠。 */
export function joinBasePath(basePath: string, path: string) {
  const base = normalizeBasePath(basePath) || "/";
  const rest = path.startsWith("/") ? path : "/" + path;
  if (base === "/") return rest === "/" ? "/" : rest;
  if (rest === "/") return base;
  return base.replace(/\/+$/, "") + rest;
}

/**
 * 把应用内部路径换算成公开路径。
 *
 * 应用内部固定挂在 /blog 下；公开域名可以把它映射到根路径，
 * 这时 canonical、站点地图、RSS 都要跟着换成公开地址。
 */
export function toPublicPath(internalPath: string, basePath: string) {
  const path = internalPath || "/blog";
  const rest =
    path === "/blog"
      ? ""
      : path.startsWith("/blog/")
        ? path.slice("/blog".length)
        : path;
  return joinBasePath(basePath, rest || "/");
}

