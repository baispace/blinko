import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import {
  blogMailSettingsInputSchema,
  blogMailSettingsSchema,
  type BlogMailSettings,
} from "../../shared/lib/blogMailSettings";
import {
  blogMailConfigFromSettings,
  readBlogMailConfig,
  type BlogMailConfig,
} from "./blogMail";

/**
 * 邮件服务的后台配置。
 *
 * 存在 config 表里（key = blogMailSettings），跟站点设置同一套存储方式：
 * 一个账号一份、带 revision 的乐观并发控制、不需要额外的表和迁移。
 *
 * 配置的优先级：后台配置 > 环境变量。
 * 后台没有填全（host / port / from 缺一）就当作「没配」，
 * 这时再看环境变量 —— 两种部署方式都能工作，不用二选一。
 */
const key = "blogMailSettings";

export type BlogMailConfigSource = "settings" | "env" | "none";

function revisionOf(data: BlogMailSettings) {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

export async function readBlogMailSettings(
  db: Prisma.TransactionClient | PrismaClient,
  accountId: number,
) {
  const row = await db.config.findFirst({
    where: { key, userId: accountId },
    orderBy: { id: "asc" },
  });
  const parsed = blogMailSettingsSchema.safeParse(row?.config ?? {});
  const data = parsed.success ? parsed.data : blogMailSettingsSchema.parse({});
  return {
    configured: !!row,
    data,
    revision: revisionOf(data),
  };
}

export async function saveBlogMailSettings(
  db: PrismaClient,
  accountId: number,
  input: unknown,
  revision: string,
) {
  const parsed = blogMailSettingsInputSchema.parse(input);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(1919126, ${accountId}::integer)`;
    const current = await readBlogMailSettings(tx, accountId);
    if (revision !== current.revision)
      throw new TRPCError({
        code: "CONFLICT",
        message: "邮件服务设置已在其他窗口更新，请重新载入后保存",
      });
    // 密码不外传，所以这里只能靠三态区分：不传=沿用、传值=替换、clearPass=清空。
    const pass = parsed.clearPass
      ? ""
      : parsed.pass !== undefined && parsed.pass !== ""
        ? parsed.pass
        : current.data.pass;
    const data = blogMailSettingsSchema.parse({ ...parsed, pass });
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
    return readBlogMailSettings(tx, accountId);
  });
}

/**
 * 当前真正生效的 SMTP 配置。
 *
 * 后台配置填全了就用它，否则看环境变量，都没有就是没配 ——
 * 返回 null 时调用方要如实告诉用户「没配置」，不能假装发过。
 */
export async function resolveBlogMailConfig(
  db: Prisma.TransactionClient | PrismaClient,
  accountId: number,
): Promise<{ config: BlogMailConfig | null; source: BlogMailConfigSource }> {
  const { data } = await readBlogMailSettings(db, accountId);
  const fromSettings = blogMailConfigFromSettings(data);
  if (fromSettings) return { config: fromSettings, source: "settings" };
  const fromEnv = readBlogMailConfig();
  if (fromEnv) return { config: fromEnv, source: "env" };
  return { config: null, source: "none" };
}
