import { readBlogSiteSettings } from "./blogSiteSettings";
import { Prisma, PrismaClient } from "@prisma/client";
import { publicBlogOwner, sanitizeLinks } from "./blog";
import { publicPublicationDTO, publicPublicationWhere } from "./publication";
import { articleStats, noteViewCounts } from "./blogStats";
import { publicText } from "./publicText";
import { toPublicPath } from "../../shared/lib/blogSeo";
import { normalizeCoverFocus } from "../../shared/lib/blogCover";
import { normalizeTopicDisplayMode } from "../../shared/lib/blogTopicMode";
import {
  publicCoverTextDTO,
  readPublicCoverConfig,
} from "./blogCoverConfig";

// 再导出一次：既有调用方继续从 publicBlog 取，避免大面积改 import。
export { publicText };

/** 公开列表统一页长。首页、专题页、推荐流共用，页码数量才有一致的观感。 */
export const BLOG_PAGE_SIZE = 12;

/** 把页码规整到合法范围（1 起，最多 10000 页，防止 ?page=999999 拖垮查询）。 */
export function normalizePage(page?: number) {
  if (typeof page !== "number" || !Number.isFinite(page)) return 1;
  return Math.min(10000, Math.max(1, Math.floor(page)));
}


export const publicPostSelect = {
  id: true,
  publishId: true,
  publication: {
    // 这里必须用 select：Prisma 的 include 只认关系字段，coverFocus 是标量。
    select: {
      title: true,
      content: true,
      summary: true,
      type: true,
      revision: true,
      createdAt: true,
      updatedAt: true,
      publicTags: true,
      isFeatured: true,
      coverFocus: true,
      // 封面文字层配置：底图 + 短标题 + 排版，公开页要靠它画文字层。
      coverConfig: true,
      coverAttachment: { select: { id: true, path: true } },
    },
  },
  blogTopics: {
    where: { topic: { isPublished: true } },
    orderBy: { topic: { sortOrder: "asc" as const } },
    select: {
      topic: {
        select: {
          id: true,
          name: true,
          slug: true,
          color: true,
          // 展示方式：文章页据此决定用文档版式还是普通版式。
          displayMode: true,
        },
      },
    },
  },
} satisfies Prisma.notesSelect;
type PublicRow = Prisma.notesGetPayload<{ select: typeof publicPostSelect }>;

/** 专题封面候选：一篇文章 + 它挂在几个专题下。 */
type CoverNote = {
  note: {
    _count: { blogTopics: number };
    publication: { coverAttachment: { path: string } | null } | null;
  };
};

/**
 * 专题封面：优先用「只属于这一个专题」的文章 —— 代表性最强。
 * 一篇文章同时挂在多个专题时（种子数据里就有），如果直接取第一篇，
 * 两个专题会撞同一张封面，看起来像 bug。没有专属文章就退回第一篇。
 */
function pickTopicCover(notes: CoverNote[]): string | null {
  const cover = notes.find((n) => n.note._count.blogTopics === 1) ?? notes[0];
  return cover?.note.publication?.coverAttachment?.path ?? null;
}

