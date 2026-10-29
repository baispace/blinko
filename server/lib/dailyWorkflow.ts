import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { prisma } from '../prisma';
import { dailyActionSchema, parseDailyDraft, type DailyAction } from '../../shared/lib/aiWorkflows';
import type { DailyTaskSource } from '../../shared/lib/dailyChanges';
import { buildDailyTaskPatch } from '../../shared/lib/dailyTaskPatch';

export const dailySyncInput = z.object({ messageId: z.number().int().positive(), saveReport: z.boolean(), title: z.string().trim().min(1).max(500), content: z.string().max(100000), actions: z.array(z.object({ index: z.number().int().min(0).max(19), value: dailyActionSchema, expectedUpdatedAt: z.string().datetime().optional() })).max(20) }).superRefine((input, ctx) => {
  if (new Set(input.actions.map(item => item.index)).size !== input.actions.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: '同一变更不能重复提交' });
});
const dayOf = (date: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(date);
type Applied = { key: string; taskId: number; title: string; action: DailyAction; source?: DailyTaskSource };
type DailyRecord = { messageId: number; content: string };

// Reports describe committed operations, never unchecked model suggestions.
export function dailyReportContent(date: string, entries: Applied[], questions: string[], records: DailyRecord[] = []) {
  const sections = [
    ['确认完成的事项', entries.filter(item => item.action.status === 'done')],
    ['进行中与最新进展', entries.filter(item => item.action.action === 'update' && item.action.status !== 'done')],
    ['今日新增事项', entries.filter(item => item.action.action === 'create' && item.action.status !== 'done')],
  ] as const;
  return [`回顾日期：${date}`, ...(records.length ? [`## 原始工作记录\n\n以下保留用户输入；不代表其中的待办建议已经同步。\n\n${records.map(record => record.content).join('\n\n---\n\n')}`] : []), ...sections.map(([label, items]) => `## ${label}\n\n${items.length ? items.map(item => `- [${item.title.replace(/[\[\]\\]/g, '')}](/detail?id=${item.taskId})${item.action.progress ? `\n  - 进展：${item.action.progress}` : ''}${item.action.nextStep ? `\n  - 下一步：${item.action.nextStep}` : ''}${item.action.planDate ? `\n  - 计划执行：${item.action.planDate}` : ''}${item.action.due ? `\n  - 截止：${item.action.due}` : ''}`).join('\n') : '本次暂无确认事项。'}`), `## 待确认与阻碍\n\n${questions.length ? questions.map(text => `- ${text}`).join('\n') : '暂无。'}`].join('\n\n');
}

export async function syncDailyWorkflow(input: z.infer<typeof dailySyncInput>, accountId: number) {
  return prisma.$transaction(async tx => {
    // Serializes same-day supplements across conversations as well as retries.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(1919130, ${accountId}::integer)::text`;
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
    const date = /^\d{4}-\d{2}-\d{2}$/.test(context.workflow.reviewDate || '') ? context.workflow.reviewDate : dayOf(user?.createdAt || message.createdAt);
    const saved: { reportId?: number; actions: Record<string, number>; applied: Applied[]; errors: Record<string, string> } = { ...(messageMetadata.dailySaved || {}), actions: { ...(messageMetadata.dailySaved?.actions || {}) }, applied: [...(messageMetadata.dailySaved?.applied || [])], errors: { ...(messageMetadata.dailySaved?.errors || {}) } };
    const seen = new Set<number>();
    for (const item of input.actions) {
      if (saved.actions[item.index]) continue;
      await tx.$executeRawUnsafe('SAVEPOINT daily_action');
      try {
      if (item.value.needsConfirmation) throw new TRPCError({ code: 'BAD_REQUEST', message: '请先核对该事项，再选择关联任务或确认为新增。' });
      if (!draft.actions[item.index]) throw new TRPCError({ code: 'BAD_REQUEST', message: '任务条目不存在' });
      // A named task picker may explicitly add an owned task with its current version. Otherwise keep the original quoted-source boundary.
      let taskId: number;
      let title: string;
      let source: DailyTaskSource | undefined;
      if (item.value.action === 'create') {
        const existing = await tx.notes.findFirst({ where: { accountId, type: 2, isRecycle: false, metadata: { path: ['title'], equals: item.value.title!.trim() } } });
        if (existing) throw new TRPCError({ code: 'CONFLICT', message: `已有同名待办「${item.value.title}」，请关联原任务后同步，避免重复创建。` });
        const patch = buildDailyTaskPatch({ content: '', metadata: {}, isArchived: false }, item.value);
        const note = await tx.notes.create({ data: { accountId, type: 2, ...patch, metadata: { ...patch.metadata, title: item.value.title!.trim(), aiSourceMessageId: message.id } } });
        taskId = note.id; title = item.value.title!.trim();
      } else {
        const id = item.value.taskId!;
        if (seen.has(id)) throw new TRPCError({ code: 'BAD_REQUEST', message: '同一任务不能重复修改，请合并进度后同步' });
        seen.add(id);
        const snapshot = context.sources?.find((source: any) => source.id === id && source.type === 2);
        const expectedUpdatedAt = item.expectedUpdatedAt || snapshot?.updatedAt;
        if (!expectedUpdatedAt) throw new TRPCError({ code: 'BAD_REQUEST', message: '该任务不在本次引用来源中，请重新读取待办' });
        await tx.$queryRaw`SELECT id FROM notes WHERE id = ${id} FOR UPDATE`;
        const task = await tx.notes.findFirst({ where: { id, accountId, type: 2, isRecycle: false } });
        if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: '该待办不存在或已删除，请重新选择任务。' });
        if (task.updatedAt.toISOString() !== new Date(expectedUpdatedAt).toISOString()) throw new TRPCError({ code: 'CONFLICT', message: `待办「${(task.metadata as any)?.title || task.content.split('\n')[0]}」已变化。本次未写入，请更换关联并选择最新任务后重试。` });
        const oldDue = (task.metadata as any)?.expireAt;
        if (oldDue && item.value.due && Date.parse(item.value.due + 'T23:59:59+08:00') > Date.parse(oldDue) && !item.value.postponeReason.trim()) throw new TRPCError({ code: 'BAD_REQUEST', message: '推迟截止时间需要填写调整原因。计划执行日可以单独调整。' });
        source = { id: task.id, type: task.type, content: task.content, metadata: task.metadata, isArchived: task.isArchived, updatedAt: task.updatedAt.toISOString() };
        const patch = buildDailyTaskPatch(task, item.value);
        const version = await tx.noteHistory.findFirst({ where: { noteId: id }, orderBy: { version: 'desc' } });
        await tx.noteHistory.create({ data: { noteId: id, accountId, content: task.content, version: (version?.version || 0) + 1, metadata: { type: task.type, isArchived: task.isArchived, ...(task.metadata as any || {}), aiSourceMessageId: message.id } } });
        await tx.notes.update({ where: { id }, data: patch });
        taskId = id; title = patch.metadata.title || task.content.split('\n')[0] || '待办事项';
      }
      saved.actions[item.index] = taskId;
      saved.applied.push({ key: `${message.id}:${item.index}`, taskId, title, action: item.value, ...(source ? { source } : {}) });
      delete saved.errors[item.index];
      await tx.$executeRawUnsafe('RELEASE SAVEPOINT daily_action');
      } catch (error) {
        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT daily_action');
        await tx.$executeRawUnsafe('RELEASE SAVEPOINT daily_action');
        // Only expected validation/concurrency errors are safe to show and retry.
        if (!(error instanceof TRPCError)) throw error;
        saved.errors[item.index] = error.message;
      }
    }
    if (input.saveReport || saved.reportId) {
      const report = await tx.notes.findFirst({ where: { accountId, type: 1, isRecycle: false, AND: [{ metadata: { path: ['workflow'], equals: 'daily' } }, { metadata: { path: ['dailyDate'], equals: date } }] } });
      const metadata: any = report?.metadata || {};
      const entries: Applied[] = [...(metadata.dailyEntries || [])];
      for (const entry of saved.applied) {
        const sameChange = (previous: Applied) => previous.taskId === entry.taskId && previous.title === entry.title && previous.action.status === entry.action.status && previous.action.progress === entry.action.progress && previous.action.nextStep === entry.action.nextStep && previous.action.planDate === entry.action.planDate && previous.action.due === entry.action.due && previous.action.description === entry.action.description;
        if (!entries.some(previous => previous.key === entry.key || sameChange(previous))) entries.push(entry);
      }
      const unresolved = draft.actions.filter((action, index) => !saved.actions[index] && action.needsConfirmation).map(action => action.reason);
      const questionSets = { ...(metadata.dailyQuestionSets || {}), [message.id]: [...draft.questions, ...unresolved] };
      const questions = [...new Set(Object.values(questionSets).flat())] as string[];
      const records: DailyRecord[] = Array.isArray(metadata.dailyRecords) ? [...metadata.dailyRecords] : [];
      const original = typeof context.displayContent === 'string' ? context.displayContent.trim() : '';
      if (original && !records.some(record => record.messageId === user?.id || record.content === original)) records.push({ messageId: user!.id, content: original });
      const reportMetadata = { ...metadata, dailyRecords: records, title: input.title, aiSourceMessageId: message.id, workflow: 'daily', dailyDate: date, dailyEntries: entries, dailyQuestions: questions, dailyQuestionSets: questionSets };
      const content = dailyReportContent(date, entries, questions, records);
      if (report) {
        await tx.$queryRaw`SELECT id FROM notes WHERE id = ${report.id} FOR UPDATE`;
        const version = await tx.noteHistory.findFirst({ where: { noteId: report.id }, orderBy: { version: 'desc' } });
        if (report.content !== content || metadata.title !== input.title) {
          await tx.noteHistory.create({ data: { noteId: report.id, accountId, content: report.content, version: (version?.version || 0) + 1, metadata: report.metadata || {} } });
          await tx.notes.update({ where: { id: report.id }, data: { content, metadata: reportMetadata } });
        }
        saved.reportId = report.id;
      } else {
        const created = await tx.notes.create({ data: { accountId, type: 1, content, metadata: reportMetadata } });
        saved.reportId = created.id;
      }
    }
    await tx.message.update({ where: { id: message.id }, data: { metadata: { ...messageMetadata, dailySaved: saved } } });
    return saved;
  }, { timeout: 20000 });
}


/** Search only the current account's tasks; never expose IDs as a user input requirement. */
export async function dailyTaskCandidates(accountId: number, input: { messageId: number; query: string }) {
  const message = await prisma.message.findFirst({ where: { id: input.messageId, role: 'assistant', conversation: { accountId } } });
  if (!message || !parseDailyDraft(message.content)) throw new TRPCError({ code: 'NOT_FOUND', message: '每日整理结果不存在。' });
  const query = input.query.trim();
  return prisma.notes.findMany({
    where: { accountId, type: 2, isRecycle: false, ...(query ? { OR: [
      { content: { contains: query, mode: 'insensitive' as const } },
      { metadata: { path: ['title'], string_contains: query } },
    ] } : {}) },
    orderBy: [{ isArchived: 'asc' }, { updatedAt: 'desc' }], take: 20,
    select: { id: true, type: true, content: true, metadata: true, isArchived: true, updatedAt: true },
  });
}
