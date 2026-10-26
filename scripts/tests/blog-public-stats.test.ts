import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  publicSiteStats,
  sharingDays,
  PUBLIC_STATS_VERSION,
} from "../../server/lib/blogPublicStats";
import {
  invalidatePublicStats,
  readPublicStatsCache,
} from "../../server/lib/blogPublicStatsCache";
import { publishSnapshot } from "../../server/lib/publication";
import { setPublicReaction } from "../../server/lib/blogInteraction";
import { readBlogSiteSettings } from "../../server/lib/blogSiteSettings";

const prisma = new PrismaClient();

/** 博客主人（公开站的数据都挂在它下面）。 */
let owner = 0;

/** 本轮测试自建的临时文章：用完必须删掉，不留任何痕迹。 */
const tempNoteIds: number[] = [];

const device = (suffix: string) => suffix.padEnd(32, "0").slice(0, 32);

async function cleanup() {
  for (const id of tempNoteIds) {
    await prisma.blogArticleReaction.deleteMany({ where: { noteId: id } });
    await prisma.blogPageView.deleteMany({ where: { noteId: id } });
    await prisma.blogPostStat.deleteMany({ where: { noteId: id } });
    await prisma.notePublication.deleteMany({ where: { noteId: id } });
    await prisma.notes.deleteMany({ where: { id } });
  }
  tempNoteIds.length = 0;
}

/** 建一篇真实的公开文章（带公开快照），返回它的 id。 */
async function createPublicNote(title: string) {
  const note = await prisma.notes.create({
    data: {
      accountId: owner,
      type: 0,
      content: `<p>${title}</p>`,
      isPublished: true,
      publishId: "test" + Math.random().toString(16).slice(2, 14),
      metadata: {},
      publication: {
        create: {
          title,
          content: `<p>${title}</p>`,
          type: 0,
          sourceUpdatedAt: new Date(),
        },
      },
    },
    select: { id: true },
  });
  tempNoteIds.push(note.id);
  return note.id;
}