/** 取某个专题的封面候选：只取有封面的公开文章，按作者编排顺序。 */
function topicCoverWhere(topicId?: number) {
  return {
    ...(topicId != null ? { topicId } : {}),
    note: {
      ...publicPublicationWhere,
      publication: { is: { coverAttachmentId: { not: null } } },
    },
  };
}
export function publicCard(note: PublicRow, views = 0) {
  const p = note.publication!;
  return {
    id: note.id,
    publishId: note.publishId!,
    title:
      p.title ||
      publicText(
        p.content
          .replace(/<\/(?:p|div|h[1-6])>/gi, "\n")
          .split(/\r?\n/)
          .find((line) => publicText(line)) || p.content,
      ).slice(0, 100) ||
      "无标题",
    // AI 摘要优先；没有就退回正文截断。
    excerpt: p.summary?.trim() || publicText(p.content).slice(0, 200),
    coverUrl: p.coverAttachment?.path ?? null,
    /*
     * 封面文字层配置：公开快照里的那份。
     * 老封面没有配置 → null → 公开页只显示图片，不叠字（避免重复加字）。
     */
    coverConfig: publicCoverTextDTO(readPublicCoverConfig(p.coverConfig)),
    /*
     * 封面在各展示位的裁切位置：一张源图，三个展示位各调各的。
     * sourceId 对不上当前封面（换过源图）就当没调过，回到居中。
     */
    coverFocus: (() => {
      const focus = normalizeCoverFocus(p.coverFocus);
      if (!focus || focus.sourceId !== (p.coverAttachment?.id ?? null))
        return null;
      return focus.placements;
    })(),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    topics: note.blogTopics.map((t) => t.topic),
    // 公开标签快照：只来自 notePublication.publicTags。
    // 私有笔记标签（tag / tagsToNote）永远不外泄，这里也不读。
    publicTags: p.publicTags ?? [],
    // 作者手动置顶：推荐流里排在普通文章之前。公开站据此挂「置顶」角标 ——
    // 读者不该只靠「它怎么排第一」来猜这是作者有意为之。
    isFeatured: !!p.isFeatured,
    // 阅读数（点击数）：去重窗口内同一设备只记一次。
    views,
  };
}
export type PostCursor = { updatedAt: Date; id: number };
/** 热门榜的时间窗：当日 / 最近一个月 / 最近一年。 */
export type HotRange = "day" | "month" | "year";
const HOT_RANGE_DAYS: Record<HotRange, number> = { day: 1, month: 30, year: 365 };
/** 时间窗起点。undefined = 不限时间（用累计阅读数排）。 */
function hotWindowStart(range?: HotRange) {
  if (!range) return null;
  const days = HOT_RANGE_DAYS[range];
  if (!days) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
/**
 * 热门排序：按窗口内的有效点击数排，同热度按累计阅读数、发布时间兜底。
 *
 * 热度数据在 blogPageView（原始事实）和 blogPostStat（累计计数）里，
 * 而没有统计行的文章在这两张表里根本不存在 ——
 * Prisma 的 orderBy 对这种关系只能内连接，没统计的文章会被直接丢掉。
 * 所以这里先用一条原始 SQL 拿到有序的 id，再按 id 取正文，两步各司其职。
 */
async function hotNoteIds(
  db: PrismaClient,
  accountId: number,
  limit: number,
  offset: number,
  range?: HotRange,
) {
  const since = hotWindowStart(range);
  return db.$queryRaw<{ id: number; hits: number; total: number }[]>`
    SELECT n."id", COALESCE(v."hits", 0)::int AS "hits",
           COUNT(*) OVER()::int AS "total"
    FROM notes n
    JOIN "notePublication" p ON p."noteId" = n."id"
    LEFT JOIN "blogPostStat" s ON s."noteId" = n."id"
    LEFT JOIN (
      SELECT "noteId", COUNT(*)::int AS "hits"
      FROM "blogPageView"
      WHERE "accountId" = ${accountId}
        AND "createdAt" >= ${since ?? new Date(0)}
      GROUP BY "noteId"
    ) v ON v."noteId" = n."id"
    WHERE n."accountId" = ${accountId}
      AND n."isPublished" = true
      AND n."isRecycle" = false
      ${since ? Prisma.sql`AND v."hits" > 0` : Prisma.empty}
    ORDER BY ${
      since
        ? Prisma.sql`COALESCE(v."hits", 0) DESC, COALESCE(s."views", 0) DESC, p."updatedAt" DESC, n."id" DESC`
        : Prisma.sql`COALESCE(s."views", 0) DESC, COALESCE(s."readers", 0) DESC, p."updatedAt" DESC, n."id" DESC`
    }
    LIMIT ${limit + 1} OFFSET ${offset}
  `;
}
export async function publicPosts(
  db: PrismaClient,
  input: {
    accountId?: number;
    topicSlug?: string;
    search?: string;
    limit?: number;
    cursor?: PostCursor;
    /** 偏移量分页：给「?page=N」这种可分享的页码用。 */
    offset?: number;
    /** 排序方式：latest 时间序（默认）/ hot 按热度。 */
    sort?: "latest" | "hot";
    /** 热门榜的时间窗。 */
    range?: HotRange;
    /** 只看某一年发布的文章（按年归档用）。 */
    year?: number;
  } = {},
) {
  const accountId = await publicBlogOwner(db, input.accountId);
  const search = input.search?.trim();
  const limit = Math.min(200, Math.max(1, input.limit ?? BLOG_PAGE_SIZE));
  const offset = Math.max(0, Math.min(10000, input.offset ?? 0));
  // 按年归档用「发布快照的更新时间」对齐卡片上显示的日期。
  const yearStart = input.year ? new Date(input.year, 0, 1) : null;
  const yearEnd = input.year ? new Date(input.year + 1, 0, 1) : null;
  const where: Prisma.notesWhereInput = {
    ...publicPublicationWhere,
    accountId,
    ...(input.topicSlug && {
      blogTopics: {
        some: {
          topic: { accountId, slug: input.topicSlug, isPublished: true },
        },
      },
    }),
    ...((yearStart || search) && {
      publication: {
        is: {
          ...(yearStart && yearEnd && { updatedAt: { gte: yearStart, lt: yearEnd } }),
          ...(search && {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { content: { contains: search, mode: "insensitive" } },
            ],
          }),
        },
      },
    }),
  };
  const pageWhere: Prisma.notesWhereInput = {
    AND: [
      where,
      ...(input.cursor
        ? [
            {
              OR: [
                {
                  publication: {
                    is: { updatedAt: { lt: input.cursor.updatedAt } },
                  },
                },
                {
                  publication: { is: { updatedAt: input.cursor.updatedAt } },
                  id: { lt: input.cursor.id },
                },
              ],
            },
          ]
        : []),
    ],
  };
  const total = await db.notes.count({ where });
  // 热门排序：先拿有序 id，再按 id 取正文。
  if (input.sort === "hot") {
    const hot = await hotNoteIds(db, accountId, limit, offset, input.range);
    const ids = hot.map((r) => r.id);
    const rows = ids.length
      ? await db.notes.findMany({
          where: { id: { in: ids } },
          select: publicPostSelect,
        })
      : [];
    const byId = new Map(rows.map((row) => [row.id, row]));
    const page = ids
      .slice(0, limit)
      .map((id) => byId.get(id))
      .filter((row): row is PublicRow => !!row);
    // 带时间窗时，卡片上显示的就是这段时间的点击数 ——
    // 「最近一个月最热」配一个累计阅读数会让人对不上账。
    const windowHits = new Map(hot.map((r) => [r.id, r.hits]));
    const views = await noteViewCounts(
      db,
      page.map((n) => n.id),
    );
    return {
      posts: page.map((n) =>
        publicCard(
          n,
          input.range ? windowHits.get(n.id) ?? 0 : views.get(n.id) ?? 0,
        ),
      ),
      total: hot[0]?.total ?? 0,
      // 热度顺序没有稳定的游标，翻页一律走偏移量。
      nextCursor: null,
    };
  }
  const [rows] = await Promise.all([
    db.notes.findMany({
      where: pageWhere,
      select: publicPostSelect,
      orderBy: [{ publication: { updatedAt: "desc" } }, { id: "desc" }],
      take: limit + 1,
      // 偏移量分页和游标分页互斥：给了 offset 就按页码翻。
      skip: input.cursor ? undefined : offset,
    }),
  ]);
  const page = rows.slice(0, limit),
    last = page[page.length - 1];
  const views = await noteViewCounts(
    db,
    page.map((n) => n.id),
  );
  return {
    posts: page.map((n) => publicCard(n, views.get(n.id) ?? 0)),
    total,
    nextCursor:
      rows.length > limit && last
        ? { updatedAt: last.publication!.updatedAt, id: last.id }
        : null,
  };
}
export async function publicTopics(db: PrismaClient, accountId?: number) {
  const owner = await publicBlogOwner(db, accountId);
  const rows = await db.blogTopic.findMany({
    where: { accountId: owner, isPublished: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      desc: true,
      color: true,
      displayMode: true,
      // 作者自选的专题封面：有就用它，没有才从成员文章里推导。
      cover: { select: { path: true } },
      _count: {
        select: { notes: { where: { note: publicPublicationWhere } } },
      },
      notes: {
        where: topicCoverWhere(),
        orderBy: [{ sortOrder: "asc" }, { noteId: "asc" }],
        // 多取几篇：用来跳过「同时属于多个专题」的文章，否则两个专题会撞同一张封面。
        take: 5,
        select: {
          note: {
            select: {
              _count: { select: { blogTopics: true } },
              publication: {
                select: { coverAttachment: { select: { path: true } } },
              },
            },
          },
        },
      },
    },
  });
  return rows
    .filter((t) => t._count.notes > 0)
    .map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      desc: t.desc,
      color: t.color,
      // 展示方式：专题索引页据此给文档模式专题加一个低调的标识。
      displayMode: normalizeTopicDisplayMode(t.displayMode),
      count: t._count.notes,
      coverUrl: t.cover?.path ?? pickTopicCover(t.notes),
    }));
}
/**
 * 站点名称：取工作区「站点名称」设置（config.customTitle，默认 "Ink"）。
 * 公开博客的品牌、og:site_name、页脚版权都跟它走，站点改名不用改代码。
 * 直接读 config 表而不引 routerTrpc/config —— 免得 lib → routerTrpc 形成循环依赖。
 */
