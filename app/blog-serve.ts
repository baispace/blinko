import path from "node:path";
import superjson from "superjson";

/**
 * 公开博客的独立服务（前后端分离部署）。
 *
 * 它只做三件事：
 *   1. 托管公开前端的静态产物（dist/blog）；
 *   2. 把 /api 反向代理到后端（用户的后台服务）；
 *   3. 首页 / 文章 / 专题在服务端渲染首屏，并把数据一起内嵌进 HTML ——
 *      前端接管时直接用这份数据，不再发一次同样的请求。
 *
 * 环境变量：
 *   BLOG_PORT        监听端口（默认 4175）
 *   BLOG_HOST        监听地址（默认 127.0.0.1，前面放反向代理）
 *   BLOG_API_ORIGIN  后端地址（默认 http://127.0.0.1:1111）
 *   BLOG_LOG         访问日志：off | access | all（默认 access）
 *   BLOG_HTML_CACHE  首屏 HTML 的 CDN 缓存秒数（默认 60，0 表示不缓存）
 */

const root = path.resolve(import.meta.dir, "../dist/blog");
const apiOrigin = process.env.BLOG_API_ORIGIN || "http://127.0.0.1:1111";
const port = Number(process.env.BLOG_PORT || 4175);
const host = process.env.BLOG_HOST || "127.0.0.1";
const logMode = process.env.BLOG_LOG || "access";
const htmlCacheSeconds = Number(process.env.BLOG_HTML_CACHE ?? 60);
const { renderArticle, renderHome, renderTopic } =
  await import("../dist/blog-server/blog-article.server.js");
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
async function query(name: string, input: unknown) {
  const url = new URL(`/api/trpc/blog.${name}`, apiOrigin);
  url.searchParams.set("input", JSON.stringify(superjson.serialize(input)));
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Public API returned ${response.status}`);
  const body = await response.json();
  return superjson.deserialize<any>(body.result.data);
}
/** 访问日志：一眼看出「慢在哪、重复请求了多少次、缓存命中没命中」。 */
function logAccess(request: Request, url: URL, status: number, started: number, note?: string) {
  if (logMode === "off") return;
  const ms = Math.round(performance.now() - started);
  const line = `${new Date().toISOString()} ${request.method} ${url.pathname}${url.search} ${status} ${ms}ms${note ? " " + note : ""}`;
  if (logMode === "all" || status >= 400 || ms >= 300) console.log(line);
  else console.log(line);
}

const server = Bun.serve({
  port,
  hostname: host,
  idleTimeout: 60,
  async fetch(request) {
    const started = performance.now();
    const url = new URL(request.url);
    // 健康检查：给反向代理与编排系统探活用，不进访问日志。
    if (url.pathname === "/healthz") {
      return new Response("ok", {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    if (url.pathname.startsWith("/api/")) {
      const upstream = new URL(url.pathname + url.search, apiOrigin);
      // 转发时补上原始 Host 与协议：后端要靠它判断公开域名与来源。
      const headers = new Headers(request.headers);
      headers.set("X-Forwarded-Host", request.headers.get("host") || host);
      headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));
      headers.set("X-Forwarded-For", request.headers.get("x-forwarded-for") || "");
      try {
        const response = await fetch(new Request(upstream, { ...request, headers }));
        logAccess(request, url, response.status, started, "api");
        return response;
      } catch (error) {
        console.error("[blog-api]", error);
        logAccess(request, url, 502, started, "api-failed");
        return new Response("接口暂时不可用，请稍后重试。", {
          status: 502,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
    }
    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(url.pathname);
    } catch {
      return new Response("Invalid path", { status: 400 });
    }
    const filePath = path.resolve(root, "." + decodedPath);
    if (!filePath.startsWith(root + path.sep) && filePath !== root)
      return new Response("Not found", { status: 404 });
    const file = Bun.file(filePath);
    if (filePath !== root && (await file.exists())) {
      const immutable = /^\/assets\/[^/]+-[\w-]+\.[a-z0-9]+$/.test(
        url.pathname,
      );
      // 字体与带 hash 的资源一样是内容寻址的：改了内容文件名就变，可以长缓存。
      const hashed =
        immutable || url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/font-assets/");
      const response = new Response(request.method === "HEAD" ? null : file, {
        headers: {
          "Content-Type": file.type,
          "Cache-Control": hashed
            ? "public, max-age=31536000, immutable"
            : "public, max-age=3600",
        },
      });
      logAccess(request, url, response.status, started, `static ${file.size}B`);
      return response;
    }
    if (/\.[a-z0-9]+$/i.test(url.pathname))
      return new Response("Not found", { status: 404 });
    let html = await Bun.file(path.join(root, "index.html")).text();
    if (
      url.pathname === "/" &&
      !["view", "topic", "feed", "year", "range"].some((key) =>
        url.searchParams.has(key),
      )
    ) {
      try {
        const page = Math.max(
          1,
          Math.min(
            10000,
            Math.floor(Number(url.searchParams.get("page")) || 1),
          ),
        );
        const site = await query("publicIndex", { page });
        const bootstrap = JSON.stringify({
          path: "/blog",
          data: superjson.serialize(site),
        }).replace(/</g, "\\u003c");
        html = html
          .replace(
            /<title>[^<]*<\/title>/,
            `<title>${escape(site.siteName)} · 思考与实践</title>`,
          )
          .replace(
            '<div id="root"></div>',
            `<style>body:has([data-ink-reading-shell]) #root{position:absolute;visibility:hidden}</style>${renderHome(site)}<div id="root"></div><script id="ink-blog-bootstrap" type="application/json">${bootstrap}</script>`,
          );
      } catch (error) {
        console.error("[blog-home-render]", error);
        return new Response("首页暂时无法加载，请稍后重试", {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        });
      }
    }
    const oldArticle = url.pathname.match(/^\/([a-z0-9]{8,64})$/);
    if (
      oldArticle &&
      !["subscribe", "moments", "friends", "topics", "about", "stats"].includes(
        oldArticle[1],
      )
    )
      return Response.redirect(
        new URL("/article/" + oldArticle[1] + url.search, url.origin),
        308,
      );
    if (url.pathname.startsWith("/t/"))
      return Response.redirect(
        new URL(
          url.pathname.replace("/t/", "/topic/") + url.search,
          url.origin,
        ),
        308,
      );
    const topicMatch = decodedPath.match(/^\/topic\/([^/]+)\/?$/);
    if (topicMatch) {
      try {
        const slug = topicMatch[1];
        const page = Math.max(
          1,
          Math.min(
            10000,
            Math.floor(Number(url.searchParams.get("page")) || 1),
          ),
        );
        const [directory, topicData, site] = await Promise.all([
          query("publicTopicDoc", { slug }),
          query("publicTopic", { slug, page }),
          query("publicIndex", { page: 1 }),
        ]);
        if (!directory)
          return new Response("专题不存在或尚未公开", {
            status: 404,
            headers: { "Cache-Control": "no-store" },
          });
        if (
          directory.topic.displayMode === "doc" &&
          url.searchParams.get("view") !== "overview" &&
          directory.defaultPublishId
        ) {
          return Response.redirect(
            new URL(
              "/article/" +
                directory.defaultPublishId +
                "?topic=" +
                encodeURIComponent(slug),
              url.origin,
            ),
            302,
          );
        }
        const bootstrap = JSON.stringify({
          path: "/blog/t/" + encodeURIComponent(slug),
          data: superjson.serialize(site),
          directory: superjson.serialize(directory),
          topicData: superjson.serialize(topicData),
          topicPage: page,
        }).replace(/</g, "\\u003c");
        html = html
          .replace(
            /<title>[^<]*<\/title>/,
            `<title>${escape(directory.topic.name)} · ${escape(site.siteName)}</title>`,
          )
          .replace(
            '<div id="root"></div>',
            `<style>body:has([data-ink-reading-shell]) #root{position:absolute;visibility:hidden}</style>${renderTopic(directory)}<div id="root"></div><script id="ink-blog-bootstrap" type="application/json">${bootstrap}</script>`,
          );
      } catch (error) {
        console.error("[blog-topic-render]", error);
        return new Response("专题暂时无法加载，请稍后重试", {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        });
      }
    }
    const match = url.pathname.match(/^\/article\/([a-z0-9]{8,64})\/?$/);
    if (
      match &&
      !["subscribe", "moments", "friends", "topics", "about", "stats"].includes(
        match[1],
      )
    ) {
      try {
        const [article, site] = await Promise.all([
          query("publicArticle", {
            publishId: match[1],
            topicSlug: url.searchParams.get("topic") || undefined,
          }),
          query("publicIndex", { page: 1 }),
        ]);
        if (!article)
          return new Response("文章不存在或已撤回", {
            status: 404,
            headers: { "Cache-Control": "no-store" },
          });
        const bootstrap = JSON.stringify({
          path: "/blog/" + match[1],
          data: superjson.serialize(site),
          article: superjson.serialize(article),
        }).replace(/</g, "\\u003c");
        html = html
          .replace(
            /<title>[^<]*<\/title>/,
            `<title>${escape(article.title)}</title>`,
          )
          .replace(
            "</head>",
            `<meta name="description" content="${escape(article.summary || "")}"><link rel="canonical" href="${escape(url.origin + url.pathname)}"></head>`,
          )
          .replace(
            '<div id="root"></div>',
            `<style>body:has([data-ink-reading-shell]) #root{position:absolute;visibility:hidden}</style>${renderArticle(article)}<div id="root"></div><script id="ink-blog-bootstrap" type="application/json">${bootstrap}</script>`,
          );
      } catch (error) {
        console.error("[blog-render]", error);
        return new Response("文章暂时无法加载，请稍后重试", {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        });
      }
    }
    /*
     * 首屏 HTML 的缓存策略。
     *
     * 页面里带的是公开内容，短时间内对所有访客是一样的 ——
     * 交给 CDN 缓存几十秒，能挡掉一整波重复请求；
     * 浏览器端仍然每次都问一次（max-age=0），内容更新立刻可见。
     */
    const cacheControl =
      htmlCacheSeconds > 0
        ? `public, max-age=0, s-maxage=${htmlCacheSeconds}, stale-while-revalidate=300`
        : "no-store";
    logAccess(request, url, 200, started, `html ${html.length}B`);
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": cacheControl,
      },
    });
  },
});

/** 收到停止信号就优雅退出：先停止接新请求，再收尾。 */
function shutdown(signal: string) {
  console.log(`[blog-serve] 收到 ${signal}，正在停止…`);
  server.stop(true);
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

console.log(
  `Blog rendering server: http://${host}:${port}  →  API ${apiOrigin}  日志 ${logMode}  HTML 缓存 ${htmlCacheSeconds}s`,
);
