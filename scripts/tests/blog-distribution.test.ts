import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_DISTRIBUTION,
  getDistribution,
  normalizeDistribution,
  saveDistribution,
} from "../../server/lib/blogDistribution";
import { qualityScore, recommendationScore } from "../../server/lib/blogRecommendations";
import {
  assertTopicParent,
  createBlogTopic,
  updateBlogTopic,
} from "../../server/lib/blog";
import { publicIndex } from "../../server/lib/publicBlog";
import { recommendationFeed } from "../../server/lib/blogRecommendations";
import { publishSnapshot } from "../../server/lib/publication";

const suite = process.env.RUN_PUBLISH_DB_TESTS === "1" ? describe : describe.skip;

suite("流量分发策略", () => {
  const db = new PrismaClient();
  let owner = 0;
  const noteIds: number[] = [];

  beforeAll(async () => {
    owner = (
      await db.accounts.create({
        data: { name: "distribution-" + crypto.randomUUID() },
      })
    ).id;
    for (let i = 0; i < 3; i++) {
      const n = await db.notes.create({
        data: {
          accountId: owner,
          content: "# 正文" + i + "\n公开内容",
          metadata: { title: "文章 " + i, summary: "摘要 " + i },
        },
      });
      await publishSnapshot(db, owner, { id: n.id });
      noteIds.push(n.id);
    }
  });

  afterAll(async () => {
    if (owner) {
      await db.notes.deleteMany({ where: { accountId: owner } });
      await db.blogTopic.deleteMany({ where: { accountId: owner } });
      await db.blogDistribution.deleteMany({ where: { accountId: owner } });
      await db.accounts.delete({ where: { id: owner } });
    }
    await db.$disconnect();
  });

  test("没配置过时用默认值，写入后读回同一份", async () => {
    expect(await getDistribution(db, owner)).toEqual(DEFAULT_DISTRIBUTION);
    const saved = await saveDistribution(db, owner, {
      mode: "ctr",
      qualityWeight: 1.5,
    });
    expect(saved.mode).toBe("ctr");
    expect(saved.qualityWeight).toBe(1.5);
    const read = await getDistribution(db, owner);
    expect(read.mode).toBe("ctr");
    expect(read.qualityWeight).toBe(1.5);
    // 其它字段没动
    expect(read.freshWeight).toBe(DEFAULT_DISTRIBUTION.freshWeight);
    await saveDistribution(db, owner, { mode: "blended", qualityWeight: 0 });
  });

  test("非法值被夹回合法区间，非法口径回落默认", () => {
    const n = normalizeDistribution({
      mode: "nonsense" as never,
      freshWeight: 999,
      hotWeight: -5,
      freshHalfLife: 0,
    });
    expect(n.mode).toBe(DEFAULT_DISTRIBUTION.mode);
    expect(n.freshWeight).toBe(20);
    expect(n.hotWeight).toBe(0);
    expect(n.freshHalfLife).toBe(0.5);
  });

  test("四种口径各自按对应因子排序", () => {
    const now = Date.UTC(2026, 9, 20);
    const post = {
      createdAt: new Date(now - 10 * 86400000),
      updatedAt: new Date(now),
      topics: [{ id: 1 }],
      title: "一篇标题足够长的文章",
      excerpt: "摘要",
      publishId: "p1",
      hasCover: true,
      hasSummary: true,
      contentLength: 1200,
    };
    const signals = {
      views: 100,
      impressions: 50,
      clicks: 10,
      topics: new Set([1]),
      terms: [],
      seen: new Set<string>(),
    };
    const score = (mode: string, patch = {}) =>
      recommendationScore(
        post,
        signals,
        now,
        normalizeDistribution({ mode: mode as never, ...patch }),
      );
    // 口径只影响排序因子，权重在单一因子口径下不参与
    expect(score("recency")).toBeGreaterThan(0);
    expect(score("clicks")).toBeGreaterThan(0);
    expect(score("ctr")).toBeGreaterThan(0);
    expect(score("blended")).toBeGreaterThan(0);
    // recency：更新的文章分更高
    const newer = { ...post, createdAt: new Date(now) };
    expect(
      recommendationScore(
        newer,
        signals,
        now,
        normalizeDistribution({ mode: "recency" }),
      ),
    ).toBeGreaterThan(score("recency"));
    // ctr：同样点击数下，曝光越少、点击率越高
    expect(
      recommendationScore(
        post,
        { ...signals, impressions: 20 },
        now,
        normalizeDistribution({ mode: "ctr" }),
      ),
    ).toBeGreaterThan(score("ctr"));
  });

  test("质量分：封面、标题长度、摘要、正文长度、专题归属各算一分", () => {
    expect(
      qualityScore({
        title: "一篇长度合适的标题",
        hasCover: true,
        hasSummary: true,
        contentLength: 1000,
        topicCount: 1,
      }),
    ).toBe(5);
    expect(qualityScore({ title: "短" })).toBe(0);
  });

  test("推荐置顶与 banner：置顶只进置顶池，banner 只进 banner 池，两处都不重复", async () => {
    const site = await publicIndex(db, { accountId: owner });
    // 没标置顶就没有置顶位 —— 不拿最新文章补齐
    expect(site.featured).toHaveLength(0);
    // banner 是另一个开关：没勾就没有 banner
    expect(site.banner).toHaveLength(0);
    // 标最早那篇为置顶：它按时间序排在最后，置顶后就该顶到推荐流最前
    const target = noteIds[0];
    await db.notePublication.update({
      where: { noteId: target },
      data: { isFeatured: true, featuredOrder: 0 },
    });
    const after = await publicIndex(db, { accountId: owner });
    expect(after.featured[0].id).toBe(target);
    // 「最近更新」是纯时间序，不受置顶影响
    expect(after.recent[0].id).not.toBe(target);
    // 推荐流：置顶文章排在最前，且不在普通结果里重复出现
    const feed = await recommendationFeed(db, { accountId: owner });
    expect(feed.posts[0].id).toBe(target);
    expect(feed.posts.filter((p) => p.id === target)).toHaveLength(1);
    // banner：另一个开关，勾了才进 banner 池；banner 里的文章不在列表里再出现
    const bannerTarget = noteIds[1];
    await db.notePublication.update({
      where: { noteId: bannerTarget },
      data: { isBanner: true, featuredOrder: 0 },
    });
    const withBanner = await publicIndex(db, { accountId: owner });
    expect(withBanner.banner.map((p) => p.id)).toEqual([bannerTarget]);
    // 置顶池与 banner 池互不替代
    expect(withBanner.featured.map((p) => p.id)).toEqual([target]);
    const feed2 = await recommendationFeed(db, { accountId: owner });
    expect(feed2.posts.map((p) => p.id)).not.toContain(bannerTarget);
    expect(feed2.posts.filter((p) => p.id === target)).toHaveLength(1);
  });
});

