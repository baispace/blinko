import { Prisma, PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { randomBytes } from 'node:crypto';

// Publishing only accepts self-contained body content in this first iteration.
// Private attachment URLs (including HTML-escaped/percent-encoded paths) cannot
// become silently broken public images or expose an authenticated URL.
export function assertPublishableBody(content: string) {
  if (!content.replace(/<[^>]*>/g, '').trim() && !/<img\b/i.test(content))
    throw new TRPCError({ code: 'BAD_REQUEST', message: '正文为空，无法发布' });
  let decoded = content.replace(/&#(?:x([0-9a-f]+)|(\d+));?/gi, (_, hex, dec) => String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10)));
  try { decoded = decodeURIComponent(decoded); } catch {}
  if (/\/api\/(?:file|s3file)\//i.test(decoded) || /(?:[?&]|&amp;)(?:token|authorization)=/i.test(decoded))
    throw new TRPCError({ code: 'BAD_REQUEST', message: '正文包含站内图片、文件或带授权的链接，本轮暂不支持公开这些资源，请移除后重试' });
}

export async function publicationStatus(db: PrismaClient, accountId: number, id: number) {
  const note = await db.notes.findFirst({ where: { id, accountId }, include: { publication: true } });
  if (!note) throw new TRPCError({ code: 'NOT_FOUND', message: '笔记不存在' });
  const p = note.publication;
  return { isPublished: note.isPublished && !!p && !note.isRecycle, publishId: note.publishId,
    legacyPublished: note.isPublished && !p, revision: p?.revision ?? 0,
    publishedAt: p?.createdAt ?? null, publishedUpdatedAt: p?.updatedAt ?? null,
    draftUpdatedAt: note.updatedAt, hasChanges: !p || p.content !== note.content || p.type !== note.type,
    canPublish: !note.isRecycle, attachmentCount: await db.attachments.count({ where: { noteId: id } }) };
}

export async function publishSnapshot(db: PrismaClient, accountId: number, input: { id: number; isCancel?: boolean; expectedUpdatedAt?: Date }) {
  return db.$transaction(async tx => {
    // Serialize publish, withdrawal and autosave on the source note. Take the
    // snapshot only after acquiring this lock, never from a stale UI object.
    await tx.$queryRaw`SELECT id FROM notes WHERE id = ${input.id} AND "accountId" = ${accountId} FOR UPDATE`;
    const note = await tx.notes.findFirst({ where: { id: input.id, accountId }, include: { publication: true } });
    if (!note) throw new TRPCError({ code: 'NOT_FOUND', message: '笔记不存在或无权发布' });
    if (input.isCancel) return tx.notes.update({ where: { id: note.id }, data: { isPublished: false } });
    if (note.isRecycle) throw new TRPCError({ code: 'BAD_REQUEST', message: '请先从回收站恢复笔记' });
    if (input.expectedUpdatedAt && note.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
      throw new TRPCError({ code: 'CONFLICT', message: '笔记已更新，请刷新发布状态后重试，确保发布的是最新保存内容' });
    assertPublishableBody(note.content);
    const now = new Date();
    const unchanged = note.publication?.content === note.content && note.publication?.type === note.type;
    if (!unchanged) await tx.notePublication.upsert({ where: { noteId: note.id },
      create: { noteId: note.id, content: note.content, type: note.type, sourceUpdatedAt: note.updatedAt, createdAt: now, updatedAt: now },
      update: { content: note.content, type: note.type, sourceUpdatedAt: note.updatedAt, updatedAt: now, revision: { increment: 1 } } });
    return tx.notes.update({ where: { id: note.id }, data: { isPublished: true,
      publishId: note.publishId ?? randomBytes(12).toString('hex'),
      publishedAt: note.publication?.createdAt ?? now } });
  });
}

export const publicPublicationWhere: Prisma.notesWhereInput = { isPublished: true, isRecycle: false, publication: { isNot: null } };

// Compatibility DTO for existing blog API consumers. Never spread the draft:
// passwords, metadata, linked private notes, author identity and tags stay private.
export function publicPublicationDTO(note: { id: number; publishId: string | null; publication: { content: string; type: number; revision: number; createdAt: Date; updatedAt: Date } | null }) {
  const p = note.publication;
  if (!p) return null;
  return { id: note.id, publishId: note.publishId, content: p.content, type: p.type,
    isPublished: true, publishedAt: p.createdAt, createdAt: p.createdAt, updatedAt: p.updatedAt,
    isArchived: false, isRecycle: false, isShare: false, isTop: false, isReviewed: false,
    sharePassword: '', metadata: { publicationRevision: p.revision }, accountId: null,
    account: null, attachments: [], tags: [], references: [], _count: { comments: 0, histories: 0 } };
}

export async function readPublicPublication(db: PrismaClient, publishId: string) {
  const note = await db.notes.findFirst({ where: { ...publicPublicationWhere, publishId },
    select: { id: true, publishId: true, publication: true } });
  return note ? publicPublicationDTO(note) : null;
}
