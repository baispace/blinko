import { readBlogSiteSettings, readTopicSeo, readPageSeo } from "./blogSiteSettings";
import { readArticleSeo } from "../../shared/lib/blogSiteSettings";
import {
  absoluteSeoImage,
  normalizeBasePath,
  resolveSeoFields,
  toPublicPath,
  type ResolvedSeoFields,
  type SeoOverrideInput,
} from "../../shared/lib/blogSeo";
import superjson from "superjson";
import type { PrismaClient } from "@prisma/client";
import {
  publicIndex,
  publicArticle,
  publicTopic,
  publicTopics,
  publicText,
  blogRSS,
  publicPosts,
} from "./publicBlog";
import { publicBlogOwner } from "./blog";
import { publicPublicationWhere } from "./publication";
import { ensureShareImage } from "./blogCoverShare";

export const SITEMAP_PAGE_SIZE = 5000;
export const escapeXML = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
/**
 * 当前实际生效的公开站点地址。
 *
 * 优先级固定：环境变量 BLOG_PUBLIC_URL > 调用方传入的请求 origin。
 * 数据库里的 targetOrigin 只是「用户想要用的目标地址」，
 * 部署真正切换之前不能用它改写线上输出 —— 否则后台显示一个域名、
 * 服务端输出另一个域名。
 */
export function publicOrigin(
  fallback: string,
  configured = process.env.BLOG_PUBLIC_URL,
) {
  const url = new URL(configured || fallback);
  if (
    !/^https?:$/.test(url.protocol) ||
    url.username ||
    url.password ||
    !url.hostname
  )
    throw new Error("Invalid BLOG_PUBLIC_URL");
  return url.origin;
}
function absoluteImage(value: string | null | undefined, origin: string) {
  return absoluteSeoImage(value, origin);
}
export type BlogSEO = {
  bootstrap?: { path: string; site: Awaited<ReturnType<typeof publicIndex>> };
  status: number;
  title: string;
  description: string;
  canonical: string;
  image: string;
  imageAlt: string;
  type: "website" | "article";
  robots: string;
  author?: string;
  published?: string;
  modified?: string;
  /** 站点名称（工作区「站点名称」设置），用于 og:site_name */
  siteName: string;
  /** 公开站自己的站点图标（工作区「站点图标」设置），为空时不注入图标 */
  iconUrl?: string;
  /** 分页链：上一页 / 下一页的绝对地址 */
  prev?: string;
  next?: string;
  structured: Record<string, unknown>;
  text: string;
  links: { title: string; url: string }[];
  /** 公开前端启动时需要的运行时配置（基础路径、API 地址等）。 */
  runtime: BlogRuntimeConfig;
};

/** 公开前端的运行时配置：由服务端注入 HTML，公开前端启动时读取。 */
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
/**
 * 站点默认规则（SEO 第 3 级继承来源）。
 *
 * 站点名称优先用后台配置；没配置就用工作区「站点名称」，
 * 不再拿作者名去覆盖站点信息。
 */
