import { test, expect } from "bun:test";
import { recommendationScore } from "../../server/lib/blogRecommendations";
const now = Date.UTC(2026, 9, 20);
const post = {
  createdAt: new Date(now),
  updatedAt: new Date(now),
  topics: [{ id: 1 }],
  title: "搜索系统实践",
  excerpt: "召回与排序",
  publishId: "a",
};
const base = {
  views: 0,
  clicks: 0,
  impressions: 0,
  topics: new Set<number>(),
  terms: [] as string[],
  seen: new Set<string>(),
};
test("fresh and personalized candidates outrank stale unrelated candidates", () => {
  expect(recommendationScore(post, base, now)).toBeGreaterThan(
    recommendationScore(
      { ...post, createdAt: new Date(now - 365 * 86400000) },
      base,
      now,
    ),
  );
  expect(
    recommendationScore(post, { ...base, terms: ["搜索"] }, now),
  ).toBeGreaterThan(recommendationScore(post, base, now));
  expect(
    recommendationScore(post, { ...base, topics: new Set([1]) }, now),
  ).toBeGreaterThan(recommendationScore(post, base, now));
});
test("seen penalty and smoothed click rates avoid one-click domination", () => {
  expect(
    recommendationScore(post, { ...base, seen: new Set(["a"]) }, now),
  ).toBeLessThan(recommendationScore(post, base, now));
  expect(
    recommendationScore(post, { ...base, clicks: 1, impressions: 1 }, now) -
      recommendationScore(post, base, now),
  ).toBeLessThan(0.2);
});

import { PrismaClient } from "@prisma/client";
import { publishSnapshot } from "../../server/lib/publication";
import { recommendationFeed } from "../../server/lib/blogRecommendations";
test.skipIf(process.env.RUN_PUBLISH_DB_TESTS !== "1")(
  "recommendations only hydrate published snapshots, including after withdrawal",
  async () => {
    const db = new PrismaClient();
    let accountId = 0;
    try {
      accountId = (
        await db.accounts.create({
          data: { name: "recommendation-test-" + crypto.randomUUID() },
        })
      ).id;
      const note = await db.notes.create({
        data: {
          accountId,
          content: "PUBLIC_ORIGINAL",
          metadata: { title: "公开标题" },
        },
      });
      const published = await publishSnapshot(db, accountId, { id: note.id });
      await db.notes.update({
        where: { id: note.id },
        data: {
          content: "PRIVATE_CHANGED",
          metadata: { title: "PRIVATE_TITLE" },
        },
      });
      await db.notes.create({
        data: { accountId, content: "PRIVATE_UNPUBLISHED" },
      });
      const feed = await recommendationFeed(db, { accountId });
      expect(feed.posts).toHaveLength(1);
      expect(feed.posts[0].publishId).toBe(published.publishId);
      expect(JSON.stringify(feed)).not.toContain("PRIVATE");
      await db.notes.update({
        where: { id: note.id },
        data: { isPublished: false },
      });
      expect((await recommendationFeed(db, { accountId })).posts).toHaveLength(
        0,
      );
    } finally {
      if (accountId) {
        await db.notes.deleteMany({ where: { accountId } });
        await db.accounts.delete({ where: { id: accountId } });
      }
      await db.$disconnect();
    }
  },
);

test.skipIf(process.env.RUN_PUBLISH_DB_TESTS !== "1")(
  "recommendation signals deduplicate concurrent requests and across the hour boundary",
  async () => {
    const { recordRecommendationEvent } = await import(
      "../../server/lib/blogRecommendations"
    );
    const { setSystemTime } = await import("bun:test");
    const db = new PrismaClient();
    let accountId = 0;
    const deviceId = crypto.randomUUID().replace(/-/g, "");
    try {
      accountId = (
        await db.accounts.create({
          data: { name: "reco-dedup-" + crypto.randomUUID() },
        })
      ).id;
      const note = await db.notes.create({
        data: { accountId, content: "Public dedup test" },
      });
      const publication = await publishSnapshot(db, accountId, { id: note.id });
      const input = {
        accountId,
        deviceId,
        kind: "impression",
        publishId: publication.publishId!,
        term: "",
      };
      const boundary = Math.ceil(Date.now() / 3600000) * 3600000;
      setSystemTime(new Date(boundary - 1000));
      const results = await Promise.all(
        Array.from({ length: 8 }, () => recordRecommendationEvent(db, input)),
      );
      expect(results.filter((r) => r.recorded)).toHaveLength(1);
      setSystemTime(new Date(boundary + 1000));
      expect((await recordRecommendationEvent(db, input)).recorded).toBe(false);
      expect(
        await db.blogRecommendationEvent.count({
          where: { accountId, deviceId, kind: "impression" },
        }),
      ).toBe(1);
      expect(
        (
          await recordRecommendationEvent(db, {
            ...input,
            kind: "search",
            term: "  AI   Search  ",
          })
        ).recorded,
      ).toBe(true);
      expect(
        (
          await recordRecommendationEvent(db, {
            ...input,
            kind: "search",
            term: "ai search",
          })
        ).recorded,
      ).toBe(false);
    } finally {
      setSystemTime();
      if (accountId) {
        await db.blogRecommendationEvent.deleteMany({ where: { accountId } });
        await db.notes.deleteMany({ where: { accountId } });
        await db.accounts.delete({ where: { id: accountId } });
      }
      await db.$disconnect();
    }
  },
);

test.skipIf(process.env.RUN_PUBLISH_DB_TESTS !== "1")(
  "专题视图里置顶不生效：别的专题的置顶文章不插队",
  async () => {
    const db = new PrismaClient();
    let accountId = 0;
    try {
      accountId = (
        await db.accounts.create({
          data: { name: "reco-topic-pin-" + crypto.randomUUID() },
        })
      ).id;
      const topic = await db.blogTopic.create({
        data: {
          accountId,
          name: "专题A",
          slug: "topic-a-" + crypto.randomUUID().slice(0, 8),
          desc: "",
          color: "#7055f8",
          isPublished: true,
        },
      });
      const inside = await db.notes.create({
        data: { accountId, content: "专题内文章", metadata: { title: "专题内文章" } },
      });
      const outside = await db.notes.create({
        data: { accountId, content: "专题外文章", metadata: { title: "专题外文章" } },
      });
      const insidePub = await publishSnapshot(db, accountId, { id: inside.id });
      await publishSnapshot(db, accountId, { id: outside.id });
      await db.blogTopicNote.create({
        data: { topicId: topic.id, noteId: inside.id, sectionId: null, sortOrder: 0 },
      });
      // 专题视图：只有这个专题的文章。
      // 置顶块是全站范围的，不该把别的专题的置顶文章塞到专题第一屏。
      const scoped = await recommendationFeed(db, { accountId, topicSlug: topic.slug });
      expect(scoped.posts.map((p) => p.publishId)).toEqual([insidePub.publishId]);
      // 全站推荐流：置顶照旧生效，两篇都在。
      const all = await recommendationFeed(db, { accountId });
      expect(all.posts).toHaveLength(2);
    } finally {
      if (accountId) {
        await db.notes.deleteMany({ where: { accountId } });
        await db.blogTopic.deleteMany({ where: { accountId } });
        await db.accounts.delete({ where: { id: accountId } });
      }
      await db.$disconnect();
    }
  },
);
