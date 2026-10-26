import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
export const SUMMARY_LENGTH = 1200;
export const summarySelect = {
  id: true, type: true, isArchived: true, isRecycle: true, isShare: true, isTop: true, isReviewed: true,
  sharePassword: true, shareEncryptedUrl: true, shareExpiryDate: true, shareMaxView: true, shareViewCount: true,
  isPublished: true, publishId: true, publishedAt: true, metadata: true, sortOrder: true, accountId: true, createdAt: true, updatedAt: true,
  // 是否已公开为动态：列表卡片据此显示「发布为动态 / 撤回动态」。
  isMoment: true,
  momentPublishedAt: true,
  tags: { include: { tag: true } },
  attachments: { take: 6, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
  _count: { select: { comments: true, histories: true, attachments: true, references: true, referencedBy: true } },
  internalShares: { select: { id: true } },
} satisfies Prisma.notesSelect;
export async function summarizeNotes(rows: any[], db: Prisma.TransactionClient = prisma) {
  if (!rows.length) return [];
  const previews = await db.$queryRaw<{ id: number; content: string; contentLength: number }[]>(Prisma.sql`
    SELECT id, LEFT(content, ${SUMMARY_LENGTH}::int) AS content, length(content)::int AS "contentLength"
    FROM notes WHERE id IN (${Prisma.join(rows.map(note => note.id))})`);
  const byId = new Map(previews.map(row => [row.id, row]));
  return rows.map(note => ({ ...note, ...byId.get(note.id), isSummary: true, comments: [], references: [], referencedBy: [], isInternalShared: note.internalShares.length > 0 }));
}
