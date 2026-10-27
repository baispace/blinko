import { Prisma, type PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { publicPublicationWhere } from "./publication";
import { publicBlogOwner } from "./blog";
import { sendBlogMail } from "./blogMail";
import { resolveBlogMailConfig } from "./blogMailSettings";
import { hitRateWindow } from "./blogRateLimit";
import { invalidatePublicStats } from "./blogPublicStatsCache";
import {
  REACTION_KINDS,
  type ReactionKind,
  type FeedbackType,
  type FeedbackStatus,
} from "../../shared/lib/blogInteraction";

/**
 * 文章互动与反馈的服务端逻辑。
 *
 * 四条硬规矩：
 *   1. 公开互动只能挂在「当前可访问的公开文章」上 —— 撤回或删除后立刻失效；
 *   2. 反馈默认私有，邮箱与内部回复永远不出现在公开接口里；
 *   3. 表态的数量始终由事实表现算，不存计数器 —— 不可能出现负数或漂移；
 *   4. 邮件失败不回滚已保存的反馈与回复，只如实记录发送状态。
 */

/* -------------------------------------------------------------------------- */
/* 限流                                                                       */
/* -------------------------------------------------------------------------- */

const REACTION_LIMIT = 30;
const REACTION_WINDOW_MS = 60 * 1000;
const FEEDBACK_LIMIT = 5;
const FEEDBACK_WINDOW_MS = 10 * 60 * 1000;

export function reactionRateLimited(key: string) {
  return hitRateWindow(key, REACTION_LIMIT, REACTION_WINDOW_MS);
}

export function feedbackRateLimited(key: string) {
  return hitRateWindow(key, FEEDBACK_LIMIT, FEEDBACK_WINDOW_MS);
}

/* -------------------------------------------------------------------------- */
/* 表态                                                                       */
/* -------------------------------------------------------------------------- */

export type ReactionCounts = Record<ReactionKind, number>;

export type ReactionState = {
  /** 三种表态各自的数量（没有就是 0，不会是负数）。 */
  counts: ReactionCounts;
  /** 文章总回应数 = 三种表态之和。反馈提交数不计入。 */
  total: number;
  /** 当前访客在这一篇上的选择；没有就是 null。 */
  mine: ReactionKind | null;
};

function emptyCounts(): ReactionCounts {
  return { inspired: 0, useful: 0, resonant: 0 };
}

/** 找到一篇「当前可访问的公开文章」。找不到就当作不存在。 */
async function findPublicNote(
  db: PrismaClient,
  accountId: number,
  publishId: string,
) {
  return db.notes.findFirst({
    where: { ...publicPublicationWhere, accountId, publishId },
    select: {
      id: true,
      publishId: true,
      accountId: true,
      publication: { select: { title: true } },
    },
  });
}

/**
 * 表态状态：数量由事实表现算，所以永远和真实行数一致。
 */
async function reactionState(
  db: PrismaClient,
  accountId: number,
  noteId: number,
  deviceId: string,
): Promise<ReactionState> {
  const [grouped, mine] = await Promise.all([
    db.blogArticleReaction.groupBy({
      by: ["kind"],
      where: { accountId, noteId },
      _count: { _all: true },
    }),
    db.blogArticleReaction.findUnique({
      where: {
        accountId_noteId_deviceId: { accountId, noteId, deviceId },
      },
      select: { kind: true },
    }),
  ]);
  const counts = emptyCounts();
  for (const row of grouped) {
    const kind = row.kind as ReactionKind;
    if (kind in counts) counts[kind] = row._count._all;
  }
  const total = REACTION_KINDS.reduce((sum, kind) => sum + counts[kind], 0);
  return {
    counts,
    total,
    mine: (mine?.kind as ReactionKind | undefined) ?? null,
  };
}

/** 公开读取：某篇文章的三种表态数量 + 当前访客的选择。 */
export async function publicReactionState(
  db: PrismaClient,
  input: { accountId?: number; publishId: string; deviceId?: string },
): Promise<ReactionState> {
  const owner = await publicBlogOwner(db, input.accountId);
  const note = await findPublicNote(db, owner, input.publishId);
  if (!note) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "文章未公开或已撤回",
    });
  }
  return reactionState(db, owner, note.id, input.deviceId ?? "");
}

/**
 * 设置表态。
 *
 * kind = null 表示撤销。
 *
 * 并发下不会多计数：唯一约束 (accountId, noteId, deviceId) 保证同一访客
 * 在同一篇文章上只有一行；数量从事实表现算，连点也只算一次。
 */
