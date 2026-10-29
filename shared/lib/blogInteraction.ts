import { z } from "zod";

/**
 * 文章互动与反馈的领域规则（前后端共用）。
 *
 * 三条边界：
 *   1. 表态只有三项，且每个匿名访客在同一篇文章上最多保留一种；
 *   2. 反馈默认私有，只有文章作者能看；
 *   3. 邮箱只用于「本次反馈的回复通知」，任何公开接口都不返回它。
 */

/** 三种表态。顺序即展示顺序。 */
export const REACTION_KINDS = ["inspired", "useful", "resonant"] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

export const REACTION_LABEL: Record<ReactionKind, string> = {
  inspired: "有启发",
  useful: "很实用",
  resonant: "有共鸣",
};

/** 反馈类型：默认「有疑问」。 */
export const FEEDBACK_TYPES = ["question", "supplement", "error"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_TYPE_LABEL: Record<FeedbackType, string> = {
  question: "有疑问",
  supplement: "补充线索",
  error: "内容有误",
};

/** 反馈处理状态。 */
export const FEEDBACK_STATUSES = ["pending", "replied", "archived"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  pending: "待处理",
  replied: "已回复",
  archived: "已归档",
};

/**
 * 回复通知的邮件状态。
 * skipped = 这条反馈本来就没订阅通知（作者仍然可以记录回复，只是不发信）。
 */
export const FEEDBACK_MAIL_STATUSES = [
  "none",
  "sending",
  "sent",
  "failed",
  "skipped",
] as const;
export type FeedbackMailStatus = (typeof FEEDBACK_MAIL_STATUSES)[number];

export const FEEDBACK_CONTENT_MAX = 500;
export const FEEDBACK_NICKNAME_MAX = 30;
export const FEEDBACK_EMAIL_MAX = 200;

/** 匿名设备的标识格式：与现有博客统计用的设备 ID 同一套。 */
export const DEVICE_ID_PATTERN = /^[0-9a-f]{32}$/;

/** 邮箱的宽松校验：够挡住明显的错字，不去追求 RFC 的完备。 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string) {
  return EMAIL_PATTERN.test((value ?? "").trim());
}

/** 可选邮箱：留空表示不订阅通知。 */
const optionalEmail = z
  .string()
  .trim()
  .max(FEEDBACK_EMAIL_MAX, "邮箱地址过长")
  .refine((v) => !v || isValidEmail(v), "请填写有效的邮箱地址");

/**
 * 设置表态的入参。
 * kind = null 表示撤销当前表态（再次点击已选项）。
 */
export const reactionInputSchema = z.object({
  publishId: z.string().min(1).max(100),
  deviceId: z.string().regex(DEVICE_ID_PATTERN, "无效的匿名标识"),
  kind: z.enum(REACTION_KINDS).nullable(),
});
export type ReactionInput = z.infer<typeof reactionInputSchema>;

/**
 * 反馈的字段规则（文章与动态共用）。
 *
 * 拆成基底 + 各自的定位字段：
 *   - 文章挂在 publishId 上；
 *   - 动态挂在 momentId 上。
 * 字段本身的校验只有这一份，两边不会出现口径差异。
 */
const feedbackFieldsSchema = z.object({
  type: z.enum(FEEDBACK_TYPES).default("question"),
  content: z
    .string()
    .trim()
    .min(1, "请填写反馈内容")
    .max(FEEDBACK_CONTENT_MAX, `反馈内容最多 ${FEEDBACK_CONTENT_MAX} 字`),
  nickname: z
    .string()
    .trim()
    .max(FEEDBACK_NICKNAME_MAX, `称呼最多 ${FEEDBACK_NICKNAME_MAX} 字`)
    .default(""),
  wantReply: z.boolean().default(false),
  email: optionalEmail.default(""),
  allowPublic: z.boolean().default(false),
  idempotencyKey: z
    .string()
    .min(8, "无效的提交标识")
    .max(80, "无效的提交标识")
    .regex(/^[A-Za-z0-9_-]+$/, "无效的提交标识"),
});

/**
 * 提交反馈的入参。
 * idempotencyKey 由前端在「打开表单时」生成一次：
 * 同一次提交的重试带同一个 key，不会新增多条；
 * 读者之后主动再提交一条，会带新的 key，不会被误判成重复。
 */
export const feedbackInputSchema = feedbackFieldsSchema
  .extend({
    publishId: z.string().min(1).max(100),
  })
  .refine((v) => !v.wantReply || isValidEmail(v.email), {
    message: "请填写有效的通知邮箱",
    path: ["email"],
  });
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;

/** 动态反馈的入参：字段规则同上，只是定位字段换成动态 id。 */
export const momentFeedbackInputSchema = feedbackFieldsSchema
  .extend({
    momentId: z.number().int().positive(),
  })
  .refine((v) => !v.wantReply || isValidEmail(v.email), {
    message: "请填写有效的通知邮箱",
    path: ["email"],
  });
export type MomentFeedbackInput = z.infer<typeof momentFeedbackInputSchema>;

/** 后台回复一条反馈。 */
export const feedbackReplySchema = z.object({
  feedbackId: z.number().int().positive(),
  content: z
    .string()
    .trim()
    .min(1, "请填写回复内容")
    .max(FEEDBACK_CONTENT_MAX, `回复最多 ${FEEDBACK_CONTENT_MAX} 字`),
});
export type FeedbackReplyInput = z.infer<typeof feedbackReplySchema>;
