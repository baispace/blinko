import type { PrismaClient } from "@prisma/client";
import { FileService } from "./files";
import { composeCoverImage } from "./blogCoverComposition";
import { cropCoverToRatio } from "./blogCoverGeneration";
import { computeCoverTextLayout } from "../../shared/lib/blogCoverText";
import {
  coverConfigFingerprint,
  readPublicCoverConfig,
  type CoverConfig,
} from "./blogCoverConfig";

/**
 * 社交分享图：由「同一张底图 + 同一份文字配置」派生出来的整图。
 *
 * 关键点：
 *   1. 不再调 AI —— 它是一张派生资源，不是新生成的封面；
 *   2. 只用**公开版本**的底图与文字 —— 不能泄露尚未发布的文案；
 *   3. 缓存键 = 配置指纹 + 公开版本号 + 底图 id：
 *      配置或版本一变就重画，没变就直接复用已生成的附件。
 */

export const SHARE_SIZE = { width: 1200, height: 630 } as const;

/** 分享图的缓存键：配置 + 版本 + 底图，三者任一变化都要重画。 */
export function shareFingerprint(
  config: CoverConfig,
  revision: number,
  baseAttachmentId: number | null,
) {
  return `${coverConfigFingerprint(config)}|rev=${revision}|base=${baseAttachmentId ?? ""}`;
}

/**
 * 取（必要时生成）这篇文章的分享图。
 *
 * 返回附件路径；这篇没有可叠加文字的封面时返回 null ——
 * 那时 og:image 直接用底图本身。
 */
export async function ensureShareImage(
  db: PrismaClient,
  noteId: number,
): Promise<string | null> {
  const note = await db.notes.findFirst({
    where: { id: noteId, isRecycle: false },
    include: {
      publication: {
        include: { coverAttachment: true, shareCoverAttachment: true },
      },
    },
  });
  const p = note?.publication;
  if (!note || !p || !p.coverAttachment || !note.isPublished) return null;
  const config = readPublicCoverConfig(p.coverConfig);
  // 完整图片封面（历史封面自带文字）不叠字，也就没什么可派生的。
  if (!config || config.mode !== "overlay" || !config.title.trim())
    return null;

  const fingerprint = shareFingerprint(
    config,
    p.revision,
    p.coverAttachmentId,
  );
  const cached = p.shareCoverAttachment;
  const cachedInfo = (cached?.metadata as any)?.blogShareImage;
  if (cached && cachedInfo?.fingerprint === fingerprint) return cached.path;

  try {
    const base = await FileService.getFileBuffer(p.coverAttachment.path);
    const focus =
      config.focus && config.focus.sourceId === p.coverAttachmentId
        ? (config.focus.placements?.banner ?? null)
        : null;
    const cropped = await cropCoverToRatio(base, {
      width: SHARE_SIZE.width,
      height: SHARE_SIZE.height,
      focus,
    });
    const layout = computeCoverTextLayout({
      containerWidth: SHARE_SIZE.width,
      containerHeight: SHARE_SIZE.height,
      placement: "share",
      title: config.title,
      subtitle: config.subtitle,
      align: config.align,
      sizeScale: config.sizeScale,
    });
    const buffer = await composeCoverImage({
      base: cropped,
      layout,
      canvasWidth: SHARE_SIZE.width,
      canvasHeight: SHARE_SIZE.height,
      palette: config.palette,
      align: config.align,
    });
    const uploaded = await FileService.uploadFile({
      buffer,
      originalName: `ink-share-${note.id}-${p.revision}.webp`,
      type: "image/webp",
      accountId: note.accountId!,
      metadata: {
        blogShareImage: {
          noteId: note.id,
          revision: p.revision,
          fingerprint,
        },
      },
    });
    const attachment = await db.attachments.findFirstOrThrow({
      where: { path: uploaded.filePath },
    });
    await db.attachments.update({
      where: { id: attachment.id },
      data: { noteId: note.id },
    });
    await db.notePublication.update({
      where: { noteId: note.id },
      data: { shareCoverAttachmentId: attachment.id },
    });
    return attachment.path;
  } catch {
    // 分享图画不出来不该拖垮页面：退回底图本身。
    return null;
  }
}