export async function publicSiteName(db: PrismaClient): Promise<string> {
  try {
    const row = await db.config.findFirst({
      where: { key: "customTitle", userId: null },
      select: { config: true },
    });
    const value = (row?.config as { value?: unknown } | null)?.value;
    const name = typeof value === "string" ? value.trim() : "";
    return name || "Ink";
  } catch {
    return "Ink";
  }
}

/**
 * 首页 banner 候选：只取作者勾了「加入推荐页 banner」的文章。
 *
 * 不用最新文章补齐 —— 补齐会让这个开关形同虚设（勾了没勾看起来一样）。
 * 排序用 bannerOrder：作者能自己决定哪一张排在最前，
 * 与「推荐置顶」的位置（featuredOrder）互不影响。
 */
export async function bannerPosts(
  db: PrismaClient,
  accountId: number,
  limit: number,
) {
  const rows = await db.notes.findMany({
    where: {
      ...publicPublicationWhere,
      accountId,
      publication: { isBanner: true },
    },
    orderBy: [{ publication: { bannerOrder: "asc" } }, { id: "asc" }],
    take: limit,
    select: publicPostSelect,
  });
  const counts = await noteViewCounts(db, rows.map((p) => p.id));
  return rows.map((row) => publicCard(row, counts.get(row.id) || 0));
}

