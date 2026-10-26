import { Prisma, type PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import {
  normalizeFriendUrl,
  type FriendApplyOutcome,
  type FriendFeedbackType,
  type FriendStatus,
} from "../../shared/lib/blogFriends";
import { publicBlogOwner } from "./blog";
import { sendBlogMail } from "./blogMail";
import { resolveBlogMailConfig } from "./blogMailSettings";

/**
 * 友情链接的服务端逻辑。
 *
 * 三条硬规矩：
 *   1. 公开接口只返回「审核通过 + 未隐藏」的记录，且 DTO 里永远没有邮箱和审核说明；
 *   2. 后端是唯一的校验方 —— 前端校验只是提示；
 *   3. 邮件失败绝不影响已经完成的审核动作，只如实记录发送状态。
 */

/** 公开列表的字段白名单：邮箱、内部备注一律不在其中。 */
const publicSelect = {
  id: true,
  name: true,
  url: true,
  description: true,
  iconUrl: true,
} satisfies Prisma.blogFriendLinkSelect;

/** 后台可见的字段：邮箱与审核说明只在这里出现。 */
const adminSelect = {
  id: true,
  accountId: true,
  name: true,
  url: true,
  description: true,
  iconUrl: true,
  email: true,
  status: true,
  reviewNote: true,
  sortOrder: true,
  isHidden: true,
  emailStatus: true,
  emailSentAt: true,
  emailError: true,
  emailAttempts: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.blogFriendLinkSelect;

/**
 * 内部查询用的字段：比公开 DTO 多了 status，
 * 但仍然不含邮箱与审核说明 —— 去重判断只需要知道审核到哪一步了。
 */
const internalSelect = {
  ...publicSelect,
  status: true,
} satisfies Prisma.blogFriendLinkSelect;

export type PublicFriendLink = Prisma.blogFriendLinkGetPayload<{
  select: typeof publicSelect;
}>;

export type AdminFriendLink = Prisma.blogFriendLinkGetPayload<{
  select: typeof adminSelect;
}>;

/** 公开列表：只给审核通过且未隐藏的友链，按后台排序。 */
export async function publicFriendLinks(
  db: PrismaClient,
  input: { accountId?: number; q?: string } = {},
): Promise<PublicFriendLink[]> {
  const owner = await publicBlogOwner(db, input.accountId);
  const keyword = (input.q ?? "").trim();
  const where: Prisma.blogFriendLinkWhereInput = {
    accountId: owner,
    status: "approved",
    isHidden: false,
  };
  if (keyword) {
    where.OR = [
      { name: { contains: keyword, mode: "insensitive" } },
      { description: { contains: keyword, mode: "insensitive" } },
    ];
  }
  return db.blogFriendLink.findMany({
    where,
    select: publicSelect,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
}

/* -------------------------------------------------------------------------- */
/* 限流                                                                       */
/* -------------------------------------------------------------------------- */

const APPLY_LIMIT = 5;
const APPLY_WINDOW_MS = 10 * 60 * 1000;
const FEEDBACK_LIMIT = 10;
const FEEDBACK_WINDOW_MS = 60 * 60 * 1000;

const applyHits = new Map<string, number[]>();
const feedbackHits = new Map<string, number[]>();

/** 滑动窗口计数。返回 0 表示放行，否则返回还需等待的秒数。 */
function hitWindow(
  store: Map<string, number[]>,
  key: string,
  limit: number,
  windowMs: number,
) {
  const now = Date.now();
  const hits = (store.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    store.set(key, hits);
    return Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000));
  }
  hits.push(now);
  store.set(key, hits);
  // 顺手清掉过期的键，避免长期运行后无限增长。
  if (store.size > 5000) {
    for (const [k, v] of store) {
      if (!v.some((t) => now - t < windowMs)) store.delete(k);
    }
  }
  return 0;
}

export function friendApplyRateLimited(key: string) {
  return hitWindow(applyHits, key, APPLY_LIMIT, APPLY_WINDOW_MS);
}

export function friendFeedbackRateLimited(key: string) {
  return hitWindow(feedbackHits, key, FEEDBACK_LIMIT, FEEDBACK_WINDOW_MS);
}

/* -------------------------------------------------------------------------- */
/* 申请                                                                       */
/* -------------------------------------------------------------------------- */

function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/** 内部记录 → 公开 DTO。status 只用来判断重复申请，不外泄。 */
function toPublicLink(row: {
  id: number;
  name: string;
  url: string;
  description: string;
  iconUrl: string;
}): PublicFriendLink {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    description: row.description,
    iconUrl: row.iconUrl,
  };
}

/**
 * 提交友链申请。
 *
 * 去重口径：地址先规范化（空白 / 主机名大小写 / 默认端口 / 结尾斜杠），
 * 同一站点只有一条记录 —— 并发提交由数据库唯一约束兜底。
 *
 * 返回结果只含公开信息：邮箱和内部备注不会出现在这里。
 */
export async function applyFriendLink(
  db: PrismaClient,
  input: {
    accountId?: number;
    name: string;
    url: string;
    description: string;
    email: string;
    iconUrl: string;
  },
) {
  const owner = await publicBlogOwner(db, input.accountId);
  const canonical = normalizeFriendUrl(input.url);
  if (!canonical) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "请填写完整的 HTTP/HTTPS 地址，例如 https://example.com",
    });
  }
  const data = {
    name: input.name.trim(),
    description: input.description.trim(),
    iconUrl: (input.iconUrl ?? "").trim(),
    email: input.email.trim(),
  };

  const existing = await db.blogFriendLink.findUnique({
    where: { accountId_url: { accountId: owner, url: canonical } },
    select: internalSelect,
  });
  if (existing) {
    if (existing.status === "pending") {
      return {
        outcome: "pending" as FriendApplyOutcome,
        link: toPublicLink(existing),
      };
    }
    if (existing.status === "approved") {
      return {
        outcome: "approved" as FriendApplyOutcome,
        link: toPublicLink(existing),
      };
    }
    // 之前被拒过：允许重新申请，把这条记录重置回待审核。
    const reset = await db.blogFriendLink.update({
      where: { id: existing.id },
      data: {
        ...data,
        status: "pending",
        reviewNote: "",
        emailStatus: "none",
        emailError: "",
        emailSentAt: null,
        emailAttempts: 0,
      },
      select: internalSelect,
    });
    return { outcome: "created" as FriendApplyOutcome, link: toPublicLink(reset) };
  }

  try {
    // 新申请排到末尾：sortOrder 默认 0 会让它直接跳到列表最前面。
    const maxOrder = await db.blogFriendLink.aggregate({
      where: { accountId: owner },
      _max: { sortOrder: true },
    });
    const created = await db.blogFriendLink.create({
      data: {
        ...data,
        url: canonical,
        accountId: owner,
        status: "pending",
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      },
      select: internalSelect,
    });
    return { outcome: "created" as FriendApplyOutcome, link: toPublicLink(created) };
  } catch (error) {
    // 并发提交：唯一约束挡住了重复入库，重新读一次按已有记录处理。
    if (!isUniqueViolation(error)) throw error;
    const again = await db.blogFriendLink.findUnique({
      where: { accountId_url: { accountId: owner, url: canonical } },
      select: internalSelect,
    });
    if (!again) throw error;
    const outcome: FriendApplyOutcome =
      again.status === "approved"
        ? "approved"
        : again.status === "pending"
          ? "pending"
          : "created";
    return { outcome, link: toPublicLink(again) };
  }
}

