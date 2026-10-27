import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  resolveBlogSEO,
  injectBlogSEO,
  renderBlogHead,
  publicOrigin,
  blogRobots,
  sitemapIndex,
  sitemapPage,
  publicRSS,
} from "../../server/lib/publicBlogSEO";
import { publishSnapshot } from "../../server/lib/publication";
import { saveBlogTopic, upsertBlogProfile } from "../../server/lib/blog";
import { publicPosts } from "../../server/lib/publicBlog";

describe("SEO output safety", () => {
  test("origin is explicit, HTTP-only and without credentials", () => {
    expect(
      publicOrigin("http://localhost:1111", "https://ink.example/blog"),
    ).toBe("https://ink.example");
    expect(() =>
      publicOrigin("https://example.com", "javascript:alert(1)"),
    ).toThrow();
    expect(() =>
      publicOrigin("https://example.com", "https://user:secret@example.com"),
    ).toThrow();
  });
  test("head, JSON-LD and initial body escape hostile snapshot strings without replacement interpolation", () => {
    const seo: any = {
      status: 200,
      title: 'A " <script>alert(1)</script> $&',
      description: '<img onerror="x">',
      canonical: "https://example.com/blog/abc",
      image: "https://example.com/cover.png",
      type: "article",
      robots: "index, follow",
      siteName: "Ink",
      structured: {
        "@type": "BlogPosting",
        headline: "</script><script>alert(1)</script>",
      },
      text: "$& $1 <iframe src=x>",
      links: [],
    };
    const html = injectBlogSEO(
      '<html lang="en"><head><title>Ink</title><meta name="description" content="old"></head><body><div id="root"></div></body></html>',
      seo,
    );
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<iframe");
    expect(html).toContain("\\u003c/script>");
    expect(html).toContain("$&amp; $1 &lt;iframe");
    expect(html).toContain('rel="canonical"');
    expect(renderBlogHead(seo, "https://example.com")).toContain(
      "summary_large_image",
    );
  });
  test("the public blog head keeps its own brand and drops the product level brand", () => {
    const seo: any = {
      status: 200,
      title: "思考与实践",
      description: "简介",
      canonical: "https://example.com/blog",
      image: "https://example.com/avatar.png",
      imageAlt: "作者",
      type: "website",
      robots: "index, follow",
      siteName: "Brian Bai",
      iconUrl: "https://example.com/avatar.png",
      structured: {},
      text: "正文",
      links: [],
      runtime: {
        basePath: "/blog",
        apiOrigin: "",
        publicOrigin: "https://example.com",
        deploymentMode: "proxy",
      },
    };
    const html = injectBlogSEO(
      '<html lang="zh-CN"><head><title>Jomio</title>' +
        '<link rel="icon" href="/favicon.svg?v=1" />' +
        '<link rel="alternate icon" href="/favicon.ico?v=1" />' +
        '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=1" />' +
        '<link rel="manifest" href="/manifest.json?v=1" />' +
        '<meta name="application-name" content="Jomio" />' +
        '<meta name="apple-mobile-web-app-title" content="Jomio" />' +
        '<meta name="msapplication-config" content="/icons/browserconfig.xml" />' +
        '<meta name="msapplication-TileColor" content="#5F40FD" />' +
        '<div id="app-boot">占位</div>' +
        '</head><body><div id="root"></div></body></html>',
      seo,
    );
    // 产品级品牌不得出现在公开博客的页面上
    expect(html).not.toContain("/favicon.svg");
    expect(html).not.toContain("/favicon.ico");
    expect(html).not.toContain("/icons/apple-touch-icon.png");
    expect(html).not.toContain("/manifest.json");
    expect(html).not.toContain('content="Jomio"');
    expect(html).not.toContain("msapplication");
    expect(html).not.toContain('id="app-boot"');
    // 公开站用自己的站点名与图标
    expect(html).toContain('rel="icon" href="https://example.com/avatar.png"');
    expect(html).toContain('name="application-name" content="Brian Bai"');
    expect(html).toContain('name="apple-mobile-web-app-title" content="Brian Bai"');
  });
  test("robots exposes public routes and sitemap without allowing private blog-management prefix", () => {
    const rules = blogRobots("https://example.com");
    expect(rules).toContain("Disallow: /");
    expect(rules).toContain("Allow: /blog$");
    expect(rules).toContain("Allow: /blog/");
    expect(rules).not.toContain("Allow: /blog\n");
    expect(rules).toContain("Sitemap: https://example.com/sitemap.xml");
  });
});
const suite =
  process.env.RUN_PUBLISH_DB_TESTS === "1" ? describe : describe.skip;