/**
 * 推荐置顶池：作者标了「推荐置顶」的文章，按 featuredOrder 排。
 *
 * 与 banner 是两个互不替代的开关：置顶只影响首页「推荐」流的排序，
 * 不影响「全部文章」与专题内的编排顺序。
 */
export async function featuredPosts(
  db: PrismaClient,
  accountId: number,
  limit: number,
) {
  const rows = await db.notes.findMany({
    where: {
      ...publicPublicationWhere,
      accountId,
      publication: { isFeatured: true },
    },
    orderBy: [{ publication: { featuredOrder: "asc" } }, { id: "asc" }],
    take: limit,
    select: publicPostSelect,
  });
  const counts = await noteViewCounts(db, rows.map((p) => p.id));
  return rows.map((row) => publicCard(row, counts.get(row.id) || 0));
}

/**
 * 年份归档：公开文章分布在哪些年份，各有几篇。
 *
 * 年份按「发布快照的更新时间」算 —— 卡片上显示的就是这个日期，
 * 两处口径必须一致，否则年份标签和列表里的文章会对不上。
 */
export async function publicYears(db: PrismaClient, accountId: number) {
  const rows = await db.$queryRaw<{ year: number; count: number }[]>`
    SELECT EXTRACT(YEAR FROM p."updatedAt")::int AS year, COUNT(*)::int AS count
    FROM notes n
    JOIN "notePublication" p ON p."noteId" = n."id"
    WHERE n."accountId" = ${accountId}
      AND n."isPublished" = true
      AND n."isRecycle" = false
    GROUP BY year
    ORDER BY year DESC
  `;
  return rows.map((row) => ({ year: row.year, count: row.count }));
}
/**
 * 随机抽一篇公开文章（「随便看看」）。
 *
 * 均匀随机：先数总数再随机取偏移，避免把全表拉进内存。
 * 只在公开快照里取 —— 未发布的、回收站里的都不会被抽到。
 */
export async function publicRandomArticle(
  db: PrismaClient,
  input: { accountId?: number } = {},
) {
  const owner = await publicBlogOwner(db, input.accountId);
  const total = await db.notes.count({
    where: { ...publicPublicationWhere, accountId: owner },
  });
  if (!total) return null;
  const offset = Math.floor(Math.random() * total);
  const row = await db.notes.findFirst({
    where: { ...publicPublicationWhere, accountId: owner },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    skip: offset,
    take: 1,
    select: { publishId: true },
  });
  if (!row?.publishId) return null;
  return { publishId: row.publishId };
}