/* -------------------------------------------------------------------------- */
/* 异常链接反馈                                                               */
/* -------------------------------------------------------------------------- */

/**
 * 提交异常链接反馈。
 * 一次反馈不会隐藏或删除站点 —— 只进后台待处理列表。
 */
export async function submitFriendFeedback(
  db: PrismaClient,
  input: {
    accountId?: number;
    linkId?: number;
    type: FriendFeedbackType;
    message: string;
  },
) {
  const owner = await publicBlogOwner(db, input.accountId);
  let linkName = "";
  let linkUrl = "";
  if (input.linkId) {
    const link = await db.blogFriendLink.findFirst({
      where: { id: input.linkId, accountId: owner },
      select: { id: true, name: true, url: true },
    });
    if (link) {
      linkName = link.name;
      linkUrl = link.url;
    }
  }
  const row = await db.blogFriendFeedback.create({
    data: {
      accountId: owner,
      linkId: input.linkId ?? null,
      linkName,
      linkUrl,
      type: input.type,
      message: (input.message ?? "").trim(),
      status: "pending",
    },
    select: { id: true, createdAt: true },
  });
  return { id: row.id, receivedAt: row.createdAt };
}

/* -------------------------------------------------------------------------- */
/* 后台管理                                                                   */
/* -------------------------------------------------------------------------- */

