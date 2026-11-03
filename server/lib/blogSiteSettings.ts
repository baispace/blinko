import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { blogSiteSettingsSchema } from "../../shared/lib/blogSiteSettings";
const key = "blogSiteSettings";
export async function readBlogSiteSettings(
  db: Prisma.TransactionClient | PrismaClient,
  accountId: number,
) {
  const row = await db.config.findFirst({
    where: { key, userId: accountId },
    orderBy: { id: "asc" },
  });
  const parsed = blogSiteSettingsSchema.safeParse(row?.config ?? {});
  let data = parsed.success ? parsed.data : blogSiteSettingsSchema.parse({});
  if (!parsed.success && row) {
    /*
     * 整份配置解析失败时，不能把站点设置打回默认值 —— 那会让站点名、标语、
     * 统计编号一起消失，比一个字段坏掉严重得多。
     * 先把最可能出问题的新增子配置摘掉再解析一次，其余设置照常生效。
     */
    const raw = { ...(row.config as Record<string, unknown>) };
    delete raw.subscribe;
    delete raw.footer;
    const retry = blogSiteSettingsSchema.safeParse(raw);
    if (retry.success) data = retry.data;
  }
  return {
    configured: !!row,
    data,
    revision: createHash("sha256").update(JSON.stringify(data)).digest("hex"),
  };
}

/**
 * 订阅页配置里的二维码路径。
 *
 * 二维码是订阅页的公开素材，匿名必须能取到 —— 但它既不是文章封面，
 * 也不是头像，走不了现成的公开资源判定。所以单独把这条路径列出来，
 * 由文件鉴权在判定「这份附件算公开」时一并比对。
 *
 * 只认本站的 /api/file 与 /api/s3file 路径：外部地址由浏览器自己取，不需要鉴权豁免。
 */
export async function publicSubscribeQrPaths(
  db: Prisma.TransactionClient | PrismaClient,
  accountIds: number[],
) {
  if (!accountIds.length) return [] as string[];
  const rows = await db.config.findMany({
    where: { key, userId: { in: accountIds } },
    select: { config: true },
  });
  const paths: string[] = [];
  for (const row of rows) {
    const parsed = blogSiteSettingsSchema.safeParse(row.config ?? {});
    const qr = parsed.success ? parsed.data.subscribe.wechatQrUrl : "";
    if (qr && /^\/api\/(?:file|s3file)\//.test(qr)) paths.push(qr);
  }
  return paths;
}
export async function saveBlogSiteSettings(
  db: PrismaClient,
  accountId: number,
  input: unknown,
  revision: string,
) {
  const data = blogSiteSettingsSchema.parse(input);
  if ((data.gaEnabled && !data.gaId) || (data.baiduEnabled && !data.baiduId))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "启用统计前请填写对应站点编号",
    });
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(1919123, ${accountId}::integer)`;
    const current = await readBlogSiteSettings(tx, accountId);
    if (revision !== current.revision)
      throw new TRPCError({
        code: "CONFLICT",
        message: "设置已在其他窗口更新，请重新载入后保存",
      });
    const row = await tx.config.findFirst({
      where: { key, userId: accountId },
      orderBy: { id: "asc" },
    });
    if (row)
      await tx.config.update({ where: { id: row.id }, data: { config: data } });
    else
      await tx.config.create({
        data: { key, userId: accountId, config: data },
      });
    return readBlogSiteSettings(tx, accountId);
  });
}

import {
  articleSeoSchema,
  emptyArticleSeo,
} from "../../shared/lib/blogSiteSettings";
import { BLOG_FIXED_PAGE_KEYS } from "../../shared/lib/blogSeo";

/**
 * 一次性迁移：把作者资料里的旧标语搬进站点设置的「站点标语」。
 *
 * 背景：公开博客的标语之前存了两份 —— 站点设置里的「站点标语」和公开作者资料里的
 * 「一句话介绍」。读者看到的绝大多数位置（页脚、关于页、动态页、SEO 描述、RSS 描述）
 * 读的都是作者资料那份，站点设置那份只有友链页在用。两处各填各的必然对不上。
 *
 * 现在标语收口到站点设置一个出处。这个迁移把作者资料里已经填好的那句搬过去，
 * 免得升级后页脚与 SEO 悄悄换成默认文案。搬运只在「站点设置的标语还是默认值」时
 * 进行 —— 用户自己写过标语就不动。
 *
 * 幂等：搬完就把作者资料里那份清空，下次启动查不到待搬的记录，直接返回。
 * 失败不应该拦住服务启动 —— 大不了一条标语没搬，用户在后台改一下就行。
 */
export async function migrateLegacyBlogTagline(db: PrismaClient) {
  const profiles = await db.blogProfile.findMany({
    where: { tagline: { not: "" } },
    select: { accountId: true, tagline: true },
  });
  if (!profiles.length) return 0;

  const defaultTagline = blogSiteSettingsSchema.parse({}).tagline;
  let moved = 0;
  for (const p of profiles) {
    const oldTagline = p.tagline.trim();
    if (!oldTagline) continue;
    const settings = await readBlogSiteSettings(db, p.accountId);
    const current = settings.data.tagline.trim();
    if (current && current !== defaultTagline) {
      // 站点设置里已经有一句自己的标语了，作者资料那份不再需要搬。
      continue;
    }
    await saveBlogSiteSettings(
      db,
      p.accountId,
      { ...settings.data, tagline: oldTagline },
      settings.revision,
    );
    await db.blogProfile.update({
      where: { accountId: p.accountId },
      data: { tagline: "" },
    });
    moved += 1;
    console.log(
      `[blog] 已把账号 ${p.accountId} 的旧标语「${oldTagline}」并入站点设置的站点标语`,
    );
  }
  return moved;
}

export async function readTopicSeo(
  db: Prisma.TransactionClient | PrismaClient,
  accountId: number,
  topicId: number,
) {
  const topic = await db.blogTopic.findFirst({
    where: { id: topicId, accountId },
  });
  if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "专题不存在" });
  const row = await db.config.findFirst({
    where: { key: "blogTopicSeo:" + topicId, userId: accountId },
    orderBy: { id: "asc" },
  });
  const parsed = articleSeoSchema.safeParse(row?.config ?? {}),
    data = parsed.success ? parsed.data : articleSeoSchema.parse({});
  return {
    data,
    revision: createHash("sha256").update(JSON.stringify(data)).digest("hex"),
  };
}
export async function saveTopicSeo(
  db: PrismaClient,
  accountId: number,
  topicId: number,
  input: unknown,
  revision: string,
) {
  const data = articleSeoSchema.parse(input);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(1919124, ${topicId}::integer)`;
    const current = await readTopicSeo(tx, accountId, topicId);
    if (current.revision !== revision)
      throw new TRPCError({
        code: "CONFLICT",
        message: "专题 SEO 已更新，请重新载入",
      });
    const key = "blogTopicSeo:" + topicId,
      row = await tx.config.findFirst({
        where: { key, userId: accountId },
        orderBy: { id: "asc" },
      });
    if (row)
      await tx.config.update({ where: { id: row.id }, data: { config: data } });
    else
      await tx.config.create({
        data: { key, userId: accountId, config: data },
      });
    return readTopicSeo(tx, accountId, topicId);
  });
}