export async function publicIndex(
  db: PrismaClient,
  input: { accountId?: number; page?: number; pageSize?: number } = {},
) {
  const owner = await publicBlogOwner(db, input.accountId);
  const pageSize = Math.min(40, Math.max(1, input.pageSize ?? BLOG_PAGE_SIZE));
  const requested = normalizePage(input.page);
  // 先数总数再收敛页码：?page=999 不该拿到一个空列表，得回落到最后一页。
  const total = await db.notes.count({
    where: { ...publicPublicationWhere, accountId: owner },
  });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requested, pageCount);
  const [profile, topics, feed, banner, featured, recent, siteName, settings, years] =
    await Promise.all([
      db.blogProfile.findFirst({
        where: { accountId: owner, isPublished: true },
      }),
      publicTopics(db, owner),
      publicPosts(db, {
        accountId: owner,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      // banner 池：只取勾了「加入推荐页 banner」的文章，最多 3 条。
      // 前端只在「推荐」tab 且没有专题筛选时渲染它。
      bannerPosts(db, owner, 3),
      // 置顶池：标了「推荐置顶」的文章，给推荐流排序用。
      featuredPosts(db, owner, 5),
      // 侧栏「最近更新」：纯时间序，和精选是两回事。
      publicPosts(db, { accountId: owner, limit: 5 }),
      publicSiteName(db),
      readBlogSiteSettings(db, owner),
      // 年份归档：公开文章按发布年份分组，给「全部文章」tab 的年份筛选用。
      publicYears(db, owner),
    ]);
  return {
    profile: profile
      ? {
          displayName: profile.displayName,
          tagline: profile.tagline,
          bio: profile.bio,
          signature: profile.signature,
          avatarUrl: profile.avatarUrl,
          homepage: profile.homepage,
          links: sanitizeLinks(profile.links),
        }
      : null,
    topics,
    siteName: settings.configured && settings.data.siteName ? settings.data.siteName : siteName,
    publicSettings: {
      siteName: settings.data.siteName,
      tagline: settings.data.tagline,
      iconUrl: settings.data.iconUrl,
      gaId: settings.data.gaEnabled ? settings.data.gaId : "",
      baiduId: settings.data.baiduEnabled ? settings.data.baiduId : "",
      excludeOwner: settings.data.excludeOwner,
      targetOrigin: settings.data.targetOrigin,
      friendApplyNote: settings.data.friendApplyNote,
      showPublicStats: settings.data.showPublicStats,
      // 站点时区：页脚推广位的起止日期按它判定，不按服务器所在时区。
      timezone: settings.data.timezone,
      // 页脚信息（备案、版权、推广位）——都是本来就要公开给访客看的内容。
      footer: settings.data.footer,
    },
    ...feed,
    // banner 池：推荐页顶部那几篇（只有勾了 banner 的文章才在里面）。
    banner,
    // 置顶池：标了「推荐置顶」的文章，推荐流里排在普通结果之前。
    featured: featured,
    // 最近更新（侧栏用，纯时间序）
    recent: recent.posts,
    // 年份归档：哪些年份有公开文章，各有几篇。
    years,
    // 分页信息：URL 用 ?page=N；页码越界时收敛回最后一页
    page,
    pageSize,
    pageCount,
    hasPrev: page > 1,
    hasNext: page < pageCount,
  };
}
export async function publicTopic(
  db: PrismaClient,
  input: {
    accountId?: number;
    slug: string;
    page?: number;
    pageSize?: number;
    offset?: number;
    limit?: number;
  },
) {
  const accountId = await publicBlogOwner(db, input.accountId),
    pageSize = Math.min(
      40,
      Math.max(1, input.pageSize ?? input.limit ?? BLOG_PAGE_SIZE),
    ),
    page = normalizePage(input.page),
    // 兼容旧的 offset 调用：没给 page 时按 offset 推算页码
    offset = input.offset !== undefined ? input.offset : (page - 1) * pageSize;
  const topic = await db.blogTopic.findFirst({
    where: { accountId, slug: input.slug, isPublished: true },
    select: {
      id: true,
      name: true,
      slug: true,
      desc: true,
      color: true,
      displayMode: true,
      cover: { select: { path: true } },
    },
  });
  if (!topic) return null;
  const where = { topicId: topic.id, note: publicPublicationWhere };
  const [rows, total, coverRows, sectionRows, memberRows] = await Promise.all([
    db.blogTopicNote.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { noteId: "asc" }],
      skip: offset,
      take: pageSize,
      select: { note: { select: publicPostSelect } },
    }),
    db.blogTopicNote.count({ where }),
    // 专题封面：跟专题列表页同一套规则，避免两处显示不同的图。
    db.blogTopicNote.findMany({
      where: topicCoverWhere(topic.id),
      orderBy: [{ sortOrder: "asc" }, { noteId: "asc" }],
      take: 5,
      select: {
        note: {
          select: {
            _count: { select: { blogTopics: true } },
            publication: {
              select: { coverAttachment: { select: { path: true } } },
            },
          },
        },
      },
    }),
    // 章节：专题内部的编排，顺序即作者拖出来的顺序。
    db.blogTopicSection.findMany({
      where: { topicId: topic.id },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, name: true, desc: true, showTitle: true },
    }),
    // 章节目录要全量：目录是「这张专题的地图」，不受列表分页裁剪。
    // 过滤显式带 publicPublicationWhere —— 撤回/未公开的文章不进目录。
    db.blogTopicNote.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { noteId: "asc" }],
      select: {
        noteId: true,
        sectionId: true,
        note: { select: publicPostSelect },
      },
    }),
  ]);
  if (!total) return null;
  const [views, memberViews] = await Promise.all([
    noteViewCounts(
      db,
      rows.map((r) => r.note.id),
    ),
    noteViewCounts(
      db,
      memberRows.map((r) => r.note.id),
    ),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // 章内成员：noteId / sectionId / 卡片 三件套。
  // sortOrder 已经是「章节顺序 → 章内顺序 → 未分章节」的全局顺序，
  // 所以按它切出来的章节顺序 = 作者编排的阅读顺序。
  const members = memberRows.map((m) => ({
    noteId: m.noteId,
    sectionId: m.sectionId,
    card: publicCard(m.note, memberViews.get(m.note.id) ?? 0),
  }));
  const sections = sectionRows.map((section) => {
    // 只收已发布的成员：未公开文章的 noteId 也不外泄。
    const posts = members
      .filter((m) => m.sectionId === section.id)
      .map((m) => m.card);
    return {
      id: section.id,
      name: section.name,
      desc: section.desc,
      showTitle: section.showTitle,
      noteIds: posts.map((p) => p.id),
      posts,
    };
  });
  const unassigned = {
    posts: members.filter((m) => m.sectionId === null).map((m) => m.card),
  };
  return {
    topic: {
      ...topic,
      displayMode: normalizeTopicDisplayMode(topic.displayMode),
    },
    coverUrl: topic.cover?.path ?? pickTopicCover(coverRows),
    posts: rows.map((r) => publicCard(r.note, views.get(r.note.id) ?? 0)),
    // 章节目录：专题 → 章节 → 文章 三层。
    sections,
    // 未分章节的已发布文章。
    unassigned,
    total,
    nextOffset: offset + rows.length < total ? offset + rows.length : null,
    // 分页信息：跟首页同一套 ?page=N 语义
    page: Math.min(page, pageCount),
    pageSize,
    pageCount,
    hasPrev: page > 1 && page <= pageCount,
    hasNext: page < pageCount,
  };
}
/**
 * 文档模式的专题目录。
 *
 * 与 publicTopic 的区别只有两点：
 *   1. 不分页 —— 目录是「这张专题的地图」，要全量；
 *   2. 不带正文 —— 只返回标题与 publishId，左栏目录不该拖着几十篇正文走。
 *
 * 排序口径和 publicArticle 的前后篇完全一致：blogTopicNote.sortOrder 本身就是
 * 「章节顺序 → 章内顺序 → 未分章节」的全局阅读顺序（见 saveTopicArrangement），
 * 所以目录、篇数、上一篇／下一篇用的是同一份结果，不会各排各的。
 *
 * 公开边界：成员一律过 publicPublicationWhere —— 私有、未发布、撤回、删除的
 * 文章既不进目录，也不会成为别人的上一篇／下一篇。
 */
export async function publicTopicDoc(
  db: PrismaClient,
  input: { accountId?: number; slug: string },
) {
  const accountId = await publicBlogOwner(db, input.accountId);
  const topic = await db.blogTopic.findFirst({
    where: { accountId, slug: input.slug, isPublished: true },
    select: {
      id: true,
      name: true,
      slug: true,
      desc: true,
      color: true,
      displayMode: true,
      defaultNoteId: true,
      cover: { select: { path: true } },
    },
  });
  if (!topic) return null;
  const [sectionRows, memberRows] = await Promise.all([
    db.blogTopicSection.findMany({
      where: { topicId: topic.id },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, name: true, desc: true, showTitle: true },
    }),
    // 目录只取「标题 + 地址」，不取正文：正文只在真正打开文章时才拉。
    db.blogTopicNote.findMany({
      where: { topicId: topic.id, note: publicPublicationWhere },
      orderBy: [{ sortOrder: "asc" }, { noteId: "asc" }],
      select: {
        noteId: true,
        sectionId: true,
        note: {
          select: {
            id: true,
            publishId: true,
            publication: { select: { title: true } },
          },
        },
      },
    }),
  ]);
  const entries = memberRows
    .filter((m) => !!m.note.publishId)
    .map((m) => ({
      id: m.note.id,
      publishId: m.note.publishId as string,
      title: (m.note.publication?.title || "").trim() || "未命名文章",
      sectionId: m.sectionId,
    }));
  const sections = sectionRows
    .map((section) => ({
      id: section.id,
      name: section.name,
      desc: section.desc,
      showTitle: section.showTitle,
      posts: entries.filter((e) => e.sectionId === section.id),
    }))
    // 没有公开文章的章节在前台隐藏（后台仍然看得到，避免作者以为章节丢了）。
    .filter((section) => section.posts.length > 0);
  const unassigned = {
    posts: entries.filter((e) => e.sectionId === null),
  };
  // 「开始阅读」= 编排中的第一篇有效公开文章。
  const first = sections.find((s) => s.posts.length > 0)?.posts[0] ?? unassigned.posts[0] ?? null;
  /**
   * 默认打开的文章。
   *
   * 作者指定的那篇优先 —— 但它必须还在这个专题里、且公开可访问。
   * entries 已经按公开边界过滤过，所以「还能在里面找到」本身就是有效性校验：
   * 文章被撤回、移出专题或删除之后，这里会自动退回编排中的第一篇。
   */
  const configured = topic.defaultNoteId
    ? (entries.find((e) => e.id === topic.defaultNoteId) ?? null)
    : null;
  const defaultPost = configured ?? first;
  return {
    topic: {
      id: topic.id,
      name: topic.name,
      slug: topic.slug,
      desc: topic.desc,
      color: topic.color,
      displayMode: normalizeTopicDisplayMode(topic.displayMode),
      coverUrl: topic.cover?.path ?? null,
    },
    sections,
    unassigned,
    // 篇数：章节 + 未分章节，一篇文章在当前专题里只算一次。
    total: entries.length,
    sectionCount: sections.length,
    firstPublishId: first?.publishId ?? null,
    // 默认打开的文章：已解析好的最终结果（指定的那篇，或编排中的第一篇）。
    defaultPublishId: defaultPost?.publishId ?? null,
    // 作者到底有没有指定：false = 走的是「自动选第一篇」的兜底。
    defaultConfigured: !!configured,
  };
}

