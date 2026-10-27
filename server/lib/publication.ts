import { readArticleSeo } from "../../shared/lib/blogSiteSettings";
import { Prisma, PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { createHash, randomBytes } from "node:crypto";
import { normalizePublicTags, readDraftPublicTags } from "./blogPublicTags";
import { invalidatePublicStats } from "./blogPublicStatsCache";
import {
  deriveTitle,
  draftVersionOf,
  publicVersionOf,
  readDraftBody,
  sourceVersionOf,
} from "./blogPublishCheck";
import {
  coverConfigEqual,
  readDraftCoverConfig,
  readPublicCoverConfig,
  toJson,
  type CoverConfig,
} from "./blogCoverConfig";

/*
 * 正文指纹、草稿标题、草稿概要挪到 shared/lib/blogPublication：
 * 「检查更新」在服务端算差异，前台只负责画出来，两边得用同一份口径。
 */
import {
  contentVersion,
  publicationSummary,
  publicationTitle,
} from "../../shared/lib/blogPublication";
import { hasCredentialLeak, publicBodyOf } from "../../shared/lib/blogPublicBody";

export {
  contentVersion,
  publicationSummary,
  publicationTitle,
} from "../../shared/lib/blogPublication";

/*
 * 站内图片可以发布。
 *
 * 笔记里的图片一律是站内地址（/api/file/*、/api/s3file/*），
 * 原来的口径把它们全挡了 —— 结果是「正文里有一张图就发不出去」。
 * 现在改成：
 *   站内地址放行 —— 发布时把地址里的凭据剥掉（见 rewritePublicBodyAssets），
 *                   服务端再按「公开素材」判定放行匿名读取；
 *   外链带 token / authorization 仍然挡 —— 那是凭据，公开快照谁都能读。
 */
export function assertPublishableBody(content: string) {
  if (!content.replace(/<[^>]*>/g, "").trim() && !/<img\b/i.test(content))
    throw new TRPCError({ code: "BAD_REQUEST", message: "正文为空，无法发布" });
  if (hasCredentialLeak(content))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "正文包含带授权参数的链接（token / authorization），公开后凭据会泄露，请去掉凭据后重试",
    });
}

type PublicationDraft = {
  content: string;
  type: number;
  metadata: unknown;
  publication: {
    content: string;
    type: number;
    title: string;
    summary: string | null;
    coverAttachmentId: number | null;
    draftCoverAttachmentId: number | null;
    /** 公开快照里的封面文字层配置（底图 + 短标题 + 排版）。 */
    coverConfig?: unknown;
    revision: number;
    publicTags: string[];
  } | null;
};
export function publicationChanges(note: PublicationDraft) {
  const p = note.publication;
  // 正文比的是「发布草稿」那份：草稿分叉之后，原笔记怎么改都不算待发布改动。
  const draftContent = readDraftBody(note.metadata, note.content).content;
  /*
   * 公开快照里存的是「公开正文形态」：站内文件地址的凭据参数已被剥掉。
   * 比对必须拿同一形态比 —— 否则刚发布完就说正文又变了。
   */
  const publicContent = publicBodyOf(draftContent);
  // 封面分两块：底图附件（草稿指针）和文字层配置（草稿 metadata）。
  // 草稿没配过封面文字时沿用公开那份 —— 那表示作者自上次发布后没动过。
  const draftCover = effectiveDraftCover(note);
  const publicCover = readPublicCoverConfig(p?.coverConfig);
  /*
   * 标题的比较口径必须和「检查更新」（blogPublishCheck）一致：
   * 作者没单独起标题时，公开标题就是从正文推出来的 ——
   * 这时不能把「没起标题」当成「标题被改了」，
   * 否则刚发布完管理列表就说有未保存修改。
   */
  const draftTitle =
    publicationTitle(note.metadata) || deriveTitle(publicContent);
  return [
    !p || p.title !== draftTitle ? "title" : null,
    !p || (p.summary ?? "") !== publicationSummary(note.metadata)
      ? "summary"
      : null,
    !p || p.content !== publicContent ? "content" : null,
    !p || p.type !== note.type ? "type" : null,
    p?.coverAttachmentId !== p?.draftCoverAttachmentId ||
    !coverConfigEqual(draftCover, publicCover)
      ? "cover"
      : null,
    JSON.stringify(readArticleSeo(note.metadata)) !== JSON.stringify(readArticleSeo(note.metadata,true)) ? "seo" : null,
    // 公开标签：草稿在 metadata.blogPublicTags，已发布在 publication.publicTags。
    !p ||
    JSON.stringify(normalizePublicTags(p.publicTags)) !==
      JSON.stringify(readDraftPublicTags(note.metadata))
      ? "tags"
      : null,
  ].filter((key): key is string => !!key);
}

