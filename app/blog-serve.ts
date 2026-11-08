import path from "node:path";
import superjson from "superjson";

const root = path.resolve(import.meta.dir, "../dist/blog");
const apiOrigin = process.env.BLOG_API_ORIGIN || "http://127.0.0.1:1111";
const port = Number(process.env.BLOG_PORT || 4175);
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
Bun.serve({
  port,
  hostname: "127.0.0.1",
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const upstream = new URL(url.pathname + url.search, apiOrigin);
      return fetch(new Request(upstream, request));
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
      return new Response(request.method === "HEAD" ? null : file, {
        headers: {
          "Content-Type": file.type,
          "Cache-Control": immutable
            ? "public, max-age=31536000, immutable"
            : "public, max-age=3600",
        },
      });
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
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  },
});
console.log(`Blog rendering server: http://127.0.0.1:${port}`);
