import { Prisma, type PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import {
  normalizeCoverFocus,
  type CoverFocus,
  type CoverFocusValue,
  type CoverPlacementKey,
} from "../../shared/lib/blogCover";
import {
  COVER_TEMPLATE_VERSION,
  coverTextConfigEqual,
  normalizeCoverTextConfig,
  type CoverTextConfig,
} from "../../shared/lib/blogCoverText";

/**
 * 封面配置 = 文字层配置 + 裁切焦点。
 *
 * 草稿与公开各存一份：
 *   草稿在 notes.metadata.blogCover（改草稿不影响线上）；
 *   公开在 notePublication.coverConfig（点「更新发布」才写进去）。
 */

export type CoverConfig = CoverTextConfig & {
  /** 各展示位的裁切位置；换底图后对不上就当没调过。 */
  focus: CoverFocus | null;
};

/** 草稿封面配置在笔记 metadata 里的键。 */
export const DRAFT_COVER_KEY = "blogCover";

export function emptyCoverConfig(): CoverConfig {
  return { ...normalizeCoverTextConfig(null), focus: null };
}

/** 归一化任意来源的封面配置（JSON / undefined / 脏数据）。 */
export function normalizeCoverConfig(value: unknown): CoverConfig {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    ...normalizeCoverTextConfig(raw),
    focus: normalizeCoverFocus(raw.focus),
  };
}

/** 读草稿封面配置；没有就是 null（表示作者还没动过封面）。 */
export function readDraftCoverConfig(metadata: unknown): CoverConfig | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return null;
  const raw = (metadata as Record<string, unknown>)[DRAFT_COVER_KEY];
  if (!raw || typeof raw !== "object") return null;
  return normalizeCoverConfig(raw);
}

/**
 * 写草稿封面配置。
 *
 * metadata 是浅合并 —— 不能整块覆盖，
 * 否则 expireAt、aiSourceMessageId 这些字段会被抹掉。
 */
export function writeDraftCoverConfig(
  metadata: unknown,
  config: CoverConfig,
): Record<string, unknown> {
  const current =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  return { ...current, [DRAFT_COVER_KEY]: normalizeCoverConfig(config) };
}

/** 读公开快照里的封面配置。 */
export function readPublicCoverConfig(value: unknown): CoverConfig | null {
  if (!value || typeof value !== "object") return null;
  return normalizeCoverConfig(value);
}

/** 两份封面配置是否等价（公开快照与草稿对比用）。 */
export function coverConfigEqual(
  a: CoverConfig | null | undefined,
  b: CoverConfig | null | undefined,
) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (!coverTextConfigEqual(a, b)) return false;
  return focusEqual(a.focus, b.focus);
}

function focusEqual(a: CoverFocus | null, b: CoverFocus | null) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if ((a.sourceId ?? null) !== (b.sourceId ?? null)) return false;
  for (const key of Object.keys({
    ...(a.placements ?? {}),
    ...(b.placements ?? {}),
  }) as CoverPlacementKey[]) {
    const x = a.placements?.[key];
    const y = b.placements?.[key];
    if (!x && !y) continue;
    if (!x || !y) return false;
    if (Math.abs(x.x - y.x) > 0.01 || Math.abs(x.y - y.y) > 0.01)
      return false;
  }
  return true;
}

/**
 * 封面配置的指纹：分享图缓存键、变更检测都用它。
 *
 * 只看真正影响画面的字段 —— 排版模板版本变了要重排，
 * 但 focus 的 sourceId 变了说明换了底图，也要重排。
 */
export function coverConfigFingerprint(config: CoverConfig | null | undefined) {
  const c = normalizeCoverConfig(config ?? null);
  const focus = c.focus;
  const placements = focus?.placements ?? {};
  const parts = [
    c.mode,
    c.templateVersion || COVER_TEMPLATE_VERSION,
    c.title,
    c.subtitle,
    c.align,
    c.sizeScale.toFixed(3),
    c.palette,
    String(focus?.sourceId ?? ""),
    ...(["double", "single", "banner", "share"] as CoverPlacementKey[]).map(
      (key) => {
        const p = placements[key];
        return p ? `${key}:${p.x.toFixed(2)},${p.y.toFixed(2)}` : `${key}:-`;
      },
    ),
  ];
  return parts.join("|");
}