/**
 * 草稿真正要发布的封面配置。
 *
 * 作者没在草稿里配过封面文字时，沿用公开快照那份 ——
 * 否则每次发布都会把公开封面「改回空」，看起来像凭空多了一处改动。
 */
function effectiveDraftCover(note: {
  metadata: unknown;
  publication: { coverConfig?: unknown } | null;
}): CoverConfig | null {
  const draft = readDraftCoverConfig(note.metadata);
  if (draft) return draft;
  return readPublicCoverConfig(note.publication?.coverConfig);
}
export function publicationReviewToken(
  note: PublicationDraft & {
    id: number;
    updatedAt: Date;
    isPublished: boolean;
    isRecycle: boolean;
  },
) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        note.id,
        note.updatedAt.toISOString(),
        readDraftBody(note.metadata, note.content).content,
        note.type,
        publicationTitle(note.metadata),
        publicationSummary(note.metadata),
        readArticleSeo(note.metadata),
        readArticleSeo(note.metadata, true),
        readDraftPublicTags(note.metadata),
        note.publication?.publicTags ?? [],
        note.isPublished,
        note.isRecycle,
        note.publication?.revision ?? 0,
        note.publication?.coverAttachmentId ?? null,
        note.publication?.draftCoverAttachmentId ?? null,
        // 封面文字层配置也算进令牌：改了短标题就该重新确认预览。
        readDraftCoverConfig(note.metadata),
        note.publication?.coverConfig ?? null,
      ]),
    )
    .digest("hex");
}
function configuredPublicOrigin() {
  try {
    const value = process.env.BLOG_PUBLIC_URL;
    if (!value) return null;
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

export async function publicationStatus(
  db: PrismaClient,
  accountId: number,
  id: number,
) {
  const note = await db.notes.findFirst({
    where: { id, accountId },
    include: {
      publication: true,
      attachments: {
        select: { id: true, name: true, path: true, type: true, size: true },
      },
      blogTopics: {
        select: {
          sectionId: true,
          topic: {
            select: {
              id: true,
              name: true,
              isPublished: true,
              sections: {
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
                select: { id: true, name: true },
              },
            },
          },
        },
      },
    },
  });
  if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "笔记不存在" });
  const p = note.publication;
  const blockers: string[] = [];
  if (note.isRecycle) blockers.push("请先从回收站恢复笔记");
  try {
    assertPublishableBody(note.content);
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : "正文暂时无法公开");
  }
  const coverId = p?.draftCoverAttachmentId ?? null;
  if (coverId && !note.attachments.some((a) => a.id === coverId))
    blockers.push("待发布封面已移除，请重新选择");
  // 草稿真正会发布的封面文字：没在草稿配过就沿用公开那份。
  const draftCover = effectiveDraftCover(note);
  return {
    isPublished: note.isPublished && !!p && !note.isRecycle,
    publishId: note.publishId,
    legacyPublished: note.isPublished && !p,
    revision: p?.revision ?? 0,
    publishedAt: p?.createdAt ?? null,
    publishedUpdatedAt: p?.updatedAt ?? null,
    draftUpdatedAt: note.updatedAt,
    hasChanges: publicationChanges(note).length > 0,
    changes: publicationChanges(note),
    reviewToken: publicationReviewToken(note),
    canPublish: blockers.length === 0,
    blockers,
    attachmentCount: note.attachments.length,
    draft: {
      title: publicationTitle(note.metadata),
      summary: publicationSummary(note.metadata),
      content: readDraftBody(note.metadata, note.content).content,
      type: note.type,
      coverAttachmentId: coverId,
      publicTags: readDraftPublicTags(note.metadata),
      // 待发布的封面文案：设置项列表要显示「当前值」，不改本地状态。
      coverText: {
        title: draftCover?.title ?? "",
        subtitle: draftCover?.subtitle ?? "",
      },
    },
    current: p
      ? {
          title: p.title,
          summary: p.summary ?? "",
          content: p.content,
          type: p.type,
          coverAttachmentId: p.coverAttachmentId,
          publicTags: normalizePublicTags(p.publicTags),
        }
      : null,
    coverOptions: note.attachments
      .filter(
        (a) =>
          /^image\/(?:png|jpeg|webp|gif|avif)$/.test(a.type) &&
          Number(a.size) <= 10 * 1024 * 1024,
      )
      .map(({ id, name, path }) => ({ id, name, path })),
    topics: note.blogTopics.map((t) => ({
      id: t.topic.id,
      name: t.topic.name,
      isPublished: t.topic.isPublished,
      // 文章在这个专题里落在哪一章。
      sectionId: t.sectionId,
      sectionName:
        t.topic.sections.find((s) => s.id === t.sectionId)?.name ?? "",
    })),
    // 运营配置：推荐置顶与加入 banner 是两个独立开关，详情页要能读。
    isFeatured: p?.isFeatured ?? false,
    featuredOrder: p?.featuredOrder ?? 0,
    isBanner: p?.isBanner ?? false,
    publicOrigin: configuredPublicOrigin(),
  };
}