export async function setPublicReaction(
  db: PrismaClient,
  input: {
    accountId?: number;
    publishId: string;
    deviceId: string;
    kind: ReactionKind | null;
  },
): Promise<ReactionState> {
  const owner = await publicBlogOwner(db, input.accountId);
  const note = await findPublicNote(db, owner, input.publishId);
  if (!note) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "文章未公开或已撤回",
    });
  }
  const key = {
    accountId: owner,
    noteId: note.id,
    deviceId: input.deviceId,
  };
  if (input.kind === null) {
    await db.blogArticleReaction.deleteMany({ where: key });
  } else {
    await db.blogArticleReaction.upsert({
      where: { accountId_noteId_deviceId: key },
      create: { ...key, kind: input.kind },
      update: { kind: input.kind },
    });
  }
  // 读者回应进了公开汇总，让关于页的站点数据立刻重算。
  invalidatePublicStats(owner);
  return reactionState(db, owner, note.id, input.deviceId);
}

/* -------------------------------------------------------------------------- */
/* 反馈提交                                                                   */
/* -------------------------------------------------------------------------- */

export type SubmittedFeedback = {
  id: number;
  /** true = 这次提交命中了幂等键，之前已经收过（同一次重试）。 */
  duplicate: boolean;
};

/**
 * 提交给作者的私密反馈。
 *
 * 幂等：同一个 idempotencyKey 只会入库一次 —— 网络失败后的重试不会多出几条。
 * 但读者之后主动再提交一条会用新的 key，不会被误判成重复。
 */
export async function submitArticleFeedback(
  db: PrismaClient,
  input: {
    accountId?: number;
    publishId: string;
    type: FeedbackType;
    content: string;
    nickname: string;
    wantReply: boolean;
    email: string;
    allowPublic: boolean;
    idempotencyKey: string;
  },
): Promise<SubmittedFeedback> {
  const owner = await publicBlogOwner(db, input.accountId);
  const note = await findPublicNote(db, owner, input.publishId);
  if (!note) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "文章未公开或已撤回，无法接收反馈。",
    });
  }
  const data = {
    accountId: owner,
    noteId: note.id,
    title: note.publication?.title || "",
    publishId: note.publishId || input.publishId,
    type: input.type,
    content: input.content.trim(),
    nickname: input.nickname.trim(),
    wantReply: input.wantReply,
    // 没勾订阅就不存邮箱：取消勾选后不提交此前填写的地址。
    email: input.wantReply ? input.email.trim() : "",
    allowPublic: input.allowPublic,
    idempotencyKey: input.idempotencyKey,
  };
  try {
    const row = await db.blogArticleFeedback.create({ data });
    return { id: row.id, duplicate: false };
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    )
      throw error;
    // 同一次提交重试：返回已存在的那条。
    const existing = await db.blogArticleFeedback.findUnique({
      where: {
        accountId_idempotencyKey: {
          accountId: owner,
          idempotencyKey: input.idempotencyKey,
        },
      },
      select: { id: true },
    });
    if (!existing) throw error;
    return { id: existing.id, duplicate: true };
  }
}

/* -------------------------------------------------------------------------- */
/* 后台：查看与处理                                                           */
/* -------------------------------------------------------------------------- */

const adminFeedbackSelect = {
  id: true,
  accountId: true,
  noteId: true,
  title: true,
  publishId: true,
  type: true,
  content: true,
  nickname: true,
  wantReply: true,
  email: true,
  allowPublic: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  replies: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      content: true,
      mailStatus: true,
      mailError: true,
      mailSentAt: true,
      mailAttempts: true,
      createdAt: true,
    },
  },
} satisfies Prisma.blogArticleFeedbackSelect;

export type AdminArticleFeedback = Prisma.blogArticleFeedbackGetPayload<{
  select: typeof adminFeedbackSelect;
}>;

