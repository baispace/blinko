import { Prisma, type PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { publicBlogOwner } from "./blog";
import { readBlogSiteSettings } from "./blogSiteSettings";
import { readDraftPublicTags } from "./blogPublicTags";
import {
  type MomentCursor,
  type MomentFilter,
} from "../../shared/lib/blogMoments";
import {
  parseMonthKey,
  safeTimeZone,
  startOfMonthInZone,
  startOfNextMonthInZone,
} from "../../shared/lib/blogTime";
import { toPublicPath } from "../../shared/lib/blogSeo";
import { publicText } from "./publicText";

/**
 * 公开博客的「动态」。
 *
 * 动态不是独立实体 —— 它就是「被公开的闪念」。
 *
 * 之前这里有一张和 notes 平行的表：正文、引文、标签、图片各存一份，
 * 后台还得单独维护一套编辑器与发布开关。同一个东西存两遍，迟早对不上。
 * 现在动态只借闪念的两个状态位（isMoment / momentPublishedAt），
 * 内容、图片、标签都取自闪念本身：
 *   · 正文：闪念的 markdown（图片内联在正文里）；
 *   · 标签：闪念 metadata 里的公开标签 —— 与文章同一套机制，私有标签不外泄；
 *   · 图片：闪念自己的附件。
 *
 * 三条硬规矩：
 *   1. 公开动态只包含已公开、且 momentPublishedAt 有值的闪念 —— 撤回立刻退出列表；
 *   2. momentPublishedAt 是首次公开时间，改内容不会重置它，排序与月份都按它算；
 *   3. 共鸣由事实表现算（不存计数器），同一访客对同一条动态最多一条。
 */

/** 一页最多取多少条。 */
const MOMENT_PAGE_SIZE = 10;
const MOMENT_PAGE_MAX = 30;

/** 匿名设备标识：32 位十六进制随机串。 */
const DEVICE_ID = /^[0-9a-f]{32}$/;

/**
 * XML 转义。
 *
 * 刻意不 import publicBlogSEO 的那份 —— 那边要 import 动态的公开数据，
 * 互相 import 会成环。这里各写各的，规则一致（& < > " '）。
 */
const xml = (value: string) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export function isMomentDeviceId(value: unknown): value is string {
  return typeof value === "string" && DEVICE_ID.test(value);
}

export type PublicMoment = {
  /** 动态的公开标识：就是闪念的 id。 */
  id: number;
  /** markdown 正文（图片内联在里面）。 */
  content: string;
  /** 正文的纯文本摘要：给「最近动态」这类紧凑位置用，省得客户端再写一套剥 markdown 的规则。 */
  summary: string;
  /** 公开标签。 */
  tags: string[];
  publishedAt: string;
  /** 共鸣总数。 */
  resonance: number;
  /** 当前访客是否已共鸣。 */
  resonated: boolean;
};

export type PublicMomentPage = {
  moments: PublicMoment[];
  /**
   * 下一页的游标；为 null 表示没有更多了。
   * 时间用字符串给出 —— 交给客户端再传回来时会被 schema 解析回 Date。
   */
  nextCursor: { publishedAt: string; id: number } | null;
  /** 当前筛选下符合条件的总数。 */
  total: number;
  /** 站点时区。 */
  timezone: string;
};

/** 站点的时区（月份边界按它判定）。 */
export async function momentTimeZone(db: PrismaClient, accountId: number) {
  const settings = await readBlogSiteSettings(db, accountId);
  return safeTimeZone(settings.data.timezone);
}

/**
 * 公开动态的基础条件。
 *
 * 回收站里的闪念不在公开动态里；草稿（momentPublishedAt 为空）也不在。
 */
function publicMomentWhere(owner: number): Prisma.notesWhereInput {
  return {
    accountId: owner,
    isMoment: true,
    momentPublishedAt: { not: null },
    isRecycle: false,
  };
}

/**
 * 公开读取动态列表。
 *
 * 筛选：
 *   all   所有公开动态
 *   media 含图片的
 *   note  不含图片的
 *
 * 分页用「公开时间 + id」的稳定游标 —— 同一秒公开的两条也不会互相吞掉。
 */
export async function publicMoments(
  db: PrismaClient,
  input: {
    accountId?: number;
    filter?: MomentFilter;
    month?: string;
    cursor?: MomentCursor;
    limit?: number;
    deviceId?: string;
  } = {},
): Promise<PublicMomentPage> {
  const owner = await publicBlogOwner(db, input.accountId);
  const timeZone = await momentTimeZone(db, owner);
  const limit = Math.min(MOMENT_PAGE_MAX, Math.max(1, input.limit ?? MOMENT_PAGE_SIZE));
  const filter: MomentFilter = input.filter ?? "all";

  const conditions: Prisma.notesWhereInput[] = [publicMomentWhere(owner)];

  if (filter === "media")
    conditions.push({ attachments: { some: { type: { startsWith: "image/" } } } });
  else if (filter === "note")
    conditions.push({ attachments: { none: { type: { startsWith: "image/" } } } });

  // 月份：按站点时区算出「左闭右开」的区间。
  if (input.month) {
    const parsed = parseMonthKey(input.month);
    if (!parsed)
      throw new TRPCError({ code: "BAD_REQUEST", message: "月份格式不正确" });
    const start = startOfMonthInZone(parsed.year, parsed.month, timeZone);
    const end = startOfNextMonthInZone(parsed.year, parsed.month, timeZone);
    conditions.push({ momentPublishedAt: { gte: start, lt: end } });
  }

  // 游标：公开时间更早的，或者同一公开时间的 id 更小的。
  if (input.cursor) {
    conditions.push({
      OR: [
        { momentPublishedAt: { lt: input.cursor.publishedAt } },
        { momentPublishedAt: input.cursor.publishedAt, id: { lt: input.cursor.id } },
      ],
    });
  }

  const where: Prisma.notesWhereInput = { AND: conditions };

  const [rows, total] = await Promise.all([
    db.notes.findMany({
      where,
      orderBy: [{ momentPublishedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: {
        id: true,
        content: true,
        metadata: true,
        momentPublishedAt: true,
      },
    }),
    db.notes.count({ where }),
  ]);

  const page = rows.slice(0, limit);
  const ids = page.map((m) => m.id);

  // 共鸣数与我的共鸣状态：两次聚合拿到，不逐条查。
  const [counts, mine] = await Promise.all([
    db.blogMomentResonance.groupBy({
      by: ["noteId"],
      where: { noteId: { in: ids } },
      _count: { _all: true },
    }),
    isMomentDeviceId(input.deviceId)
      ? db.blogMomentResonance.findMany({
          where: { noteId: { in: ids }, deviceId: input.deviceId },
          select: { noteId: true },
        })
      : Promise.resolve([]),
  ]);
  const countMap = new Map(counts.map((c) => [c.noteId, c._count._all]));
  const mineSet = new Set(mine.map((m) => m.noteId));

  const moments: PublicMoment[] = page.map((m) => ({
    id: m.id,
    content: m.content ?? "",
    // 摘要只留文字：图片整行去掉。
    // publicText 会把图片语法换成替代文字（这里就是文件名），
    // 摘要里冒出一串「20261025-39022.png」纯属噪音 —— 图片在动态页正文里照样看得到。
    summary: publicText(
      (m.content ?? "").replace(/!\[[^\]]*\]\([^)]*\)/g, " "),
    ).slice(0, 200),
    tags: readDraftPublicTags(m.metadata),
    publishedAt: m.momentPublishedAt!.toISOString(),
    resonance: countMap.get(m.id) ?? 0,
    resonated: mineSet.has(m.id),
  }));

  const last = page[page.length - 1];
  return {
    moments,
    nextCursor:
      rows.length > limit && last && last.momentPublishedAt
        ? { publishedAt: last.momentPublishedAt.toISOString(), id: last.id }
        : null,
    total,
    timezone: timeZone,
  };
}

/**
 * 可选月份：根据真实公开内容算出来，不写死。
 *
 * 用 SQL 直接按站点时区分组，避免把整列时间拉回内存再算。
 */
export async function publicMomentMonths(
  db: PrismaClient,
  accountId?: number,
) {
  const owner = await publicBlogOwner(db, accountId);
  const timeZone = await momentTimeZone(db, owner);
  const rows = await db.$queryRaw<{ key: string; count: bigint }[]>`
    SELECT to_char(date_trunc('month', "momentPublishedAt" AT TIME ZONE ${timeZone}), 'YYYY-MM') AS key,
           COUNT(*)::bigint AS count
    FROM "notes"
    WHERE "accountId" = ${owner} AND "isMoment" = true
      AND "momentPublishedAt" IS NOT NULL AND "isRecycle" = false
    GROUP BY 1 ORDER BY 1 DESC
  `;
  return {
    timezone: timeZone,
    months: rows.map((r) => ({ key: r.key, count: Number(r.count) })),
  };
}

/** 确认某条动态当前是公开可访问的。 */
async function findPublicMoment(db: PrismaClient, accountId: number, id: number) {
  const moment = await db.notes.findFirst({
    where: { ...publicMomentWhere(accountId), id },
    select: { id: true },
  });
  if (!moment)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "动态不存在或已撤回",
    });
  return moment;
}