export async function publicArticle(
  db: PrismaClient,
  input: { accountId?: number; publishId: string; topicSlug?: string },
) {
  const accountId = await publicBlogOwner(db, input.accountId);
  const note = await db.notes.findFirst({
    where: { ...publicPublicationWhere, accountId, publishId: input.publishId },
    select: publicPostSelect,
  });
  if (!note) return null;
  const base = publicPublicationDTO(note)!;
  const topics = note.blogTopics.map((t) => t.topic);
  /**
   * 明确的专题上下文 = URL 里带的那个专题，而且文章确实属于它。
   *
   * 对不上时（URL 写了个别的专题 slug）不能拿「文章的第一个专题」顶替 ——
   * 那等于凭猜测把读者塞进一个专题的版式里。
   */
  const explicit = input.topicSlug
    ? topics.find((t) => t.slug === input.topicSlug)
    : undefined;
  const primary = explicit ?? topics[0];
  let prevRow: PublicRow | null = null,
    nextRow: PublicRow | null = null;
  if (primary) {
    const link = await db.blogTopicNote.findUnique({
      where: { topicId_noteId: { topicId: primary.id, noteId: note.id } },
    });
    if (link) {
      /**
       * 前后篇口径（有专题上下文时）：
       * blogTopicNote.sortOrder 已经是「章节顺序 → 章内顺序 → 未分章节」的
       * 全局阅读顺序（见 saveTopicArrangement），所以按 sortOrder 取邻
       * 天然就是「按章节顺序 + 章内文章顺序」衔接，不需要额外的章节参数。
       *
       * common 里带 publicPublicationWhere：撤回/未公开的文章既不进目录，
       * 也不会成为别人的前一篇或后一篇。
       */
      const common = { topicId: primary.id, note: publicPublicationWhere };
      const [before, after] = await Promise.all([
        db.blogTopicNote.findFirst({
          where: {
            ...common,
            OR: [
              { sortOrder: { lt: link.sortOrder } },
              { sortOrder: link.sortOrder, noteId: { lt: note.id } },
            ],
          },
          orderBy: [{ sortOrder: "desc" }, { noteId: "desc" }],
          select: { note: { select: publicPostSelect } },
        }),
        db.blogTopicNote.findFirst({
          where: {
            ...common,
            OR: [
              { sortOrder: { gt: link.sortOrder } },
              { sortOrder: link.sortOrder, noteId: { gt: note.id } },
            ],
          },
          orderBy: [{ sortOrder: "asc" }, { noteId: "asc" }],
          select: { note: { select: publicPostSelect } },
        }),
      ]);
      prevRow = before ? before.note : null;
      nextRow = after ? after.note : null;
    }
  } else {
    /**
     * 前后篇口径（没有专题上下文时）：按 publication.createdAt 取邻。
     * 全站列表是「最新在前」，所以这里的「上一篇」是更新的那篇 ——
     * 与有专题时（编排顺序在前，「上一篇」是更早的那篇）方向相反，
     * 两者都跟各自列表的排列方向一致。
     */
    const at = note.publication!.createdAt;
    const [before, after] = await Promise.all([
      db.notes.findFirst({
        where: {
          ...publicPublicationWhere,
          accountId,
          OR: [
            { publication: { is: { createdAt: { gt: at } } } },
            { publication: { is: { createdAt: at } }, id: { gt: note.id } },
          ],
        },
        orderBy: [{ publication: { createdAt: "asc" } }, { id: "asc" }],
        select: publicPostSelect,
      }),
      db.notes.findFirst({
        where: {
          ...publicPublicationWhere,
          accountId,
          OR: [
            { publication: { is: { createdAt: { lt: at } } } },
            { publication: { is: { createdAt: at } }, id: { lt: note.id } },
          ],
        },
        orderBy: [{ publication: { createdAt: "desc" } }, { id: "desc" }],
        select: publicPostSelect,
      }),
    ]);
    prevRow = before;
    nextRow = after;
  }
  const related = await db.notes.findMany({
    where: {
      ...publicPublicationWhere,
      accountId,
      id: {
        notIn: [
          note.id,
          ...(prevRow ? [prevRow.id] : []),
          ...(nextRow ? [nextRow.id] : []),
        ],
      },
      ...(primary && { blogTopics: { some: { topicId: primary.id } } }),
    },
    select: publicPostSelect,
    take: 3,
    orderBy: [{ publication: { updatedAt: "desc" } }, { id: "desc" }],
  });
  // 这篇自己的点击数/读者数，外加周边文章的点击数。
  const [stats, views] = await Promise.all([
    articleStats(db, note.id),
    noteViewCounts(db, [
      ...(prevRow ? [prevRow.id] : []),
      ...(nextRow ? [nextRow.id] : []),
      ...related.map((r) => r.id),
    ]),
  ]);
  const withViews = (n: PublicRow) => publicCard(n, views.get(n.id) ?? 0);
  return {
    ...base,
    title: publicCard(note).title,
    excerpt:
      note.publication!.summary?.trim() ||
      publicText(note.publication!.content).slice(0, 180),
    coverUrl: note.publication!.coverAttachment?.path ?? null,
    // 文章页也要画文字层，用的还是公开快照里那份配置。
    coverConfig: publicCoverTextDTO(
      readPublicCoverConfig(note.publication!.coverConfig),
    ),
    // 裁切位置：换过底图就当没调过，回到居中。
    coverFocus: (() => {
      const focus = normalizeCoverFocus(note.publication!.coverFocus);
      if (!focus || focus.sourceId !== (note.publication!.coverAttachment?.id ?? null))
        return null;
      return focus.placements;
    })(),
    topics,
    primaryTopic: primary ?? null,
    /**
     * 当前上下文的展示方式。
     *
     * 只有「带着专题上下文进来、且那个专题是文档模式」时才为 "doc" ——
     * 从全站列表直接打开、或专题对不上，都不该被硬套进某个专题的版式。
     */
    topicMode:
      explicit && normalizeTopicDisplayMode(explicit.displayMode) === "doc"
        ? "doc"
        : null,
    // 公开标签快照：只来自 notePublication.publicTags，私有标签不外泄。
    publicTags: note.publication!.publicTags ?? [],
    // views = 点击数，readers = 去重设备数（读者数）
    stats,
    prev: prevRow ? withViews(prevRow) : null,
    next: nextRow ? withViews(nextRow) : null,
    related: related.map(withViews),
  };
}
export function blogRSS(
  site: Awaited<ReturnType<typeof publicIndex>>,
  base: string,
  /** 公开站的基础路径（公开域名下博客挂载的位置），默认还是应用内部的 /blog。 */
  basePath: string = "/blog",
) {
  const xml = (v: string) =>
    v
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><language>zh-CN</language><atom:link href="${xml(base + toPublicPath("/blog/feed.xml", basePath))}" rel="self" type="application/rss+xml"/><title>${xml(site.profile?.displayName || "Ink")}</title><link>${xml(base + toPublicPath("/blog", basePath))}</link><description>${xml(site.profile?.tagline || "最新公开文章")}</description>${site.posts.length ? `<lastBuildDate>${new Date(Math.max(...site.posts.map((p) => p.updatedAt.getTime()))).toUTCString()}</lastBuildDate>` : ""}${site.posts.map((p) => `<item><title>${xml(p.title)}</title><link>${xml(base + toPublicPath("/blog/" + p.publishId, basePath))}</link><guid>${xml(base + toPublicPath("/blog/" + p.publishId, basePath))}</guid><pubDate>${p.createdAt.toUTCString()}</pubDate><description>${xml(p.excerpt)}</description></item>`).join("")}</channel></rss>`;
}