suite("多级专题", () => {
  const db = new PrismaClient();
  let owner = 0;

  beforeAll(async () => {
    owner = (
      await db.accounts.create({
        data: { name: "topic-tree-" + crypto.randomUUID() },
      })
    ).id;
  });

  afterAll(async () => {
    if (owner) {
      await db.blogTopic.deleteMany({ where: { accountId: owner } });
      await db.accounts.delete({ where: { id: owner } });
    }
    await db.$disconnect();
  });

  test("可以建子专题并挂到父专题下", async () => {
    const parent = await createBlogTopic(db, owner, {
      name: "父专题",
      desc: "",
      color: "#7055f8",
      isPublished: true,
    });
    const child = await createBlogTopic(db, owner, {
      name: "子专题",
      desc: "",
      color: "#7055f8",
      isPublished: true,
      parentId: parent.id,
    });
    expect(child.parentId).toBe(parent.id);
    const kids = await db.blogTopic.findMany({
      where: { accountId: owner, parentId: parent.id },
    });
    expect(kids).toHaveLength(1);
  });

  test("发布设置字段可写可读", async () => {
    const topic = await createBlogTopic(db, owner, {
      name: "带设置的专题",
      desc: "简介",
      color: "#7055f8",
      isPublished: false,
    });
    const updated = await updateBlogTopic(db, owner, topic.id, {
      isPublished: true,
      showInNav: false,
      isFeatured: true,
      coverTitle: "短标题",
    });
    expect(updated.isPublished).toBe(true);
    expect(updated.showInNav).toBe(false);
    expect(updated.isFeatured).toBe(true);
    expect(updated.coverTitle).toBe("短标题");
  });

  test("不能把自己或自己的下级设成上级专题（防环）", async () => {
    const parent = await createBlogTopic(db, owner, {
      name: "环测试父",
      desc: "",
      color: "#7055f8",
      isPublished: true,
    });
    const child = await createBlogTopic(db, owner, {
      name: "环测试子",
      desc: "",
      color: "#7055f8",
      isPublished: true,
      parentId: parent.id,
    });
    await expect(
      assertTopicParent(db, owner, parent.id, child.id),
    ).rejects.toThrow();
    await expect(
      assertTopicParent(db, owner, parent.id, parent.id),
    ).rejects.toThrow();
    // 把「子」挂到自己的孙下面：孙→子→孙，成环
    const grand = await createBlogTopic(db, owner, {
      name: "环测试孙",
      desc: "",
      color: "#7055f8",
      isPublished: true,
      parentId: child.id,
    });
    await expect(
      assertTopicParent(db, owner, child.id, grand.id),
    ).rejects.toThrow();
    // 把「孙」挂回「父」是合法的：父下并列挂子与孙，没有环
    await expect(
      assertTopicParent(db, owner, grand.id, parent.id),
    ).resolves.toBeUndefined();
  });
});
