import { useEffect } from "react";
import {
  blogInternalPath,
  publicAsset,
  publicBasePath,
} from "@/lib/blogPublicBase";
import { useLocation } from "react-router-dom";
import { api } from "@/lib/publicBlogClient";

// Server-rendered metadata covers first navigation and non-JS crawlers. Keep the
// same metadata on client-side route transitions; never retain a previous post's card.
//
// 关键约定：请求发出前**不**清掉服务端注入的 meta，也**不**预置 noindex。
// 服务端那份（server/lib/publicBlogSEO.ts 的 injectBlogSEO）对应的就是当前 URL，
// 是可信值。如果这里先写 noindex、而接口恰好失败，已收录的页面会在渲染后
// 被搜索引擎判成 noindex —— 把好事变坏。失败时保持服务端那份不动。
export function BlogMetadata() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    let current = true;
    const clear = () =>
      document.head
        .querySelectorAll("[data-ink-blog-seo]")
        .forEach((n) => n.remove());
    const setMeta = (key: string, value: string, property = false) => {
      const node = document.createElement("meta");
      node.dataset.inkBlogSeo = "";
      node.setAttribute(property ? "property" : "name", key);
      node.content = value;
      document.head.append(node);
    };
    // 只清掉不属于博客 SEO 的旧 description（index.html 自带的那份）；
    // 服务端注入的那份带 data-ink-blog-seo 标记，留到接口成功后一起替换。
    document.head
      .querySelectorAll('meta[name="description"]')
      .forEach((n) => {
        if (!n.hasAttribute("data-ink-blog-seo")) n.remove();
      });
    api.blog.publicSEO
      // 服务端按内部路径解析（/blog/...），公开地址只是外壳。
      .query({ path: blogInternalPath(pathname) + search, origin: location.origin })
      .then((seo) => {
        if (!current) return;
        clear();
        document.title = seo.title;
        document.documentElement.lang = "zh-CN";
        setMeta("description", seo.description);
        setMeta("robots", seo.robots);
        for (const [key, value] of Object.entries({
          "og:title": seo.title,
          "og:description": seo.description,
          "og:url": seo.canonical,
          "og:type": seo.type,
          "og:locale": "zh_CN",
          "og:site_name": seo.siteName || "Ink",
          "og:image": seo.image,
          "og:image:alt": seo.title,
          ...(seo.published ? { "article:published_time": seo.published } : {}),
          ...(seo.modified ? { "article:modified_time": seo.modified } : {}),
        }))
          setMeta(key, value, true);
        setMeta(
          "twitter:card",
          seo.image.endsWith("/icons/Square310x310Logo.png")
            ? "summary"
            : "summary_large_image",
        );
        setMeta("twitter:title", seo.title);
        setMeta("twitter:description", seo.description);
        setMeta("twitter:image", seo.image);
        if (seo.author) setMeta("author", seo.author);
        const canonical = document.createElement("link");
        canonical.dataset.inkBlogSeo = "";
        canonical.rel = "canonical";
        canonical.href = seo.canonical;
        document.head.append(canonical);
        // 分页链：搜索引擎靠它发现后面的页
        for (const rel of ["prev", "next"] as const) {
          const href = rel === "prev" ? seo.prev : seo.next;
          if (!href) continue;
          const link = document.createElement("link");
          link.dataset.inkBlogSeo = "";
          link.rel = rel;
          link.href = href;
          document.head.append(link);
        }
        const rss = document.createElement("link");
        rss.dataset.inkBlogSeo = "";
        rss.rel = "alternate";
        rss.type = "application/rss+xml";
        rss.title = "RSS";
        rss.href = new URL(publicAsset("/blog/feed.xml"), seo.canonical).href;
        document.head.append(rss);
        const json = document.createElement("script");
        json.dataset.inkBlogSeo = "";
        json.type = "application/ld+json";
        json.textContent = JSON.stringify(seo.structured);
        document.head.append(json);
      })
      .catch(() => {
        // 保持现状：首屏有服务端注入的正确值；SPA 跳转失败时宁可留着上一份
        // meta，也不要把当前页标成 noindex。
      });
    return () => {
      current = false;
      // 只有真正离开 /blog 区域时才清，博客内部跳转由下一次成功回调接管。
      if (!window.location.pathname.startsWith(publicBasePath())) clear();
    };
  }, [pathname, search]);
  return null;
}
