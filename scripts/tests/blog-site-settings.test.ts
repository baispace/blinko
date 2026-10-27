import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  blogSiteSettingsSchema,
  readArticleSeo,
} from "../../shared/lib/blogSiteSettings";
import {
  readBlogSiteSettings,
  saveBlogSiteSettings,
  readTopicSeo,
  saveTopicSeo,
} from "../../server/lib/blogSiteSettings";
import {
  publicationStatus,
  publishSnapshot,
} from "../../server/lib/publication";
import { blogEngagement } from "../../server/lib/blogStats";
import { resolveBlogSEO } from "../../server/lib/publicBlogSEO";
test("settings reject arbitrary script values, invalid IDs and credential URLs", () => {
  expect(blogSiteSettingsSchema.safeParse({ gaId: "<script>" }).success).toBe(
    false,
  );
  expect(
    blogSiteSettingsSchema.safeParse({
      targetOrigin: "https://user:pass@example.com",
    }).success,
  ).toBe(false);
  expect(
    blogSiteSettingsSchema.safeParse({ titleTemplate: "missing placeholder" })
      .success,
  ).toBe(false);
  expect(
    blogSiteSettingsSchema.safeParse({
      gaId: "G-ABC123",
      baiduId: "a".repeat(32),
    }).success,
  ).toBe(true);
  expect(
    readArticleSeo(
      { blogSeo: { title: "Draft" }, blogSeoPublished: { title: "Live" } },
      true,
    ).title,
  ).toBe("Live");
});
const suite =
  process.env.RUN_PUBLISH_DB_TESTS === "1" ? describe : describe.skip;
suite("blog settings isolation and SEO publication", () => {
  const db = new PrismaClient();
  let owner = 0,
    other = 0,
    note = 0;
  beforeAll(async () => {
    owner = (
      await db.accounts.create({
        data: { name: "site-settings-" + crypto.randomUUID() },
      })
    ).id;
    other = (
      await db.accounts.create({
        data: { name: "site-settings-other-" + crypto.randomUUID() },
      })
    ).id;
    note = (
      await db.notes.create({
        data: {
          accountId: owner,
          type: 1,
          content: "<h1>Example</h1><p>Body content for SEO test.</p>",
          metadata: {
            title: "Example",
            blogSeo: {
              title: "Draft search title",
              description: "A draft description",
              image: "",
            },
          },
        },
      })
    ).id;
  });
  afterAll(async () => {
    await db.notes.deleteMany({ where: { accountId: { in: [owner, other] } } });
    await db.config.deleteMany({ where: { userId: { in: [owner, other] } } });
    await db.accounts.deleteMany({ where: { id: { in: [owner, other] } } });
    await db.$disconnect();
  });
  test("settings persist per owner and reject stale concurrent saves", async () => {
    const a = await readBlogSiteSettings(db, owner);
    expect(a.configured).toBe(false);
    const saved = await saveBlogSiteSettings(
      db,
      owner,
      { siteName: "Test blog" },
      a.revision,
    );
    expect(saved.data.siteName).toBe("Test blog");
    // 站点名称留空表示继承工作区的站点名称，默认不再是写死的 "Ink"。
    expect((await readBlogSiteSettings(db, other)).data.siteName).toBe("");
    await expect(
      saveBlogSiteSettings(db, owner, { siteName: "Stale" }, a.revision),
    ).rejects.toThrow("其他窗口");
  });
  test("topic SEO validates ownership and becomes visible only for a public topic", async () => {
    const topicNote=await db.notes.create({data:{accountId:owner,type:1,content:"Topic fixture body"}});
    await publishSnapshot(db,owner,{id:topicNote.id});
    const topic = await db.blogTopic.create({
      data: {
        accountId: owner,
        name: "Test topic",
        slug: "test-topic",
        desc: "Topic summary",
        isPublished: true,
      },
    });
    await db.blogTopicNote.create({data:{topicId:topic.id,noteId:topicNote.id,sortOrder:0}});
    try {
      const base = await readTopicSeo(db, owner, topic.id);
      await expect(readTopicSeo(db, other, topic.id)).rejects.toThrow(
        "专题不存在",
      );
      await saveTopicSeo(
        db,
        owner,
        topic.id,
        { title: "Topic search title" },
        base.revision,
      );
      expect(
        (
          await resolveBlogSEO(
            db,
            "/blog/t/test-topic",
            "https://example.com",
            owner,
          )
        ).title,
      ).toBe("Topic search title");
      await db.blogTopic.update({
        where: { id: topic.id },
        data: { isPublished: false },
      });
      expect(
        (
          await resolveBlogSEO(
            db,
            "/blog/t/test-topic",
            "https://example.com",
            owner,
          )
        ).status,
      ).toBe(404);
    } finally {
      await db.config.deleteMany({
        where: { userId: owner, key: "blogTopicSeo:" + topic.id },
      });
      await db.blogTopic.delete({ where: { id: topic.id } });
    }
  });
  test("range analytics count real events and isolate owners", async () => {
    const device = "1".repeat(32),
      bucket = new Date();
    await db.blogRecommendationEvent.createMany({
      data: [
        {
          accountId: owner,
          deviceId: device,
          kind: "impression",
          publishId: "test-event",
          term: "",
          bucket,
        },
        {
          accountId: owner,
          deviceId: device,
          kind: "click",
          publishId: "test-event",
          term: "",
          bucket,
        },
      ],
    });
    try {
      const r = await blogEngagement(db, owner, 7);
      expect(r.impressions).toBe(1);
      expect(r.clicks).toBe(1);
      expect(r.ctr).toBe(1);
      expect((await blogEngagement(db, other, 7)).clicks).toBe(0);
    } finally {
      await db.blogRecommendationEvent.deleteMany({
        where: { accountId: owner },
      });
    }
  });
  test("SEO changes stay private until publish, invalidate review and update metadata", async () => {
    const review = await publicationStatus(db, owner, note);
    expect(review.changes).toContain("seo");
    const pub = await publishSnapshot(db, owner, {
      id: note,
      expectedPublicationToken: review.reviewToken,
    });
    const seo = await resolveBlogSEO(
      db,
      "/blog/" + pub.publishId,
      "https://example.com",
      owner,
    );
    expect(seo.title).toBe("Draft search title");
    const saved = await db.notes.findUniqueOrThrow({ where: { id: note } });
    await db.notes.update({
      where: { id: note },
      data: {
        metadata: {
          ...(saved.metadata as object),
          blogSeo: { title: "New draft", description: "", image: "" },
        },
      },
    });
    const previous = await resolveBlogSEO(
      db,
      "/blog/" + pub.publishId,
      "https://example.com",
      owner,
    );
    expect(previous.title).toBe("Draft search title");
    await expect(
      publishSnapshot(db, owner, {
        id: note,
        expectedPublicationToken: review.reviewToken,
      }),
    ).rejects.toThrow("已变化");
    const next = await publicationStatus(db, owner, note);
    expect(next.changes).toEqual(["seo"]);
    await publishSnapshot(db, owner, {
      id: note,
      expectedPublicationToken: next.reviewToken,
    });
    expect(
      (
        await resolveBlogSEO(
          db,
          "/blog/" + pub.publishId,
          "https://example.com",
          owner,
        )
      ).title,
    ).toBe("New draft");
    expect((await publicationStatus(db, owner, note)).changes).toEqual([]);
  });
});
