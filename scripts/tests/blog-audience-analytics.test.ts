import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  analyticsAudience,
  analyticsTopics,
} from "../../server/lib/blogAudienceAnalytics";
import { resolveAnalyticsRange } from "../../server/lib/blogAnalytics";
const suite =
  process.env.RUN_PUBLISH_DB_TESTS === "1" ? describe : describe.skip;
suite("用户与专题分析", () => {
  const db = new PrismaClient();
  let owner: number, other: number, a: number, b: number, topic: number;
  const range = resolveAnalyticsRange({ from: "2026-03-01", to: "2026-03-07" });
  beforeAll(async () => {
    const name = "analytics-tabs-" + crypto.randomUUID();
    owner = (await db.accounts.create({ data: { name } })).id;
    other = (await db.accounts.create({ data: { name: name + "-other" } })).id;
    a = (
      await db.notes.create({
        data: {
          accountId: owner,
          content: "A",
          publishId: crypto.randomUUID(),
        },
      })
    ).id;
    b = (
      await db.notes.create({
        data: {
          accountId: owner,
          content: "B",
          publishId: crypto.randomUUID(),
        },
      })
    ).id;
    topic = (
      await db.blogTopic.create({
        data: { accountId: owner, name: "专题甲", slug: name },
      })
    ).id;
    await db.blogTopicNote.createMany({
      data: [
        { topicId: topic, noteId: a },
        { topicId: topic, noteId: b },
      ],
    });
    await db.blogPageView.createMany({
      data: [
        {
          accountId: owner,
          noteId: a,
          deviceId: "a".repeat(32),
          createdAt: new Date("2026-02-28T02:00:00Z"),
        },
        {
          accountId: owner,
          noteId: a,
          deviceId: "a".repeat(32),
          createdAt: new Date("2026-03-02T02:00:00Z"),
        },
        {
          accountId: owner,
          noteId: b,
          deviceId: "a".repeat(32),
          createdAt: new Date("2026-03-03T02:00:00Z"),
        },
        {
          accountId: owner,
          noteId: b,
          deviceId: "b".repeat(32),
          createdAt: new Date("2026-03-04T02:00:00Z"),
        },
        {
          accountId: other,
          noteId: b,
          deviceId: "c".repeat(32),
          createdAt: new Date("2026-03-04T02:00:00Z"),
        },
      ],
    });
    const publishId = (await db.notes.findUniqueOrThrow({ where: { id: a } }))
      .publishId!;
    await db.blogRecommendationEvent.createMany({
      data: [
        {
          accountId: owner,
          deviceId: "a".repeat(32),
          publishId,
          kind: "impression",
          term: "",
          bucket: new Date("2026-03-02T00:00:00Z"),
        },
        {
          accountId: owner,
          deviceId: "a".repeat(32),
          publishId,
          kind: "click",
          term: "",
          bucket: new Date("2026-03-02T00:00:00Z"),
        },
      ],
    });
  });
  afterAll(async () => {
    if (owner) {
      await db.blogRecommendationEvent.deleteMany({
        where: { accountId: owner },
      });
      await db.blogTopic.deleteMany({ where: { accountId: owner } });
      await db.notes.deleteMany({ where: { accountId: owner } });
      await db.accounts.delete({ where: { id: owner } });
    }
    if (other) await db.accounts.delete({ where: { id: other } });
    await db.$disconnect();
  });
  test("新访客和回访跨文章去重，边界参考全部历史而非区间内第一次", async () => {
    const d = await analyticsAudience(db, owner, range);
    expect(d.visitors).toBe(2);
    expect(d.newVisitors).toBe(1);
    expect(d.returningVisitors).toBe(1);
    expect(d.multiDayVisitors).toBe(1);
    expect(d.viewsPerVisitor).toBe(1.5);
    expect(d.articlesPerVisitor).toBe(1.5);
    expect(d.rows).toHaveLength(2);
    expect(d.rows[0]!.visitor).not.toContain("b".repeat(32));
    expect(d.rows[0]!.visitor.length).toBe(12);
  });
  test("专题 UV 不累加文章 UV，曝光与点击不被成员连接放大", async () => {
    const { rows } = await analyticsTopics(db, owner, range);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: topic,
      articles: 2,
      views: 3,
      visitors: 2,
      impressions: 1,
      clicks: 1,
      ctr: 1,
    });
  });
  test("无数据时保持零值且人均分母为零显示空", async () => {
    const d = await analyticsAudience(
      db,
      owner,
      resolveAnalyticsRange({ from: "2025-01-01", to: "2025-01-02" }),
    );
    expect(d.visitors).toBe(0);
    expect(d.viewsPerVisitor).toBeNull();
    expect(d.rows).toEqual([]);
  });
});