export async function publishSnapshot(
  db: PrismaClient | Prisma.TransactionClient,
  accountId: number,
  input: {
    id: number;
    isCancel?: boolean;
    expectedUpdatedAt?: Date;
    expectedPublicationToken?: string;
    /**
     * 版本三元组：进入「检查更新」对比时记下的来源 / 草稿 / 公开版本。
     * 发布时服务端重新算一遍，对不上就拒绝 —— 前端传来的对比内容
     * 不能当成可信的发布依据。
     */
    expectedSourceVersion?: string;
    expectedDraftVersion?: string;
    expectedPublicVersion?: string;
    coverAttachmentId?: number | null;
  },
) {
  const run = async (tx: Prisma.TransactionClient) => {
    // Serialize publish, withdrawal and autosave on the source note. Take the
    // snapshot only after acquiring this lock, never from a stale UI object.
    await tx.$queryRaw`SELECT id FROM notes WHERE id = ${input.id} AND "accountId" = ${accountId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "noteId" FROM "notePublication" WHERE "noteId" = ${input.id} FOR UPDATE`;
    const note = await tx.notes.findFirst({
      where: { id: input.id, accountId },
      include: { publication: true },
    });
    if (!note)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "笔记不存在或无权发布",
      });
    if (
      input.expectedPublicationToken &&
      input.expectedPublicationToken !== publicationReviewToken(note)
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "发布内容或状态已变化，请刷新预览后重新确认",
      });
    if (input.isCancel)
      return tx.notes.update({
        where: { id: note.id },
        data: { isPublished: false },
      });
    if (note.isRecycle)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "请先从回收站恢复笔记",
      });
    if (
      input.expectedUpdatedAt &&
      note.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "笔记已更新，请刷新发布状态后重试，确保发布的是最新保存内容",
      });
    const now = new Date();
    const p = note.publication;

    // 发布的是「发布草稿」那份正文：草稿没分叉时它就是原笔记正文，
    // 分叉之后原笔记再改也不会跟着变。
    const draftBody = readDraftBody(note.metadata, note.content);
    /*
     * 写进公开快照的正文是「公开正文形态」：
     * 站内文件地址里的凭据参数在写之前剥掉，公开页不需要登录态也能取到图。
     * 指纹仍按原文算（草稿正文一个字节都不改）。
     */
    const publicContent = publicBodyOf(draftBody.content);
    const sourceVersion = sourceVersionOf(note.content ?? "", note.type);
    const draftTags = readDraftPublicTags(note.metadata);
    const draftTitle = publicationTitle(note.metadata);
    const draftSummary = publicationSummary(note.metadata);
    const draftSeo = readArticleSeo(note.metadata);
    const publishedSeo = readArticleSeo(note.metadata, true);
    // 待发布的封面配置：底图附件 + 文字层。草稿没配过就沿用公开那份。
    const draftCoverConfig = effectiveDraftCover(note);
    const publicCoverConfig = readPublicCoverConfig(p?.coverConfig);
    const draftVersion = draftVersionOf({
      title: draftTitle || deriveTitle(publicContent),
      summary: draftSummary,
      body: draftBody.content,
      tags: draftTags,
      coverAttachmentId: p?.draftCoverAttachmentId ?? null,
      coverConfig: draftCoverConfig,
      seo: draftSeo as unknown as Record<string, string>,
    });
    const publicVersion = publicVersionOf(
      p
        ? {
            revision: p.revision,
            title: p.title,
            summary: p.summary ?? "",
            content: p.content,
            publicTags: normalizePublicTags(p.publicTags ?? []),
            coverAttachmentId: p.coverAttachmentId ?? null,
            coverConfig: publicCoverConfig,
          }
        : null,
    );

    const coverId =
      input.coverAttachmentId !== undefined
        ? input.coverAttachmentId
        : (p?.draftCoverAttachmentId ?? null);
    if (coverId !== null) {
      const cover = await tx.attachments.findFirst({
        where: { id: coverId, noteId: note.id },
      });
      if (
        !cover ||
        !/^image\/(?:png|jpeg|webp|gif|avif)$/.test(cover.type) ||
        Number(cover.size) > 10 * 1024 * 1024
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "请选择属于这篇笔记且不超过 10MB 的图片作为封面",
        });
    }
    const unchanged =
      p?.content === publicContent &&
      p?.type === note.type &&
      p?.title === (draftTitle || deriveTitle(publicContent)) &&
      (p?.summary ?? "") === draftSummary &&
      (p?.coverAttachmentId ?? null) === coverId &&
      coverConfigEqual(draftCoverConfig, publicCoverConfig) &&
      JSON.stringify(normalizePublicTags(p?.publicTags ?? [])) ===
        JSON.stringify(draftTags) &&
      JSON.stringify(draftSeo) === JSON.stringify(publishedSeo);

    /*
     * 版本三元组复核。
     *
     * 公开版本对不上时先判断是不是「上一次已经发布成功了，只是响应丢了」
     * —— 那种情况按成功处理，不重复写一个版本；否则一律挡住，
     * 让作者重新检查，不拿旧页面的内容覆盖新版本。
     */
    if (input.expectedSourceVersion && input.expectedSourceVersion !== sourceVersion)
      throw new TRPCError({
        code: "CONFLICT",
        message: "原笔记已发生变化，请重新检查后再发布。",
      });
    if (input.expectedDraftVersion && input.expectedDraftVersion !== draftVersion)
      throw new TRPCError({
        code: "CONFLICT",
        message: "发布草稿已发生变化，请重新检查后再发布。",
      });
    if (input.expectedPublicVersion && input.expectedPublicVersion !== publicVersion) {
      if (!unchanged)
        throw new TRPCError({
          code: "CONFLICT",
          message: "内容已发生变化，请重新检查。",
        });
      // 已经是刚发布出去的那一版了：幂等返回，不写新版本。
      return tx.notes.update({
        where: { id: note.id },
        data: { isPublished: true },
      });
    }

    assertPublishableBody(draftBody.content);
    /*
     * 封面文字层配置跟着底图一起进公开快照：
     * 改了短标题、换了排版，公开页上要跟着一起变 —— 但仍然只在「更新发布」之后。
     * 分享图是公开版本的派生物：封面一变就得重画，所以先把它清掉。
     */
    const nextCoverConfig = draftCoverConfig
      ? toJson(draftCoverConfig)
      : p?.coverConfig ?? undefined;
    const coverChanged = !coverConfigEqual(draftCoverConfig, publicCoverConfig);
    if (!unchanged)
      await tx.notePublication.upsert({
        where: { noteId: note.id },
        create: {
          title: draftTitle || deriveTitle(publicContent),
          summary: draftSummary,
          coverAttachmentId: coverId,
          draftCoverAttachmentId: coverId,
          coverConfig: nextCoverConfig,
          coverFocus: draftCoverConfig?.focus
            ? (draftCoverConfig.focus as unknown as Prisma.InputJsonValue)
            : undefined,
          noteId: note.id,
          content: publicContent,
          type: note.type,
          publicTags: draftTags,
          sourceUpdatedAt: note.updatedAt,
          // 这一版发布时的原笔记指纹，作为下一次来源比对的基线。
          sourceContentVersion: sourceVersion,
          // 新发布的文章默认进精选：同时置顶并加入 banner。
          // 作者随时可以在面板的「首页展示」里改回默认展示。
          isFeatured: true,
          isBanner: true,
          createdAt: now,
          updatedAt: now,
        },
        update: {
          title: draftTitle || deriveTitle(publicContent),
          summary: draftSummary,
          coverAttachmentId: coverId,
          draftCoverAttachmentId: coverId,
          coverConfig: nextCoverConfig,
          coverFocus: draftCoverConfig?.focus
            ? (draftCoverConfig.focus as unknown as Prisma.InputJsonValue)
            : undefined,
          content: publicContent,
          type: note.type,
          publicTags: draftTags,
          sourceUpdatedAt: note.updatedAt,
          sourceContentVersion: sourceVersion,
          updatedAt: now,
          revision: { increment: 1 },
        },
      });
    // 分享图跟着公开版本走：封面一变就作废，下一次有人要 og:image 时重画。
    if (coverChanged)
      await tx.notePublication.updateMany({
        where: { noteId: note.id },
        data: { shareCoverAttachmentId: null },
      });
      // 发布历史：同一个版本号只写一条，重复提交撞唯一键也不会写出两条。
      const published = await tx.notePublication.findUnique({
        where: { noteId: note.id },
        select: { revision: true },
      });
      if (published)
        await tx.blogPublicationHistory.createMany({
          data: [
            {
              noteId: note.id,
              revision: published.revision,
              title: draftTitle || deriveTitle(publicContent),
              summary: draftSummary || null,
              content: publicContent,
              type: note.type,
              coverAttachmentId: coverId,
              publicTags: draftTags,
              seo: draftSeo as unknown as Prisma.InputJsonValue,
              // 这一版的封面文字层配置：撤回后仍能还原当时的封面排版。
              coverConfig: nextCoverConfig,
              sourceContentVersion: sourceVersion,
              publishedAt: now,
            },
          ],
          skipDuplicates: true,
        });
    if (unchanged && p && p.draftCoverAttachmentId !== coverId)
      await tx.notePublication.update({
        where: { noteId: note.id },
        data: { draftCoverAttachmentId: coverId },
      });
    return tx.notes.update({
      where: { id: note.id },
      data: {
        isPublished: true,
        metadata: {
          ...(note.metadata &&
          typeof note.metadata === "object" &&
          !Array.isArray(note.metadata)
            ? note.metadata
            : {}),
          blogSeoPublished: draftSeo,
          // 发布即视为「这个来源版本作者已经看过了」。
          blogSourceBaseline: {
            version: sourceVersion,
            reviewedAt: now.toISOString(),
          },
        },
        publishId: note.publishId ?? randomBytes(12).toString("hex"),
        publishedAt: note.publication?.createdAt ?? now,
      },
    });
  };
  // 发布与撤回都从这里出去：撤回只是把 isPublished 置回 false，
  // 公开快照留着，所以「更新发布」不会重置首次发布时间。
  const result = "$transaction" in db ? await db.$transaction(run) : await run(db);
  // 公开文章集合变了，关于页的站点数据汇总必须立刻重算。
  invalidatePublicStats(accountId);
  return result;
}