/**
 * 固定页面（首页 / 专题索引 / 关于页）的独立 SEO 覆盖。
 *
 * 固定页面不是伪文章，所以不放进内容列表，而是单独存一份覆盖配置：
 * 留空即继承站点默认规则，清空覆盖就是恢复继承。
 */
const pageSeoKey = "blogPageSeo";
export type BlogPageSeoMap = Record<string, typeof emptyArticleSeo>;

function normalizePageSeo(value: unknown): BlogPageSeoMap {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const result: BlogPageSeoMap = {};
  for (const key of BLOG_FIXED_PAGE_KEYS) {
    const parsed = articleSeoSchema.safeParse(source[key]);
    result[key] = parsed.success ? parsed.data : { ...emptyArticleSeo };
  }
  return result;
}

export async function readPageSeo(
  db: Prisma.TransactionClient | PrismaClient,
  accountId: number,
) {
  const row = await db.config.findFirst({
    where: { key: pageSeoKey, userId: accountId },
    orderBy: { id: "asc" },
  });
  const data = normalizePageSeo(row?.config);
  return {
    data,
    revision: createHash("sha256").update(JSON.stringify(data)).digest("hex"),
  };
}

export async function savePageSeo(
  db: PrismaClient,
  accountId: number,
  input: unknown,
  revision: string,
) {
  const data = normalizePageSeo(input);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(1919125, ${accountId}::integer)`;
    const current = await readPageSeo(tx, accountId);
    if (revision !== current.revision)
      throw new TRPCError({
        code: "CONFLICT",
        message: "固定页面 SEO 已更新，请重新载入",
      });
    const row = await tx.config.findFirst({
      where: { key: pageSeoKey, userId: accountId },
      orderBy: { id: "asc" },
    });
    if (row)
      await tx.config.update({ where: { id: row.id }, data: { config: data } });
    else
      await tx.config.create({
        data: { key: pageSeoKey, userId: accountId, config: data },
      });
    return readPageSeo(tx, accountId);
  });
}
