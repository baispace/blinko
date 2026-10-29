import { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

/**
 * 公开标签：与私有笔记标签（tag / tagsToNote）彻底分开的一条线。
 *
 * 私有标签是个人组织方式，永远不外泄；公开标签只活在博客这条线上，
 * 发布时冻结进 notePublication.publicTags，改草稿不影响线上。
 *
 * 草稿态放在 notes.metadata.blogPublicTags —— 与文章 SEO 的
 * metadata.blogSeo / blogSeoPublished 是同一套「草稿 → 发布快照」的写法。
 */

export const PUBLIC_TAG_LIMIT = 8;
export const PUBLIC_TAG_MAX_LENGTH = 20;

/** 归一化：去空白、去重（大小写不敏感）、截断到上限。 */
export function normalizePublicTags(input: unknown): string[] {
  const list = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const name = raw.replace(/\s+/g, " ").trim().slice(0, PUBLIC_TAG_MAX_LENGTH);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
    if (result.length >= PUBLIC_TAG_LIMIT) break;
  }
  return result;
}

/** 草稿态公开标签：从 notes.metadata 里读。 */
export function readDraftPublicTags(metadata: unknown): string[] {
  const m =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>)
      : {};
  return normalizePublicTags(m.blogPublicTags);
}

/** 账号的公开标签池：给「优先匹配已有公开标签」用。 */
export async function listPublicTagPool(
  db: PrismaClient,
  accountId: number,
) {
  const rows = await db.blogPublicTag.findMany({
    where: { accountId },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
  return rows;
}

/** 把新用到的标签补进标签池（已存在的不动）。 */
export async function rememberPublicTags(
  tx: PrismaClient,
  accountId: number,
  names: string[],
) {
  const tags = normalizePublicTags(names);
  if (!tags.length) return;
  await tx.blogPublicTag.createMany({
    data: tags.map((name) => ({ accountId, name })),
    skipDuplicates: true,
  });
}
