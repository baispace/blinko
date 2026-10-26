import { z } from "zod";

/**
 * 博客邮件服务（SMTP）的后台可配置项。
 *
 * 为什么放在后台而不是只读环境变量：
 *   友链申请通知、读者反馈回复都要用到邮件，但换服务器、改端口、换发件人
 *   不应该要求改部署环境变量再重启。环境变量仍然保留，作为没有后台配置时的兜底。
 *
 * 三条硬规矩：
 *   1. 密码永远不返回给前端 —— 读回来只有 hasPass（是否已设置）这一个布尔值；
 *   2. 缺 host / port / from 任意一项就算「没配」，不猜、不替用户填默认值；
 *   3. 端口与加密方式只接受明确的值，不做隐式推断。
 */
export const blogMailSettingsSchema = z.object({
  /** SMTP 服务器地址，例如 smtp.exmail.qq.com。 */
  host: z.string().trim().max(200).default(""),
  /** SMTP 端口。465 走直接 TLS，587 走明文连接后 STARTTLS。 */
  port: z.number().int().min(1).max(65535).default(465),
  /** true = 直接 TLS（通常是 465）；false = 明文连接，服务器支持时自动 STARTTLS。 */
  secure: z.boolean().default(true),
  /** 登录账号。留空表示不需要认证的匿名服务器。 */
  user: z.string().trim().max(200).default(""),
  /** 登录密码或授权码。只写不读。 */
  pass: z.string().max(200).default(""),
  /** 发件人地址。 */
  from: z.string().trim().max(200).default(""),
});

export type BlogMailSettings = z.infer<typeof blogMailSettingsSchema>;

/**
 * 后台表单的输入。
 *
 * 密码的语义跟其它字段不同：
 *   - 不传 / 传空串 = 沿用已保存的密码（用户只想改端口，不该被迫重填密码）；
 *   - 传了非空 = 替换成新密码；
 *   - clearPass = 明确清空（服务器不需要认证时用）。
 */
export const blogMailSettingsInputSchema = blogMailSettingsSchema.extend({
  pass: z.string().max(200).optional(),
  clearPass: z.boolean().optional(),
});

export type BlogMailSettingsInput = z.infer<typeof blogMailSettingsInputSchema>;

/** 读给后台界面看的视图：不含密码，只有「是否已设置」。 */
export type BlogMailSettingsView = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  hasPass: boolean;
};

export function blogMailSettingsView(
  data: BlogMailSettings,
): BlogMailSettingsView {
  return {
    host: data.host,
    port: data.port,
    secure: data.secure,
    user: data.user,
    from: data.from,
    hasPass: !!data.pass,
  };
}