export const publicPublicationWhere: Prisma.notesWhereInput = {
  isPublished: true,
  isRecycle: false,
  publication: { isNot: null },
};

// Compatibility DTO for existing blog API consumers. Never spread the draft:
// passwords, metadata, linked private notes, author identity and tags stay private.
export function publicPublicationDTO(note: {
  id: number;
  publishId: string | null;
  isPublished?: boolean;
  isRecycle?: boolean;
  publication: {
    title?: string;
    content: string;
    type: number;
    revision: number;
    createdAt: Date;
    updatedAt: Date;
    coverAttachment?: { path: string } | null;
  } | null;
}) {
  const p = note.publication;
  if (
    !p ||
    ("isPublished" in note && !note.isPublished) ||
    ("isRecycle" in note && note.isRecycle)
  )
    return null;
  return {
    id: note.id,
    publishId: note.publishId,
    content: p.content,
    type: p.type,
    isPublished: true,
    publishedAt: p.createdAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    isArchived: false,
    isRecycle: false,
    isShare: false,
    isTop: false,
    isReviewed: false,
    sharePassword: "",
    metadata: {
      title: p.title || "",
      publicationRevision: p.revision,
      coverUrl: p.coverAttachment?.path ?? null,
    },
    accountId: null,
    account: null,
    attachments: [],
    tags: [],
    references: [],
    _count: { comments: 0, histories: 0 },
  };
}

export async function readPublicPublication(
  db: PrismaClient,
  publishId: string,
) {
  const note = await db.notes.findFirst({
    where: { ...publicPublicationWhere, publishId },
    select: {
      id: true,
      publishId: true,
      publication: { include: { coverAttachment: { select: { path: true } } } },
    },
  });
  return note ? publicPublicationDTO(note) : null;
}
