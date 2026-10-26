import { z } from "zod";

/**
 * 友情链接的领域规则（前后端共用）。
 *
 * 为什么放 shared：去重规则与字段长度必须前后端完全一致 ——
 * 前端只是提示，真正的判断永远在后端；两边各写一份必然会漂移。
 */

/** 公开字段的长度上限。后端为准，前端用同一份数字做字数统计。 */
export const FRIEND_NAME_MAX = 30;
export const FRIEND_DESC_MAX = 100;
export const FRIEND_URL_MAX = 300;
export const FRIEND_EMAIL_MAX = 120;
export const FRIEND_ICON_MAX = 500;
export const FRIEND_MESSAGE_MAX = 300;

/** 审核状态：pending 待审核 / approved 已通过 / rejected 已拒绝。 */
export const FRIEND_STATUSES = ["pending", "approved", "rejected"] as const;
export type FriendStatus = (typeof FRIEND_STATUSES)[number];

/** 反馈类型：unreachable 无法访问 / changed 地址变化 / content 内容异常 / other 其他。 */
export const FRIEND_FEEDBACK_TYPES = [
  "unreachable",
  "changed",
  "content",
  "other",
] as const;
export type FriendFeedbackType = (typeof FRIEND_FEEDBACK_TYPES)[number];

/** 反馈处理状态。 */
export const FRIEND_FEEDBACK_STATUSES = [
  "pending",
  "resolved",
  "dismissed",
] as const;
export type FriendFeedbackStatus = (typeof FRIEND_FEEDBACK_STATUSES)[number];

/**
 * 邮件发送状态。
 * none = 还没触发过（待审核）；sent = 已发送；failed = 发送失败；not_configured = 没配邮件服务。
 * 后台按这四种如实显示，绝不把「没配」显示成「已发送」。
 */
export type FriendEmailStatus = "none" | "sent" | "failed" | "not_configured";

export const FRIEND_TYPE_LABEL: Record<FriendFeedbackType, string> = {
  unreachable: "无法访问",
  changed: "地址变化",
  content: "内容异常",
  other: "其他",
};

export const FRIEND_STATUS_LABEL: Record<FriendStatus, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已拒绝",
};

/** 是否是完整的 HTTP/HTTPS 地址（不含内嵌凭据）。 */
export function isHttpUrl(value: string) {
  const input = (value ?? "").trim();
  if (!input) return false;
  try {
    const u = new URL(input);
    return (
      (u.protocol === "http:" || u.protocol === "https:") &&
      !!u.hostname &&
      !u.username &&
      !u.password
    );
  } catch {
    return false;
  }
}

/**
 * 这个地址能不能公开展示给别人看。
 *
 * 图标地址会被访客的浏览器直接加载，所以指向内网 / 回环地址的地址一律拒收：
 * 否则一个申请就能让所有访客的浏览器去戳他们自己的内网。
 * 站点地址只是普通外链，不参与自动加载，不受这条限制。
 */
export function isPubliclyLoadableUrl(value: string) {
  if (!isHttpUrl(value)) return false;
  let host: string;
  try {
    host = new URL(value.trim()).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!host) return false;
  // 没有点的主机名（localhost、metadata 这类）不可信
  if (!host.includes(".")) return false;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return false;
  }
  if (host === "[::1]" || host === "::1") return false;
  if (/^127\./.test(host)) return false;
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  return true;
}

/**
 * 规范化站点地址 —— 去重与展示都用它。
 *
 * 规则（前后端一致，测试里有固定用例）：
 *   1. 去掉首尾空白；
 *   2. 协议与主机名转小写（URL 解析已把 IDN 转成 punycode）；
 *   3. 去掉默认端口（http:80 / https:443）；
 *   4. 去掉 fragment（# 之后不参与请求）；
 *   5. 路径去掉结尾斜杠，根路径归一为空串 —— /about 与 /about/ 是同一个站点；
 *   6. 不同路径仍是不同站点 —— /about 与 /blog 不会被合并。
 *
 * 返回 null 表示不是可用的 HTTP(S) 地址。
 */