beforeAll(async () => {
  const account = await prisma.accounts.findFirst({
    where: { role: "superadmin" },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (!account) throw new Error("测试需要一个 superadmin 账号。");
  owner = account.id;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("公开站点数据汇总", () => {
  test("汇总的四个数字都来自公开可访问的文章", async () => {
    invalidatePublicStats(owner);
    const base = await publicSiteStats(prisma, owner);
    const noteId = await createPublicNote("统计口径测试文章");
    await prisma.blogPostStat.create({
      data: { noteId, accountId: owner, views: 7, readers: 1 },
    });
    await prisma.blogArticleReaction.create({
      data: { noteId, accountId: owner, deviceId: device("aa"), kind: "inspired" },
    });
    invalidatePublicStats(owner);
    const after = await publicSiteStats(prisma, owner);

    expect(after.views).toBe(base.views + 7);
    expect(after.reactions).toBe(base.reactions + 1);
    expect(after.articles).toBe(base.articles + 1);
    expect(after.version).toBe(PUBLIC_STATS_VERSION);
    expect(after.dedupeWindowMinutes).toBe(30);
  });

  test("撤回的文章退出汇总：阅读与回应都不再计入", async () => {
    const noteId = await createPublicNote("待撤回的统计测试文章");
    await prisma.blogPostStat.create({
      data: { noteId, accountId: owner, views: 5, readers: 1 },
    });
    await prisma.blogArticleReaction.create({
      data: { noteId, accountId: owner, deviceId: device("bb"), kind: "useful" },
    });
    invalidatePublicStats(owner);
    const before = await publicSiteStats(prisma, owner);

    // 撤回：公开快照留着，只把 isPublished 置回 false。
    await prisma.notes.update({
      where: { id: noteId },
      data: { isPublished: false },
    });
    invalidatePublicStats(owner);
    const after = await publicSiteStats(prisma, owner);

    expect(after.views).toBe(before.views - 5);
    expect(after.reactions).toBe(before.reactions - 1);
    expect(after.articles).toBe(before.articles - 1);
  });

  test("读者回应：切换类型总数不变，撤销后减少", async () => {
    const note = await prisma.notes.create({
      data: {
        accountId: owner,
        type: 0,
        content: "<p>回应计数测试</p>",
        isPublished: true,
        publishId: "test" + Math.random().toString(16).slice(2, 14),
        metadata: {},
        publication: {
          create: {
            title: "回应计数测试",
            content: "<p>回应计数测试</p>",
            type: 0,
            sourceUpdatedAt: new Date(),
          },
        },
      },
      select: { id: true, publishId: true },
    });
    tempNoteIds.push(note.id);
    const key = device("cc");
    invalidatePublicStats(owner);
    const base = await publicSiteStats(prisma, owner);

    await setPublicReaction(prisma, {
      accountId: owner,
      publishId: note.publishId,
      deviceId: key,
      kind: "inspired",
    });
    invalidatePublicStats(owner);
    const afterFirst = await publicSiteStats(prisma, owner);
    expect(afterFirst.reactions).toBe(base.reactions + 1);

    // 切换类型：同一访客对同一篇只留一种，总数不增加。
    await setPublicReaction(prisma, {
      accountId: owner,
      publishId: note.publishId,
      deviceId: key,
      kind: "resonant",
    });
    invalidatePublicStats(owner);
    const afterSwitch = await publicSiteStats(prisma, owner);
    expect(afterSwitch.reactions).toBe(afterFirst.reactions);

    // 撤销：总数减少。
    await setPublicReaction(prisma, {
      accountId: owner,
      publishId: note.publishId,
      deviceId: key,
      kind: null,
    });
    invalidatePublicStats(owner);
    const afterCancel = await publicSiteStats(prisma, owner);
    expect(afterCancel.reactions).toBe(base.reactions);
  });

  test("重复上报同一访客的同一篇阅读不会放大累计阅读", async () => {
    const note = await prisma.notes.create({
      data: {
        accountId: owner,
        type: 0,
        content: "<p>阅读去重测试</p>",
        isPublished: true,
        publishId: "test" + Math.random().toString(16).slice(2, 14),
        metadata: {},
        publication: {
          create: {
            title: "阅读去重测试",
            content: "<p>阅读去重测试</p>",
            type: 0,
            sourceUpdatedAt: new Date(),
          },
        },
      },
      select: { id: true, publishId: true },
    });
    tempNoteIds.push(note.id);
    const { trackBlogView } = await import("../../server/lib/blogStats");
    const key = device("dd");

    const first = await trackBlogView(prisma, {
      publishId: note.publishId,
      deviceId: key,
      accountId: owner,
    });
    expect(first?.counted).toBe(true);
    // 同一设备、同一篇，30 分钟窗口内再报一次不计入。
    const second = await trackBlogView(prisma, {
      publishId: note.publishId,
      deviceId: key,
      accountId: owner,
    });
    expect(second?.counted).toBe(false);
    expect(second?.views).toBe(first?.views);
  });

  test("更新发布不增加文章数，也不重置首次发布时间", async () => {
    const noteId = await createPublicNote("更新发布测试文章");
    const before = await prisma.notePublication.findUnique({
      where: { noteId },
      select: { createdAt: true },
    });
    invalidatePublicStats(owner);
    const statsBefore = await publicSiteStats(prisma, owner);

    // 内容没变 —— publishSnapshot 会走「无需更新」的分支，但仍然走同一套发布逻辑。
    await publishSnapshot(prisma, owner, { id: noteId });

    const after = await prisma.notePublication.findUnique({
      where: { noteId },
      select: { createdAt: true },
    });
    invalidatePublicStats(owner);
    const statsAfter = await publicSiteStats(prisma, owner);

    expect(after?.createdAt.getTime()).toBe(before?.createdAt.getTime());
    expect(statsAfter.articles).toBe(statsBefore.articles);
    expect(statsAfter.firstPublishedAt).toBe(statsBefore.firstPublishedAt);
  });

  test("持续分享：没有公开文章时是 0 天", () => {
    expect(sharingDays(null)).toBe(0);
    const today = new Date();
    expect(sharingDays(today)).toBe(0);
    const sixDaysAgo = new Date(today.getTime() - 6 * 24 * 3600 * 1000);
    expect(sharingDays(sixDaysAgo)).toBe(6);
    // 未来时间不应该出现负数
    const future = new Date(today.getTime() + 3 * 24 * 3600 * 1000);
    expect(sharingDays(future)).toBe(0);
  });

  test("发布之后公开汇总缓存立刻失效", async () => {
    const noteId = await createPublicNote("缓存失效测试文章");
    invalidatePublicStats(owner);
    await publicSiteStats(prisma, owner);
    expect(readPublicStatsCache(owner)).toBeDefined();
    await publishSnapshot(prisma, owner, { id: noteId });
    expect(readPublicStatsCache(owner)).toBeUndefined();
  });

  test("公开汇总里没有任何私密字段", async () => {
    invalidatePublicStats(owner);
    const stats = await publicSiteStats(prisma, owner);
    expect(Object.keys(stats).sort()).toEqual(
      [
        "articles",
        "days",
        "dedupeWindowMinutes",
        "firstPublishedAt",
        "reactions",
        "updatedAt",
        "version",
        "views",
      ].sort(),
    );
    // 不应出现访客标识、邮箱、反馈内容或原始事件
    const dumped = JSON.stringify(stats);
    expect(dumped).not.toContain("deviceId");
    expect(dumped).not.toContain("email");
    expect(dumped).not.toContain("feedback");
  });

  test("公开展示开关：关闭时后台读到的配置为 false", async () => {
    const settings = await readBlogSiteSettings(prisma, owner);
    expect(typeof settings.data.showPublicStats).toBe("boolean");
  });
});