/** 作者看自己文章收到的反馈。只按归属账号过滤，跨账号读不到。 */
export async function listArticleFeedbacks(
  db: PrismaClient,
  accountId: number,
  status?: FeedbackStatus,
) {
  const where: Prisma.blogArticleFeedbackWhereInput = { accountId };
  if (status) where.status = status;
  return db.blogArticleFeedback.findMany({
    where,
    select: adminFeedbackSelect,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

async function ownedFeedback(
  db: PrismaClient,
  accountId: number,
  feedbackId: number,
) {
  const row = await db.blogArticleFeedback.findFirst({
    where: { id: feedbackId, accountId },
    select: adminFeedbackSelect,
  });
  if (!row)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "反馈不存在或不属于当前账号",
    });
  return row;
}

/** 反馈的公开文章链接：优先用配置的公开地址，其次退回工作区地址。 */
function feedbackArticleUrl(publishId: string) {
  const base = (
    process.env.BLOG_PUBLIC_URL ||
    process.env.NEXTAUTH_URL ||
    ""
  ).replace(/\/+$/, "");
  return base ? `${base}/blog/${publishId}` : `/blog/${publishId}`;
}

function feedbackReplyMail(
  feedback: { title: string; publishId: string; nickname: string; content: string; type: string },
  reply: string,
) {
  return [
    `你好${feedback.nickname ? "，" + feedback.nickname : ""}：`,
    ``,
    `你给《${feedback.title}》留下了一条反馈，作者回复如下：`,
    ``,
    reply,
    ``,
    `—— 反馈原文`,
    feedback.content,
    ``,
    `文章地址：${feedbackArticleUrl(feedback.publishId)}`,
    ``,
    `这封邮件是你为这条反馈主动订阅的回复通知，不是营销邮件。`,
  ].join("\n");
}

/**
 * 保存一条回复。
 *
 * 回复内容、处理状态、邮件发送状态三者分开存：
 *   - 回复写进 blogArticleFeedbackReply（历史不会被覆盖）；
 *   - 处理状态变成「已回复」；
 *   - 邮件状态单独记，保存成功 ≠ 邮件已发出。
 */
export async function replyArticleFeedback(
  db: PrismaClient,
  accountId: number,
  input: { feedbackId: number; content: string },
) {
  const feedback = await ownedFeedback(db, accountId, input.feedbackId);
  const content = input.content.trim();
  const reply = await db.blogArticleFeedbackReply.create({
    data: {
      accountId,
      feedbackId: feedback.id,
      content,
      mailStatus: "none",
    },
  });
  await db.blogArticleFeedback.update({
    where: { id: feedback.id },
    data: { status: "replied" },
  });
  const mailed = await deliverFeedbackMail(db, feedback, reply.id);
  return { feedbackId: feedback.id, replyId: reply.id, ...mailed };
}

/**
 * 发送回复通知。
 *
 * 没订阅通知 / 没填邮箱 → 标记为 skipped，明确告诉作者「读者未订阅」，
 * 绝不显示成「已通知读者」。
 * 邮件失败不影响已经保存的回复。
 */
export async function deliverFeedbackMail(
  db: PrismaClient,
  feedback: AdminArticleFeedback,
  replyId: number,
) {
  const reply = await db.blogArticleFeedbackReply.findFirst({
    where: { id: replyId, feedbackId: feedback.id },
    select: { id: true, content: true, mailStatus: true },
  });
  if (!reply)
    throw new TRPCError({ code: "NOT_FOUND", message: "回复记录不存在" });
  // 已经发成功的不重复发。
  if (reply.mailStatus === "sent") {
    return { mailStatus: "sent" as const, mailError: "", skipped: false };
  }
  if (!feedback.wantReply || !feedback.email) {
    const updated = await db.blogArticleFeedbackReply.update({
      where: { id: reply.id },
      data: {
        mailStatus: "skipped",
        mailError: "读者未订阅回复通知，未发送邮件。",
        mailAttempts: { increment: 1 },
      },
      select: { mailStatus: true, mailError: true },
    });
    return {
      mailStatus: updated.mailStatus,
      mailError: updated.mailError,
      skipped: true,
    };
  }
  await db.blogArticleFeedbackReply.update({
    where: { id: reply.id },
    data: { mailStatus: "sending", mailError: "" },
  });
  const { config } = await resolveBlogMailConfig(db, feedback.accountId);
  const result = await sendBlogMail(
    {
      to: feedback.email,
      subject: `你收到一条关于《${feedback.title}》的回复`,
      text: feedbackReplyMail(
        {
          title: feedback.title,
          publishId: feedback.publishId,
          nickname: feedback.nickname,
          content: feedback.content,
          type: feedback.type,
        },
        reply.content,
      ),
    },
    config,
  );
  const updated = await db.blogArticleFeedbackReply.update({
    where: { id: reply.id },
    data: {
      mailStatus: result.status,
      mailError: result.status === "sent" ? "" : result.message,
      mailSentAt: result.status === "sent" ? new Date() : null,
      mailAttempts: { increment: 1 },
    },
    select: { mailStatus: true, mailError: true },
  });
  return {
    mailStatus: updated.mailStatus,
    mailError: updated.mailError,
    skipped: false,
  };
}

/** 重发通知：只对失败或未发过的回复有效。 */
export async function resendArticleFeedbackMail(
  db: PrismaClient,
  accountId: number,
  input: { feedbackId: number; replyId: number },
) {
  const feedback = await ownedFeedback(db, accountId, input.feedbackId);
  return deliverFeedbackMail(db, feedback, input.replyId);
}

/** 归档一条反馈。 */
export async function archiveArticleFeedback(
  db: PrismaClient,
  accountId: number,
  feedbackId: number,
) {
  const feedback = await ownedFeedback(db, accountId, feedbackId);
  return db.blogArticleFeedback.update({
    where: { id: feedback.id },
    data: { status: "archived" },
    select: adminFeedbackSelect,
  });
}