export async function listFriendLinks(
  db: PrismaClient,
  accountId: number,
  status?: FriendStatus,
) {
  const where: Prisma.blogFriendLinkWhereInput = { accountId };
  if (status) where.status = status;
  return db.blogFriendLink.findMany({
    where,
    select: adminSelect,
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
}

export async function getFriendLink(
  db: PrismaClient,
  accountId: number,
  id: number,
) {
  const link = await db.blogFriendLink.findFirst({
    where: { id, accountId },
    select: adminSelect,
  });
  if (!link)
    throw new TRPCError({ code: "NOT_FOUND", message: "友链不存在或不属于当前账号" });
  return link;
}

/** 编辑公开字段。地址改动后要重新走一遍规范化，避免产生重复记录。 */
export async function updateFriendLink(
  db: PrismaClient,
  accountId: number,
  input: {
    id: number;
    name: string;
    url: string;
    description: string;
    iconUrl: string;
  },
) {
  const current = await getFriendLink(db, accountId, input.id);
  const canonical = normalizeFriendUrl(input.url);
  if (!canonical) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "请填写完整的 HTTP/HTTPS 地址",
    });
  }
  const clash = await db.blogFriendLink.findUnique({
    where: { accountId_url: { accountId, url: canonical } },
    select: { id: true },
  });
  if (clash && clash.id !== current.id) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "这个地址已经被另一条友链占用了",
    });
  }
  return db.blogFriendLink.update({
    where: { id: current.id },
    data: {
      name: input.name.trim(),
      url: canonical,
      description: input.description.trim(),
      iconUrl: (input.iconUrl ?? "").trim(),
    },
    select: adminSelect,
  });
}

/** 隐藏 / 恢复公开展示。只动 isHidden，审核记录原样保留。 */
export async function setFriendLinkHidden(
  db: PrismaClient,
  accountId: number,
  id: number,
  isHidden: boolean,
) {
  const current = await getFriendLink(db, accountId, id);
  return db.blogFriendLink.update({
    where: { id: current.id },
    data: { isHidden },
    select: adminSelect,
  });
}

/** 调整排序：传入完整的有序 id 列表。 */
export async function reorderFriendLinks(
  db: PrismaClient,
  accountId: number,
  ids: number[],
) {
  const owned = await db.blogFriendLink.findMany({
    where: { accountId },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((o) => o.id));
  if (ids.some((id) => !ownedIds.has(id))) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "排序列表里包含了不属于当前账号的友链",
    });
  }
  await db.$transaction(
    ids.map((id, index) =>
      db.blogFriendLink.update({
        where: { id },
        data: { sortOrder: index + 1 },
      }),
    ),
  );
  return listFriendLinks(db, accountId);
}

/* -------------------------------------------------------------------------- */
/* 审核 + 邮件通知                                                            */
/* -------------------------------------------------------------------------- */

