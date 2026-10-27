import { Prisma, type PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { publicBlogOwner } from "./blog";
import { sendBlogMail } from "./blogMail";
import { resolveBlogMailConfig } from "./blogMailSettings";
import { publicText } from "./publicText";
import type {
  FeedbackStatus,
  FeedbackType,
} from "../../shared/lib/blogInteraction";

/**
 * 动态的读者反馈闭环。
 *
 * 结构与文章反馈一致，但挂在动态上：
 *   - 公开提交：默认私有，邮箱只存在库里，公开接口永远不读；
 *   - 幂等：同一个 idempotencyKey 只会入库一次；
 *   - 回复内容、处理状态、邮件发送状态三者分开存 ——
 *     保存成功 ≠ 邮件已发出。
 */

/** 反馈的动态链接：定位到具体那一条。 */
function feedbackMomentUrl(noteId: number) {
  const base = (
    process.env.BLOG_PUBLIC_URL ||
    process.env.NEXTAUTH_URL ||
    ""
  ).replace(/\/+$/, "");
  return base ? `${base}/blog/moments#m${noteId}` : `/blog/moments#m${noteId}`;
}

export type SubmittedMomentFeedback = {
  id: number;
  /** true = 这次提交命中了幂等键，之前已经收过。 */
  duplicate: boolean;
};

/**
 * 确认这条动态当前公开可访问 —— 撤回后不再接收反馈。
 *
 * 动态就是闪念：查的是「已公开到动态流的闪念」。
 */
async function findPublicMoment(
  db: PrismaClient,
  accountId: number,
  noteId: number,
) {
  const moment = await db.notes.findFirst({
    where: {
      id: noteId,
      accountId,
      isMoment: true,
      momentPublishedAt: { not: null },
      isRecycle: false,
    },
    select: { id: true },
  });
  if (!moment)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "动态不存在或已撤回，无法接收反馈。",
    });
  return moment;
}

/** 公开提交反馈。 */
export async function submitMomentFeedback(
  db: PrismaClient,
  input: {
    accountId?: number;
    noteId: number;
    type: FeedbackType;
    content: string;
    nickname: string;
    wantReply: boolean;
    email: string;
    allowPublic: boolean;
    idempotencyKey: string;
  },
): Promise<SubmittedMomentFeedback> {
  const owner = await publicBlogOwner(db, input.accountId);
  const moment = await findPublicMoment(db, owner, input.noteId);
  const data = {
    accountId: owner,
    noteId: moment.id,
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
    const row = await db.blogMomentFeedback.create({ data });
    return { id: row.id, duplicate: false };
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    )
      throw error;
    // 同一次提交重试：返回已存在的那条。
    const existing = await db.blogMomentFeedback.findUnique({
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

const adminMomentFeedbackSelect = {
  id: true,
  accountId: true,
  noteId: true,
  // 反馈挂在哪条动态上：带上闪念的正文摘要，后台一眼看得出上下文。
  note: {
    select: {
      id: true,
      content: true,
      momentPublishedAt: true,
      isMoment: true,
    },
  },
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
} satisfies Prisma.blogMomentFeedbackSelect;

export type AdminMomentFeedback = Prisma.blogMomentFeedbackGetPayload<{
  select: typeof adminMomentFeedbackSelect;
}>;

/** 作者看自己动态收到的反馈。只按归属账号过滤。 */
export async function listMomentFeedbacks(
  db: PrismaClient,
  accountId: number,
  status?: FeedbackStatus,
) {
  const where: Prisma.blogMomentFeedbackWhereInput = { accountId };
  if (status) where.status = status;
  const rows = await db.blogMomentFeedback.findMany({
    where,
    select: adminMomentFeedbackSelect,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  // 闪念正文是 markdown，后台列表要的是一行能看懂的摘要 ——
  // 剥 markdown 的规则只有服务端这一份（publicText），客户端不另写一套。
  return rows.map((row) => ({
    ...row,
    note: {
      ...row.note,
      summary: publicText(row.note.content ?? "").slice(0, 80),
    },
  }));
}

async function ownedFeedback(
  db: PrismaClient,
  accountId: number,
  feedbackId: number,
) {
  const row = await db.blogMomentFeedback.findFirst({
    where: { id: feedbackId, accountId },
    select: adminMomentFeedbackSelect,
  });
  if (!row)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "反馈不存在或不属于当前账号",
    });
  return row;
}

function feedbackReplyMail(
  feedback: { nickname: string; content: string; noteId: number },
  reply: string,
) {
  return [
    `你好${feedback.nickname ? "，" + feedback.nickname : ""}：`,
    ``,
    `你给一条动态留下了反馈，作者回复如下：`,
    ``,
    reply,
    ``,
    `—— 反馈原文`,
    feedback.content,
    ``,
    `动态地址：${feedbackMomentUrl(feedback.noteId)}`,
    ``,
    `这封邮件是你为这条反馈主动订阅的回复通知，不是营销邮件。`,
  ].join("\n");
}

/** 保存一条回复。 */
export async function replyMomentFeedback(
  db: PrismaClient,
  accountId: number,
  input: { feedbackId: number; content: string },
) {
  const feedback = await ownedFeedback(db, accountId, input.feedbackId);
  const content = input.content.trim();
  const reply = await db.blogMomentFeedbackReply.create({
    data: {
      accountId,
      feedbackId: feedback.id,
      content,
      mailStatus: "none",
    },
  });
  await db.blogMomentFeedback.update({
    where: { id: feedback.id },
    data: { status: "replied" },
  });
  const mailed = await deliverMomentFeedbackMail(db, feedback, reply.id);
  return { feedbackId: feedback.id, replyId: reply.id, ...mailed };
}

/**
 * 发送回复通知。
 *
 * 没订阅通知 / 没填邮箱 → 标记 skipped，明确告诉作者「读者未订阅」，
 * 绝不显示成「已通知读者」。邮件失败不影响已经保存的回复。
 */
export async function deliverMomentFeedbackMail(
  db: PrismaClient,
  feedback: AdminMomentFeedback,
  replyId: number,
) {
  const reply = await db.blogMomentFeedbackReply.findFirst({
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
    const updated = await db.blogMomentFeedbackReply.update({
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
  await db.blogMomentFeedbackReply.update({
    where: { id: reply.id },
    data: { mailStatus: "sending", mailError: "" },
  });
  const { config } = await resolveBlogMailConfig(db, feedback.accountId);
  const result = await sendBlogMail(
    {
      to: feedback.email,
      subject: "你收到一条关于动态的回复",
      text: feedbackReplyMail(
        {
          nickname: feedback.nickname,
          content: feedback.content,
          noteId: feedback.noteId,
        },
        reply.content,
      ),
    },
    config,
  );
  const updated = await db.blogMomentFeedbackReply.update({
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
export async function resendMomentFeedbackMail(
  db: PrismaClient,
  accountId: number,
  input: { feedbackId: number; replyId: number },
) {
  const feedback = await ownedFeedback(db, accountId, input.feedbackId);
  return deliverMomentFeedbackMail(db, feedback, input.replyId);
}

/** 归档反馈。归档后不再出现在待处理列表里。 */
export async function archiveMomentFeedback(
  db: PrismaClient,
  accountId: number,
  input: { feedbackId: number },
) {
  const feedback = await ownedFeedback(db, accountId, input.feedbackId);
  return db.blogMomentFeedback.update({
    where: { id: feedback.id },
    data: { status: "archived" },
    select: adminMomentFeedbackSelect,
  });
}
