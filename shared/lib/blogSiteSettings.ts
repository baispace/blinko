import { z } from "zod";
import { normalizeBasePath } from "./blogSeo";
import { DEFAULT_BLOG_TIMEZONE, isValidTimeZone } from "./blogTime";
const url = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => {
    if (!v) return true;
    try {
      const u = new URL(v);
      return /^https?:$/.test(u.protocol) && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "请输入有效的 HTTP(S) 地址");
/** 基础路径：空或 / 开头，不带协议、凭据、查询串。 */
const basePath = z
  .string()
  .trim()
  .max(120)
  .refine((v) => !v || normalizeBasePath(v) !== "", "请填写以 / 开头的路径");

/**
 * 站点资源：站内路径（上传后得到的 /api/file/… 或 /api/s3file/…）或外部 http(s) 地址。
 *
 * 不能直接复用上面的 url —— 那条只收绝对地址，而上传得到的资源路径是相对的。
 */
const assetUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => {
    if (!v) return true;
    if (v.startsWith("/api/file/") || v.startsWith("/api/s3file/")) return true;
    try {
      const u = new URL(v);
      return /^https?:$/.test(u.protocol) && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "请填写有效的资源路径或 HTTP(S) 地址");

/**
 * 订阅页的可配置项。
 *
 * 两件事，都挂在站点设置里，不另开一个管理模块：
 *   1) 微信公众号：开关 + 名称 + 二维码；
 *   2) RSS：开关 + （可选的）自定义订阅源。
 *
 * RSS 地址默认由公开站点地址与真实订阅路由自动生成 —— 用户不该为了
 * 换一个域名就把订阅地址再抄一遍。需要指到站外的源时才填自定义地址。
 *
 * 「关于这里」与订阅说明也放在这里：它们是订阅页的文案，
 * 由作者维护，公开页只负责按配置渲染。
 */
export const blogSubscribeSettingsSchema = z.object({
  /** 微信公众号是否开放订阅。关掉时公开页只显示 RSS。 */
  wechatEnabled: z.boolean().default(false),
  /** 公众号名称。留空视为「暂未开放」—— 不展示扫码入口。 */
  wechatName: z.string().trim().max(80).default(""),
  /** 公众号二维码：后台上传后得到的文件路径，或一个外部图片地址。 */
  wechatQrUrl: assetUrl.default(""),
  /** RSS 是否在订阅页展示。 */
  rssEnabled: z.boolean().default(true),
  /** 自定义 RSS 订阅源。留空 = 按公开站点地址自动生成。 */
  rssUrl: url.default(""),
  /** 「关于这里」的主标题。留空时公开页用站点名称生成一句中性文案。 */
  introTitle: z.string().trim().max(80).default(""),
  /** 「关于这里」的站点介绍。留空时回落到站点的公开介绍（spaceIntro / 标语）。 */
  intro: z.string().trim().max(600).default(""),
  /**
   * 内容方向：给订阅页「关于这里」用的几个短标签。
   * 与已发布专题同名时自动变成可跳转的入口，对不上就当普通标签展示。
   */
  directions: z
    .array(z.string().trim().max(40))
    .max(8)
    .default([]),
  /**
   * 订阅说明：左侧短标签 + 右侧说明文字。
   *
   * 默认三条是「如实描述现状」的措辞 —— 不承诺定时更新、全量同步或即时推送，
   * 这三件事站点都没实现。删空则整块不渲染。
   */
  notes: z
    .array(
      z.object({
        label: z.string().trim().max(20).default(""),
        text: z.string().trim().max(200).default(""),
      }),
    )
    .max(6)
    .default([
      { label: "更新节奏", text: "不定期分享，以实际发布为准。" },
      {
        label: "渠道安排",
        text: "微信公众号与博客的内容和发布时间，可能有所不同。",
      },
      {
        label: "取消订阅",
        text: "在微信取消关注，或在 RSS 阅读器中移除订阅即可。",
      },
    ]),
});
export type BlogSubscribeSettings = z.infer<typeof blogSubscribeSettingsSchema>;

/**
 * 页脚要展示的信息：备案、版权与推广位。
 *
 * 备案号是硬性要求（国内站点必须挂），但号码因站而异，写死在代码里等于
 * 逼每个部署都改一次源码 —— 所以做成站点配置，站长自己在后台填。
 *
 * 推广位是一条带起止时间的推广信息：到期自动隐藏，不靠人工记得撤。
 * 起止日期按站点时区判定，日期格式写成 YYYY-MM-DD；
 * 这里不做格式硬校验（填错会让整份配置解析失败、连站点名一起丢），
 * 由公开页在渲染时容错。
 */
export const blogFooterSettingsSchema = z.object({
  /** 版权署名主体，如「张洪Heo」。留空则只显示年份与站点名。 */
  owner: z.string().trim().max(80).default(""),
  /** 版权起始年份。0 表示不显示起始年。 */
  copyrightStart: z.number().int().min(0).max(2100).default(0),
  /** 版权结束年份。0 表示一直延续到当前年份。 */
  copyrightEnd: z.number().int().min(0).max(2100).default(0),
  /** ICP 备案号，如「京ICP备19051325号-2」。 */
  icp: z.string().trim().max(80).default(""),
  /** 公安备案号，如「京公网安备 11011402054421号」。 */
  police: z.string().trim().max(80).default(""),
  /** 页脚推广位：一条带生效区间的推广信息。 */
  promo: z
    .object({
      enabled: z.boolean().default(false),
      /** 推广位名称，如「PowBay」。 */
      title: z.string().trim().max(60).default(""),
      /** 推广文案。 */
      text: z.string().trim().max(200).default(""),
      /** 落地页地址。 */
      url: z.string().trim().max(500).default(""),
      /** 生效日期 YYYY-MM-DD；留空表示立即生效。 */
      startAt: z.string().trim().max(20).default(""),
      /** 结束日期 YYYY-MM-DD；留空表示长期有效。 */
      endAt: z.string().trim().max(20).default(""),
    })
    .prefault({}),
});
export type BlogFooterSettings = z.infer<typeof blogFooterSettingsSchema>;

export const blogSiteSettingsSchema = z.object({
  /** 留空表示继承工作区「站点名称」，不要用默认值盖掉用户已经设置的站点信息。 */
  siteName: z.string().trim().max(80).default(""),
  tagline: z
    .string()
    .trim()
    .max(300)
    .default("记录思考与实践，让经验成为有脉络的内容。"),
  iconUrl: url.default(""),
  /**
   * 公开博客前台用的字体：字体注册表（fonts 表）里的字体名。
   *
   * 留空表示用系统字体（PingFang / 微软雅黑 / 系统 UI 字体）。
   * 公开页把它拼成字体栈，连同 @font-face 样式表一起注入 head ——
   * 访客第一次打开就能用上，不用等前端脚本跑完再换字体。
   */
  fontFamily: z.string().trim().max(80).default(""),
  titleTemplate: z
    .string()
    .trim()
    .max(160)
    .refine((v) => v.includes("{标题}"), "请保留 {标题} 占位符")
    .default("{标题} · {站点名称}"),
  description: z.string().trim().max(500).default(""),
  shareImage: url.default(""),
  allowIndex: z.boolean().default(true),
  gaEnabled: z.boolean().default(false),
  gaId: z
    .string()
    .trim()
    .regex(/^(G-[A-Z0-9]+)?$/, "GA4 编号应以 G- 开头")
    .default(""),
  baiduEnabled: z.boolean().default(false),
  baiduId: z
    .string()
    .trim()
    .regex(/^([a-f0-9]{32})?$/, "百度站点编号应为 32 位十六进制字符")
    .default(""),
  excludeOwner: z.boolean().default(true),
  /** 目标公开站点地址：用户希望使用的域名。保存它不代表域名已经上线。 */
  targetOrigin: url.default(""),
  /** 前后端分开部署时公开前端访问的 API 基础地址。 */
  apiOrigin: url.default(""),
  deploymentMode: z.enum(["proxy", "separate"]).default("proxy"),
  /** 公开前端的基础路径。默认与应用内部真实挂载位置一致（/blog）。 */
  publicBasePath: basePath.default("/blog"),
  /** 旧公开地址的前缀，例如 /blog；留空表示不做路径迁移。 */
  legacyBasePath: basePath.default(""),
  /** 是否把旧地址永久跳转到对应的新地址。默认关闭，需部署验证后再开启。 */
  legacyRedirectEnabled: z.boolean().default(false),
  /**
   * 友情链接申请说明：由后台维护，公开页的「查看申请说明」展示它。
   * 留空表示不提供说明，公开页会退回到一句默认提示。
   */
  friendApplyNote: z.string().trim().max(2000).default(""),
  /**
   * 是否在「关于」页公开展示站点数据（累计阅读、读者回应、公开文章数、持续分享天数）。
   * 关闭后整个数据区不渲染 —— 不是把数字藏起来，而是这块内容根本不出现。
   */
  showPublicStats: z.boolean().default(true),
  /**
   * 站点时区：动态的月份边界、以及所有「自然日」口径都按它判定。
   * 服务器可能在 UTC，站点作者在别的时区 —— 按服务器时区分月会把跨月的内容分错。
   */
  timezone: z
    .string()
    .trim()
    .max(64)
    .refine((v) => isValidTimeZone(v), "请填写有效的时区名称，例如 Asia/Shanghai")
    .default(DEFAULT_BLOG_TIMEZONE),
  /** 订阅页的渠道、文案与说明。与站点其它设置同一份配置、同一处保存。 */
  // prefault 而不是 default：default 会把 {} 原样塞进去（内层默认值不生效），
  // prefault 会先用 {} 走一遍子 schema，把每一项的默认值都填上。
  subscribe: blogSubscribeSettingsSchema.prefault({}),
  /** 页脚信息：备案号、版权署名与推广位。 */
  footer: blogFooterSettingsSchema.prefault({}),
});
export type BlogSiteSettings = z.infer<typeof blogSiteSettingsSchema>;
export const articleSeoSchema = z.object({
  title: z.string().trim().max(160).default(""),
  description: z.string().trim().max(500).default(""),
  image: url.default(""),
  /** 分享图片说明（og:image:alt / twitter:image:alt）。 */
  imageAlt: z.string().trim().max(200).default(""),
});
export const emptyArticleSeo = articleSeoSchema.parse({});
export function readArticleSeo(metadata: unknown, published = false) {
  const m =
    metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  const result = articleSeoSchema.safeParse(
    m[published ? "blogSeoPublished" : "blogSeo"],
  );
  return result.success ? result.data : { ...emptyArticleSeo };
}
