import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  publicMoments,
  publicMomentMonths,
  publicMomentResonanceState,
  setPublicMomentResonance,
  momentsRSS,
  setMomentPublished,
} from "../../server/lib/blogMoments";
import { submitMomentFeedback } from "../../server/lib/blogMomentFeedback";
import { saveBlogSiteSettings, readBlogSiteSettings } from "../../server/lib/blogSiteSettings";
import {
  DEFAULT_BLOG_TIMEZONE,
  formatMonthLabel,
  isValidTimeZone,
  monthKeyInZone,
  parseMonthKey,
  safeTimeZone,
  startOfMonthInZone,
  startOfNextMonthInZone,
} from "../../shared/lib/blogTime";
import { momentCursorSchema } from "../../shared/lib/blogMoments";
import {
  isMomentFilter,
  MOMENT_FILTERS,
  MOMENT_FILTER_LABEL,
} from "../../shared/lib/blogMoments";

const prisma = new PrismaClient();

/**
 * 动态的公开口径测试。
 *
 * 动态不是独立实体 —— 它就是「被公开的闪念」。
 * 所以这里测的是：一条闪念被公开后，公开动态流能看到什么；
 * 撤回之后又看不到什么。
 *
 * 规则只有几条，但每条都对应公开页上真实能看到的东西：
 *   筛选的口径、月份归到哪个月、翻页会不会漏、共鸣会不会重复计数、
 *   撤回后是不是真的消失、改内容会不会把「首次发布」推后。
 *
 * 数据库部分只在本地的开发库上跑（RUN_PUBLISH_DB_TESTS=1），
 * 且用一个临时账号，测完连账号一起删掉 —— 不碰站点真实数据。
 */

/* -------------------------------------------------------------------------- */
/* 纯函数：时区与月边界                                                       */
/* -------------------------------------------------------------------------- */

