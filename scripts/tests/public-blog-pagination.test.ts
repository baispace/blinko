import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  BLOG_PAGE_SIZE,
  normalizePage,
  publicIndex,
  publicPosts,
  publicTopic,
} from "../../server/lib/publicBlog";
import { publishSnapshot } from "../../server/lib/publication";
import { saveBlogTopic, upsertBlogProfile } from "../../server/lib/blog";
import { recommendationFeed } from "../../server/lib/blogRecommendations";
import { saveDistribution } from "../../server/lib/blogDistribution";

const suite = process.env.RUN_PUBLISH_DB_TESTS === "1" ? describe : describe.skip;
suite("公开列表的分页", () => {
  const db = new PrismaClient();
  let owner = 0;
  const notes: { id: number; publishId: string }[] = [];
  const TOTAL = 16;

  beforeAll(async () => {
    owner = (
      await db.accounts.create({
        data: { name: "public-pagination-" + crypto.randomUUID() },
      })
    ).id;
    for (let i = 0; i < TOTAL; i++) {
      const n = await db.notes.create({
        data: {
          accountId: owner,
          content: "# 正文" + i + "\n已公开内容",
          metadata: { title: "文章 " + i },
        },
      });
      const p = await publishSnapshot(db, owner, { id: n.id });
      notes.push({ id: n.id, publishId: p.publishId! });
    }
    await saveBlogTopic(db, owner, {
      name: "分页专题",
      slug: "paging-topic",
      desc: "专题简介",
      color: "#7055f8",
      isPublished: true,
      noteIds: notes.slice(0, 6).map((n) => n.id),
    });
    await upsertBlogProfile(db, owner, {
      displayName: "分页作者",
      tagline: "介绍",
      bio: "简介",
      avatarUrl: "",
      homepage: "",
      links: [],
      isPublished: true,
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

  test("页码规整：非法值回到第 1 页，上限兜底", () => {
    expect(normalizePage(undefined)).toBe(1);
    expect(normalizePage(0)).toBe(1);
    expect(normalizePage(-3)).toBe(1);
    expect(normalizePage(2.7)).toBe(2);
    expect(normalizePage(NaN)).toBe(1);
    expect(normalizePage(Infinity)).toBe(1);
    expect(normalizePage(999999)).toBe(10000);
  });

  test("首页分页：页长、总页数、上一页下一页都对得上", async () => {
    const first = await publicIndex(db, { accountId: owner });
    expect(first.pageSize).toBe(BLOG_PAGE_SIZE);
    expect(first.total).toBe(TOTAL);
    expect(first.pageCount).toBe(Math.ceil(TOTAL / BLOG_PAGE_SIZE));
    expect(first.page).toBe(1);
    expect(first.hasPrev).toBe(false);
    expect(first.hasNext).toBe(true);
    expect(first.posts).toHaveLength(BLOG_PAGE_SIZE);

    const second = await publicIndex(db, { accountId: owner, page: 2 });
    expect(second.page).toBe(2);
    expect(second.hasPrev).toBe(true);
    expect(second.posts.length).toBe(TOTAL - BLOG_PAGE_SIZE);
  });

  test("越界页码收敛回最后一页，不会给空列表", async () => {
    const last = await publicIndex(db, {
      accountId: owner,
      page: 9999,
    });
    expect(last.page).toBe(last.pageCount);
    expect(last.posts.length).toBeGreaterThan(0);
    expect(last.hasNext).toBe(false);
  });

  test("翻完所有页正好覆盖全部文章，且没有重复", async () => {
    const first = await publicIndex(db, { accountId: owner });
    const seen = new Set<number>();
    for (let p = 1; p <= first.pageCount; p++) {
      const page = await publicIndex(db, { accountId: owner, page: p });
      for (const post of page.posts) {
        expect(seen.has(post.id)).toBe(false);
        seen.add(post.id);
      }
    }
    expect(seen.size).toBe(TOTAL);
  });

  test("banner 跟当前页无关：没勾就没有 banner，勾了翻页还是那几篇", async () => {
    // banner 是显式开关：不勾就没有，不拿最新文章补齐
    const empty = await publicIndex(db, { accountId: owner });
    expect(empty.banner).toHaveLength(0);
    await db.notePublication.update({
      where: { noteId: notes[0].id },
      data: { isBanner: true, featuredOrder: 0 },
    });
    const first = await publicIndex(db, { accountId: owner });
    const later = await publicIndex(db, { accountId: owner, page: 2 });
    expect(first.banner.map((p) => p.id)).toEqual([notes[0].id]);
    expect(later.banner.map((p) => p.id)).toEqual([notes[0].id]);
    // banner 里的文章不在推荐流里再出现一次
    const feed = await recommendationFeed(db, { accountId: owner });
    expect(feed.posts.map((p) => p.id)).not.toContain(notes[0].id);
    // 复位，别影响后面的分页用例
    await db.notePublication.update({
      where: { noteId: notes[0].id },
      data: { isBanner: false },
    });
  });

  test("offset 分页和 publicIndex 的分页结果一致", async () => {
    const viaIndex = await publicIndex(db, { accountId: owner, page: 2 });
    const viaOffset = await publicPosts(db, {
      accountId: owner,
      limit: BLOG_PAGE_SIZE,
      offset: BLOG_PAGE_SIZE,
    });
    expect(viaOffset.posts.map((p) => p.id)).toEqual(
      viaIndex.posts.map((p) => p.id),
    );
  });

  test("专题分页：按编排顺序翻页，页数与总页数一致", async () => {
    const first = await publicTopic(db, {
      accountId: owner,
      slug: "paging-topic",
    });
    expect(first?.total).toBe(6);
    expect(first?.page).toBe(1);
    expect(first?.pageCount).toBe(1);
    expect(first?.posts.map((p) => p.id)).toEqual(notes.slice(0, 6).map((n) => n.id));

    // 专题页长跟首页共用同一个常量
    const small = await publicTopic(db, {
      accountId: owner,
      slug: "paging-topic",
      pageSize: 2,
    });
    expect(small?.pageCount).toBe(3);
    expect(small?.posts).toHaveLength(2);
    const last = await publicTopic(db, {
      accountId: owner,
      slug: "paging-topic",
      pageSize: 2,
      page: 3,
    });
    expect(last?.page).toBe(3);
    expect(last?.hasNext).toBe(false);
  });

  test("推荐流和首页共用同一个页长常量", async () => {
    // 页长只能有一处定义。推荐流以前写死 8，首页是 8，专题页是 8 ——
    // 任何一处单独改，都会让分页控件算出的页数和实际返回条数错位。
    const first = await recommendationFeed(db, { accountId: owner });
    expect(first.posts.length).toBe(BLOG_PAGE_SIZE);
    expect(first.pageCount).toBe(Math.ceil(TOTAL / BLOG_PAGE_SIZE));
    const second = await recommendationFeed(db, { accountId: owner, page: 2 });
    expect(second.page).toBe(2);
    expect(second.posts.length).toBe(TOTAL - BLOG_PAGE_SIZE);
  });

  test("推荐置顶：置顶块排在最前，第 2 页不再重复它", async () => {
    await db.notePublication.update({
      where: { noteId: notes[0].id },
      data: { isFeatured: true, featuredOrder: 0 },
    });
    const first = await recommendationFeed(db, { accountId: owner });
    const second = await recommendationFeed(db, { accountId: owner, page: 2 });
    // 置顶排在普通推荐结果之前
    expect(first.posts[0].id).toBe(notes[0].id);
    // 同一篇不在置顶区与普通结果里重复出现
    expect(first.posts.filter((p) => p.id === notes[0].id)).toHaveLength(1);
    expect(second.posts.map((p) => p.id)).not.toContain(notes[0].id);
    // 分页基数是「置顶 + 普通候选」的总数，页数与其它 feed 对得上
    expect(first.pageCount).toBe(Math.ceil(TOTAL / BLOG_PAGE_SIZE));
    expect(second.posts.length).toBe(TOTAL - BLOG_PAGE_SIZE);
    // 复位
    await db.notePublication.update({
      where: { noteId: notes[0].id },
      data: { isFeatured: false },
    });
  });

  test("关掉「精选优先」：置顶文章仍在列表里，只是不排最前", async () => {
    await db.notePublication.update({
      where: { noteId: notes[0].id },
      data: { isFeatured: true, featuredOrder: 0 },
    });
    await saveDistribution(db, owner, { featuredFirst: false });
    const feed = await recommendationFeed(db, { accountId: owner });
    // 置顶没被排到最前
    expect(feed.posts[0].id).not.toBe(notes[0].id);
    // 但也没有凭空消失：翻完两页仍然只有它出现一次
    const second = await recommendationFeed(db, { accountId: owner, page: 2 });
    const all = [...feed.posts, ...second.posts];
    expect(all.filter((p) => p.id === notes[0].id)).toHaveLength(1);
    expect(all).toHaveLength(TOTAL);
    // 复位
    await saveDistribution(db, owner, { featuredFirst: true });
    await db.notePublication.update({
      where: { noteId: notes[0].id },
      data: { isFeatured: false },
    });
  });

  test("公开卡片带出置顶标记：公开站据此挂「置顶」角标", async () => {
    await db.notePublication.update({
      where: { noteId: notes[0].id },
      data: { isFeatured: true, featuredOrder: 0 },
    });
    const feed = await recommendationFeed(db, { accountId: owner });
    expect(feed.posts[0].isFeatured).toBe(true);
    // 没置顶的文章不带标记 —— 角标不能满屏都是
    const normal = feed.posts.find((p) => p.id !== notes[0].id);
    expect(normal?.isFeatured).toBe(false);
    // 复位
    await db.notePublication.update({
      where: { noteId: notes[0].id },
      data: { isFeatured: false },
    });
  });
});
