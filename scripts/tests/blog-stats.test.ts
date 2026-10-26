import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  articleStats,
  isDeviceId,
  siteStats,
  trackBlogView,
  VIEW_WINDOW_SECONDS,
} from "../../server/lib/blogStats";
import { publishSnapshot } from "../../server/lib/publication";

describe("阅读统计的设备标识", () => {
  test("只认 32 位十六进制随机串", () => {
    expect(isDeviceId("a".repeat(32))).toBe(true);
    expect(isDeviceId("A".repeat(32))).toBe(false);
    expect(isDeviceId("a".repeat(31))).toBe(false);
    expect(isDeviceId("")).toBe(false);
    expect(isDeviceId(undefined)).toBe(false);
    expect(isDeviceId(123)).toBe(false);
  });
});

// Only run against the explicitly selected local development database.
const suite =
  process.env.RUN_PUBLISH_DB_TESTS === "1" ? describe : describe.skip;
suite("阅读统计口径", () => {
  const db = new PrismaClient();
  let owner: number,
    other: number,
    noteA: number,
    noteB: number,
    publishA: string,
    publishB: string;
  const deviceA = "a".repeat(32);
  const deviceB = "b".repeat(32);

  beforeAll(async () => {
    const name = "blog-stats-test-" + crypto.randomUUID();
    owner = (await db.accounts.create({ data: { name } })).id;
    other = (await db.accounts.create({ data: { name: name + "-other" } })).id;
    const draft = (title: string) => ({
      accountId: owner,
      content: `# ${title}\n这一篇用来验证阅读统计口径的正文内容，足够长以便被发布。`,
      type: 1,
      metadata: { title },
    });
    noteA = (await db.notes.create({ data: draft("统计甲") })).id;
    noteB = (await db.notes.create({ data: draft("统计乙") })).id;
    await publishSnapshot(db, owner, { id: noteA });
    await publishSnapshot(db, owner, { id: noteB });
    publishA = (await db.notes.findUniqueOrThrow({ where: { id: noteA } }))
      .publishId!;
    publishB = (await db.notes.findUniqueOrThrow({ where: { id: noteB } }))
      .publishId!;
  });
  afterAll(async () => {
    if (owner) {
      await db.blogDevice.deleteMany({ where: { accountId: owner } });
      await db.notes.deleteMany({ where: { accountId: owner } });
      await db.accounts.delete({ where: { id: owner } });
    }
    if (other) await db.accounts.delete({ where: { id: other } });
    await db.$disconnect();
  });

  test("首次阅读记一次点击和一个读者", async () => {
    const result = await trackBlogView(db, {
      publishId: publishA,
      deviceId: deviceA,
      accountId: owner,
    });
    expect(result?.counted).toBe(true);
    expect(result?.views).toBe(1);
    expect(result?.readers).toBe(1);
    const stats = await articleStats(db, noteA);
    expect(stats).toEqual({ views: 1, readers: 1 });
  });

  test("去重窗口内的重复打开只算一次", async () => {
    // windowSeconds: 0 = 窗口立即过期，模拟「过了窗口再打开」
    const again = await trackBlogView(db, {
      publishId: publishA,
      deviceId: deviceA,
      accountId: owner,
      windowSeconds: 0,
    });
    expect(again?.counted).toBe(true);
    expect(again?.views).toBe(2);
    // 读者数不重复加：同一台设备还是 1 个读者
    expect(again?.readers).toBe(1);
  });

  test("窗口内的重复打开不记新点击", async () => {
    const before = await articleStats(db, noteA);
    const again = await trackBlogView(db, {
      publishId: publishA,
      deviceId: deviceA,
      accountId: owner,
    });
    expect(again?.counted).toBe(false);
    expect(again?.views).toBe(before.views);
    const after = await articleStats(db, noteA);
    expect(after).toEqual(before);
    expect(after.views).toBe(2);
    expect(after.readers).toBe(1);
  });

  test("另一台设备算新读者", async () => {
    const result = await trackBlogView(db, {
      publishId: publishA,
      deviceId: deviceB,
      accountId: owner,
    });
    expect(result?.counted).toBe(true);
    expect(result?.views).toBe(3);
    expect(result?.readers).toBe(2);
  });

  test("同一台设备读多篇，站点总用户数只算一个", async () => {
    await trackBlogView(db, {
      publishId: publishB,
      deviceId: deviceA,
      accountId: owner,
    });
    const stats = await siteStats(db, owner);
    // 站点总用户数 = 跨文章去重后的设备数
    expect(stats.readers).toBe(2);
    // 站点总点击数 = 各文章点击数之和
    expect(stats.views).toBe(4);
    const byNote = new Map(stats.byNote.map((r) => [r.noteId, r]));
    expect(byNote.get(noteA)).toEqual({ noteId: noteA, views: 3, readers: 2 });
    expect(byNote.get(noteB)).toEqual({ noteId: noteB, views: 1, readers: 1 });
    // 趋势按天聚合，今天至少有数据
    expect(stats.daily.length).toBeGreaterThan(0);
    expect(stats.daily[0].views).toBe(4);
  });

  test("非法设备标识与未发布文章都不进统计", async () => {
    const before = await siteStats(db, owner);
    expect(
      await trackBlogView(db, {
        publishId: publishA,
        deviceId: "not-a-device",
        accountId: owner,
      }),
    ).toBeNull();
    expect(
      await trackBlogView(db, {
        publishId: "does-not-exist",
        deviceId: deviceA,
        accountId: owner,
      }),
    ).toBeNull();
    const after = await siteStats(db, owner);
    expect(after.views).toBe(before.views);
    expect(after.readers).toBe(before.readers);
  });

  test("别人的账号不会把阅读记到本站名下", async () => {
    const result = await trackBlogView(db, {
      publishId: publishA,
      deviceId: deviceA,
      accountId: other,
    });
    // other 名下没有这篇已发布文章
    expect(result).toBeNull();
  });

  test("同设备并发首次阅读只增加一个访客和一次阅读", async () => {
    const deviceId = "c".repeat(32);
    const before = await articleStats(db, noteA);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        trackBlogView(db, { publishId: publishA, deviceId, accountId: owner }),
      ),
    );
    expect(results.filter((r) => r?.counted)).toHaveLength(1);
    const after = await articleStats(db, noteA);
    expect(after.views).toBe(before.views + 1);
    expect(after.readers).toBe(before.readers + 1);
    expect(
      await db.blogDevice.count({ where: { accountId: owner, deviceId } }),
    ).toBe(1);
  });
  test("默认去重窗口是 30 分钟", () => {
    expect(VIEW_WINDOW_SECONDS).toBe(1800);
  });
});
