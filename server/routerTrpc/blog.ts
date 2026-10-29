import { analyticsAudience, analyticsTopics } from "../lib/blogAudienceAnalytics";
import { generateTopicCover } from '../lib/blogTopicCover';
import { readPublishSettings, savePublishSettings, savePublishSettingsSchema } from "../lib/blogPublishSettings";
import { blogSiteSettingsSchema, articleSeoSchema, readArticleSeo } from "../../shared/lib/blogSiteSettings";
import { readBlogSiteSettings, saveBlogSiteSettings, readTopicSeo, saveTopicSeo } from "../lib/blogSiteSettings";
import {
  recommendationFeed,
  recordRecommendationEvent,
} from "../lib/blogRecommendations";
import {
  coverGenerationOptions,
  generateBlogCover,
  applyCoverToDraft,
  exportCoverImage,
} from "../lib/blogCoverGeneration";
import { readCoverState, saveDraftCoverText } from "../lib/blogCoverConfig";
import { readAiCopyState } from "../lib/blogAiCandidates";
import { resolveBlogSEO, publicOrigin } from "../lib/publicBlogSEO";
import {
  previewArticleSeo,
  previewTopicSeo,
  previewPageSeo,
} from "../lib/blogSeoPreview";
import {
  readPageSeo,
  savePageSeo,
} from "../lib/blogSiteSettings";
import { runSiteChecks, siteCheckRateLimited } from "../lib/blogSiteCheck";
import { BLOG_FIXED_PAGES } from "../../shared/lib/blogSeo";
import { Prisma } from "@prisma/client";
import {
  DISTRIBUTION_MODES,
  getDistribution,
  saveDistribution,
} from "../lib/blogDistribution";
import {
  publicIndex,
  publicPosts,
  publicTopic,
  publicTopicDoc,
  publicArticle,
  publicTopics,
  publicRandomArticle,
  BLOG_PAGE_SIZE,
} from "../lib/publicBlog";
import { normalizeCoverFocus } from "@shared/lib/blogCover";
import {
  TOPIC_DISPLAY_MODES,
  normalizeTopicDisplayMode,
} from "@shared/lib/blogTopicMode";
import {
  friendApplySchema,
  friendEditSchema,
  friendFeedbackSchema,
  FRIEND_STATUSES,
  FRIEND_FEEDBACK_STATUSES,
} from "@shared/lib/blogFriends";
import {
  publicFriendLinks,
  applyFriendLink,
  submitFriendFeedback,
  listFriendLinks,
  updateFriendLink,
  reviewFriendLink,
  setFriendLinkHidden,
  reorderFriendLinks,
  resendFriendLinkMail,
  listFriendFeedback,
  resolveFriendFeedback,
  friendApplyRateLimited,
  friendFeedbackRateLimited,
} from "../lib/blogFriends";
import { MAIL_NOT_CONFIGURED_MESSAGE, sendBlogMail } from "../lib/blogMail";
import {
  readBlogMailSettings,
  saveBlogMailSettings,
  resolveBlogMailConfig,
} from "../lib/blogMailSettings";
import { blogMailSettingsView } from "@shared/lib/blogMailSettings";
import {
  reactionInputSchema,
  feedbackInputSchema,
  momentFeedbackInputSchema,
  feedbackReplySchema,
  FEEDBACK_STATUSES,
} from "@shared/lib/blogInteraction";
import {
  publicReactionState,
  setPublicReaction,
  submitArticleFeedback,
  listArticleFeedbacks,
  replyArticleFeedback,
  resendArticleFeedbackMail,
  archiveArticleFeedback,
  reactionRateLimited,
  feedbackRateLimited,
} from "../lib/blogInteraction";
import { router, authProcedure, publicProcedure } from "@server/middleware";
import { prisma } from "@server/prisma";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getBlogProfile,
  upsertBlogProfile,
  listBlogTopics,
  createBlogTopic,
  updateBlogTopic,
  deleteBlogTopic,
  reorderBlogTopics,
  assignTopicNotes,
  setPublicationCover,
  listPublishedForManage,
  sanitizeLinks,
  saveBlogTopic,
  attachBlogCover,
  publicBlogOwner,
  saveNoteCopy,
  setPublicationBanner,
  bulkPublishAction,
  setBlogDraftFlag,
} from "../lib/blog";
import {
  listTopicSections,
  saveTopicArrangement,
  deleteTopicSection,
  reorderTopicSections,
  setArticleTopicSection,
  removeArticleTopic,
} from "../lib/blogSections";
import { listPublicTagPool } from "../lib/blogPublicTags";
import { generateBlogCopy, generateBlogCopyGroup } from "../lib/blogAiCopy";
import { publicPublicationDTO } from "../lib/publication";
import {
  buildPublishCheck,
  resolveSourceChange,
} from "../lib/blogPublishCheck";
import { siteStats, trackBlogView, blogEngagement } from "../lib/blogStats";
import { publicSiteStats } from "../lib/blogPublicStats";
import { publicStatsPage } from "../lib/blogStatsPage";
import { STATS_RANGES } from "../../shared/lib/blogStatsPage";
import { publicAbout } from "../lib/blogAbout";
import { publicSubscribe } from "../lib/blogSubscribe";
import {
  publicMoments,
  publicMomentMonths,
  publicMomentResonanceState,
  setPublicMomentResonance,
  setMomentPublished,
} from "../lib/blogMoments";
import {
  submitMomentFeedback,
  listMomentFeedbacks,
  replyMomentFeedback,
  resendMomentFeedbackMail,
  archiveMomentFeedback,
} from "../lib/blogMomentFeedback";
import {
  MOMENT_FILTERS,
  momentCursorSchema,
} from "@shared/lib/blogMoments";
import {
  analyticsOverview,
  analyticsArticles,
  analyticsArticleDetail,
  resolveAnalyticsRange,
  AnalyticsRangeError,
  ARTICLE_SORT_KEYS,
} from "../lib/blogAnalytics";
import {
  readTrackingStates,
  reportTrackingState,
  TRACKING_VENDORS,
} from "../lib/blogTrackingState";

const linkSchema = z.object({
  label: z.string().max(40),
  url: z.string().max(300),
});

/**
 * 封面文字层配置。
 *
 * 底图只有一张，文字与排版是配置 —— 改文字不需要重新生图。
 */
const coverTextConfigSchema = z.object({
  /** overlay = 底图＋系统文字；full = 完整图片封面（历史封面自带文字，不再叠字）。 */
  mode: z.enum(["overlay", "full"]).default("overlay"),
  templateVersion: z.string().trim().max(16).default("v1"),
  title: z.string().trim().max(24),
  subtitle: z.string().trim().max(40),
  align: z.enum(["left", "center", "right"]).default("left"),
  sizeScale: z.number().min(0.8).max(1.25).default(1),
  palette: z.string().trim().max(24).default("violet"),
  /** 各展示位的裁切位置。 */
  focus: z
    .object({
      sourceId: z.number().int().positive().nullable().default(null),
      placements: z
        .object({
          double: z
            .object({
              x: z.number().min(0).max(100),
              y: z.number().min(0).max(100),
            })
            .optional(),
          single: z
            .object({
              x: z.number().min(0).max(100),
              y: z.number().min(0).max(100),
            })
            .optional(),
          banner: z
            .object({
              x: z.number().min(0).max(100),
              y: z.number().min(0).max(100),
            })
            .optional(),
        })
        .default({}),
    })
    .optional(),
});
const coverSceneSchema = z.enum(["double", "single", "banner", "share"]);

/**
 * 埋点携带的来源线索。
 *
 * 全部是可选的短字符串：服务端只取 referrer 的主机部分做归类，
 * 完整来源 URL 不会落库。缺失时按 unknown 处理，不猜测。
 */
const attributionInput = z.object({
  referrer: z.string().max(500).optional(),
  entry: z.string().max(24).optional(),
  navigationType: z.string().max(20).optional(),
  siteHost: z.string().max(120).optional(),
  internalNav: z.boolean().optional(),
});

/** 时间范围：预设或自定义日期，两种走同一套解析。 */
const analyticsRangeInput = z.object({
  preset: z.enum(["today", "7d", "30d"]).optional(),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
});

