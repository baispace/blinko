import type { PrismaClient } from "@prisma/client";
import { readBlogSiteSettings } from "./blogSiteSettings";
import { publicBlogOwner, sanitizeLinks } from "./blog";
import { publicTopics } from "./publicBlog";

/**
 * 订阅页的数据层。
 *
 * 页面只有两个渠道（微信公众号 / RSS）加一段站点介绍，所以这一层很薄：
 * 读站点设置里的 subscribe 子配置，补上公开作者资料与已发布专题，
 * 组装成一份「可以直接渲染」的公开数据。
 *
 * 三条边界：
 *   1) 只返回允许公开的东西 —— 不碰账户邮箱、统计编号、部署配置；
 *   2) 渠道是否可用由配置决定，没配就是没配，不替作者编一个出来；
 *   3) RSS 地址默认由公开站点地址与真实订阅路由生成，作者不必手抄。
 */

export type PublicSubscribe = {
  /** 微信公众号渠道。 */
  wechat: {
    /** 三个条件都满足才算可用：开关打开、有名称、有二维码。 */
    available: boolean;
    name: string;
    /** 二维码地址：本文件的相对路径或外部图片地址。 */
    qrUrl: string;
  };
  /** RSS 渠道。 */
  rss: {
    available: boolean;
    /** 作者自定义的订阅源；为空表示按公开站点地址自动生成。 */
    customUrl: string;
    /** 自动生成时使用的真实订阅路由（应用内部路径）。 */
    feedPath: string;
    /** 动态的独立订阅地址 —— 与文章源分开，不擅自合并。 */
    momentsFeedPath: string;
  };
  /** 「关于这里」卡片。 */
  about: {
    title: string;
    text: string;
    /** 内容方向：与专题同名的是可跳转入口，否则是普通标签。 */
    directions: { name: string; slug: string | null; color: string }[];
    /** 联系入口：只给已经公开的地址，不自动公开账户私有邮箱。 */
    contact: { label: string; href: string } | null;
  };
  /** 订阅说明（标签 + 说明）。 */
  notes: { label: string; text: string }[];
};

/** 联系入口的标签判定：只认作者明确写成「联系/邮箱」的公开链接。 */
const CONTACT_LABEL_RE = /(联系|邮箱|email|contact|mail)/i;

export async function publicSubscribe(
  db: PrismaClient,
  input: { accountId?: number } = {},
): Promise<PublicSubscribe> {
  const owner = await publicBlogOwner(db, input.accountId);
  const [settings, topics, profile] = await Promise.all([
    readBlogSiteSettings(db, owner),
    publicTopics(db, owner),
    db.blogProfile.findFirst({ where: { accountId: owner, isPublished: true } }),
  ]);
  const sub = settings.data.subscribe;

  // 公众号：开关 + 名称 + 二维码齐了才算一个能用的渠道。
  const wechatName = sub.wechatName.trim();
  const wechatQr = sub.wechatQrUrl.trim();
  const wechatAvailable = sub.wechatEnabled && !!wechatName && !!wechatQr;

  // RSS：开关打开即可用。自定义源必须是 http(s)，schema 已经校验过。
  const rssCustom = sub.rssUrl.trim();

  // 介绍文案：优先用订阅页自己配的，其次是站点的公开介绍（spaceIntro），
  // 再退到公开资料里的标语。绝不靠按空行切分个人简介来猜段落 ——
  // 那会把作者随手分的段当成有意义的结构。
  const introText = (
    sub.intro.trim() ||
    (profile?.spaceIntro ?? "").trim() ||
    (profile?.tagline ?? "").trim()
  ).trim();

  const directions = sub.directions
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => {
      const topic = topics.find((t) => t.name === name);
      return { name, slug: topic?.slug ?? null, color: topic?.color ?? "" };
    });

  const links = profile ? sanitizeLinks(profile.links) : [];
  const contactLink = links.find((l) => CONTACT_LABEL_RE.test(l.label));
  const contact = profile?.homepage
    ? { label: "联系我", href: profile.homepage }
    : contactLink
      ? { label: contactLink.label || "联系我", href: contactLink.url }
      : null;

  const notes = sub.notes
    .map((n) => ({ label: n.label.trim(), text: n.text.trim() }))
    .filter((n) => n.label && n.text);

  return {
    wechat: {
      available: wechatAvailable,
      name: wechatName,
      qrUrl: wechatQr,
    },
    rss: {
      available: sub.rssEnabled,
      customUrl: rssCustom,
      feedPath: "/blog/feed.xml",
      momentsFeedPath: "/blog/moments/feed.xml",
    },
    about: {
      title: sub.introTitle.trim(),
      text: introText,
      directions,
      contact,
    },
    notes,
  };
}