suite("public SEO snapshot lifecycle", () => {
  const db = new PrismaClient();
  let owner = 0;
  let note: { id: number; publishId: string };
  let privateId = 0;
  beforeAll(async () => {
    owner = (
      await db.accounts.create({
        data: { name: "seo-test-" + crypto.randomUUID() },
      })
    ).id;
    const n = await db.notes.create({
      data: {
        accountId: owner,
        content: "# 公开正文\n可索引文字",
        metadata: { title: "公开标题 < &" },
      },
    });
    const p = await publishSnapshot(db, owner, { id: n.id });
    note = { id: n.id, publishId: p.publishId! };
    privateId = (
      await db.notes.create({
        data: {
          accountId: owner,
          content: "PRIVATE_NEVER_PUBLISHED",
          metadata: { title: "隐私标题" },
        },
      })
    ).id;
    await saveBlogTopic(db, owner, {
      name: "公开专题",
      slug: "seo-topic",
      desc: "专题摘要",
      color: "#7055f8",
      isPublished: true,
      noteIds: [n.id],
    });
    await saveBlogTopic(db, owner, {
      name: "隐藏专题",
      slug: "hidden-topic",
      desc: "SECRET_TOPIC",
      color: "#7055f8",
      isPublished: false,
      noteIds: [n.id],
    });
    await upsertBlogProfile(db, owner, {
      displayName: "公开作者",
      tagline: "公开简介",
      bio: "公开作者资料",
      avatarUrl: "",
      homepage: "",
      links: [],
      isPublished: false,
    });
  });
  afterAll(async () => {
    if (owner) {
      await db.notes.deleteMany({ where: { accountId: owner } });
      await db.blogTopic.deleteMany({ where: { accountId: owner } });
      await db.blogProfile.deleteMany({ where: { accountId: owner } });
      await db.accounts.delete({ where: { id: owner } });
    }
    await db.$disconnect();
  });
  test("all five page types have canonical metadata; profile is opt-in", async () => {
    for (const path of [
      "/blog",
      "/blog/topics",
      "/blog/t/seo-topic",
      "/blog/" + note.publishId,
    ]) {
      const seo = await resolveBlogSEO(db, path, "https://example.com", owner);
      expect(seo.status).toBe(200);
      expect(seo.canonical).toBe("https://example.com" + path);
      expect(seo.robots).toContain("index, follow");
      expect(JSON.stringify(seo)).not.toContain("PRIVATE_NEVER_PUBLISHED");
      expect(JSON.stringify(seo)).not.toContain("SECRET_TOPIC");
    }
    expect(
      (await resolveBlogSEO(db, "/blog/about", "https://example.com", owner))
        .status,
    ).toBe(404);
    await db.blogProfile.update({
      where: { accountId: owner },
      data: { isPublished: true },
    });
    expect(
      (await resolveBlogSEO(db, "/blog/about", "https://example.com", owner))
        .structured["@type"],
    ).toBe("ProfilePage");
  });
  test("private edits do not change SEO, search, sitemap dates or RSS until update publication", async () => {
    const before = await resolveBlogSEO(
      db,
      "/blog/" + note.publishId,
      "https://example.com",
      owner,
    );
    await db.notes.update({
      where: { id: note.id },
      data: {
        content: "SECRET_NEW_DRAFT",
        metadata: { title: "SECRET_NEW_TITLE" },
      },
    });
    const after = await resolveBlogSEO(
      db,
      "/blog/" + note.publishId,
      "https://example.com",
      owner,
    );
    expect(after.title).toBe(before.title);
    expect(after.modified).toBe(before.modified);
    expect(after.type).toBe("article");
    expect(after.structured["@type"]).toBe("BlogPosting");
    expect(after.image).toBe("https://example.com/icons/Square310x310Logo.png");
    expect(
      (await publicPosts(db, { accountId: owner, search: "SECRET_NEW_DRAFT" }))
        .total,
    ).toBe(0);
    expect(await publicRSS(db, "https://example.com", owner)).not.toContain(
      "SECRET_NEW",
    );
    const sitemap = await sitemapPage(db, "https://example.com", 1, owner);
    expect(sitemap).toContain(note.publishId);
    expect(sitemap).toContain(before.modified!);
    expect(sitemap).not.toContain(String(privateId) + "</loc>");
    expect(await sitemapIndex(db, "https://example.com", owner)).toContain(
      "sitemap-articles-1.xml",
    );
    expect(await sitemapPage(db, "https://example.com", 2, owner)).toBeNull();
    expect(
      await sitemapPage(db, "https://example.com", "pages", owner),
    ).not.toContain("hidden-topic");
  });
  test("withdrawal disappears from search, sitemap and RSS; direct SEO returns404 noindex without stale text", async () => {
    await publishSnapshot(db, owner, { id: note.id, isCancel: true });
    const seo = await resolveBlogSEO(
      db,
      "/blog/" + note.publishId,
      "https://example.com",
      owner,
    );
    expect(seo.status).toBe(404);
    expect(seo.robots).toBe("noindex, nofollow");
    expect(JSON.stringify(seo)).not.toContain("公开标题");
    expect(
      (await publicPosts(db, { accountId: owner, search: "公开" })).total,
    ).toBe(0);
    expect(await sitemapPage(db, "https://example.com", 1, owner)).toBeNull();
    expect(await sitemapIndex(db, "https://example.com", owner)).not.toContain(
      "sitemap-articles",
    );
    expect(await publicRSS(db, "https://example.com", owner)).not.toContain(
      note.publishId,
    );
    expect(
      await sitemapPage(db, "https://example.com", "pages", owner),
    ).not.toContain("seo-topic");
  });
});
