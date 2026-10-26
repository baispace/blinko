import { Prisma, PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { readArticleSeo } from "../../shared/lib/blogSiteSettings";
import {
  compareCover,
  compareSeo,
  compareTags,
  countChanges,
  diffBlocks,
  splitBlocks,
  type DiffSegment,
  type SeoChange,
  type TagChange,
} from "../../shared/lib/blogDiff";
import { createHash } from "node:crypto";
import {
  contentVersion,
  publicationSummary,
  publicationTitle,
} from "../../shared/lib/blogPublication";
import { normalizePublicTags, readDraftPublicTags } from "./blogPublicTags";
import { normalizeCoverConfig } from "./blogCoverConfig";
import {
  readDraftCoverConfig,
  readPublicCoverConfig,
  type CoverConfig,
} from "./blogCoverConfig";

/**
 * 「检查更新」的服务端核心。
 *
 * 三份内容要分清：
 *   原笔记      notes.content —— 用户日常编辑的私有正文
 *   发布草稿    notes.metadata 上的公开字段 + 草稿正文 + 待发布封面
 *   当前公开版本 notePublication 这一行 —— 上次确认发布时冻结的快照
 *
 * 原笔记改了不会直接改到草稿上：「检查更新」只报告变化，
 * 要不要采用由作者决定；采用也只改草稿，不发布。
 */

/* ------------------------------------------------------------------ *
 * 草稿正文：与原笔记分叉的那一份
 * ------------------------------------------------------------------ */

/**
 * 草稿正文存在 notes.metadata.blogDraftBody。
 *
 * 没有这一项时，草稿正文就是原笔记正文 —— 老文章不用迁移，
 * 行为和以前一致。作者一旦「采用原笔记更新」或手动分叉，
 * 草稿正文就独立出来，原笔记再改也不会覆盖它。
 */
export type DraftBodyState = {
  content: string;
  /** 是否已经与原笔记分叉。 */
  forked: boolean;
  /** 分叉时原笔记的指纹，用来判断来源之后有没有再变。 */
  sourceVersion: string | null;
  importedAt: string | null;
};

export function readDraftBody(
  metadata: unknown,
  sourceContent: string,
): DraftBodyState {
  const m =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  const raw = m.blogDraftBody as
    | { content?: unknown; sourceVersion?: unknown; importedAt?: unknown }
    | undefined;
  if (raw && typeof raw === "object" && typeof raw.content === "string") {
    return {
      content: raw.content,
      forked: true,
      sourceVersion:
        typeof raw.sourceVersion === "string" ? raw.sourceVersion : null,
      importedAt: typeof raw.importedAt === "string" ? raw.importedAt : null,
    };
  }
  return {
    content: sourceContent,
    forked: false,
    sourceVersion: null,
    importedAt: null,
  };
}

/** 写草稿正文：只动 blogDraftBody 这一个键。 */
export function withDraftBody(
  metadata: unknown,
  body: { content: string; sourceVersion: string; importedAt?: string },
): Prisma.InputJsonValue {
  const current =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  return {
    ...current,
    blogDraftBody: {
      content: body.content,
      sourceVersion: body.sourceVersion,
      importedAt: body.importedAt ?? new Date().toISOString(),
    },
  } as Prisma.InputJsonValue;
}

/**
 * 来源基线：作者「看过并处理过」的源版本。
 *
 * 发布时记一次；作者选择「保留当前草稿」或「采用原笔记」时也记一次。
 * 没有基线的老文章，只能说「无法判断来源有没有变」—— 不猜。
 */
export function readSourceBaseline(metadata: unknown) {
  const m =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  const raw = m.blogSourceBaseline as
    | { version?: unknown; reviewedAt?: unknown }
    | undefined;
  if (!raw || typeof raw !== "object" || typeof raw.version !== "string")
    return { version: null as string | null, reviewedAt: null as string | null };
  return {
    version: raw.version,
    reviewedAt: typeof raw.reviewedAt === "string" ? raw.reviewedAt : null,
  };
}

export function withSourceBaseline(
  metadata: unknown,
  version: string,
  reviewedAt?: string,
): Prisma.InputJsonValue {
  const current =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  return {
    ...current,
    blogSourceBaseline: {
      version,
      reviewedAt: reviewedAt ?? new Date().toISOString(),
    },
  } as Prisma.InputJsonValue;
}

/* ------------------------------------------------------------------ *
 * 版本指纹
 * ------------------------------------------------------------------ */

function fingerprint(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value ?? null))
    .digest("hex")
    .slice(0, 32);
}