function resolveRange(input: { preset?: string; from?: string; to?: string }) {
  try {
    return resolveAnalyticsRange(input);
  } catch (error) {
    if (error instanceof AnalyticsRangeError)
      throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
    throw error;
  }
}

function rangeMeta(range: ReturnType<typeof resolveAnalyticsRange>) {
  return {
    from: range.from,
    to: range.to,
    days: range.days,
    granularity: range.granularity,
    timezone: "Asia/Shanghai",
  };
}

/**
 * 公开接口的限流键。
 *
 * 只用 IP —— 不采集更细的指纹。匿名请求没有登录态，
 * IP 是唯一能既限住滥用又不误伤正常读者的标识。
 */
function rateKey(ctx: { ip?: string }) {
  return ctx.ip || "0.0.0.0";
}

export const blogRouter = router({
  topicSEO: authProcedure.input(z.object({id:z.number().int().positive()})).query(({ctx,input})=>readTopicSeo(prisma,Number(ctx.id),input.id)),
  saveTopicSEO: authProcedure.input(z.object({id:z.number().int().positive(),data:articleSeoSchema,revision:z.string()})).mutation(({ctx,input})=>saveTopicSeo(prisma,Number(ctx.id),input.id,input.data,input.revision)),
  engagement: authProcedure.input(z.object({days:z.union([z.literal(1),z.literal(7),z.literal(30)])})).query(({ctx,input})=>blogEngagement(prisma,Number(ctx.id),input.days)),
  siteSettings: authProcedure.query(async ({ctx}) => ({...await readBlogSiteSettings(prisma, Number(ctx.id)), deployedOrigin: process.env.BLOG_PUBLIC_URL || '', backendOrigin: process.env.NEXTAUTH_URL || ''})),
  saveSiteSettings: authProcedure.input(z.object({data: blogSiteSettingsSchema, revision: z.string()})).mutation(({ctx,input}) => saveBlogSiteSettings(prisma, Number(ctx.id), input.data, input.revision)),
  contentSEO: authProcedure.input(z.object({id: z.number().int().positive()})).query(async ({ctx,input}) => {
    const note = await prisma.notes.findFirst({where:{id:input.id,accountId:Number(ctx.id)},include:{publication:true}});
    if(!note) throw new TRPCError({code:'NOT_FOUND'});
    return { draft:readArticleSeo(note.metadata), published:readArticleSeo(note.metadata,true), updatedAt:note.updatedAt, revision:note.publication?.revision ?? 0 };
  }),
  saveContentSEO: authProcedure.input(z.object({id:z.number().int().positive(), data:articleSeoSchema, expectedUpdatedAt:z.date()})).mutation(async ({ctx,input}) => prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM notes WHERE id = ${input.id} AND "accountId" = ${Number(ctx.id)} FOR UPDATE`;
    const note = await tx.notes.findFirst({where:{id:input.id,accountId:Number(ctx.id)}});
    if(!note) throw new TRPCError({code:'NOT_FOUND'});
    if(note.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) throw new TRPCError({code:'CONFLICT',message:'笔记已更新，请重新载入后保存 SEO'});
    const metadata = note.metadata && typeof note.metadata === 'object' && !Array.isArray(note.metadata) ? note.metadata : {};
    await tx.notes.update({where:{id:note.id},data:{metadata:{...metadata,blogSeo:input.data}}});
    return {saved:true};
  })),
  /**
   * 内容 SEO 的左侧选择列表。
   *
   * 文章走一条窄查询：只取标题、公开状态、版本号，不把正文拉出来；
   * 专题与固定页面分别取数，各自分页。切换筛选时由前端用序号防竞态。
   */
  seoContentList: authProcedure
    .input(
      z.object({
        type: z.enum(["all", "article", "topic", "page"]).default("all"),
        q: z.string().trim().max(120).default(""),
        page: z.number().int().min(1).max(200).default(1),
        pageSize: z.number().int().min(1).max(60).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const accountId = Number(ctx.id);
      const q = input.q.trim();
      const like = `%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
      const skip = (input.page - 1) * input.pageSize;
      const wantArticles = input.type === "all" || input.type === "article";
      const wantTopics = input.type === "all" || input.type === "topic";
      const wantPages = input.type === "all" || input.type === "page";

      type ArticleRow = {
        id: number;
        title: string;
        publishId: string;
        isPublished: boolean;
        updatedAt: Date;
        revision: number;
      };
      let articles: { items: ArticleRow[]; total: number } = {
        items: [],
        total: 0,
      };
      if (wantArticles) {
        const rows = await prisma.$queryRaw<ArticleRow[]>(Prisma.sql`
          SELECT n.id AS id,
                 COALESCE(n.metadata->>'title', '') AS title,
                 COALESCE(n."publishId", '') AS "publishId",
                 n."isPublished" AS "isPublished",
                 n."updatedAt" AS "updatedAt",
                 COALESCE(p.revision, 0) AS revision
          FROM notes n
          LEFT JOIN "notePublication" p ON p."noteId" = n.id
          WHERE n."accountId" = ${accountId}
            AND n."isRecycle" = false
            ${
              q
                ? Prisma.sql`AND (COALESCE(n.metadata->>'title', '') ILIKE ${like} OR COALESCE(n.content, '') ILIKE ${like})`
                : Prisma.empty
            }
          ORDER BY n."updatedAt" DESC, n.id DESC
          LIMIT ${input.pageSize} OFFSET ${skip}
        `);
        const counts = await prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
          SELECT COUNT(*) AS count
          FROM notes n
          WHERE n."accountId" = ${accountId}
            AND n."isRecycle" = false
            ${
              q
                ? Prisma.sql`AND (COALESCE(n.metadata->>'title', '') ILIKE ${like} OR COALESCE(n.content, '') ILIKE ${like})`
                : Prisma.empty
            }
        `);
        articles = { items: rows, total: Number(counts[0]?.count ?? 0) };
      }

      let topics: {
        items: {
          id: number;
          name: string;
          slug: string;
          isPublished: boolean;
          count: number;
        }[];
        total: number;
      } = { items: [], total: 0 };
      if (wantTopics) {
        const rows = await prisma.blogTopic.findMany({
          where: {
            accountId,
            ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
          },
          select: {
            id: true,
            name: true,
            slug: true,
            isPublished: true,
            _count: { select: { notes: true } },
          },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          skip,
          take: input.pageSize,
        });
        const total = await prisma.blogTopic.count({
          where: {
            accountId,
            ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
          },
        });
        topics = {
          items: rows.map((t) => ({
            id: t.id,
            name: t.name,
            slug: t.slug,
            isPublished: t.isPublished,
            count: t._count.notes,
          })),
          total,
        };
      }

      return {
        articles,
        topics,
        pages: wantPages
          ? BLOG_FIXED_PAGES.map((p) => ({ key: p.key, label: p.label, path: p.path }))
          : [],
      };
    }),
  /**
   * SEO 预览：返回「待发布」和「当前公开」两份解析结果。
   *
   * 当前公开那一份直接复用公开站的解析逻辑，保证预览与线上逐字一致。
   */
  seoPreview: authProcedure
    .input(
      z.object({
        kind: z.enum(["article", "topic", "page"]),
        id: z.string().trim().max(64),
        origin: z.string().trim().max(300).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const accountId = Number(ctx.id);
      const origin = publicOrigin(input.origin || "http://localhost:1111");
      if (input.kind === "article") {
        const payload = await previewArticleSeo(
          prisma,
          accountId,
          Number(input.id),
          origin,
        );
        if (!payload) throw new TRPCError({ code: "NOT_FOUND", message: "文章不存在" });
        return payload;
      }
      if (input.kind === "topic") {
        const payload = await previewTopicSeo(
          prisma,
          accountId,
          Number(input.id),
          origin,
        );
        if (!payload) throw new TRPCError({ code: "NOT_FOUND", message: "专题不存在" });
        return payload;
      }
      const payload = await previewPageSeo(
        prisma,
        accountId,
        input.id as "home" | "topics" | "about" | "friends" | "moments",
        origin,
      );
      if (!payload)
        throw new TRPCError({ code: "NOT_FOUND", message: "固定页面不存在" });
      return payload;
    }),
  pageSEO: authProcedure.query(async ({ ctx }) =>
    readPageSeo(prisma, Number(ctx.id)),
  ),
  savePageSEO: authProcedure
    .input(
      z.object({
        data: z.record(z.string(), articleSeoSchema),
        revision: z.string(),
      }),
    )
    .mutation(({ ctx, input }) =>
      savePageSeo(prisma, Number(ctx.id), input.data, input.revision),
    ),
  /**
   * 站点检查：真的发起请求与查库，给出通过 / 警告 / 失败 / 无法验证。
   *
   * 目标地址来自站点设置里的目标配置，用户手动指定时也会走 SSRF 防护。
   */
  siteCheck: authProcedure
    .input(
      z.object({
        target: z.string().trim().max(300).optional(),
        effective: z.string().trim().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const accountId = Number(ctx.id);
      const stored = await readBlogSiteSettings(prisma, accountId);
      const settings = stored.configured ? stored.data : null;
      const effective = process.env.BLOG_PUBLIC_URL || input.effective || "";
      const target = input.target || settings?.targetOrigin || effective;
      if (!target)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "没有可检查的地址，请先填写目标公开站点地址",
        });
      const wait = siteCheckRateLimited(accountId);
      if (wait > 0)
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `检查太频繁，请 ${wait} 秒后再试`,
        });
      return runSiteChecks(prisma, accountId, {
        target,
        effective: effective || target,
      });
    }),
  publicRecommendations: publicProcedure
    .input(
      z.object({
        deviceId: z
          .string()
          .regex(/^[0-9a-f]{32}$/)
          .optional(),
        topicSlug: z.string().max(80).optional(),
        page: z.number().int().min(1).max(100).default(1),
      }),
    )
    .query(({ input }) => recommendationFeed(prisma, input)),
  recommendationEvent: publicProcedure
    .input(
      z.object({
        deviceId: z.string().regex(/^[0-9a-f]{32}$/),
        kind: z.enum(["impression", "click", "search"]),
        publishId: z.string().max(128).default(""),
        term: z.string().trim().max(80).default(""),
        ...attributionInput.shape,
      }),
    )
    .mutation(({ input }) => recordRecommendationEvent(prisma, input)),

  /**
   * 按场景导出封面二进制：浏览器直接下载，不落库。
   *
   * 用的是同一套排版规则（shared/lib/blogCoverText.ts），
   * 导出的图和线上看到的一致。
   */
  exportCover: authProcedure
    .input(
      z.object({
        noteId: z.number().int().positive(),
        placement: coverSceneSchema.default("banner"),
        width: z.number().int().min(120).max(2400).default(1200),
        height: z.number().int().min(80).max(1600).default(630),
        config: coverTextConfigSchema.optional(),
        focus: z
          .object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) })
          .nullable()
          .optional(),
      }),
    )
    .query(({ input, ctx }) =>
      exportCoverImage(prisma, Number(ctx.id), input),
    ),
  coverGenerationOptions: authProcedure
    .input(
      z.object({
        noteId: z.number().int().positive(),
        style: z.literal("ink").default("ink"),
      }),
    )
    .query(({ input, ctx }) =>
      coverGenerationOptions(prisma, Number(ctx.id), input.noteId, input.style),
    ),
  generateCover: authProcedure
    .input(
      z.object({
        noteId: z.number().int().positive(),
        modelId: z.number().int().positive(),
        /** 作者写的「想要什么画面」；留空按模型默认模板生成。 */
        direction: z.string().trim().max(300).optional(),
        style: z.literal("ink").default("ink"),
        revision: z.number().int().positive(),
      }),
    )
    .mutation(({ input, ctx }) =>
      generateBlogCover(prisma, Number(ctx.id), input),
    ),
  /**
   * 把底图 + 文字配置应用到发布草稿。
   *
   * 只写草稿：公开快照不动，要点「更新发布」才对外生效。
   */
  applyCover: authProcedure
    .input(
      z.object({
        noteId: z.number().int().positive(),
        /** 已有的底图附件。 */
        attachmentId: z.number().int().positive().optional(),
        /** 刚上传、还没挂到笔记上的底图路径。 */
        path: z.string().trim().max(400).optional(),
        config: coverTextConfigSchema,
        expectedRevision: z.number().int().positive().optional(),
      }),
    )
    .mutation(({ input, ctx }) =>
      applyCoverToDraft(prisma, Number(ctx.id), input),
    ),
  /**
   * 封面状态：草稿那份与公开那份分开给。
   *
   * 草稿没配过封面文字时，draft.config 会回落到公开那份 ——
   * 面板据此判断「这次发布到底改不改封面」。
   */
  coverState: authProcedure
    .input(z.object({ noteId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const state = await readCoverState(prisma, Number(ctx.id), input.noteId);
      if (!state)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "文章不存在或尚未发布，请先发布正文。",
        });
      return state;
    }),
  publishSettings: authProcedure.input(z.object({ noteId: z.number().int().positive() })).query(({ input, ctx }) => readPublishSettings(prisma, Number(ctx.id), input.noteId)),
  savePublishSettings: authProcedure.input(savePublishSettingsSchema).mutation(({ input, ctx }) => savePublishSettings(prisma, Number(ctx.id), input)),
  /** 可用于生成文案的对话模型。 */
  copyModels: authProcedure.input(z.void()).query(async () => {
    const models = await prisma.aiModels.findMany({
      include: { provider: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    return models
      .filter((m) => (m.capabilities as any)?.inference)
      .map((m) => ({
        id: m.id,
        title: m.title,
        providerTitle: m.provider.title,
        available: !!m.provider.apiKey?.trim(),
        reason: m.provider.apiKey?.trim() ? "" : "请先配置 API Key",
      }));
  }),
  /**
   * 一次调用产出四份文案：正文标题、摘要、封面标题、封面副标题。
   * 封面那两份必须一起出 —— 分两次调用，模型给的标题和副标题会各说各话。
   *
   * kind 用来做列表行的快捷操作：只出标题 / 只出摘要 / 只出封面文案。
   * hint 是作者现有的标题，传了就是「优化这版标题」。
   */
  generateCopy: authProcedure
    .input(
      z.object({
        noteId: z.number().int().positive(),
        modelId: z.number().int().positive().optional(),
        kind: z.enum(["all", "title", "summary", "cover"]).default("all"),
        hint: z.string().trim().max(200).optional(),
      }),
    )
    .mutation(({ input, ctx }) =>
      generateBlogCopy(prisma, Number(ctx.id), input),
    ),
  /**
   * 「AI 整理发布信息」：读一次已保存正文，一次请求出齐六组字段 ——
   * 公开标题、封面短标题、封面副标题、文章概要、公开标签建议、专题与章节归属建议。
   *
   * 返回的是候选，不落库。应用由用户挑字段后走 saveCopy，
   * 并带上 contentVersion 校验 —— 正文在生成与应用之间被改过就拒绝套用。
   */
  generateCopyGroup: authProcedure
    .input(
      z.object({
        noteId: z.number().int().positive(),
        modelId: z.number().int().positive().optional(),
      }),
    )
    .mutation(({ input, ctx }) =>
      generateBlogCopyGroup(prisma, Number(ctx.id), input),
    ),
  /**
   * AI 整理候选 + 当前正文指纹。
   *
   * 界面据此判断某一项是不是「按旧正文生成的」：
   * 有候选就直接展示，没有才走生成 —— 免得每次点开都重新烧一次模型。
   */
  aiCopyState: authProcedure
    .input(z.object({ noteId: z.number().int().positive() }))
    .query(({ input, ctx }) =>
      readAiCopyState(prisma, Number(ctx.id), input.noteId),
    ),
  /**
   * 只写封面文字层（短标题 / 副标题），不碰底图。
   *
   * 封面文案是发布内容里的一项设置，作者可能先定文案、之后再去做底图。
   */
  saveCoverText: authProcedure
    .input(
      z.object({
        noteId: z.number().int().positive(),
        title: z.string().max(24),
        subtitle: z.string().max(40),
      }),
    )
    .mutation(({ input, ctx }) =>
      saveDraftCoverText(prisma, Number(ctx.id), input.noteId, input),
    ),
  /** 把标题与摘要写进草稿。公开页面读快照，要「更新发布」后才生效。 */
  saveCopy: authProcedure
    .input(
      z.object({
        noteId: z.number().int().positive(),
        title: z.string().max(200).optional(),
        summary: z.string().max(2000).optional(),
        // 公开标签：与私有笔记标签分开，只写草稿。
        publicTags: z.array(z.string().max(20)).max(8).optional(),
        // 乐观锁：AI 候选返回时正文可能已改，带上读到的 updatedAt 对一下。
        expectedUpdatedAt: z.coerce.date().optional(),
        // 正文版本指纹：候选按哪一版正文生成就带哪一版，正文改过就拒绝对应的候选。
        expectedContentVersion: z.string().max(64).optional(),
      }),
    )
    .mutation(({ input, ctx }) => saveNoteCopy(prisma, Number(ctx.id), input)),
  saveTopic: authProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        name: z.string().min(1).max(60),
        slug: z.string().max(80).optional(),
        desc: z.string().max(500),
        color: z.string().max(16),
        isPublished: z.boolean(),
        noteIds: z.array(z.number().int().positive()).max(200).optional(),
        parentId: z.number().int().positive().nullable().optional(),
        showInNav: z.boolean().optional(),
        isFeatured: z.boolean().optional(),
        coverTitle: z.string().max(24).optional(),
        coverAttachmentId: z.number().int().positive().nullable().optional(),
        // 展示方式：topic（专题模式）/ doc（文档模式）。不传就保持原样。
        displayMode: z.enum(TOPIC_DISPLAY_MODES).optional(),
        // 文档模式默认打开的文章（notes.id）。不传就保持原样；传 null 改回「自动」。
        defaultNoteId: z.number().int().positive().nullable().optional(),
      }),
    )
    .mutation(({ input, ctx }) => saveBlogTopic(prisma, Number(ctx.id), input)),
  generateTopicCover: authProcedure.input(z.object({ topicId: z.number().int().positive(), name: z.string().trim().min(1).max(60), desc: z.string().max(500) })).mutation(({ input, ctx }) => generateTopicCover(prisma, Number(ctx.id), input)),
  attachCover: authProcedure
    .input(
      z.object({
        noteId: z.number().int().positive(),
        path: z.string().max(1000),
      }),
    )
    .mutation(({ input, ctx }) =>
      attachBlogCover(prisma, Number(ctx.id), input.noteId, input.path),
    ),
  /** 已发布文章的完整管理视图：封面、专题、草稿差异一次拿全。 */
  published: authProcedure
    .input(z.void())
    .query(({ ctx }) => listPublishedForManage(prisma, Number(ctx.id))),

  /**
   * 批量发布 / 撤回。
   *
   * 一次操作只发一个请求，服务端逐篇重新读最新状态再写 ——
   * 避免拿着列表页的旧快照批量发布。逐篇返回结果，失败的那几篇单独说。
   */
  bulkAction: authProcedure
    .input(
      z.object({
        noteIds: z.array(z.number().int().positive()).min(1).max(50),
        action: z.enum(["publish", "withdraw"]),
      }),
    )
    .mutation(({ input, ctx }) =>
      bulkPublishAction(prisma, Number(ctx.id), input),
    ),

  /** 把笔记放进 / 移出博客草稿箱。 */
  setDraft: authProcedure
    .input(
      z.object({
        noteId: z.number().int().positive(),
        inDrafts: z.boolean(),
      }),
    )
    .mutation(({ input, ctx }) =>
      setBlogDraftFlag(prisma, Number(ctx.id), input.noteId, input.inDrafts),
    ),

  profile: authProcedure
    .input(z.void())
    .query(({ ctx }) => getBlogProfile(prisma, Number(ctx.id))),

  saveProfile: authProcedure
    .input(
      z.object({
        displayName: z.string().max(80),
        tagline: z.string().max(160),
        bio: z.string().max(5000),
        avatarUrl: z.string().max(500),
        homepage: z.string().max(300),
        links: z.array(linkSchema).max(12).optional(),
        // 关于页的可配置项：站点说明、精选文章、展示专题。
        spaceIntro: z.string().max(2000).optional(),
        signature: z.string().max(80).optional(),
        featuredPosts: z
          .array(
            z.object({
              noteId: z.number().int().positive(),
              reason: z.string().max(120),
            }),
          )
          .max(3)
          .optional(),
        aboutTopicIds: z.array(z.number().int().positive()).max(4).optional(),
        isPublished: z.boolean(),
      }),
    )
    .mutation(({ input, ctx }) =>
      upsertBlogProfile(prisma, Number(ctx.id), input),
    ),

  topics: authProcedure
    .input(z.void())
    .query(({ ctx }) => listBlogTopics(prisma, Number(ctx.id))),

  createTopic: authProcedure
    .input(
      z.object({
        name: z.string().min(1).max(60),
        slug: z.string().max(80).optional(),
        desc: z.string().max(500),
        color: z.string().max(16),
        isPublished: z.boolean(),
        parentId: z.number().int().positive().nullable().optional(),
        showInNav: z.boolean().optional(),
        isFeatured: z.boolean().optional(),
        displayMode: z.enum(TOPIC_DISPLAY_MODES).optional(),
        // 新建专题还没有编排，默认文章先不设。
        defaultNoteId: z.number().int().positive().nullable().optional(),
      }),
    )
    .mutation(({ input, ctx }) =>
      createBlogTopic(prisma, Number(ctx.id), input),
    ),

  updateTopic: authProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().max(60).optional(),
        slug: z.string().max(80).optional(),
        desc: z.string().max(500).optional(),
        color: z.string().max(16).optional(),
        isPublished: z.boolean().optional(),
        parentId: z.number().int().positive().nullable().optional(),
        showInNav: z.boolean().optional(),
        isFeatured: z.boolean().optional(),
        coverTitle: z.string().max(24).optional(),
        // 展示方式：字段级更新，不碰章节编排与文章关系。
        displayMode: z.enum(TOPIC_DISPLAY_MODES).optional(),
        // 默认打开的文章：字段级更新，失效自动退回「自动」。
        defaultNoteId: z.number().int().positive().nullable().optional(),
      }),
    )
    .mutation(({ input, ctx }) => {
      const { id, ...rest } = input;
      return updateBlogTopic(prisma, Number(ctx.id), id, rest);
    }),

  /**
   * 流量分发策略：读 / 写站点的排序口径与权重。
   * 口径决定「推荐」列表怎么排：发布时间 / 点击数 / 曝光点击率 / 综合。
   */
  distribution: authProcedure
    .input(z.void())
    .query(({ ctx }) => getDistribution(prisma, Number(ctx.id))),

  saveDistribution: authProcedure
    .input(
      z.object({
        mode: z.enum(DISTRIBUTION_MODES).optional(),
        freshWeight: z.number().min(0).max(20).optional(),
        hotWeight: z.number().min(0).max(20).optional(),
        qualityWeight: z.number().min(0).max(20).optional(),
        affinityWeight: z.number().min(0).max(20).optional(),
        searchWeight: z.number().min(0).max(20).optional(),
        freshHalfLife: z.number().min(0.5).max(365).optional(),
        hotHalfLife: z.number().min(0.5).max(365).optional(),
        featuredFirst: z.boolean().optional(),
      }),
    )
    .mutation(({ input, ctx }) =>
      saveDistribution(prisma, Number(ctx.id), input),
    ),

  /**
   * 单篇文章的运营配置（置顶 / banner 的开关与位置）。
   *
   * 运营弹窗打开时读这份实时值：内容列表是进页面那一刻的快照，
   * 开着页面在别处改过再回来，照着快照写回会把过期的位置存进库里。
   */
  promoteState: authProcedure
    .input(z.object({ noteId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const row = await prisma.notePublication.findFirst({
        where: {
          noteId: input.noteId,
          note: { accountId: Number(ctx.id), isRecycle: false },
        },
        select: {
          isFeatured: true,
          featuredOrder: true,
          isBanner: true,
          bannerOrder: true,
        },
      });
      if (!row)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "文章不存在或尚未发布，请先发布正文。",
        });
      return row;
    }),

  /**
   * 封面在各展示位的裁切位置。
   *
   * 一张 1600×900 的源图同时给双栏（2.8:1）、单栏（16:9）、Banner（2.9:1）用，
   * 每个展示位各存一份裁切位置，共用同一张源图。
   *
   * 读的时候带上当前封面附件 id：换了源图以后这份裁切就对不上了，
   * 公开站与后台都会当没调过，回到居中。
   */
  coverFocus: authProcedure
    .input(z.object({ noteId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const row = await prisma.notePublication.findFirst({
        where: {
          noteId: input.noteId,
          note: { accountId: Number(ctx.id), isRecycle: false },
        },
        select: {
          coverFocus: true,
          coverAttachmentId: true,
          draftCoverAttachmentId: true,
        },
      });
      if (!row)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "文章不存在或尚未发布，请先发布正文。",
        });
      const sourceId = row.coverAttachmentId ?? row.draftCoverAttachmentId;
      const focus = normalizeCoverFocus(row.coverFocus);
      return {
        sourceId: sourceId ?? null,
        // 源图换了就当没调过：回到居中。
        coverFocus:
          focus && focus.sourceId === sourceId
            ? focus
            : { sourceId: sourceId ?? null, placements: {} },
      };
    }),

  /**
   * 保存封面在各展示位的裁切位置。
   * 改动即存，跟置顶 / banner 一样是运营配置，不需要重新发布正文。
   */
  /* ---------- 专题章节编排 ---------- */

  /** 某个专题下的章节与文章归属。 */
  topicSections: authProcedure
    .input(z.object({ topicId: z.number().int().positive() }))
    .query(({ input, ctx }) =>
      listTopicSections(prisma, Number(ctx.id), input.topicId),
    ),

  /**
   * 「保存编排」：章节与文章归属一次性事务提交。
   * 拖拽过程不写库，攒够一次整体落，中途取消不影响线上目录。
   */
  saveTopicArrangement: authProcedure
    .input(
      z.object({
        topicId: z.number().int().positive(),
        sections: z
          .array(
            z.object({
              id: z.number().int().positive().nullable().optional(),
              name: z.string().trim().min(1).max(60),
              desc: z.string().trim().max(500).optional(),
              showTitle: z.boolean().optional(),
              noteIds: z.array(z.number().int().positive()).max(500),
            }),
          )
          .max(50),
        unassignedNoteIds: z.array(z.number().int().positive()).max(500),
      }),
    )
    .mutation(({ input, ctx }) =>
      saveTopicArrangement(prisma, Number(ctx.id), input),
    ),

  /** 删除章节：文章移入未分章节，不删文章。 */
  deleteTopicSection: authProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) =>
      deleteTopicSection(prisma, Number(ctx.id), input.id),
    ),

  /** 章节排序。 */
  reorderTopicSections: authProcedure
    .input(
      z.object({
        topicId: z.number().int().positive(),
        orderedIds: z.array(z.number().int().positive()).max(50),
      }),
    )
    .mutation(({ input, ctx }) =>
      reorderTopicSections(
        prisma,
        Number(ctx.id),
        input.topicId,
        input.orderedIds,
      ),
    ),

  /** 文章在某个专题里的章节归属。 */
  setArticleTopic: authProcedure
    .input(
      z.object({
        noteId: z.number().int().positive(),
        topicId: z.number().int().positive(),
        sectionId: z.number().int().positive().nullable().optional(),
      }),
    )
    .mutation(({ input, ctx }) =>
      setArticleTopicSection(prisma, Number(ctx.id), input),
    ),

  /** 把文章移出专题（文章本身保留）。 */
  removeArticleTopic: authProcedure
    .input(
      z.object({
        noteId: z.number().int().positive(),
        topicId: z.number().int().positive(),
      }),
    )
    .mutation(({ input, ctx }) =>
      removeArticleTopic(prisma, Number(ctx.id), input),
    ),

  /** 公开标签池：优先匹配这里已有的标签。 */
  publicTags: authProcedure
    .input(z.void())
    .query(({ ctx }) => listPublicTagPool(prisma, Number(ctx.id))),

  deleteTopic: authProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) =>
      deleteBlogTopic(prisma, Number(ctx.id), input.id),
    ),

  reorderTopics: authProcedure
    .input(
      z.object({ orderedIds: z.array(z.number().int().positive()).max(200) }),
    )
    .mutation(({ input, ctx }) =>
      reorderBlogTopics(prisma, Number(ctx.id), input.orderedIds),
    ),

  assignTopics: authProcedure
    .input(
      z.object({
        topicId: z.number().int().positive(),
        noteIds: z.array(z.number().int().positive()).max(200),
      }),
    )
    .mutation(({ input, ctx }) =>
      assignTopicNotes(prisma, Number(ctx.id), input.topicId, input.noteIds),
    ),

  /**
   * 「检查更新」：读取原笔记、发布草稿与当前公开版本，
   * 判断有没有变化、有没有冲突，并把差异算好交给页面展示。
   *
   * 只读，不改任何东西 —— 变化与冲突由作者决定怎么处理。
   */
  publishCheck: authProcedure
    .input(z.object({ noteId: z.number().int().positive() }))
    .query(({ input, ctx }) =>
      buildPublishCheck(prisma, Number(ctx.id), input.noteId),
    ),

  /**
   * 处理来源更新：采用原笔记正文，或保留当前草稿。
   *
   * 只改发布草稿，不发布。公开标题撞车时逐项选：
   * keep 保留人工整理过的标题，adopt 改用原笔记派生标题。
   * 概要、标签、封面与 SEO 一概不动 —— 更新正文不牵动其它字段。
   */
  resolveSource: authProcedure
    .input(
      z.object({
        noteId: z.number().int().positive(),
        adoptBody: z.boolean().default(false),
        titleChoice: z.enum(["keep", "adopt"]).default("keep"),
        expectedSourceVersion: z.string().regex(/^[0-9a-f]{32}$/).optional(),
      }),
    )
    .mutation(({ input, ctx }) =>
      resolveSourceChange(prisma, Number(ctx.id), input),
    ),

  setCover: authProcedure
    .input(
      z.object({
        noteId: z.number().int().positive(),
        attachmentId: z.number().int().positive().nullable(),
      }),
    )
    .mutation(({ input, ctx }) =>
      setPublicationCover(
        prisma,
        Number(ctx.id),
        input.noteId,
        input.attachmentId,
      ),
    ),

  /**
   * 公开读：博客首页要拉作者资料和专题。资料未发布时一律返回 null，
   * 不因为「表里有记录」就默认公开。
   */
  publicProfile: publicProcedure
    .input(
      z
        .object({ accountId: z.number().int().positive().optional() })
        .optional(),
    )
    .query(async ({ input }) => {
      const accountId = await publicBlogOwner(prisma, input?.accountId);
      const profile = await prisma.blogProfile.findFirst({
        where: { accountId, isPublished: true },
        orderBy: { updatedAt: "desc" },
      });
      if (!profile) return null;
      return {
        displayName: profile.displayName,
        tagline: profile.tagline,
        bio: profile.bio,
        avatarUrl: profile.avatarUrl,
        homepage: profile.homepage,
        links: sanitizeLinks(profile.links),
      };
    }),

  /**
   * 公开读：关于页的站点数据汇总。
   *
   * 只返回四个汇总数字、更新时间与口径版本 —— 没有访客标识、邮箱、
   * 私密反馈或任何管理数据。站长关掉「公开展示站点数据」时返回 null，
   * 前端据此整块不渲染，而不是把数字藏起来。
   */
  publicSiteStats: publicProcedure
    .input(
      z
        .object({ accountId: z.number().int().positive().optional() })
        .optional(),
    )
    .query(async ({ input }) => {
      const accountId = await publicBlogOwner(prisma, input?.accountId);
      const settings = await readBlogSiteSettings(prisma, accountId);
      if (!settings.data.showPublicStats) return null;
      return publicSiteStats(prisma, accountId);
    }),

  /**
   * 公开读：「站点数据」页的汇总（按周期）。
   *
   * 与后台的数据分析面板是两回事：这里只出汇总数字、趋势、热门公开文章、
   * 回应分类与公开更新记录，不返回访客标识、原始事件、来源明细、
   * 私密反馈或任何管理字段。站长关掉「公开展示站点数据」时返回 null，
   * 前端据此整页不渲染。
   */
  publicStats: publicProcedure
    .input(
      z
        .object({
          accountId: z.number().int().positive().optional(),
          range: z.enum(STATS_RANGES).default("7d"),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const accountId = await publicBlogOwner(prisma, input?.accountId);
      const settings = await readBlogSiteSettings(prisma, accountId);
      if (!settings.data.showPublicStats) return null;
      return publicStatsPage(prisma, accountId, input?.range ?? "7d");
    }),

  /**
   * 公开：关于页的作者精选内容。
   *
   * 只返回允许公开的三样：站点说明、展示专题、精选文章（含推荐理由）。
   * 不含账户私有资料、邮箱、草稿或私密反馈。
   */
  publicAbout: publicProcedure
    .input(
      z
        .object({ accountId: z.number().int().positive().optional() })
        .optional(),
    )
    .query(async ({ input }) => {
      const accountId = await publicBlogOwner(prisma, input?.accountId);
      return publicAbout(prisma, { accountId });
    }),

  /**
   * 订阅页的公开数据：两个渠道 + 站点介绍 + 订阅说明。
   * 只含允许公开的配置与作者公开资料，不返回账户邮箱或管理字段。
   */
  publicSubscribe: publicProcedure
    .input(
      z
        .object({ accountId: z.number().int().positive().optional() })
        .optional(),
    )
    .query(async ({ input }) => {
      const accountId = await publicBlogOwner(prisma, input?.accountId);
      return publicSubscribe(prisma, { accountId });
    }),

  publicTopics: publicProcedure
    .input(
      z
        .object({ accountId: z.number().int().positive().optional() })
        .optional(),
    )
    .query(async ({ input }) => {
      const accountId = await publicBlogOwner(prisma, input?.accountId);
      const topics = await prisma.blogTopic.findMany({
        where: { accountId, isPublished: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: {
          name: true,
          slug: true,
          desc: true,
          color: true,
          _count: {
            select: {
              notes: {
                where: {
                  note: {
                    isPublished: true,
                    isRecycle: false,
                    publication: { isNot: null },
                  },
                },
              },
            },
          },
        },
      });
      return topics.filter((t) => t._count.notes > 0);
    }),

  /** 公开读：按专题 slug 拉文章列表，只返回快照，不碰草稿。 */
  publicTopicFeed: publicProcedure
    .input(
      z.object({
        slug: z.string().max(80),
        accountId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ input }) => {
      const topic = await prisma.blogTopic.findFirst({
        where: {
          accountId: await publicBlogOwner(prisma, input.accountId),
          slug: input.slug,
          isPublished: true,
        },
      });
      if (!topic) return [];
      const links = await prisma.blogTopicNote.findMany({
        where: {
          topicId: topic.id,
          note: {
            isPublished: true,
            isRecycle: false,
            publication: { isNot: null },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { noteId: "asc" }],
        take: input.limit,
        select: {
          note: {
            select: {
              id: true,
              publishId: true,
              isPublished: true,
              isRecycle: true,
              publication: {
                include: { coverAttachment: { select: { path: true } } },
              },
            },
          },
        },
      });
      return links
        .map((l) => publicPublicationDTO(l.note))
        .filter((n): n is NonNullable<typeof n> => !!n);
    }),

  publicSEO: publicProcedure
    .input(
      z.object({
        path: z
          .string()
          .max(300)
          .regex(/^\/blog(?:\/[^?#]*)?(?:\?[^#]*)?$/),
        origin: z.string().url().max(300),
      }),
    )
    .query(async ({ input }) => {
      const origin = publicOrigin(input.origin);
      // path 里可能带 ?page=N —— 分页页的 canonical / rel=prev,next 靠它。
      const [path, query] = input.path.split("?");
      const page = Number(new URLSearchParams(query ?? "").get("page")) || 1;
      const seo = await resolveBlogSEO(prisma, path, origin, undefined, page);
      const query2 = new URLSearchParams(query ?? "");
      if (
        query2.has("topic") ||
        query2.get("feed") === "recommended" ||
        // 热门榜是同一篇首页的另一种排序，别让搜索引擎把它当第二个页面收录。
        query2.get("view") === "hot"
      )
        seo.robots = "noindex, follow";
      const { text, links, bootstrap, ...metadata } = seo;
      return metadata;
    }),

  publicIndex: publicProcedure
    .input(
      z
        .object({
          accountId: z.number().int().positive().optional(),
          page: z.number().int().positive().max(10000).optional(),
        })
        .optional(),
    )
    .query(({ input }) => publicIndex(prisma, input ?? {})),

  publicPosts: publicProcedure
    .input(
      z.object({
        accountId: z.number().int().positive().optional(),
        topicSlug: z.string().max(80).optional(),
        search: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(200).default(BLOG_PAGE_SIZE),
        /** 偏移量分页：给 ?page=N 这种可分享的页码用 */
        offset: z.number().int().min(0).max(10000).optional(),
        cursor: z
          .object({
            updatedAt: z.coerce.date(),
            id: z.number().int().positive(),
          })
          .optional(),
        /** 排序方式：latest 时间序 / hot 按热度。 */
        sort: z.enum(["latest", "hot"]).default("latest"),
        /** 热门榜的时间窗。 */
        range: z.enum(["day", "month", "year"]).optional(),
        /** 只看某一年发布的文章（按年归档用）。 */
        year: z.number().int().min(1970).max(2999).optional(),
      }),
    )
    .query(({ input }) => publicPosts(prisma, input)),
  /** 「随便看看」：随机抽一篇公开文章。 */
  publicRandomArticle: publicProcedure
    .input(z.object({ accountId: z.number().int().positive().optional() }).optional())
    .query(({ input }) => publicRandomArticle(prisma, input ?? {})),
  publicSearch: publicProcedure
    .input(
      z.object({
        search: z.string().max(200),
        accountId: z.number().int().positive().optional(),
      }),
    )
    .query(async ({ input }) => {
      const term = input.search.trim().toLowerCase();
      const [feed, topics] = await Promise.all([
        publicPosts(prisma, { ...input, limit: 12 }),
        publicTopics(prisma, input.accountId),
      ]);
      return {
        posts: feed.posts,
        total: feed.total,
        topics: topics
          .filter((t) => (t.name + t.desc).toLowerCase().includes(term))
          .slice(0, 12),
      };
    }),
  publicTopic: publicProcedure
    .input(
      z.object({
        accountId: z.number().int().positive().optional(),
        slug: z.string().max(80),
        page: z.number().int().positive().max(10000).optional(),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(40).optional(),
      }),
    )
    .query(({ input }) => publicTopic(prisma, input)),
  /**
   * 公开读：文档模式的专题目录。
   *
   * 只返回章节结构与文章标题，不带正文 —— 左栏目录不该拖着几十篇正文走。
   */
  publicTopicDoc: publicProcedure
    .input(
      z.object({
        accountId: z.number().int().positive().optional(),
        slug: z.string().max(80),
      }),
    )
    .query(({ input }) => publicTopicDoc(prisma, input)),
  publicArticle: publicProcedure
    .input(
      z.object({
        publishId: z.string().min(1).max(100),
        accountId: z.number().int().positive().optional(),
        topicSlug: z.string().max(80).optional(),
      }),
    )
    .query(({ input }) => publicArticle(prisma, input)),

  /**
   * 公开埋点：记一次文章阅读。
   *
   * 去重完全交给浏览器 —— 设备 ID 由前端在 localStorage 生成，服务端只当不透明
   * 字符串用，拿不到 IP、UA 或任何指纹。同一个设备在去重窗口内重复打开只记一次。
   */
  trackView: publicProcedure
    .input(
      z.object({
        publishId: z.string().min(1).max(100),
        deviceId: z.string().regex(/^[0-9a-f]{32}$/),
        ...attributionInput.shape,
      }),
    )
    .mutation(({ input }) => trackBlogView(prisma, input)),

  /**
   * 后台统计：站点总点击数、总用户数（去重设备）、每篇文章明细与每日趋势。
   */
  stats: authProcedure
    .input(z.void())
    .query(({ ctx }) => siteStats(prisma, Number(ctx.id))),

  /**
   * 数据分析：顶部指标、趋势、来源分布与文章表共用同一个时间范围。
   *
   * 一次性返回，避免不同区块各自取数导致范围口径不一致。
   */
  analytics: authProcedure
    .input(
      z.object({
        ...analyticsRangeInput.shape,
        page: z.number().int().min(1).max(500).optional(),
        pageSize: z.number().int().min(1).max(50).optional(),
        sort: z.enum(ARTICLE_SORT_KEYS as [string, ...string[]]).optional(),
        q: z.string().max(60).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const accountId = Number(ctx.id);
      const range = resolveRange(input);
      const [overview, articles] = await Promise.all([
        analyticsOverview(prisma, accountId, range),
        analyticsArticles(prisma, accountId, range, {
          page: input.page,
          pageSize: input.pageSize,
          sort: input.sort,
          q: input.q,
        }),
      ]);
      return { ...overview, articles };
    }),

  analyticsAudience: authProcedure.input(analyticsRangeInput).query(({ctx,input}) => analyticsAudience(prisma,Number(ctx.id),resolveRange(input))),
  analyticsTopics: authProcedure.input(analyticsRangeInput).query(({ctx,input}) => analyticsTopics(prisma,Number(ctx.id),resolveRange(input))),

  /** 文章下钻：单篇文章在所选范围内的指标与趋势。 */
  analyticsArticle: authProcedure
    .input(
      z.object({
        noteId: z.number().int().positive(),
        ...analyticsRangeInput.shape,
      }),
    )
    .query(async ({ ctx, input }) => {
      const range = resolveRange(input);
      const detail = await analyticsArticleDetail(
        prisma,
        Number(ctx.id),
        input.noteId,
        range,
      );
      if (!detail)
        throw new TRPCError({ code: "NOT_FOUND", message: "文章不存在" });
      return { ...detail, range: rangeMeta(range) };
    }),

  /** 第三方统计接入状态：配置、脚本加载、事件发送三件事分别可见。 */
  trackingState: authProcedure
    .input(z.void())
    .query(async ({ ctx }) => readTrackingStates(prisma, Number(ctx.id))),

  /**
   * 公开博客页上报第三方脚本状态。
   *
   * 无凭据公开接口，所以只认两个厂商、只存路径与主机名，
   * 并且必须该平台已启用且编号合法才落库。
   */
  reportTrackingState: publicProcedure
    .input(
      z.object({
        vendor: z.enum(TRACKING_VENDORS),
        scriptLoaded: z.boolean().optional(),
        eventSent: z.boolean().optional(),
        path: z.string().max(200).optional(),
        host: z.string().max(120).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const accountId = await publicBlogOwner(prisma, undefined);
      if (!accountId)
        return { recorded: false, reason: "站点尚未初始化" };
      return reportTrackingState(prisma, accountId, input);
    }),

  /* ------------------------------------------------------------------ */
  /* 友情链接                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * 公开友链列表。
   *
   * 只返回「审核通过 + 未隐藏」的记录，DTO 里没有邮箱也没有审核说明。
   * 搜索按名称与介绍做大小写不敏感的匹配。
   */
  publicFriendLinks: publicProcedure
    .input(
      z
        .object({
          accountId: z.number().int().positive().optional(),
          q: z.string().max(80).optional(),
        })
        .optional(),
    )
    .query(({ input }) => publicFriendLinks(prisma, input ?? {})),

  /**
   * 提交友链申请。
   *
   * 同一地址只会有一条记录（数据库唯一约束兜住并发），
   * 重复提交会分别提示「已在审核中」或「已收录」。
   */
  publicFriendApply: publicProcedure
    .input(friendApplySchema)
    .mutation(async ({ ctx, input }) => {
      const wait = friendApplyRateLimited(rateKey(ctx));
      if (wait)
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `提交过于频繁，请 ${wait} 秒后再试。`,
        });
      const result = await applyFriendLink(prisma, input);
      // 只回公开信息：邮箱与内部备注不会出现在响应里。
      return {
        outcome: result.outcome,
        id: result.link.id,
        name: result.link.name,
        url: result.link.url,
      };
    }),

  /** 异常链接反馈：进后台待处理列表，不会因为一次反馈就隐藏站点。 */
  publicFriendFeedback: publicProcedure
    .input(friendFeedbackSchema)
    .mutation(async ({ ctx, input }) => {
      const wait = friendFeedbackRateLimited(rateKey(ctx));
      if (wait)
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `提交过于频繁，请 ${wait} 秒后再试。`,
        });
      return submitFriendFeedback(prisma, input);
    }),

  /**
   * 公开页只需要知道一件事：邮件通知到底能不能用。
   * 没配置就不能对申请人承诺「结果会发到你的邮箱」—— 只回一个布尔值，不泄露任何配置细节。
   */
  publicFriendNotice: publicProcedure
    .input(z.void())
    .query(async () => {
      const owner = await publicBlogOwner(prisma);
      const { config } = await resolveBlogMailConfig(prisma, owner);
      return { mailEnabled: !!config };
    }),

  /** 后台：友链列表（含待审核 / 已通过 / 已拒绝）。 */
  friendLinks: authProcedure
    .input(z.object({ status: z.enum(FRIEND_STATUSES).optional() }).optional())
    .query(({ ctx, input }) =>
      listFriendLinks(prisma, Number(ctx.id), input?.status),
    ),

  /** 后台：编辑公开字段。 */
  saveFriendLink: authProcedure
    .input(friendEditSchema)
    .mutation(({ ctx, input }) =>
      updateFriendLink(prisma, Number(ctx.id), input),
    ),

  /** 后台：审核（通过 / 拒绝），并按结果通知申请人。 */
  reviewFriendLink: authProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().max(1000).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      reviewFriendLink(prisma, Number(ctx.id), input),
    ),

  /** 后台：隐藏 / 恢复公开展示（不动审核记录）。 */
  setFriendLinkHidden: authProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        isHidden: z.boolean(),
      }),
    )
    .mutation(({ ctx, input }) =>
      setFriendLinkHidden(prisma, Number(ctx.id), input.id, input.isHidden),
    ),

  /** 后台：调整公开列表的排序。 */
  reorderFriendLinks: authProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()).max(500) }))
    .mutation(({ ctx, input }) =>
      reorderFriendLinks(prisma, Number(ctx.id), input.ids),
    ),

  /** 后台：重发审核通知（已发过的不重复发）。 */
  resendFriendLinkMail: authProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      resendFriendLinkMail(prisma, Number(ctx.id), input.id),
    ),

  /** 后台：邮件服务是否配置。没有配置时如实告诉管理员要配什么。 */
  friendMailStatus: authProcedure.input(z.void()).query(async ({ ctx }) => {
    const { config, source } = await resolveBlogMailConfig(
      prisma,
      Number(ctx.id),
    );
    return {
      configured: !!config,
      source,
      host: config?.host ?? "",
      port: config?.port ?? 0,
      from: config?.from ?? "",
      message: config ? "" : MAIL_NOT_CONFIGURED_MESSAGE,
    };
  }),

  /**
   * 后台：邮件服务设置。
   *
   * 读回来的是「视图」—— 密码只有 hasPass 这一个布尔值，密码本身永远不回传。
   * source 说明现在生效的是后台配置（settings）还是环境变量（env）。
   */
  mailSettings: authProcedure.input(z.void()).query(async ({ ctx }) => {
    const accountId = Number(ctx.id);
    const { data, revision, configured } = await readBlogMailSettings(
      prisma,
      accountId,
    );
    const { source } = await resolveBlogMailConfig(prisma, accountId);
    return {
      configured,
      source,
      data: blogMailSettingsView(data),
      revision,
    };
  }),

  /** 后台：保存邮件服务设置。 */
  saveMailSettings: authProcedure
    .input(
      z.object({
        data: z.object({
          host: z.string().trim().max(200),
          port: z.number().int().min(1).max(65535),
          secure: z.boolean(),
          user: z.string().trim().max(200),
          from: z.string().trim().max(200),
          pass: z.string().max(200).optional(),
          clearPass: z.boolean().optional(),
        }),
        revision: z.string().length(64),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await saveBlogMailSettings(
        prisma,
        Number(ctx.id),
        input.data,
        input.revision,
      );
      return {
        configured: result.configured,
        data: blogMailSettingsView(result.data),
        revision: result.revision,
      };
    }),

  /**
   * 后台：发一封测试信。
   *
   * 收件地址由管理员自己填 —— 账号表里没有邮箱字段，不能替用户猜一个。
   * 返回的是真实的发送结果：失败时 message 里是服务器给的原始原因，不粉饰。
   */
  testMail: authProcedure
    .input(z.object({ to: z.string().trim().email().max(200) }))
    .mutation(async ({ ctx, input }) => {
      const accountId = Number(ctx.id);
      const to = input.to.trim();
      const { config } = await resolveBlogMailConfig(prisma, accountId);
      return await sendBlogMail(
        {
          to,
          subject: "Ink 邮件服务测试",
          text: "这是一封来自 Ink 博客后台的测试邮件。收到它说明 SMTP 配置已经可用。",
        },
        config,
      );
    }),

  /** 后台：异常链接反馈列表。 */
  friendFeedbacks: authProcedure
    .input(
      z.object({ status: z.enum(FRIEND_FEEDBACK_STATUSES).optional() }).optional(),
    )
    .query(({ ctx, input }) =>
      listFriendFeedback(prisma, Number(ctx.id), input?.status),
    ),

  /** 后台：把一条反馈标记为已处理 / 已忽略。 */
  resolveFriendFeedback: authProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(["resolved", "dismissed"]),
      }),
    )
    .mutation(({ ctx, input }) =>
      resolveFriendFeedback(prisma, Number(ctx.id), input.id, input.status),
    ),

  /* ------------------------------------------------------------------ */
  /* 文章互动与反馈                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * 公开：某篇文章的三种表态数量 + 当前访客的选择。
   *
   * 只返回数量与自己的选择，不含任何访客身份信息。
   */
  publicReactionState: publicProcedure
    .input(
      z
        .object({
          accountId: z.number().int().positive().optional(),
          publishId: z.string().min(1).max(100),
          deviceId: z.string().max(64).optional(),
        })
        .optional(),
    )
    .query(({ input }) =>
      publicReactionState(prisma, input ?? { publishId: "" }),
    ),

  /**
   * 公开：设置 / 撤销表态。
   * kind = null 表示撤销（再次点击已选项）。
   */
  publicReactionSet: publicProcedure
    .input(reactionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const wait = reactionRateLimited(rateKey(ctx));
      if (wait)
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `操作过于频繁，请 ${wait} 秒后再试。`,
        });
      return setPublicReaction(prisma, input);
    }),

  /**
   * 公开：给作者提交一条私密反馈。
   * 幂等键保证同一次提交的重试不会新增多条。
   */
  publicArticleFeedback: publicProcedure
    .input(feedbackInputSchema)
    .mutation(async ({ ctx, input }) => {
      const wait = feedbackRateLimited(rateKey(ctx));
      if (wait)
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `提交过于频繁，请 ${wait} 秒后再试。`,
        });
      return submitArticleFeedback(prisma, input);
    }),

  /**
   * 公开：邮件服务是否真的可用。
   * 没配就不能对读者承诺「会发邮件提醒你」—— 只回一个布尔值。
   */
  publicMailNotice: publicProcedure.input(z.void()).query(async () => {
    const owner = await publicBlogOwner(prisma);
    const { config } = await resolveBlogMailConfig(prisma, owner);
    return { mailEnabled: !!config };
  }),

  /** 后台：作者看到的读者反馈列表（只含自己的文章）。 */
  articleFeedbacks: authProcedure
    .input(z.object({ status: z.enum(FEEDBACK_STATUSES).optional() }).optional())
    .query(({ ctx, input }) =>
      listArticleFeedbacks(prisma, Number(ctx.id), input?.status),
    ),

  /** 后台：保存回复（同时按订阅情况尝试发信，状态分开记）。 */
  articleFeedbackReply: authProcedure
    .input(feedbackReplySchema)
    .mutation(({ ctx, input }) =>
      replyArticleFeedback(prisma, Number(ctx.id), input),
    ),

  /** 后台：重发回复通知（已发成功的不重复发）。 */
  articleFeedbackResend: authProcedure
    .input(
      z.object({
        feedbackId: z.number().int().positive(),
        replyId: z.number().int().positive(),
      }),
    )
    .mutation(({ ctx, input }) =>
      resendArticleFeedbackMail(prisma, Number(ctx.id), input),
    ),

  /** 后台：归档一条反馈。 */
  articleFeedbackArchive: authProcedure
    .input(z.object({ feedbackId: z.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      archiveArticleFeedback(prisma, Number(ctx.id), input.feedbackId),
    ),

  /* ------------------------------------------------------------------ */
  /* 动态                                                                */
  /* ------------------------------------------------------------------ */

  /**
   * 公开：动态列表。
   *
   * 游标分页（发布时间 + id），筛选口径：
   *   all   全部公开动态
   *   media 含图片的
   *   note  不含图片的
   * month 按站点时区归月。只返回汇总与公开内容，不含任何访客身份。
   */
  publicMoments: publicProcedure
    .input(
      z
        .object({
          accountId: z.number().int().positive().optional(),
          filter: z.enum(MOMENT_FILTERS).optional(),
          month: z.string().max(10).optional(),
          cursor: momentCursorSchema.optional(),
          limit: z.number().int().min(1).max(30).optional(),
          deviceId: z.string().max(64).optional(),
        })
        .optional(),
    )
    .query(({ input }) => publicMoments(prisma, input ?? {})),

  /** 公开：可选月份（按真实公开内容算出来）。 */
  publicMomentMonths: publicProcedure
    .input(
      z
        .object({ accountId: z.number().int().positive().optional() })
        .optional(),
    )
    .query(({ input }) => publicMomentMonths(prisma, input?.accountId)),

  /** 公开：某条动态的共鸣状态。 */
  publicMomentResonanceState: publicProcedure
    .input(
      z.object({
        accountId: z.number().int().positive().optional(),
        momentId: z.number().int().positive(),
        deviceId: z.string().max(64).optional(),
      }),
    )
    .query(({ input }) => publicMomentResonanceState(prisma, input)),

  /** 公开：共鸣 / 取消共鸣。 */
  publicMomentResonanceSet: publicProcedure
    .input(
      z.object({
        accountId: z.number().int().positive().optional(),
        momentId: z.number().int().positive(),
        deviceId: z.string().max(64),
        resonated: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const wait = reactionRateLimited(rateKey(ctx));
      if (wait)
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `操作过于频繁，请 ${wait} 秒后再试。`,
        });
      return setPublicMomentResonance(prisma, input);
    }),

  /** 公开：给作者提交一条关于动态的私密反馈。 */
  publicMomentFeedback: publicProcedure
    .input(momentFeedbackInputSchema)
    .mutation(async ({ ctx, input }) => {
      const wait = feedbackRateLimited(rateKey(ctx));
      if (wait)
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `提交过于频繁，请 ${wait} 秒后再试。`,
        });
      const { momentId, ...rest } = input;
      return submitMomentFeedback(prisma, { noteId: momentId, ...rest });
    }),

  /**
   * 把一条闪念公开到动态流，或撤回它。
   *
   * 动态没有独立的数据表，也就没有「新建动态」这种操作 ——
   * 公开一条闪念就是公开它自己，撤回也只改一个开关，内容一个字不动。
   */
  momentPublish: authProcedure
    .input(
      z.object({
        noteId: z.number().int().positive(),
        published: z.boolean(),
      }),
    )
    .mutation(({ ctx, input }) =>
      setMomentPublished(
        prisma,
        Number(ctx.id),
        input.noteId,
        input.published,
      ),
    ),

  /** 后台：作者看到的动态反馈列表。 */
  momentFeedbacks: authProcedure
    .input(z.object({ status: z.enum(FEEDBACK_STATUSES).optional() }).optional())
    .query(({ ctx, input }) =>
      listMomentFeedbacks(prisma, Number(ctx.id), input?.status),
    ),

  /** 后台：保存对动态反馈的回复。 */
  momentFeedbackReply: authProcedure
    .input(feedbackReplySchema)
    .mutation(({ ctx, input }) =>
      replyMomentFeedback(prisma, Number(ctx.id), input),
    ),

  /** 后台：重发动态反馈的回复通知。 */
  momentFeedbackResend: authProcedure
    .input(
      z.object({
        feedbackId: z.number().int().positive(),
        replyId: z.number().int().positive(),
      }),
    )
    .mutation(({ ctx, input }) =>
      resendMomentFeedbackMail(prisma, Number(ctx.id), input),
    ),

  /** 后台：归档一条动态反馈。 */
  momentFeedbackArchive: authProcedure
    .input(z.object({ feedbackId: z.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      archiveMomentFeedback(prisma, Number(ctx.id), {
        feedbackId: input.feedbackId,
      }),
    ),
});
