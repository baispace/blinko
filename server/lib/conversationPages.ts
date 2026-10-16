import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
export async function getConversationMessages(conversationId: number, accountId: number, size: number, beforeId?: number, db: Prisma.TransactionClient = prisma) {
  const owned = await db.conversation.findFirst({ where: { id: conversationId, accountId }, select: { id: true } });
  if (!owned) throw new TRPCError({ code: 'NOT_FOUND', message: '对话不存在' });
  const anchor = beforeId ? await db.message.findFirst({ where: { id: beforeId, conversationId }, select: { id: true, createdAt: true } }) : null;
  if (beforeId && !anchor) throw new TRPCError({ code: 'BAD_REQUEST', message: '历史消息位置已变化，请重新打开对话' });
  const rows = await db.message.findMany({ where: { conversationId, ...(anchor ? { OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }] } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: size + 1 });
  const items = rows.slice(0,size).reverse();
  return { items, nextCursor: rows.length > size ? items[0]!.id : null };
}
/** Context is independent of how many UI history pages have been opened. */
export async function getChatContext(conversationId: number, questionId: number, accountId: number, db: Prisma.TransactionClient = prisma) {
  const question = await db.message.findFirst({ where: { id: questionId, conversationId, role: 'user', conversation: { accountId } }, select: { id: true, createdAt: true } });
  if (!question) throw new TRPCError({ code: 'NOT_FOUND', message: '对话消息不存在' });
  const before = { conversationId, OR: [{ createdAt: { lt: question.createdAt } }, { createdAt: question.createdAt, id: { lt: question.id } }] };
  const [recent, workflow, system] = await Promise.all([
    db.message.findMany({ where: before, select: { id: true, role: true, content: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 40 }),
    db.message.findFirst({ where: { ...before, role: 'user', metadata: { path: ['workflow','key'], not: Prisma.AnyNull } }, select: { id: true, role: true, content: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    db.message.findFirst({ where: { ...before, role: 'system', NOT: { content: '[Request interrupted by user]' } }, select: { id: true, role: true, content: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
  ]);
  const chronological = recent.reverse().filter(message => message.content !== '[Request interrupted by user]');
  const ids = new Set(chronological.map(message => message.id));
  return [system && !ids.has(system.id) ? system : null, workflow && !ids.has(workflow.id) ? workflow : null, ...chronological].filter(Boolean).map(message => ({ role: message!.role, content: message!.content }));
}