/** 原笔记正文指纹。 */
export function sourceVersionOf(content: string, type: number) {
  return contentVersion(content ?? "", type ?? 0);
}

/** 发布草稿指纹：公开字段 + 草稿正文 + 待发布封面 + 封面文字 + SEO 一起算。 */
export function draftVersionOf(draft: {
  title: string;
  summary: string;
  body: string;
  tags: string[];
  coverAttachmentId: number | null;
  /** 封面文字层配置：短标题 / 副标题 / 排版。 */
  coverConfig?: unknown;
  seo: Record<string, string>;
}) {
  return fingerprint({
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    body: draft.body,
    tags: [...draft.tags].map((t) => t.trim().toLowerCase()).sort(),
    coverAttachmentId: draft.coverAttachmentId ?? null,
    coverConfig: normalizeCoverConfig(draft.coverConfig ?? null),
    seo: {
      title: (draft.seo.title ?? "").trim(),
      description: (draft.seo.description ?? "").trim(),
      image: (draft.seo.image ?? "").trim(),
      imageAlt: (draft.seo.imageAlt ?? "").trim(),
    },
  });
}

/** 公开版本指纹：版本号 + 快照内容。 */
export function publicVersionOf(publication: {
  revision: number;
  title: string;
  summary: string | null;
  content: string;
  publicTags: string[];
  coverAttachmentId: number | null;
  /** 公开快照里的封面文字层配置。 */
  coverConfig?: unknown;
} | null) {
  if (!publication) return fingerprint({ revision: 0, empty: true });
  return fingerprint({
    revision: publication.revision,
    title: publication.title,
    summary: publication.summary ?? "",
    content: publication.content,
    tags: [...publication.publicTags].map((t) => t.trim().toLowerCase()).sort(),
    coverAttachmentId: publication.coverAttachmentId ?? null,
    coverConfig: normalizeCoverConfig(publication.coverConfig ?? null),
  });
}

/* ------------------------------------------------------------------ *
 * 检查结果
 * ------------------------------------------------------------------ */

export type PublishLifecycle = "first-publish" | "live" | "withdrawn";

export type PublishCheckMode =
  | "up-to-date"
  | "draft-changed"
  | "source-changed"
  | "conflict"
  | "first-publish"
  | "withdrawn";

export type FieldChange = {
  changed: boolean;
  before: string;
  after: string;
};

export type ContentChange = {
  changed: boolean;
  before: string;
  after: string;
  segments: DiffSegment[];
  changeCount: number;
};

export type CoverChange = {
  changed: boolean;
  before: {
    attachmentId: number | null;
    title: string;
    subtitle: string;
    palette: string;
    layout: string;
    url: string | null;
  };
  after: {
    attachmentId: number | null;
    title: string;
    subtitle: string;
    palette: string;
    layout: string;
    url: string | null;
  };
  changes: ReturnType<typeof compareCover>;
};

export type PublishConflict = {
  field: "body" | "title";
  label: string;
  /** 给作者看的一句话：这两边为什么撞上了。 */
  detail: string;
  sourceValue: string;
  draftValue: string;
};

export type PublishCheckResult = {
  noteId: number;
  publishId: string | null;
  lifecycle: PublishLifecycle;
  mode: PublishCheckMode;
  /** 三个版本号：进入对比时记下，发布时服务端重新核对。 */
  versions: {
    source: string;
    draft: string;
    public: string;
  };
  public: {
    hasSnapshot: boolean;
    revision: number;
    publishedAt: string | null;
    updatedAt: string | null;
  };
  source: {
    version: string;
    baselineVersion: string | null;
    baselineAvailable: boolean;
    changed: boolean;
    title: string;
    updatedAt: string | null;
  };
  draft: {
    version: string;
    title: string;
    summary: string;
    body: string;
    tags: string[];
    coverAttachmentId: number | null;
    forked: boolean;
    updatedAt: string | null;
  };
  changes: {
    title: FieldChange;
    summary: FieldChange;
    content: ContentChange;
    tags: TagChange & { changed: boolean };
    cover: CoverChange;
    seo: { changed: boolean; changes: SeoChange[] };
  };
  conflicts: PublishConflict[];
  /** 有变化的字段名，页面据此显示「N 项变化」。 */
  changedFields: string[];
  changeCount: number;
  blockers: string[];
  canPublish: boolean;
};

