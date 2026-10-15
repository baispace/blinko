import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { prisma } from '../prisma';
import { dailyActionSchema, parseDailyDraft } from '../../shared/lib/aiWorkflows';
import { buildDailyTaskPatch } from '../../shared/lib/dailyTaskPatch';
export const dailySyncInput = z.object({ messageId: z.number().int().positive(), saveReport: z.boolean(), title: z.string().trim().min(1).max(500), content: z.string().max(100000), actions: z.array(z.object({ index: z.number().int().min(0).max(19), value: dailyActionSchema })).max(20) });
export async function syncDailyWorkflow(input: z.infer<typeof dailySyncInput>, accountId: number) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM message WHERE id = ${input.messageId} FOR UPDATE`;
    const message = await tx.message.findFirst({ where: { id: input.messageId, role: 'assistant', conversation: { accountId } } });
    if (!message) throw new TRPCError({ code: 'NOT_FOUND', message: '日报结果不存在' });
    const messageMetadata: any = message.metadata || {};
    if (['stopped','error'].includes(messageMetadata.responseStatus)) throw new TRPCError({ code: 'BAD_REQUEST', message: '请先生成完整日报' });
    const draft = parseDailyDraft(message.content);
    if (!draft) throw new TRPCError({ code: 'BAD_REQUEST', message: '日报结果格式无效，请重新生成' });
    const user = await tx.message.findFirst({ where: { conversationId: message.conversationId, role: 'user', OR: [{ createdAt: { lt: message.createdAt } }, { createdAt: message.createdAt, id: { lt: message.id } }] }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    const context: any = user?.metadata || {};
    if (context.workflow?.key !== 'daily') throw new TRPCError({ code: 'BAD_REQUEST', message: '缺少日报来源，请重新选择工作流' });
    const saved: { reportId?: number; actions: Record<string, number> } = { ...(messageMetadata.dailySaved || {}), actions: { ...(messageMetadata.dailySaved?.actions || {}) } };
    const seen = new Set<number>();
    for (const item of input.actions) {
      if (saved.actions[item.index]) continue;
      const original = draft.actions[item.index];
      if (!original || original.action !== item.value.action || original.taskId !== item.value.taskId) throw new TRPCError({ code: 'BAD_REQUEST', message: '任务条目与原始结果不一致' });
      if (item.value.action === 'create') {
        const patch = buildDailyTaskPatch({ content: '', metadata: {}, isArchived: false }, item.value);
        const note = await tx.notes.create({ data: { accountId, type: 2, ...patch, metadata: { ...patch.metadata, title: item.value.title!, aiSourceMessageId: message.id } } });
        saved.actions[item.index] = note.id;
      } else {
        const id = item.value.taskId!;
        if (seen.has(id)) throw new TRPCError({ code: 'BAD_REQUEST', message: '同一任务不能重复修改' });
        seen.add(id);
        const snapshot = context.sources?.find((source: any) => source.id === id && source.type === 2);
        if (!snapshot?.updatedAt) throw new TRPCError({ code: 'BAD_REQUEST', message: '该任务不在本次引用来源中，请重新读取待办' });
        await tx.$queryRaw`SELECT id FROM notes WHERE id = ${id} FOR UPDATE`;
        const task = await tx.notes.findFirst({ where: { id, accountId, type: 2, isRecycle: false } });
        if (!task || task.updatedAt.toISOString() !== new Date(snapshot.updatedAt).toISOString()) throw new TRPCError({ code: 'CONFLICT', message: `待办 #${id} 已变化。本次未写入，请重新读取来源并生成变更。` });
        const patch = buildDailyTaskPatch(task, item.value);
        const version = await tx.noteHistory.findFirst({ where: { noteId: id }, orderBy: { version: 'desc' } });
        await tx.noteHistory.create({ data: { noteId: id, accountId, content: task.content, version: (version?.version || 0) + 1, metadata: { type: task.type, isArchived: task.isArchived, ...(task.metadata as any || {}), aiSourceMessageId: message.id } } });
        await tx.notes.update({ where: { id }, data: patch });
        saved.actions[item.index] = id;
      }
    }
    if (input.saveReport && !saved.reportId) {
      const report = await tx.notes.create({ data: { accountId, type: 1, content: input.content, metadata: { title: input.title, aiSourceMessageId: message.id, workflow: 'daily' } } });
      saved.reportId = report.id;
    }
    await tx.message.update({ where: { id: message.id }, data: { metadata: { ...messageMetadata, dailySaved: saved } } });
    return saved;
  }, { timeout: 20000 });
}
