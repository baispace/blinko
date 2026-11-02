import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { publicIndex, blogRSS } from "../../server/lib/publicBlog";
import { resolveBlogSEO } from "../../server/lib/publicBlogSEO";
import { upsertBlogProfile, getBlogProfile } from "../../server/lib/blog";
import {
  readBlogSiteSettings,
  saveBlogSiteSettings,
  migrateLegacyBlogTagline,
} from "../../server/lib/blogSiteSettings";
import { publishSnapshot } from "../../server/lib/publication";

/**
 * 站点标识只有一套出处：
 *
 * - 标语：只来自站点设置里的「站点标语」。作者资料里那份不再对外生效，
 *   否则页脚、SEO、RSS 显示的会和友链页不是同一句。
 * - 署名：作者资料公开时用作者名；没公开时回退到站点品牌名，
 *   页面不空着，但 published=false 表示「这不是作者本人」。
 */
describe("公开博客的站点标识只有一套出处", () => {
  const db = new PrismaClient();
  let owner = 0;
  let publishId = "";

  const setSettings = async (patch: Record<string, unknown>) => {
    const current = await readBlogSiteSettings(db, owner);
    const merged = { ...current.data, ...patch };
    const saved = await saveBlogSiteSettings(db, owner, merged, current.revision);
    return saved.data;
  };

  beforeAll(async () => {
    owner = (
      await db.accounts.create({
        data: { name: "site-identity-" + crypto.randomUUID() },
      })
    ).id;
    const note = await db.notes.create({
      data: {
        accountId: owner,
        content: "# 正文\n公开内容",
        metadata: { title: "公开标题" },
      },
    });
    const p = await publishSnapshot(db, owner, { id: note.id });
    publishId = p.publishId!;
  });

  afterAll(async () => {
    if (owner) {
      await db.notes.deleteMany({ where: { accountId: owner } });
      await db.blogProfile.deleteMany({ where: { accountId: owner } });
      await db.config.deleteMany({ where: { key: "blogSiteSettings", userId: owner } });
      await db.accounts.delete({ where: { id: owner } });
    }
    await db.$disconnect();
  });

  test("标语只有站点设置一个出处：作者资料里那份不再对外生效", async () => {
    await setSettings({ siteName: "拾成", tagline: "站点标语·唯一出处" });
    await upsertBlogProfile(db, owner, {
      displayName: "白贺",
      tagline: "作者资料里的旧标语",
      bio: "",
      avatarUrl: "",
      homepage: "",
      links: [],
      isPublished: true,
    });

    const site = await publicIndex(db, { accountId: owner });
    // 公开输出里的标语是站点设置那一句。
    expect(site.profile?.tagline).toBe("站点标语·唯一出处");
    expect(JSON.stringify(site)).not.toContain("作者资料里的旧标语");

    // SEO 与 RSS 同样只认站点设置那一句。
    const seo = await resolveBlogSEO(db, "/blog", "https://example.com", owner);
    expect(seo.description).toBe("站点标语·唯一出处");
    expect(JSON.stringify(seo)).not.toContain("作者资料里的旧标语");

    const rss = blogRSS(site, "https://example.com");
    expect(rss).toContain("站点标语·唯一出处");
    expect(rss).not.toContain("作者资料里的旧标语");
  });

  test("作者资料没公开时署名回退到站点品牌名，并标记为未公开", async () => {
    await setSettings({ siteName: "拾成", tagline: "站点标语·唯一出处" });
    await db.blogProfile.updateMany({
      where: { accountId: owner },
      data: { isPublished: false },
    });

    const site = await publicIndex(db, { accountId: owner });
    expect(site.profile?.published).toBe(false);
    // 署名回退到站点品牌名，页面不空着。
    expect(site.profile?.displayName).toBe("拾成");
    // 标语照旧来自站点设置。
    expect(site.profile?.tagline).toBe("站点标语·唯一出处");
  });

  test("作者资料公开后署名用作者名，未公开资料的内容不外泄", async () => {
    await setSettings({ siteName: "拾成", tagline: "站点标语·唯一出处" });
    await upsertBlogProfile(db, owner, {
      displayName: "白贺",
      bio: "作者私人简介",
      avatarUrl: "",
      homepage: "",
      links: [],
      isPublished: true,
    });

    const site = await publicIndex(db, { accountId: owner });
    expect(site.profile?.published).toBe(true);
    expect(site.profile?.displayName).toBe("白贺");
    expect(site.profile?.tagline).toBe("站点标语·唯一出处");
  });

  test("作者资料没公开时 SEO 不写 author 标签，关于页仍然不可用", async () => {
    await setSettings({ siteName: "拾成", tagline: "站点标语·唯一出处" });
    await db.blogProfile.updateMany({
      where: { accountId: owner },
      data: { isPublished: false },
    });

    const seo = await resolveBlogSEO(
      db,
      "/blog/" + publishId,
      "https://example.com",
      owner,
    );
    // 署名回退的是站点名，不能当成「作者公开了个人资料」。
    expect(seo.author).toBeUndefined();

    const about = await resolveBlogSEO(db, "/blog/about", "https://example.com", owner);
    expect(about.status).toBe(404);
  });

  test("保存作者资料时不带标语不会清空库里已有的旧标语", async () => {
    await upsertBlogProfile(db, owner, {
      displayName: "白贺",
      tagline: "保留下来的一句",
      bio: "",
      avatarUrl: "",
      homepage: "",
      links: [],
      isPublished: true,
    });
    // 新界面不再提交 tagline —— 这里模拟一次不传标语的保存。
    await upsertBlogProfile(db, owner, {
      displayName: "白贺",
      bio: "改了简介",
      avatarUrl: "",
      homepage: "",
      links: [],
      isPublished: true,
    });
    expect((await getBlogProfile(db, owner)).tagline).toBe("保留下来的一句");
  });

  test("启动时的迁移把旧标语搬进站点设置，且不会覆盖用户自己写的那句", async () => {
    // 场景一：站点设置的标语还是默认值 —— 搬。
    await setSettings({ siteName: "拾成", tagline: "" });
    await upsertBlogProfile(db, owner, {
      displayName: "白贺",
      tagline: "该被搬走的一句",
      bio: "",
      avatarUrl: "",
      homepage: "",
      links: [],
      isPublished: true,
    });
    expect(await migrateLegacyBlogTagline(db)).toBe(1);
    expect((await readBlogSiteSettings(db, owner)).data.tagline).toBe(
      "该被搬走的一句",
    );
    // 搬完就清空作者资料里那份，不再有两份。
    expect((await getBlogProfile(db, owner)).tagline).toBe("");
    // 幂等：再跑一次没有可搬的。
    expect(await migrateLegacyBlogTagline(db)).toBe(0);

    // 场景二：站点设置里用户自己写过标语 —— 不动。
    await setSettings({ siteName: "拾成", tagline: "站点自己那句" });
    await upsertBlogProfile(db, owner, {
      displayName: "白贺",
      tagline: "另一句旧的",
      bio: "",
      avatarUrl: "",
      homepage: "",
      links: [],
      isPublished: true,
    });
    expect(await migrateLegacyBlogTagline(db)).toBe(0);
    expect((await readBlogSiteSettings(db, owner)).data.tagline).toBe(
      "站点自己那句",
    );
    expect((await getBlogProfile(db, owner)).tagline).toBe("另一句旧的");
  });
});