export async function siteSeoRules(
  db: PrismaClient,
  accountId?: number,
) {
  const owner = await publicBlogOwner(db, accountId);
  const storedSettings = owner ? await readBlogSiteSettings(db, owner) : null;
  const settings = storedSettings?.configured ? storedSettings.data : null;
  const workspaceName = await workspaceSiteName(db);
  const siteName = settings?.siteName || workspaceName || "Ink";
  return {
    owner,
    settings,
    siteName,
    rules: {
      siteName,
      titleTemplate: settings?.titleTemplate ?? "{标题} · {站点名称}",
      description: settings?.description ?? "",
      shareImage: settings?.shareImage ?? "",
      allowIndex: settings?.allowIndex ?? true,
    },
  };
}
async function workspaceSiteName(db: PrismaClient) {
  try {
    const row = await db.config.findFirst({
      where: { key: "customTitle", userId: null },
      select: { config: true },
    });
    const value = (row?.config as { value?: unknown } | null)?.value;
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}
/**
 * 固定页面（首页 / 专题索引 / 关于页）的默认文案。
 *
 * 公开站输出与管理端预览共用这一份，避免预览和实际展示出现两套文案。
 */
export function fixedPageFacts(
  site: Awaited<ReturnType<typeof publicIndex>>,
  key: "home" | "topics" | "about" | "friends" | "moments" | "subscribe" | "stats",
) {
  const tagline = publicText(
    site.profile?.tagline || "记录思考与实践，让经验成为有脉络的内容。",
  );
  if (key === "home")
    return {
      path: "/blog",
      label: "首页",
      fallbackTitle: "思考与实践",
      fallbackDescription: tagline,
      fallbackImage: site.profile?.avatarUrl ?? null,
    };
  if (key === "topics")
    return {
      path: "/blog/topics",
      label: "专题索引",
      fallbackTitle: "专题",
      fallbackDescription: "按主题阅读公开文章，探索持续更新的思考与实践。",
      fallbackImage: site.profile?.avatarUrl ?? null,
    };
  if (key === "friends")
    return {
      path: "/blog/friends",
      label: "友情链接",
      fallbackTitle: "友情链接",
      fallbackDescription:
        "顺着链接，遇见有趣的人。这里收藏着一些认真记录、持续分享的个人站点。",
      fallbackImage: site.profile?.avatarUrl ?? null,
    };
  if (key === "moments")
    return {
      path: "/blog/moments",
      label: "动态",
      fallbackTitle: "动态",
      fallbackDescription: "一些当下，慢慢记录。",
      fallbackImage: site.profile?.avatarUrl ?? null,
    };
  if (key === "subscribe")
    return {
      path: "/blog/subscribe",
      label: "订阅更新",
      fallbackTitle: "订阅更新",
      fallbackDescription:
        "用你习惯的方式保持关注：微信公众号与 RSS，新内容自然来到你身边。",
      fallbackImage: site.profile?.avatarUrl ?? null,
    };
  if (key === "stats")
    return {
      path: "/blog/stats",
      label: "站点数据",
      fallbackTitle: "站点数据",
      fallbackDescription:
        "这里公开文章更新、阅读与互动的汇总数据。统计口径与更新时间一并展示，方便了解这个站点的近况。",
      fallbackImage: site.profile?.avatarUrl ?? null,
    };
  return {
    path: "/blog/about",
    label: "关于页",
    fallbackTitle: site.profile?.displayName
      ? `关于 ${site.profile.displayName}`
      : "关于作者",
    fallbackDescription: publicText(site.profile?.bio || tagline).slice(0, 180),
    fallbackImage: site.profile?.avatarUrl ?? null,
  };
}
export async function resolveBlogSEO(
  db: PrismaClient,
  pathname: string,
  origin: string,
  accountId?: number,
  /** 分页页码（来自 ?page=N），只对列表页有意义 */
  page: number = 1,
): Promise<BlogSEO> {
  const site = await publicIndex(db, { accountId, page });
  const { owner, settings, siteName, rules } = await siteSeoRules(db, accountId);
  const name = site.profile?.displayName || "Ink";
  const tagline = publicText(
    site.profile?.tagline || "记录思考与实践，让经验成为有脉络的内容。",
  );
  const canonicalPath = pathname.replace(/\/$/, "") || "/blog";
  // 公开站基础路径：应用内部固定在 /blog，公开域名可以把它映射到别的位置。
  const basePath = normalizeBasePath(settings?.publicBasePath) || "/blog";
  const publicPath = toPublicPath(canonicalPath, basePath);
  const isList =
    canonicalPath === "/blog" || /^\/blog\/t\/[^/]+$/.test(canonicalPath);
  // 分页页的地址带上页码，第一页保持干净（不写 ?page=1）
  const pageSuffix = (n: number) => (n > 1 ? `?page=${n}` : "");
  const seo: BlogSEO = {
    bootstrap: { path: canonicalPath, site },
    status: 200,
    title: "思考与实践 · " + name,
    description: tagline,
    canonical: origin + publicPath,
    image: absoluteImage(site.profile?.avatarUrl, origin),
    imageAlt: name,
    type: "website",
    robots: "index, follow, max-image-preview:large",
    siteName,
    // 公开站图标用站点自己的设置；没配过时退回作者头像，
    // 不用产品级标识覆盖公开站的品牌。
    iconUrl: settings?.iconUrl || absoluteImage(site.profile?.avatarUrl, origin),
    structured: {},
    text: tagline,
    links: site.posts.map((p) => ({
      title: p.title,
      url: toPublicPath("/blog/" + p.publishId, basePath),
    })),
    runtime: {
      basePath,
      apiOrigin: settings?.apiOrigin ?? "",
      publicOrigin: origin,
      deploymentMode: settings?.deploymentMode ?? "proxy",
    },
  };
  /**
   * 列表页分页：canonical 自指当前页，并串起 rel=prev / rel=next。
   * 搜索引擎靠这对链接发现后面的页；canonical 指向自己才不会被当成
   * 「第一页的重复内容」丢掉。
   */
  const paginate = (pageCount: number) => {
    const current = Math.min(Math.max(1, page), Math.max(1, pageCount));
    seo.canonical = origin + publicPath + pageSuffix(current);
    if (current > 1)
      seo.prev = origin + publicPath + pageSuffix(current - 1);
    if (current < pageCount)
      seo.next = origin + publicPath + pageSuffix(current + 1);
    return current;
  };
  const missing = () => {
    seo.status = 404;
    seo.title = "页面不存在 · " + name;
    seo.description = "此内容未公开、已撤回或不存在。";
    seo.robots = "noindex, nofollow";
    seo.text = seo.description;
    seo.links = [{ title: "返回首页", url: toPublicPath("/blog", basePath) }];
  };
  /**
   * 统一的 SEO 解析入口。
   *
   * content 是内容的公开信息（第 2 级），override 是内容显式覆盖（第 1 级），
   * 站点默认规则（第 3 级）与系统兜底（第 4 级）由 resolveSeoFields 处理。
   */
  const applySeo = (input: {
    override?: SeoOverrideInput | null;
    content?: { title?: string | null; summary?: string | null; coverUrl?: string | null } | null;
    fallbackTitle?: string | null;
    fallbackDescription?: string | null;
    fallbackImage?: string | null;
  }) => {
    const fields: ResolvedSeoFields = resolveSeoFields({
      override: input.override ?? null,
      content: input.content ?? null,
      site: rules,
      fallbackTitle: input.fallbackTitle ?? "",
      fallbackDescription: input.fallbackDescription ?? "",
      defaultImage: absoluteImage(input.fallbackImage, origin),
    });
    seo.title = fields.title;
    seo.description = fields.description;
    seo.image = absoluteImage(fields.image, origin);
    seo.imageAlt = fields.imageAlt || fields.title;
    return fields;
  };
  const pageOverrides = owner
    ? (await readPageSeo(db, owner)).data
    : ({
        home: {},
        topics: {},
        about: {},
        friends: {},
        moments: {},
        subscribe: {},
      } as const);
  if (canonicalPath === "/blog") {
    const current = paginate(site.pageCount);
    const paged = current > 1;
    const facts = fixedPageFacts(site, "home");
    applySeo({
      override: pageOverrides.home,
      content: {
        title: null,
        summary: null,
        coverUrl: null,
      },
      fallbackTitle: paged
        ? `${facts.fallbackTitle} · 第 ${current} 页`
        : facts.fallbackTitle,
      fallbackDescription: paged
        ? `${facts.fallbackDescription}（第 ${current} 页，共 ${site.pageCount} 页）`
        : facts.fallbackDescription,
      fallbackImage: facts.fallbackImage,
    });
    seo.structured = {
      "@type": "CollectionPage",
      name: seo.title,
      description: seo.description,
    };
  } else if (canonicalPath === "/blog/topics") {
    const facts = fixedPageFacts(site, "topics");
    applySeo({
      override: pageOverrides.topics,
      content: { title: null, summary: null, coverUrl: null },
      fallbackTitle: facts.fallbackTitle,
      fallbackDescription: facts.fallbackDescription,
      fallbackImage: facts.fallbackImage,
    });
    seo.links = site.topics.map((t) => ({
      title: t.name,
      url: toPublicPath("/blog/t/" + t.slug, basePath),
    }));
    seo.structured = { "@type": "CollectionPage", name: seo.title };
  } else if (canonicalPath === "/blog/about") {
    if (!site.profile) missing();
    else {
      const bio = publicText(site.profile.bio || tagline);
      const facts = fixedPageFacts(site, "about");
      applySeo({
        override: pageOverrides.about,
        content: { title: null, summary: null, coverUrl: null },
        fallbackTitle: facts.fallbackTitle,
        fallbackDescription: facts.fallbackDescription,
        fallbackImage: facts.fallbackImage,
      });
      seo.text = bio;
      seo.links = site.profile.links.map((l) => ({
        title: l.label,
        url: l.url,
      }));
      seo.structured = {
        "@type": "ProfilePage",
        mainEntity: {
          "@type": "Person",
          name,
          description: seo.description,
          image: seo.image,
          sameAs: site.profile.links.map((l) => l.url),
        },
      };
    }
  } else if (canonicalPath === "/blog/friends") {
    const facts = fixedPageFacts(site, "friends");
    applySeo({
      override: pageOverrides.friends,
      content: { title: null, summary: null, coverUrl: null },
      fallbackTitle: facts.fallbackTitle,
      fallbackDescription: facts.fallbackDescription,
      fallbackImage: facts.fallbackImage,
    });
    seo.text = facts.fallbackDescription;
    seo.links = [{ title: "返回首页", url: toPublicPath("/blog", basePath) }];
    seo.structured = { "@type": "CollectionPage", name: seo.title };
  } else if (canonicalPath === "/blog/moments") {
    const facts = fixedPageFacts(site, "moments");
    applySeo({
      override: pageOverrides.moments,
      content: { title: null, summary: null, coverUrl: null },
      fallbackTitle: facts.fallbackTitle,
      fallbackDescription: facts.fallbackDescription,
      fallbackImage: facts.fallbackImage,
    });
    seo.text = facts.fallbackDescription;
    seo.links = [{ title: "返回首页", url: toPublicPath("/blog", basePath) }];
    seo.structured = { "@type": "CollectionPage", name: seo.title };
  } else if (canonicalPath === "/blog/subscribe") {
    // 订阅页不造 FAQ 结构化数据 —— 页面里没有问答，标了就是骗搜索引擎。
    const facts = fixedPageFacts(site, "subscribe");
    applySeo({
      override: pageOverrides.subscribe,
      content: { title: null, summary: null, coverUrl: null },
      fallbackTitle: facts.fallbackTitle,
      fallbackDescription: facts.fallbackDescription,
      fallbackImage: facts.fallbackImage,
    });
    seo.text = facts.fallbackDescription;
    seo.links = [
      { title: "返回首页", url: toPublicPath("/blog", basePath) },
      { title: "关于作者", url: toPublicPath("/blog/about", basePath) },
    ];
    seo.structured = { "@type": "WebPage", name: seo.title };
  } else if (canonicalPath === "/blog/stats") {
    // 数据页没有单独的 SEO 覆盖项（后台没这个设置），
    // 走站点默认规则 + 系统兜底，不编造可配置项。
    const facts = fixedPageFacts(site, "stats");
    applySeo({
      override: null,
      content: { title: null, summary: null, coverUrl: null },
      fallbackTitle: facts.fallbackTitle,
      fallbackDescription: facts.fallbackDescription,
      fallbackImage: facts.fallbackImage,
    });
    seo.text = facts.fallbackDescription;
    seo.links = [{ title: "返回首页", url: toPublicPath("/blog", basePath) }];
    seo.structured = { "@type": "WebPage", name: seo.title };
  } else if (/^\/blog\/t\/[^/]+$/.test(canonicalPath)) {
    let slug = "";
    try {
      slug = decodeURIComponent(canonicalPath.split("/")[3]);
    } catch {}
    const topic = await publicTopic(db, { accountId, slug, page });
    if (!topic) missing();
    else {
      const current = paginate(topic.pageCount);
      const paged = current > 1;
      let override: SeoOverrideInput = {};
      if (owner) {
        const topicRow = await db.blogTopic.findFirst({
          where: {
            accountId: owner,
            slug,
            isPublished: true,
          },
          select: { id: true },
        });
        if (topicRow)
          override = (await readTopicSeo(db, owner, topicRow.id)).data;
      }
      applySeo({
        override,
        content: {
          title: topic.topic.name,
          summary: null,
          coverUrl:
            site.topics.find((t) => t.slug === slug)?.coverUrl ??
            site.profile?.avatarUrl,
        },
        fallbackTitle: topic.topic.name,
        fallbackDescription: publicText(
          topic.topic.desc || topic.topic.name + "专题文章",
        ).slice(0, 180),
      });
      seo.text = seo.description;
      seo.links = topic.posts.map((p) => ({
        title: p.title,
        url: toPublicPath("/blog/" + p.publishId, basePath),
      }));
      seo.structured = {
        "@type": "CollectionPage",
        name: topic.topic.name,
        description: seo.description,
      };
    }
  } else if (/^\/blog\/[^/]+$/.test(canonicalPath)) {
    let id = "";
    try {
      id = decodeURIComponent(canonicalPath.split("/")[2]);
    } catch {}
    const article = await publicArticle(db, { accountId, publishId: id });
    if (!article) missing();
    else {
      let override: SeoOverrideInput = {};
      if (owner) {
        const note = await db.notes.findFirst({
          where: {
            accountId: owner,
            publishId: id,
            ...publicPublicationWhere,
          },
          select: { metadata: true },
        });
        override = readArticleSeo(note?.metadata, true);
      }
      /*
       * og:image 用派生分享图：同一张底图 + 同一份文字配置合成 1200×630。
       * 它只由**公开版本**生成 —— 草稿里还没发布的文案不会泄露出去。
       * 作者自己在 SEO 面板里显式配了图片的话，override 优先，不受影响。
       */
      const shareUrl = await ensureShareImage(db, article.id);
      applySeo({
        override,
        content: {
          title: article.title,
          summary: article.excerpt || null,
          coverUrl: shareUrl || article.coverUrl || site.profile?.avatarUrl,
        },
        fallbackTitle: article.title,
        fallbackDescription: article.excerpt || article.title,
      });
      seo.type = "article";
      seo.author = site.profile?.displayName || undefined;
      seo.published = article.createdAt.toISOString();
      seo.modified = article.updatedAt.toISOString();
      seo.text = publicText(article.content);
      seo.links = article.related.map((p) => ({
        title: p.title,
        url: toPublicPath("/blog/" + p.publishId, basePath),
      }));
      seo.structured = {
        "@type": "BlogPosting",
        headline: seo.title,
        description: seo.description,
        image: seo.image,
        datePublished: seo.published,
        dateModified: seo.modified,
        mainEntityOfPage: seo.canonical,
        ...(seo.author && {
          author: {
            "@type": "Person",
            name: seo.author,
            url: origin + toPublicPath("/blog/about", basePath),
          },
        }),
      };
    }
  } else missing();
  if (seo.status === 200) {
    if (settings && !settings.allowIndex) seo.robots = "noindex, follow";
  }
  seo.structured = {
    "@context": "https://schema.org",
    ...seo.structured,
    url: seo.canonical,
  };
  return seo;
}
export function renderBlogHead(seo: BlogSEO, origin: string) {
  const e = escapeXML;
  const meta = (name: string, value: string, property = false) =>
    `<meta data-ink-blog-seo ${property ? "property" : "name"}="${name}" content="${e(value)}">`;
  // 公开站有自己的品牌配置：图标与应用名用站点设置，不复用产品级标识。
  const brand =
    (seo.iconUrl
      ? `<link data-ink-blog-seo rel="icon" href="${e(seo.iconUrl)}">` +
        `<link data-ink-blog-seo rel="apple-touch-icon" href="${e(seo.iconUrl)}">`
      : "") +
    meta("application-name", seo.siteName) +
    meta("apple-mobile-web-app-title", seo.siteName);
  return (
    `<title>${e(seo.title)}</title>` +
    brand +
    meta("description", seo.description) +
    meta("robots", seo.robots) +
    `<link data-ink-blog-seo rel="canonical" href="${e(seo.canonical)}"><link data-ink-blog-seo rel="alternate" type="application/rss+xml" title="RSS" href="${e(origin + toPublicPath("/blog/feed.xml", seo.runtime?.basePath || "/blog"))}">` +
    (seo.prev
      ? `<link data-ink-blog-seo rel="prev" href="${e(seo.prev)}">`
      : "") +
    (seo.next
      ? `<link data-ink-blog-seo rel="next" href="${e(seo.next)}">`
      : "") +
    meta("og:site_name", seo.siteName || "Ink", true) +
    meta("og:locale", "zh_CN", true) +
    meta("og:type", seo.type, true) +
    meta("og:title", seo.title, true) +
    meta("og:description", seo.description, true) +
    meta("og:url", seo.canonical, true) +
    meta("og:image", seo.image, true) +
    meta("og:image:alt", seo.imageAlt || seo.title, true) +
    meta(
      "twitter:card",
      seo.image.endsWith("/icons/Square310x310Logo.png")
        ? "summary"
        : "summary_large_image",
    ) +
    meta("twitter:title", seo.title) +
    meta("twitter:description", seo.description) +
    meta("twitter:image", seo.image) +
    meta("twitter:image:alt", seo.imageAlt || seo.title) +
    (seo.author ? meta("author", seo.author) : "") +
    (seo.published ? meta("article:published_time", seo.published, true) : "") +
    (seo.modified ? meta("article:modified_time", seo.modified, true) : "") +
    `<script data-ink-blog-seo type="application/ld+json">${JSON.stringify(seo.structured).replace(/</g, "\\u003c")}</script>`
  );
}
export function injectBlogSEO(html: string, seo: BlogSEO) {
  const origin = new URL(seo.canonical).origin;
  const clean = html
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(
      /<meta\b(?=[^>]*(?:name|property)\s*=\s*["'](?:description|robots|author|og:[^"']+|twitter:[^"']+|article:[^"']+)["'])[^>]*>/gi,
      "",
    )
    .replace(/<link\b(?=[^>]*rel=["'](?:canonical|prev|next)["'])[^>]*>/gi, "")
    // 公开站有自己的品牌配置：产品级的图标、manifest、应用名与首屏占位
    // 都不能覆盖它，也不该出现在公开博客的页面上。
    .replace(
      /<link\b(?=[^>]*rel=["'](?:icon|shortcut icon|alternate icon|apple-touch-icon|manifest)["'])[^>]*>/gi,
      "",
    )
    .replace(
      /<meta\b(?=[^>]*name=["'](?:application-name|apple-mobile-web-app-title|msapplication-config|msapplication-TileColor)["'])[^>]*>/gi,
      "",
    )
    .replace(/<div\b[^>]*id=["']app-boot["'][\s\S]*?<\/div>/gi, "");
  const fallback = `<main data-ink-public-fallback><h1>${escapeXML(seo.title)}</h1><p>${escapeXML(seo.text)}</p><nav><a href="/blog">首页</a> <a href="/blog/topics">专题</a> ${seo.links.map((l) => `<a href="${escapeXML(l.url)}">${escapeXML(l.title)}</a>`).join(" ")}</nav></main>`;
  const runtime = `<script>window.__INK_BLOG_RUNTIME__=${JSON.stringify(seo.runtime || {}).replace(/</g, "\\u003c")}</script>`;
  const startup = `<script>document.documentElement.classList.add('ink-blog-js')</script><style>
html.ink-blog-js,html.ink-blog-js body{background:#f7f7fc;margin:0}.ink-blog-js [data-ink-public-fallback]{display:none}[data-ink-blog-skeleton]{display:none}.ink-blog-js [data-ink-blog-skeleton]{display:block;max-width:1280px;margin:0 auto;padding:24px 32px;box-sizing:border-box}.ink-skeleton-nav{height:42px;width:210px;background:#fff;border-radius:28px;margin:0 auto 38px}.ink-skeleton-hero{height:300px;border-radius:20px;background:linear-gradient(110deg,#edeafb,#e3ddfb,#edeafb);margin-bottom:28px}.ink-skeleton-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.ink-skeleton-card{height:240px;border-radius:18px;background:#fff}@media(max-width:640px){[data-ink-blog-skeleton]{padding:20px 16px!important}.ink-skeleton-hero{height:220px}.ink-skeleton-grid{grid-template-columns:1fr}}</style>`;
  const bootstrap = seo.bootstrap
    ? `<script id="ink-blog-bootstrap" type="application/json">${JSON.stringify({ path: seo.bootstrap.path, data: superjson.serialize(seo.bootstrap.site) }).replace(/</g, "\\u003c")}</script>`
    : "";
  const skeleton =
    '<div data-ink-blog-skeleton aria-hidden="true"><div class="ink-skeleton-nav"></div><div class="ink-skeleton-hero"></div><div class="ink-skeleton-grid"><div class="ink-skeleton-card"></div><div class="ink-skeleton-card"></div></div></div>';
  return clean
    .replace(/<html\b[^>]*>/i, '<html lang="zh-CN">')
    .replace(
      "</head>",
      () => startup + runtime + renderBlogHead(seo, origin) + bootstrap + "</head>",
    )
    .replace(
      /(<div\b[^>]*id=["']root["'][^>]*>)\s*(<\/div>)/i,
      (_match, open, close) => open + skeleton + fallback + close,
    );
}
export async function sitemapIndex(
  db: PrismaClient,
  origin: string,
  accountId?: number,
  basePath: string = "/blog",
) {
  const owner = await publicBlogOwner(db, accountId);
  const total = await db.notes.count({
    where: { ...publicPublicationWhere, accountId: owner },
  });
  const paths = [
    toPublicPath("/blog/sitemap-pages.xml", basePath),
    ...Array.from(
      { length: Math.ceil(total / SITEMAP_PAGE_SIZE) },
      (_, i) => toPublicPath(`/blog/sitemap-articles-${i + 1}.xml`, basePath),
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<sitemap><loc>${escapeXML(origin + p)}</loc></sitemap>`).join("")}</sitemapindex>`;
}
export async function sitemapPage(
  db: PrismaClient,
  origin: string,
  page: number | "pages",
  accountId?: number,
  basePath: string = "/blog",
) {
  const owner = await publicBlogOwner(db, accountId);
  let urls: { path: string; modified?: Date }[];
  if (page === "pages") {
    const [topics, profile] = await Promise.all([
      publicTopics(db, owner),
      db.blogProfile.findFirst({
        where: { accountId: owner, isPublished: true },
        select: { updatedAt: true },
      }),
    ]);
    urls = [
      { path: toPublicPath("/blog", basePath) },
      { path: toPublicPath("/blog/topics", basePath) },
      { path: toPublicPath("/blog/friends", basePath) },
      { path: toPublicPath("/blog/moments", basePath) },
      { path: toPublicPath("/blog/subscribe", basePath) },
      { path: toPublicPath("/blog/stats", basePath) },
      ...(profile
        ? [{ path: toPublicPath("/blog/about", basePath), modified: profile.updatedAt }]
        : []),
      ...topics.map((t) => ({ path: toPublicPath("/blog/t/" + t.slug, basePath) })),
    ];
  } else {
    if (!Number.isSafeInteger(page) || page < 1) return null;
    const rows = await db.notes.findMany({
      where: { ...publicPublicationWhere, accountId: owner },
      select: { publishId: true, publication: { select: { updatedAt: true } } },
      orderBy: { id: "asc" },
      skip: (page - 1) * SITEMAP_PAGE_SIZE,
      take: SITEMAP_PAGE_SIZE,
    });
    if (!rows.length) return null;
    urls = rows.map((r) => ({
      path: toPublicPath("/blog/" + r.publishId, basePath),
      // 更新时间取公开快照的更新时间，不是私有草稿的编辑时间。
      modified: r.publication!.updatedAt,
    }));
  }
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${escapeXML(origin + u.path)}</loc>${u.modified ? `<lastmod>${u.modified.toISOString()}</lastmod>` : ""}</url>`).join("")}</urlset>`;
}
export function blogRobots(origin: string, basePath: string = "/blog") {
  const base = normalizeBasePath(basePath) || "/blog";
  const allowRoot = base === "/" ? "/$" : base + "$";
  const allowPrefix = base === "/" ? "/" : base + "/";
  return `User-agent: *\nDisallow: /\nAllow: ${allowRoot}\nAllow: ${allowPrefix}\nAllow: /assets/\nAllow: /font-assets/\nAllow: /icons/\nAllow: /api/trpc/blog.public\nAllow: /api/file/\nAllow: /api/s3file/\nSitemap: ${origin}/sitemap.xml\n`;
}
export async function publicRSS(
  db: PrismaClient,
  origin: string,
  accountId?: number,
  basePath: string = "/blog",
) {
  const site = await publicIndex(db, { accountId });
  const feed = await publicPosts(db, { accountId, limit: 40 });
  return blogRSS({ ...site, ...feed }, origin, basePath);
}