describe("动态：时区与月边界", () => {
  test("只认运行时认识的时区", () => {
    expect(isValidTimeZone("Asia/Shanghai")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  test("非法时区退回默认时区", () => {
    expect(safeTimeZone("Asia/Shanghai")).toBe("Asia/Shanghai");
    expect(safeTimeZone("Not/AZone")).toBe(DEFAULT_BLOG_TIMEZONE);
    expect(safeTimeZone(undefined)).toBe(DEFAULT_BLOG_TIMEZONE);
    expect(safeTimeZone(null)).toBe(DEFAULT_BLOG_TIMEZONE);
  });

  test("同一瞬间在不同时区归到不同的月份", () => {
    // UTC 的 9/30 16:30 = 上海时间的 10/1 00:30，正好跨月。
    const instant = new Date("2026-09-30T16:30:00.000Z");
    expect(monthKeyInZone(instant, "Asia/Shanghai")).toBe("2026-10");
    expect(monthKeyInZone(instant, "UTC")).toBe("2026-09");
  });

  test("月起点是「左闭右开」的区间边界", () => {
    const start = startOfMonthInZone(2026, 10, "Asia/Shanghai");
    const end = startOfNextMonthInZone(2026, 10, "Asia/Shanghai");
    // 上海时间 2026-10-01 00:00 == UTC 2026-09-30 16:00
    expect(start.toISOString()).toBe("2026-09-30T16:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-31T16:00:00.000Z");
  });

  test("月份键的解析与展示", () => {
    expect(parseMonthKey("2026-10")).toEqual({ year: 2026, month: 10 });
    expect(parseMonthKey("2026-13")).toBeNull();
    expect(parseMonthKey("26-10")).toBeNull();
    expect(parseMonthKey("")).toBeNull();
    expect(formatMonthLabel("2026-10")).toBe("2026年10月");
    expect(formatMonthLabel("bad")).toBe("bad");
  });
});

/* -------------------------------------------------------------------------- */
/* 纯函数：共享契约                                                           */
/* -------------------------------------------------------------------------- */

describe("动态：共享契约", () => {
  test("筛选口径固定三种，且能认出合法值", () => {
    expect(MOMENT_FILTERS).toEqual(["all", "media", "note"]);
    expect(isMomentFilter("all")).toBe(true);
    expect(isMomentFilter("media")).toBe(true);
    expect(isMomentFilter("note")).toBe(true);
    expect(isMomentFilter("other")).toBe(false);
    expect(isMomentFilter(null)).toBe(false);
    expect(MOMENT_FILTER_LABEL.all).toBe("全部");
  });

  test("游标必须带发布时间与 id", () => {
    expect(
      momentCursorSchema.safeParse({ publishedAt: "2026-10-01T00:00:00Z", id: 3 })
        .success,
    ).toBe(true);
    expect(momentCursorSchema.safeParse({ publishedAt: "2026-10-01T00:00:00Z" }).success).toBe(
      false,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 数据库：公开列表                                                           */
/* -------------------------------------------------------------------------- */

const suite =
  process.env.RUN_PUBLISH_DB_TESTS === "1" ? describe : describe.skip;

suite("动态：公开列表口径", () => {
  let owner = 0;
  let accountId = 0;

  /**
   * 造一条「已公开为动态」的闪念。
   *
   * 动态就是闪念：正文写在 notes.content，公开标签写在
   * notes.metadata.blogPublicTags，图片挂在 notes 的附件上。
   */
  async function seedMoment(input: {
    content: string;
    tags?: string[];
    imageCount?: number;
    isPublished?: boolean;
    publishedAt?: Date | null;
    isRecycle?: boolean;
  }) {
    const isPublished = input.isPublished ?? true;
    const note = await prisma.notes.create({
      data: {
        accountId,
        type: 0,
        content: input.content,
        isMoment: isPublished,
        momentPublishedAt:
          input.publishedAt === undefined
            ? isPublished
              ? new Date()
              : null
            : input.publishedAt,
        isRecycle: input.isRecycle ?? false,
        metadata: { blogPublicTags: input.tags ?? [] },
      },
      select: { id: true },
    });
    for (let i = 0; i < (input.imageCount ?? 0); i++) {
      await prisma.attachments.create({
        data: {
          name: `moment-${note.id}-${i}-${Math.random().toString(16).slice(2, 8)}.png`,
          path: `/api/file/moment-${note.id}-${i}-${Math.random().toString(16).slice(2, 8)}.png`,
          size: 1024,
          type: "image/png",
          accountId,
          noteId: note.id,
        },
      });
    }
    return note.id;
  }

  beforeAll(async () => {
    const name = "blog-moments-test-" + crypto.randomUUID();
    accountId = (await prisma.accounts.create({ data: { name } })).id;
    owner = accountId;
  });

  afterAll(async () => {
    // 反馈挂在闪念上，闪念删掉反馈也跟着走；共鸣同理。
    await prisma.blogMomentFeedbackReply.deleteMany({ where: { accountId } });
    await prisma.blogMomentFeedback.deleteMany({ where: { accountId } });
    await prisma.blogMomentResonance.deleteMany({ where: { accountId } });
    await prisma.attachments.deleteMany({ where: { accountId } });
    // 私有标签是外键指向闪念的，先解绑再删。
    await prisma.tagsToNote.deleteMany({ where: { note: { accountId } } });
    await prisma.tag.deleteMany({ where: { accountId } });
    await prisma.notes.deleteMany({ where: { accountId } });
    await prisma.config.deleteMany({ where: { userId: accountId } });
    await prisma.accounts.deleteMany({ where: { id: accountId } });
  });

  test("筛选口径：全部 / 图文 / 随记", async () => {
    const textId = await seedMoment({ content: "纯文字的一条" });
    const mediaId = await seedMoment({
      content: "带图的一条",
      imageCount: 2,
    });
    const anotherText = await seedMoment({ content: "另一条纯文字" });

    const all = await publicMoments(prisma, { accountId: owner });
    const media = await publicMoments(prisma, { accountId: owner, filter: "media" });
    const note = await publicMoments(prisma, { accountId: owner, filter: "note" });

    const ids = (page: { moments: { id: number }[] }) =>
      page.moments.map((m) => m.id);

    expect(ids(all).sort()).toEqual([textId, mediaId, anotherText].sort());
    expect(ids(media)).toEqual([mediaId]);
    expect(ids(note).sort()).toEqual([textId, anotherText].sort());
    expect(all.total).toBe(3);
  });

  test("公开标签来自闪念的 metadata，私有标签不会外泄", async () => {
    const tagged = await seedMoment({
      content: "带公开标签的一条",
      tags: ["随笔", "工程"],
    });
    // 私有标签（tag / tagsToNote）不进公开数据。
    const tag = await prisma.tag.create({
      data: { name: "私密标签-" + crypto.randomUUID(), accountId },
      select: { id: true },
    });
    await prisma.tagsToNote.create({
      data: { noteId: tagged, tagId: tag.id },
    });

    const page = await publicMoments(prisma, { accountId: owner });
    const row = page.moments.find((m) => m.id === tagged);
    expect(row?.tags).toEqual(["随笔", "工程"]);
    expect(JSON.stringify(page)).not.toContain("私密标签");
  });

  test("未公开、回收站与没有发布时间的闪念都不进公开列表", async () => {
    const draft = await seedMoment({ content: "草稿", isPublished: false });
    const withdrawn = await seedMoment({ content: "先发布后撤回" });
    // 撤回：内容还在，但不再公开。
    await prisma.notes.update({
      where: { id: withdrawn },
      data: { isMoment: false },
    });
    const noTime = await seedMoment({
      content: "有内容但没有发布时间",
      isPublished: true,
      publishedAt: null,
    });
    const recycled = await seedMoment({
      content: "在回收站里",
      isRecycle: true,
    });

    const page = await publicMoments(prisma, { accountId: owner });
    const ids = page.moments.map((m) => m.id);
    expect(ids).not.toContain(draft);
    expect(ids).not.toContain(withdrawn);
    expect(ids).not.toContain(noTime);
    expect(ids).not.toContain(recycled);
  });

  test("月份按站点时区判定，而不是服务器时区", async () => {
    // 2026-09-30T16:30Z = 上海时间 2026-10-01 00:30，UTC 则是 9 月。
    const boundary = await seedMoment({
      content: "跨月的一条",
      publishedAt: new Date("2026-09-30T16:30:00.000Z"),
    });

    // 默认时区（Asia/Shanghai）下它属于 10 月。
    const inShanghai = await publicMoments(prisma, {
      accountId: owner,
      month: "2026-10",
    });
    expect(inShanghai.moments.map((m) => m.id)).toContain(boundary);

    const shanghaiMonths = await publicMomentMonths(prisma, owner);
    expect(shanghaiMonths.timezone).toBe(DEFAULT_BLOG_TIMEZONE);
    expect(shanghaiMonths.months.map((m) => m.key)).toContain("2026-10");

    // 把站点时区改成 UTC，同一条动态就归到 9 月。
    const current = await readBlogSiteSettings(prisma, accountId);
    await saveBlogSiteSettings(
      prisma,
      accountId,
      { timezone: "UTC" },
      current.revision,
    );

    const inUtc = await publicMoments(prisma, { accountId: owner, month: "2026-10" });
    expect(inUtc.moments.map((m) => m.id)).not.toContain(boundary);
    const inUtcSeptember = await publicMoments(prisma, {
      accountId: owner,
      month: "2026-09",
    });
    expect(inUtcSeptember.moments.map((m) => m.id)).toContain(boundary);

    const utcMonths = await publicMomentMonths(prisma, owner);
    expect(utcMonths.timezone).toBe("UTC");
    expect(utcMonths.months.map((m) => m.key)).toContain("2026-09");

    // 改回默认时区，别影响后面的用例。
    const afterChange = await readBlogSiteSettings(prisma, accountId);
    await saveBlogSiteSettings(
      prisma,
      accountId,
      { timezone: DEFAULT_BLOG_TIMEZONE },
      afterChange.revision,
    );
  });

  test("月份列表只包含真实公开内容，且按新到旧", async () => {
    const months = await publicMomentMonths(prisma, owner);
    const keys = months.months.map((m) => m.key);
    expect(keys.length).toBeGreaterThan(0);
    expect([...keys].sort().reverse()).toEqual(keys);
    // 计数与公开列表对得上。
    const total = months.months.reduce((sum, m) => sum + m.count, 0);
    const all = await publicMoments(prisma, { accountId: owner, limit: 30 });
    expect(total).toBe(all.total);
  });

  test("游标翻页不重不漏，同一秒发布的也不会互相吞掉", async () => {
    const sameSecond = new Date("2026-03-05T08:00:00.000Z");
    const first = await seedMoment({ content: "同秒 A", publishedAt: sameSecond });
    const second = await seedMoment({ content: "同秒 B", publishedAt: sameSecond });
    const third = await seedMoment({
      content: "更早一条",
      publishedAt: new Date("2026-03-04T08:00:00.000Z"),
    });

    const collected: number[] = [];
    let cursor: { publishedAt: string; id: number } | null = null;
    for (let i = 0; i < 10; i++) {
      const page = await publicMoments(prisma, {
        accountId: owner,
        cursor: cursor ?? undefined,
        limit: 1,
      });
      collected.push(...page.moments.map((m) => m.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    // 全部出现，且没有重复。
    expect(new Set(collected).size).toBe(collected.length);
    expect(collected).toContain(first);
    expect(collected).toContain(second);
    expect(collected).toContain(third);

    // 顺序按首次发布时间倒序；同一发布时间内按 id 倒序（后写入的在前）。
    const list = await publicMoments(prisma, { accountId: owner, limit: 30 });
    const order = list.moments.map((m) => m.id);
    const firstIdx = order.indexOf(first);
    const secondIdx = order.indexOf(second);
    expect(firstIdx).toBeGreaterThanOrEqual(0);
    expect(secondIdx).toBeGreaterThanOrEqual(0);
    expect(second).toBeGreaterThan(first);
    expect(secondIdx).toBeLessThan(firstIdx);
  });

  test("没有内容时给出空列表与空游标", async () => {
    const emptyAccount = (
      await prisma.accounts.create({
        data: { name: "blog-moments-empty-" + crypto.randomUUID() },
      })
    ).id;
    try {
      const page = await publicMoments(prisma, { accountId: emptyAccount });
      expect(page.moments).toEqual([]);
      expect(page.nextCursor).toBeNull();
      expect(page.total).toBe(0);
    } finally {
      await prisma.accounts.deleteMany({ where: { id: emptyAccount } });
    }
  });

  test("公开数据不泄露私密字段", async () => {
    const page = await publicMoments(prisma, { accountId: owner, limit: 5 });
    const moment = page.moments[0];
    expect(Object.keys(moment).sort()).toEqual(
      ["content", "id", "publishedAt", "resonance", "resonated", "summary", "tags"].sort(),
    );
    // 整页也没有账号 id、发布状态这类内部字段。
    const raw = JSON.stringify(page);
    expect(raw).not.toContain("accountId");
    expect(raw).not.toContain("isMoment");
    expect(raw).not.toContain("momentPublishedAt");
    expect(raw).not.toContain("email");
  });
});

/* -------------------------------------------------------------------------- */
/* 数据库：共鸣                                                               */
/* -------------------------------------------------------------------------- */

suite("动态：共鸣", () => {
  let owner = 0;
  let accountId = 0;
  let momentId = 0;
  const deviceA = "a".repeat(32);
  const deviceB = "b".repeat(32);

  beforeAll(async () => {
    const name = "blog-moments-resonance-" + crypto.randomUUID();
    accountId = (await prisma.accounts.create({ data: { name } })).id;
    owner = accountId;
    const row = await prisma.notes.create({
      data: {
        accountId,
        type: 0,
        content: "值得共鸣的一条",
        isMoment: true,
        momentPublishedAt: new Date(),
      },
      select: { id: true },
    });
    momentId = row.id;
  });

  afterAll(async () => {
    await prisma.blogMomentResonance.deleteMany({ where: { accountId } });
    await prisma.notes.deleteMany({ where: { accountId } });
    await prisma.accounts.deleteMany({ where: { id: accountId } });
  });

  test("同一访客连点多次只算一次", async () => {
    const first = await setPublicMomentResonance(prisma, {
      accountId: owner,
      momentId,
      deviceId: deviceA,
      resonated: true,
    });
    const second = await setPublicMomentResonance(prisma, {
      accountId: owner,
      momentId,
      deviceId: deviceA,
      resonated: true,
    });
    expect(first.resonance).toBe(1);
    expect(second.resonance).toBe(1);
    expect(second.resonated).toBe(true);

    const state = await publicMomentResonanceState(prisma, {
      accountId: owner,
      momentId,
      deviceId: deviceA,
    });
    expect(state).toEqual({ resonance: 1, resonated: true });
  });

  test("取消共鸣后数量回落", async () => {
    const off = await setPublicMomentResonance(prisma, {
      accountId: owner,
      momentId,
      deviceId: deviceA,
      resonated: false,
    });
    expect(off.resonance).toBe(0);
    expect(off.resonated).toBe(false);

    const state = await publicMomentResonanceState(prisma, {
      accountId: owner,
      momentId,
      deviceId: deviceA,
    });
    expect(state).toEqual({ resonance: 0, resonated: false });
  });

  test("不同访客各算一条", async () => {
    await setPublicMomentResonance(prisma, {
      accountId: owner,
      momentId,
      deviceId: deviceA,
      resonated: true,
    });
    await setPublicMomentResonance(prisma, {
      accountId: owner,
      momentId,
      deviceId: deviceB,
      resonated: true,
    });
    const state = await publicMomentResonanceState(prisma, {
      accountId: owner,
      momentId,
    });
    expect(state.resonance).toBe(2);
  });

  test("唯一约束兜底：同一访客同一动态只有一条记录", async () => {
    const rows = await prisma.blogMomentResonance.findMany({
      where: { accountId: owner, noteId: momentId, deviceId: deviceA },
    });
    expect(rows.length).toBe(1);
  });

  test("无效的访客标识被拒绝", async () => {
    await expect(
      setPublicMomentResonance(prisma, {
        accountId: owner,
        momentId,
        deviceId: "not-a-device-id",
        resonated: true,
      }),
    ).rejects.toThrow();
  });

  test("撤回后的动态不能再被共鸣", async () => {
    await prisma.notes.update({
      where: { id: momentId },
      data: { isMoment: false },
    });
    await expect(
      setPublicMomentResonance(prisma, {
        accountId: owner,
        momentId,
        deviceId: deviceA,
        resonated: true,
      }),
    ).rejects.toThrow();
    await prisma.notes.update({
      where: { id: momentId },
      data: { isMoment: true },
    });
  });
});

/* -------------------------------------------------------------------------- */
/* 数据库：发布与撤回                                                         */
/* -------------------------------------------------------------------------- */

suite("动态：发布与撤回", () => {
  let owner = 0;
  let accountId = 0;

  beforeAll(async () => {
    const name = "blog-moments-publish-" + crypto.randomUUID();
    accountId = (await prisma.accounts.create({ data: { name } })).id;
    owner = accountId;
  });

  afterAll(async () => {
    await prisma.blogMomentFeedbackReply.deleteMany({ where: { accountId } });
    await prisma.blogMomentFeedback.deleteMany({ where: { accountId } });
    await prisma.blogMomentResonance.deleteMany({ where: { accountId } });
    await prisma.attachments.deleteMany({ where: { accountId } });
    await prisma.notes.deleteMany({ where: { accountId } });
    await prisma.accounts.deleteMany({ where: { id: accountId } });
  });

  test("公开一条闪念：它立刻出现在公开动态流里", async () => {
    const note = await prisma.notes.create({
      data: { accountId, type: 0, content: "刚写的一条闪念" },
      select: { id: true },
    });
    // 还没公开时不在动态流里。
    let page = await publicMoments(prisma, { accountId: owner });
    expect(page.moments.map((m) => m.id)).not.toContain(note.id);

    const result = await setMomentPublished(prisma, owner, note.id, true);
    expect(result.isMoment).toBe(true);
    expect(result.momentPublishedAt).toBeTruthy();

    page = await publicMoments(prisma, { accountId: owner });
    expect(page.moments.map((m) => m.id)).toContain(note.id);
    expect(page.moments.find((m) => m.id === note.id)?.content).toBe(
      "刚写的一条闪念",
    );
  });

  test("撤回只是关掉开关：内容与首次发布时间都不动", async () => {
    const note = await prisma.notes.create({
      data: { accountId, type: 0, content: "会撤回的一条" },
      select: { id: true },
    });
    const published = await setMomentPublished(prisma, owner, note.id, true);
    const firstAt = published.momentPublishedAt!.toISOString();

    // 改内容再撤回 —— 首次公开时间不能被推后。
    await prisma.notes.update({
      where: { id: note.id },
      data: { content: "会撤回的一条（改过）" },
    });
    const withdrawn = await setMomentPublished(prisma, owner, note.id, false);
    expect(withdrawn.isMoment).toBe(false);
    expect(withdrawn.momentPublishedAt!.toISOString()).toBe(firstAt);

    const row = await prisma.notes.findUniqueOrThrow({ where: { id: note.id } });
    expect(row.content).toBe("会撤回的一条（改过）");
    expect(row.momentPublishedAt!.toISOString()).toBe(firstAt);

    // 撤回后立刻退出公开动态流。
    const page = await publicMoments(prisma, { accountId: owner });
    expect(page.moments.map((m) => m.id)).not.toContain(note.id);
  });

  test("再次公开沿用第一次公开的时间", async () => {
    const note = await prisma.notes.create({
      data: { accountId, type: 0, content: "反复公开的一条" },
      select: { id: true },
    });
    const published = await setMomentPublished(prisma, owner, note.id, true);
    const firstAt = published.momentPublishedAt!.toISOString();
    await setMomentPublished(prisma, owner, note.id, false);
    const again = await setMomentPublished(prisma, owner, note.id, true);
    expect(again.momentPublishedAt!.toISOString()).toBe(firstAt);
  });

  test("回收站里的闪念不能被公开", async () => {
    const note = await prisma.notes.create({
      data: {
        accountId,
        type: 0,
        content: "在回收站里",
        isRecycle: true,
      },
      select: { id: true },
    });
    await expect(
      setMomentPublished(prisma, owner, note.id, true),
    ).rejects.toThrow();
  });

  test("空内容的闪念不能被公开", async () => {
    const note = await prisma.notes.create({
      data: { accountId, type: 0, content: "   " },
      select: { id: true },
    });
    await expect(
      setMomentPublished(prisma, owner, note.id, true),
    ).rejects.toThrow();
    const row = await prisma.notes.findUniqueOrThrow({ where: { id: note.id } });
    expect(row.isMoment).toBe(false);
    expect(row.momentPublishedAt).toBeNull();
  });

  test("别人家的闪念不能被公开", async () => {
    const other = (
      await prisma.accounts.create({
        data: { name: "blog-moments-other-" + crypto.randomUUID() },
      })
    ).id;
    const note = await prisma.notes.create({
      data: { accountId: other, type: 0, content: "别人的闪念" },
      select: { id: true },
    });
    try {
      await expect(
        setMomentPublished(prisma, owner, note.id, true),
      ).rejects.toThrow();
    } finally {
      await prisma.notes.deleteMany({ where: { accountId: other } });
      await prisma.accounts.deleteMany({ where: { id: other } });
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 数据库：反馈闭环                                                           */
/* -------------------------------------------------------------------------- */

suite("动态：读者反馈", () => {
  let owner = 0;
  let accountId = 0;

  beforeAll(async () => {
    const name = "blog-moments-feedback-" + crypto.randomUUID();
    accountId = (await prisma.accounts.create({ data: { name } })).id;
    owner = accountId;
  });

  afterAll(async () => {
    await prisma.blogMomentFeedbackReply.deleteMany({ where: { accountId } });
    await prisma.blogMomentFeedback.deleteMany({ where: { accountId } });
    await prisma.blogMomentResonance.deleteMany({ where: { accountId } });
    await prisma.attachments.deleteMany({ where: { accountId } });
    await prisma.notes.deleteMany({ where: { accountId } });
    await prisma.accounts.deleteMany({ where: { id: accountId } });
  });

  async function seedPublished(content: string) {
    const note = await prisma.notes.create({
      data: {
        accountId,
        type: 0,
        content,
        isMoment: true,
        momentPublishedAt: new Date(),
      },
      select: { id: true },
    });
    return note.id;
  }

  test("反馈提交是幂等的：同一个提交标识只入库一次", async () => {
    const noteId = await seedPublished("带反馈的");
    const payload = {
      accountId: owner,
      noteId,
      type: "supplement" as const,
      content: "补充一点",
      nickname: "",
      wantReply: false,
      email: "",
      allowPublic: false,
      idempotencyKey: "same-idempotency-key",
    };
    const first = await submitMomentFeedback(prisma, payload);
    const second = await submitMomentFeedback(prisma, payload);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.id).toBe(first.id);
    expect(
      await prisma.blogMomentFeedback.count({ where: { noteId } }),
    ).toBe(1);
  });

  test("撤回后的动态不再接收反馈", async () => {
    const noteId = await seedPublished("会被撤回");
    await prisma.notes.update({
      where: { id: noteId },
      data: { isMoment: false },
    });
    await expect(
      submitMomentFeedback(prisma, {
        accountId: owner,
        noteId,
        type: "question",
        content: "还能提交吗",
        nickname: "",
        wantReply: false,
        email: "",
        allowPublic: false,
        idempotencyKey: "after-withdraw",
      }),
    ).rejects.toThrow();
  });

  test("闪念被删除时，它的反馈一起走", async () => {
    const noteId = await seedPublished("待删除");
    await submitMomentFeedback(prisma, {
      accountId: owner,
      noteId,
      type: "question",
      content: "想问一下",
      nickname: "读者",
      wantReply: false,
      email: "",
      allowPublic: false,
      idempotencyKey: "feedback-key-to-delete",
    });
    expect(
      await prisma.blogMomentFeedback.count({ where: { noteId } }),
    ).toBe(1);

    await prisma.notes.delete({ where: { id: noteId } });
    expect(
      await prisma.blogMomentFeedback.count({ where: { noteId } }),
    ).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 数据库：RSS                                                                */
/* -------------------------------------------------------------------------- */

suite("动态：RSS", () => {
  let owner = 0;
  let accountId = 0;

  beforeAll(async () => {
    const name = "blog-moments-rss-" + crypto.randomUUID();
    accountId = (await prisma.accounts.create({ data: { name } })).id;
    owner = accountId;
    await prisma.notes.create({
      data: {
        accountId,
        type: 0,
        content: "RSS 里应该出现的内容",
        isMoment: true,
        momentPublishedAt: new Date("2026-04-01T04:00:00.000Z"),
      },
    });
  });

  afterAll(async () => {
    await prisma.notes.deleteMany({ where: { accountId } });
    await prisma.accounts.deleteMany({ where: { id: accountId } });
  });

  test("产出合法的 RSS，并且只包含已公开的动态", async () => {
    const xml = await momentsRSS(prisma, "https://ink.example.com", owner);
    expect(xml.startsWith("<?xml version=\"1.0\"")).toBe(true);
    expect(xml).toContain("<rss version=\"2.0\"");
    expect(xml).toContain("RSS 里应该出现的内容");
    expect(xml).toContain("https://ink.example.com/blog/moments#m");
    expect(xml).toContain("/blog/moments/feed.xml");
    // 描述里的尖括号被转义了，没有裸的标签。
    expect(xml).not.toMatch(/<description>[^<]*<[^/]/);
  });

  test("没有内容时也给出可解析的 RSS", async () => {
    const emptyAccount = (
      await prisma.accounts.create({
        data: { name: "blog-moments-rss-empty-" + crypto.randomUUID() },
      })
    ).id;
    try {
      const xml = await momentsRSS(prisma, "https://ink.example.com", emptyAccount);
      expect(xml).toContain("<rss version=\"2.0\"");
      expect(xml).not.toContain("<item>");
    } finally {
      await prisma.accounts.deleteMany({ where: { id: emptyAccount } });
    }
  });
});