export function normalizeFriendUrl(raw: string): string | null {
  const input = (raw ?? "").trim();
  if (!input) return null;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname || url.username || url.password) return null;

  const scheme = url.protocol.toLowerCase();
  const host = url.hostname.toLowerCase();
  const isDefaultPort =
    (scheme === "http:" && url.port === "80") ||
    (scheme === "https:" && url.port === "443");
  const port = url.port && !isDefaultPort ? `:${url.port}` : "";
  const path = url.pathname.replace(/\/+$/, "");
  return `${scheme}//${host}${port}${path}${url.search}`;
}

/** 申请表单的校验规则。前端用它做即时提示，后端用它做最终判断。 */
export const friendApplySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "请填写站点名称")
    .max(FRIEND_NAME_MAX, `站点名称最多 ${FRIEND_NAME_MAX} 字`),
  url: z
    .string()
    .trim()
    .min(1, "请填写站点地址")
    .max(FRIEND_URL_MAX, "站点地址过长")
    .refine(
      isHttpUrl,
      "请填写完整的 HTTP/HTTPS 地址，例如 https://example.com",
    ),
  description: z
    .string()
    .trim()
    .min(1, "请填写一句话介绍")
    .max(FRIEND_DESC_MAX, `一句话介绍最多 ${FRIEND_DESC_MAX} 字`),
  email: z
    .string()
    .trim()
    .min(1, "请填写联系邮箱")
    .max(FRIEND_EMAIL_MAX, "邮箱地址过长")
    .email("请填写有效的邮箱地址"),
  iconUrl: z
    .string()
    .trim()
    .max(FRIEND_ICON_MAX, "图标地址过长")
    .refine(
      (v) => !v || isPubliclyLoadableUrl(v),
      "图标地址需为可公开访问的 HTTP/HTTPS 图片地址",
    ),
});
export type FriendApplyInput = z.infer<typeof friendApplySchema>;

/** 异常链接反馈的校验规则。 */
export const friendFeedbackSchema = z.object({
  /** 可选：从具体友链入口进入时带上，服务端据此快照站点名与地址。 */
  linkId: z.number().int().positive().optional(),
  type: z.enum(FRIEND_FEEDBACK_TYPES),
  message: z
    .string()
    .trim()
    .max(FRIEND_MESSAGE_MAX, `说明最多 ${FRIEND_MESSAGE_MAX} 字`)
    .default(""),
});
export type FriendFeedbackInput = z.infer<typeof friendFeedbackSchema>;

/** 申请结果：created 新建 / pending 已在审核中 / approved 已收录。 */
export type FriendApplyOutcome = "created" | "pending" | "approved";

/** 后台编辑友链时允许改的公开字段。 */
export const friendEditSchema = z.object({
  id: z.number().int().positive(),
  name: z
    .string()
    .trim()
    .min(1, "请填写站点名称")
    .max(FRIEND_NAME_MAX, `站点名称最多 ${FRIEND_NAME_MAX} 字`),
  url: z
    .string()
    .trim()
    .min(1, "请填写站点地址")
    .max(FRIEND_URL_MAX, "站点地址过长")
    .refine(isHttpUrl, "请填写完整的 HTTP/HTTPS 地址"),
  description: z
    .string()
    .trim()
    .max(FRIEND_DESC_MAX, `一句话介绍最多 ${FRIEND_DESC_MAX} 字`)
    .default(""),
  iconUrl: z
    .string()
    .trim()
    .max(FRIEND_ICON_MAX, "图标地址过长")
    .refine(
      (v) => !v || isPubliclyLoadableUrl(v),
      "图标地址需为可公开访问的 HTTP/HTTPS 图片地址",
    )
    .default(""),
});
export type FriendEditInput = z.infer<typeof friendEditSchema>;