/** 从正文里取公开标题：与前台 contentTitle 同一套口径。 */
export function deriveTitle(content: string) {
  const source = content ?? "";
  const match = source.match(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/i);
  const raw = match
    ? match[2]
    : source
        .replace(/<\/(?:p|div|h[1-6])>/gi, "\n")
        .split(/\r?\n/)
        .find((line) => line.trim());
  return (raw ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

type CoverMeta = {
  id: number;
  path: string;
  metadata: unknown;
};

/**
 * 读封面配置。
 *
 * 现在封面分三层：底图附件 + 文字层配置 + 页面状态层。
 * 比对只看底图身份与文字层配置 —— 图片地址每次签发都可能变，不能拿来比。
 */
function coverComposition(config: CoverConfig | null | undefined) {
  return {
    title: config?.title ?? "",
    subtitle: config?.subtitle ?? "",
    palette: config?.palette ?? "",
    layout: config
      ? config.mode === "full"
        ? "完整图片封面"
        : "底图＋系统文字"
      : "",
  };
}

/**
 * 算一次「检查更新」。
 *
 * 判定顺序：
 *   1. 从没发布过 → 首次发布；
 *   2. 发布过但当前是撤回状态 → 已撤回（保留历史快照供对比）；
 *   3. 原笔记和草稿都没动 → 已是最新；
 *   4. 只有草稿动过 → 直接进对比；
 *   5. 只有原笔记动过 → 先处理来源更新；
 *   6. 两边都动过且互相冲突 → 先处理冲突，再进对比。
 */
export async function buildPublishCheck(
  db: PrismaClient | Prisma.TransactionClient,
  accountId: number,
  noteId: number,
): Promise<PublishCheckResult> {
  const note = await db.notes.findFirst({
    where: { id: noteId, accountId },
    include: {
      publication: true,
      attachments: { select: { id: true, path: true, metadata: true } },
    },
  });
  if (!note) throw new Error("文章不存在");
  const p = note.publication;

  const sourceBody = note.content ?? "";
  const sourceVersion = sourceVersionOf(sourceBody, note.type);
  const draftBody = readDraftBody(note.metadata, sourceBody);
  const baseline = readSourceBaseline(note.metadata);

  const draftTitle = publicationTitle(note.metadata);
  const draftSummary = publicationSummary(note.metadata);
  const draftTags = readDraftPublicTags(note.metadata);
  const draftSeo = readArticleSeo(note.metadata);
  const publicSeo = readArticleSeo(note.metadata, true);

  const draftCoverId = p?.draftCoverAttachmentId ?? null;
  const publicCoverId = p?.coverAttachmentId ?? null;
  const draftCover = note.attachments.find((a) => a.id === draftCoverId) ?? null;
  const publicCover = note.attachments.find((a) => a.id === publicCoverId) ?? null;
  // 封面文字层配置：草稿那份优先；草稿没配过就沿用公开那份（= 没动过）。
  const publicCoverConfig = readPublicCoverConfig(p?.coverConfig);
  const draftCoverConfig =
    readDraftCoverConfig(note.metadata) ?? publicCoverConfig;

  const draftTitleEffective = draftTitle || deriveTitle(draftBody.content);
  const publicTitle = p?.title || (p ? deriveTitle(p.content) : "");
  const publicSummary = p?.summary ?? "";
  const publicTags = normalizePublicTags(p?.publicTags ?? []);

  const draftVersion = draftVersionOf({
    title: draftTitleEffective,
    summary: draftSummary,
    body: draftBody.content,
    tags: draftTags,
    coverAttachmentId: draftCoverId,
    coverConfig: draftCoverConfig,
    seo: draftSeo as unknown as Record<string, string>,
  });
  const publicVersion = publicVersionOf(
    p
      ? {
          revision: p.revision,
          title: publicTitle,
          summary: publicSummary,
          content: p.content,
          publicTags,
          coverAttachmentId: publicCoverId,
          coverConfig: publicCoverConfig,
        }
      : null,
  );

  /* ---- 正文差异 ---- */
  const contentSegments = diffBlocks(
    splitBlocks(p?.content ?? ""),
    splitBlocks(draftBody.content),
  );
  const contentChangeCount = countChanges(contentSegments);
  const contentChanged =
    (p?.content ?? "") !== draftBody.content || contentChangeCount > 0;

  /* ---- 标题 / 概要 / 标签 / 封面 / SEO ---- */
  const titleChanged = draftTitleEffective !== publicTitle;
  const summaryChanged = draftSummary.trim() !== publicSummary.trim();
  const tagChange = compareTags(publicTags, draftTags);
  const tagsChanged = tagChange.added.length > 0 || tagChange.removed.length > 0;
  const draftComposition = coverComposition(draftCoverConfig);
  const publicComposition = coverComposition(publicCoverConfig);
  const coverChanges = compareCover(
    {
      attachmentId: publicCoverId,
      title: publicComposition.title,
      subtitle: publicComposition.subtitle,
      palette: publicComposition.palette,
      layout: publicComposition.layout,
    },
    {
      attachmentId: draftCoverId,
      title: draftComposition.title,
      subtitle: draftComposition.subtitle,
      palette: draftComposition.palette,
      layout: draftComposition.layout,
    },
  );
  const seoChanges = compareSeo(
    publicSeo as unknown as Record<string, string>,
    draftSeo as unknown as Record<string, string>,
  );

  /* ---- 来源变化与冲突 ---- */
  const sourceTitle = deriveTitle(sourceBody);
  const baselineVersion = baseline.version ?? p?.sourceContentVersion ?? null;
  const sourceChanged = baselineVersion ? baselineVersion !== sourceVersion : false;
  const sourceBodyDiffersFromPublic = sourceBody !== (p?.content ?? "");
  const draftBodyDiffersFromPublic = draftBody.content !== (p?.content ?? "");
  const draftBodyDiffersFromSource = draftBody.content !== sourceBody;

  const conflicts: PublishConflict[] = [];
  // 正文：原笔记改了、草稿也改了、两边还不一样 —— 撞上了。
  if (
    sourceBodyDiffersFromPublic &&
    draftBodyDiffersFromPublic &&
    draftBodyDiffersFromSource
  ) {
    conflicts.push({
      field: "body",
      label: "正文",
      detail:
        "原笔记和发布草稿的正文都改过，且两边内容不一致，需要你决定保留哪一份。",
      sourceValue: sourceBody,
      draftValue: draftBody.content,
    });
  }
  /*
   * 标题：
   *   来源侧变了 —— 原笔记现在派生出的标题和发布时那份正文派生出的不一样；
   *   草稿侧变了 —— 草稿标题和公开标题不一样（作者重新整理过）。
   * 两边都变了、而且两边给的结果不一样，才算撞车。
   *
   * 草稿标题是自己整理过的（不是自动派生）时，作者的决定优先，
   * 不因为原笔记更新就把标题重置掉。
   */
  const draftTitleIsManual = draftTitle.trim() !== "";
  const sourceTitleChanged = sourceTitle !== deriveTitle(p?.content ?? "");
  const draftTitleChanged = draftTitleEffective !== publicTitle;
  if (
    draftTitleIsManual &&
    sourceTitleChanged &&
    draftTitleChanged &&
    draftTitleEffective !== sourceTitle
  ) {
    conflicts.push({
      field: "title",
      label: "公开标题",
      detail:
        "原笔记标题与人工整理过的公开标题都变了，需要你决定用哪一个。",
      sourceValue: sourceTitle,
      draftValue: draftTitleEffective,
    });
  }

  const draftChanged =
    titleChanged ||
    summaryChanged ||
    contentChanged ||
    tagsChanged ||
    coverChanges.length > 0 ||
    seoChanges.length > 0;

  /* ---- 生命周期与结果分支 ---- */
  const neverPublished = !p || p.revision === 0;
  const lifecycle: PublishLifecycle = neverPublished
    ? "first-publish"
    : note.isPublished
      ? "live"
      : "withdrawn";

  let mode: PublishCheckMode;
  if (lifecycle === "first-publish") mode = "first-publish";
  else if (lifecycle === "withdrawn") mode = "withdrawn";
  // 有冲突就先处理冲突；来源变了也要先过来源这一关，
  // 再看最终待发布差异。
  else if (conflicts.length) mode = "conflict";
  else if (sourceChanged) mode = "source-changed";
  else if (draftChanged) mode = "draft-changed";
  else mode = "up-to-date";

  /*
   * 这里存字段键，不存中文。
   *
   * 中文名由前端统一映射（contentStatus.ts 的 CHANGE_FIELD_LABELS）。
   * 各处自己写一份中文，就会出现"公开标题 / 标题"这种同义不同写法，
   * 用户会以为是两个不同的字段。
   */
  const changedFields: string[] = [];
  if (titleChanged) changedFields.push("title");
  if (summaryChanged) changedFields.push("summary");
  if (contentChanged) changedFields.push("content");
  if (tagsChanged) changedFields.push("tags");
  if (coverChanges.length) changedFields.push("cover");
  if (seoChanges.length) changedFields.push("seo");

  const blockers: string[] = [];
  if (note.isRecycle) blockers.push("请先从回收站恢复笔记");
  if (!draftBody.content.replace(/<[^>]*>/g, "").trim())
    blockers.push("正文为空，无法发布");
  if (draftCoverId && !note.attachments.some((a) => a.id === draftCoverId))
    blockers.push("待发布封面已移除，请重新选择");

  return {
    noteId: note.id,
    publishId: note.publishId,
    lifecycle,
    mode,
    versions: { source: sourceVersion, draft: draftVersion, public: publicVersion },
    public: {
      hasSnapshot: !!p,
      revision: p?.revision ?? 0,
      publishedAt: p?.createdAt?.toISOString() ?? null,
      updatedAt: p?.updatedAt?.toISOString() ?? null,
    },
    source: {
      version: sourceVersion,
      baselineVersion,
      baselineAvailable: !!baselineVersion,
      changed: sourceChanged,
      title: sourceTitle,
      updatedAt: note.updatedAt?.toISOString() ?? null,
    },
    draft: {
      version: draftVersion,
      title: draftTitleEffective,
      summary: draftSummary,
      body: draftBody.content,
      tags: draftTags,
      coverAttachmentId: draftCoverId,
      forked: draftBody.forked,
      updatedAt: note.updatedAt?.toISOString() ?? null,
    },
    changes: {
      title: {
        changed: titleChanged,
        before: publicTitle || "（无标题）",
        after: draftTitleEffective || "（无标题）",
      },
      summary: {
        changed: summaryChanged,
        before: publicSummary || "（无概要）",
        after: draftSummary || "（无概要）",
      },
      content: {
        changed: contentChanged,
        before: p?.content ?? "",
        after: draftBody.content,
        segments: contentSegments,
        changeCount: contentChangeCount,
      },
      tags: { ...tagChange, changed: tagsChanged },
      cover: {
        changed: coverChanges.length > 0,
        before: {
          attachmentId: publicCoverId,
          ...publicComposition,
          url: publicCover?.path ?? null,
        },
        after: {
          attachmentId: draftCoverId,
          ...draftComposition,
          url: draftCover?.path ?? null,
        },
        changes: coverChanges,
      },
      seo: { changed: seoChanges.length > 0, changes: seoChanges },
    },
    conflicts,
    changedFields,
    changeCount:
      changedFields.length + (contentChangeCount > 0 ? contentChangeCount - 1 : 0),
    blockers,
    canPublish: blockers.length === 0,
  };
}

/* ------------------------------------------------------------------ *
 * 处理来源更新
 * ------------------------------------------------------------------ */

/**
 * 处理「原笔记有更新」这一步。
 *
 *   adoptBody=true  采用原笔记：把原笔记正文写进发布草稿（草稿从此独立），
 *                   并把来源基线记到当前版本 —— 作者下次不会再看到同一条提示。
 *   adoptBody=false 保留当前草稿：只记基线，正文一个字都不动。
 *   titleChoice     公开标题撞车时的逐项处理：keep 保留人工整理的标题，
 *                   adopt 改用原笔记派生出来的标题。
 *
 * 无论怎么选，都不碰概要、标签、封面与 SEO ——
 * 更新正文不牵动其它字段，AI 整理过的内容也不会被顺带重置。
 *
 * 这一步只改草稿，绝不发布。
 */
export async function resolveSourceChange(
  db: PrismaClient | Prisma.TransactionClient,
  accountId: number,
  input: {
    noteId: number;
    adoptBody?: boolean;
    titleChoice?: "keep" | "adopt";
    /** 检查时看到的来源版本；对不上说明原笔记又变了。 */
    expectedSourceVersion?: string;
  },
) {
  const note = await db.notes.findFirst({
    where: { id: input.noteId, accountId, isRecycle: false },
    include: { publication: true },
  });
  if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "文章不存在" });
  const sourceVersion = sourceVersionOf(note.content ?? "", note.type);
  if (
    input.expectedSourceVersion &&
    input.expectedSourceVersion !== sourceVersion
  )
    throw new TRPCError({
      code: "CONFLICT",
      message: "原笔记已发生变化，请重新检查后再处理。",
    });

  let metadata = (note.metadata ?? {}) as Record<string, unknown>;
  if (input.adoptBody) {
    metadata = withDraftBody(metadata, {
      content: note.content ?? "",
      sourceVersion,
    }) as Record<string, unknown>;
  }
  if (input.titleChoice === "adopt") {
    metadata = { ...metadata, title: deriveTitle(note.content ?? "") };
  }
  // 记下「这个来源版本作者看过了」，别反复提示同一件事。
  metadata = withSourceBaseline(metadata, sourceVersion) as Record<
    string,
    unknown
  >;
  await db.notes.update({
    where: { id: note.id },
    data: { metadata: metadata as Prisma.InputJsonValue },
  });
  return {
    sourceVersion,
    adoptedBody: !!input.adoptBody,
    titleChoice: input.titleChoice ?? ("keep" as const),
  };
}