/** 当前访客对一条动态的共鸣状态。 */
export async function publicMomentResonanceState(
  db: PrismaClient,
  input: { accountId?: number; momentId: number; deviceId?: string },
) {
  const owner = await publicBlogOwner(db, input.accountId);
  const moment = await findPublicMoment(db, owner, input.momentId);
  const [count, mine] = await Promise.all([
    db.blogMomentResonance.count({ where: { noteId: moment.id } }),
    isMomentDeviceId(input.deviceId)
      ? db.blogMomentResonance.findUnique({
          where: {
            accountId_noteId_deviceId: {
              accountId: owner,
              noteId: moment.id,
              deviceId: input.deviceId,
            },
          },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  return { resonance: count, resonated: !!mine };
}

/**
 * 设置共鸣。
 *
 * 共鸣只有「有」与「没有」两种状态，所以不存计数器 ——
 * 数量从事实表现算，连点两次也只算一次，不可能有负数或漂移。
 */
export async function setPublicMomentResonance(
  db: PrismaClient,
  input: {
    accountId?: number;
    momentId: number;
    deviceId: string;
    resonated: boolean;
  },
) {
  const owner = await publicBlogOwner(db, input.accountId);
  const moment = await findPublicMoment(db, owner, input.momentId);
  if (!isMomentDeviceId(input.deviceId))
    throw new TRPCError({ code: "BAD_REQUEST", message: "访客标识无效" });
  const key = {
    accountId: owner,
    noteId: moment.id,
    deviceId: input.deviceId,
  };
  if (input.resonated) {
    await db.blogMomentResonance.upsert({
      where: { accountId_noteId_deviceId: key },
      create: key,
      update: {},
    });
  } else {
    await db.blogMomentResonance.deleteMany({ where: key });
  }
  const count = await db.blogMomentResonance.count({
    where: { noteId: moment.id },
  });
  return { resonance: count, resonated: input.resonated };
}

/* -------------------------------------------------------------------------- */
/* 动态 RSS                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * 动态的 RSS。
 *
 * 与文章的 feed 分开：动态是短内容，订阅它的人要的是「近况」而不是长文。
 * item 的链接指向具体那一条的锚点。
 */
export async function momentsRSS(
  db: PrismaClient,
  origin: string,
  accountId?: number,
  basePath: string = "/blog",
) {
  const owner = await publicBlogOwner(db, accountId);
  const [profile, moments] = await Promise.all([
    db.blogProfile.findFirst({
      where: { accountId: owner, isPublished: true },
      select: { displayName: true, tagline: true },
    }),
    db.notes.findMany({
      where: publicMomentWhere(owner),
      orderBy: [{ momentPublishedAt: "desc" }, { id: "desc" }],
      take: 50,
      select: { id: true, content: true, momentPublishedAt: true },
    }),
  ]);
  const listPath = toPublicPath("/blog/moments", basePath);
  const feedPath = toPublicPath("/blog/moments/feed.xml", basePath);
  const base = origin.replace(/\/+$/, "");
  const items = moments
    .map((moment) => {
      const text = publicText(moment.content || "");
      const link = `${base}${listPath}#m${moment.id}`;
      const title = text.slice(0, 60) || "动态";
      return `<item><title>${xml(title)}</title><link>${xml(link)}</link><guid isPermaLink="false">${xml(link)}</guid><pubDate>${moment.momentPublishedAt!.toUTCString()}</pubDate><description>${xml(text.slice(0, 300))}</description></item>`;
    })
    .join("");
  const lastBuildDate = moments.length
    ? new Date(
        Math.max(...moments.map((m) => m.momentPublishedAt!.getTime())),
      ).toUTCString()
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><language>zh-CN</language><atom:link href="${xml(base + feedPath)}" rel="self" type="application/rss+xml"/><title>${xml(profile?.displayName || "Ink")} · 动态</title><link>${xml(base + listPath)}</link><description>${xml(profile?.tagline || "公开动态")}</description>${lastBuildDate ? `<lastBuildDate>${lastBuildDate}</lastBuildDate>` : ""}${items}</channel></rss>`;
}

/* -------------------------------------------------------------------------- */
/* 发布与撤回                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * 把一条闪念公开到动态流，或撤回它。
 *
 * 这是动态唯一的「写」入口 —— 后台不再有独立的动态编辑器：
 * 作者在闪念上操作，动态流读的就是这条闪念。
 *
 * 两条时间口径：
 *   · 首次公开时间（momentPublishedAt）定下后不再重置 —— 排序与月份按它算；
 *   · 撤回只是把 isMoment 关掉，内容一个字都不动，随时可以再公开。
 */
export async function setMomentPublished(
  db: PrismaClient,
  accountId: number,
  noteId: number,
  published: boolean,
) {
  const note = await db.notes.findFirst({
    where: { id: noteId, accountId },
    select: { id: true, content: true, momentPublishedAt: true, isRecycle: true },
  });
  if (!note)
    throw new TRPCError({ code: "NOT_FOUND", message: "笔记不存在或无权操作" });
  if (published) {
    if (note.isRecycle)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "请先从回收站恢复这条笔记",
      });
    // 空内容不发布：公开页上会出现一条什么都没有的动态。
    // 注意判的是正文，不是 momentPublishedAt ——
    // 后者是「从未公开过」，新写的闪念一开始就是空的。
    if (!note.content?.trim())
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "这条笔记还没有内容，发布前先写点什么。",
      });
  }
  return db.notes.update({
    where: { id: note.id },
    data: {
      isMoment: published,
      // 首次公开时间只定一次：撤回后再次公开，起点还是第一次公开那天。
      momentPublishedAt: published
        ? (note.momentPublishedAt ?? new Date())
        : note.momentPublishedAt,
    },
    select: {
      id: true,
      isMoment: true,
      momentPublishedAt: true,
      updatedAt: true,
    },
  });
}