function reviewEmailBody(
  link: { name: string; url: string },
  decision: "approved" | "rejected",
  note: string,
) {
  const title = decision === "approved" ? "已通过" : "未通过";
  const lines = [
    `你好，`,
    ``,
    `你提交的友情链接申请「${link.name}」（${link.url}）审核结果为：${title}。`,
    ``,
  ];
  if (note.trim()) lines.push(`审核说明：${note.trim()}`, ``);
  if (decision === "approved") {
    lines.push(`通过审核后，站点会出现在友链列表中。`);
  } else {
    lines.push(`如有疑问，可以直接回复这封邮件。`);
  }
  lines.push(``, `—— ${process.env.BLOG_PUBLIC_URL || "本站"}`);
  return lines.join("\n");
}

/**
 * 审核一条申请。
 *
 * 邮件失败不会回滚审核结果 —— 审核已经生效，邮件只是通知。
 * 发送状态如实写进 emailStatus / emailError，后台能看到并重试。
 */
export async function reviewFriendLink(
  db: PrismaClient,
  accountId: number,
  input: { id: number; decision: "approved" | "rejected"; note?: string },
) {
  const current = await getFriendLink(db, accountId, input.id);
  const note = (input.note ?? "").trim();
  const updated = await db.blogFriendLink.update({
    where: { id: current.id },
    data: { status: input.decision, reviewNote: note },
    select: adminSelect,
  });
  const mailed = await deliverFriendMail(db, updated, input.decision, note);
  return { link: mailed, mail: mailed };
}

/**
 * 发送（或重发）审核通知。
 *
 * 已经发成功过的不会重复发 —— 避免同一个人收到两封一样的邮件。
 */
export async function deliverFriendMail(
  db: PrismaClient,
  link: AdminFriendLink,
  decision: "approved" | "rejected",
  note: string,
) {
  if (!link.email) {
    return db.blogFriendLink.update({
      where: { id: link.id },
      data: {
        emailStatus: "none",
        emailError: "申请未填写邮箱，未发送通知。",
        emailAttempts: { increment: 1 },
      },
      select: adminSelect,
    });
  }
  const { config } = await resolveBlogMailConfig(db, link.accountId);
  const result = await sendBlogMail(
    {
      to: link.email,
      subject:
        decision === "approved"
          ? `友情链接申请已通过：${link.name}`
          : `友情链接申请未通过：${link.name}`,
      text: reviewEmailBody(link, decision, note),
    },
    config,
  );
  return db.blogFriendLink.update({
    where: { id: link.id },
    data: {
      emailStatus: result.status,
      emailError: result.status === "sent" ? "" : result.message,
      emailSentAt: result.status === "sent" ? new Date() : null,
      emailAttempts: { increment: 1 },
    },
    select: adminSelect,
  });
}

/** 后台手动重发通知。已发送过的直接跳过，避免重复打扰。 */
export async function resendFriendLinkMail(
  db: PrismaClient,
  accountId: number,
  id: number,
) {
  const current = await getFriendLink(db, accountId, id);
  if (current.status === "pending") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "这条申请还没有审核结果，暂时无法发送通知",
    });
  }
  if (current.emailStatus === "sent") {
    return { link: current, skipped: true, message: "这封通知已经发过了，不重复发送。" };
  }
  const decision = current.status === "approved" ? "approved" : "rejected";
  const link = await deliverFriendMail(db, current, decision, current.reviewNote);
  return { link, skipped: false, message: link.emailError || "邮件已发送。" };
}

/* -------------------------------------------------------------------------- */
/* 反馈处理                                                                   */
/* -------------------------------------------------------------------------- */

export async function listFriendFeedback(
  db: PrismaClient,
  accountId: number,
  status?: "pending" | "resolved" | "dismissed",
) {
  const where: Prisma.blogFriendFeedbackWhereInput = { accountId };
  if (status) where.status = status;
  return db.blogFriendFeedback.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function resolveFriendFeedback(
  db: PrismaClient,
  accountId: number,
  id: number,
  status: "resolved" | "dismissed",
) {
  const row = await db.blogFriendFeedback.findFirst({
    where: { id, accountId },
  });
  if (!row)
    throw new TRPCError({ code: "NOT_FOUND", message: "反馈不存在或不属于当前账号" });
  return db.blogFriendFeedback.update({
    where: { id: row.id },
    data: { status },
  });
}