/** 取某个展示位的裁切位置；换过底图就当没调过。 */
export function readFocusFor(
  focus: CoverFocus | null | undefined,
  placement: CoverPlacementKey,
  sourceId: number | null,
): CoverFocusValue | null {
  const normalized = normalizeCoverFocus(focus);
  if (!normalized) return null;
  if ((normalized.sourceId ?? null) !== (sourceId ?? null)) return null;
  return normalized.placements?.[placement] ?? null;
}

/** 存进数据库的 JSON 形态。 */
export function toJson(config: CoverConfig): Prisma.InputJsonValue {
  return normalizeCoverConfig(config) as unknown as Prisma.InputJsonValue;
}

/**
 * 对外的封面文字层配置。
 *
 * 只带渲染需要的字段：焦点位置由 coverFocus 单独给（按展示位分开）。
 */
export function publicCoverTextDTO(config: CoverConfig | null | undefined) {
  if (!config) return null;
  const c = normalizeCoverConfig(config);
  return {
    mode: c.mode,
    templateVersion: c.templateVersion,
    title: c.title,
    subtitle: c.subtitle,
    align: c.align,
    sizeScale: c.sizeScale,
    palette: c.palette,
  };
}

/**
 * 只写封面文字层（短标题、副标题），不碰底图。
 *
 * 「发布内容」页签的封面文案设置项走这条路径：文案得先能落到草稿里，
 * 底图还没有也允许写 —— 没底图的公开页本来就不显示封面，不受影响。
 * 草稿没配过时沿用公开那份配置，所以只改文字不会把作者调过的排版打回默认。
 */
export async function saveDraftCoverText(
  db: PrismaClient,
  accountId: number,
  noteId: number,
  input: { title: string; subtitle: string },
) {
  const note = await db.notes.findFirst({
    where: { id: noteId, accountId, isRecycle: false },
    select: {
      id: true,
      metadata: true,
      publication: { select: { coverConfig: true } },
    },
  });
  if (!note?.publication)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "文章不存在，请先发布正文。",
    });
  const current =
    readDraftCoverConfig(note.metadata) ??
    readPublicCoverConfig(note.publication.coverConfig) ??
    emptyCoverConfig();
  const config: CoverConfig = {
    ...current,
    title: input.title.trim(),
    subtitle: input.subtitle.trim(),
    templateVersion: COVER_TEMPLATE_VERSION,
  };
  await db.notes.update({
    where: { id: note.id },
    data: {
      metadata: writeDraftCoverConfig(
        note.metadata,
        config,
      ) as unknown as Prisma.InputJsonValue,
    },
  });
  return config;
}

/**
 * 读一篇文章的封面状态：草稿那份与公开那份分开给。
 *
 * 后台的封面面板要同时看到两边 —— 草稿改了什么、线上现在是什么，
 * 才好判断「这次更新会改掉哪张封面」。
 */
export async function readCoverState(
  db: PrismaClient,
  accountId: number,
  noteId: number,
) {
  const note = await db.notes.findFirst({
    where: { id: noteId, accountId, isRecycle: false },
    include: {
      publication: {
        include: {
          coverAttachment: { select: { id: true, path: true } },
          draftCoverAttachment: { select: { id: true, path: true } },
        },
      },
    },
  });
  if (!note?.publication) return null;
  const p = note.publication;
  const publicConfig = readPublicCoverConfig(p.coverConfig);
  const draftConfig = readDraftCoverConfig(note.metadata);
  return {
    draft: {
      attachmentId: p.draftCoverAttachmentId ?? null,
      path: p.draftCoverAttachment?.path ?? null,
      // 草稿没配过封面文字时沿用公开那份：那表示作者自上次发布后没动过。
      config: draftConfig ?? publicConfig,
      /** 草稿是否真的配过（false 表示这次发布不会动封面文字）。 */
      configured: !!draftConfig,
    },
    public: {
      attachmentId: p.coverAttachmentId ?? null,
      path: p.coverAttachment?.path ?? null,
      config: publicConfig,
      revision: p.revision,
    },
  };
}
