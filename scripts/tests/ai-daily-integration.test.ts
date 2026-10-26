import { test, expect } from 'bun:test';
import { prisma } from '../../server/prisma';
import { syncDailyWorkflow, dailySyncInput } from '../../server/lib/dailyWorkflow';
const integration = process.env.RUN_DAILY_DB_TESTS === '1' ? test : test.skip;
integration('daily sync commits actual progress, retries, same-day report and account isolation', async () => {
  const owner = await prisma.accounts.create({ data: { name: 'daily-test-' + crypto.randomUUID() } });
  let conversationId = 0;
  try {
    const conversation = await prisma.conversation.create({ data: { accountId: owner.id, title: 'isolated daily test' } }); conversationId = conversation.id;
    const task = await prisma.notes.create({ data: { accountId: owner.id, type: 2, content: '测试目标\n\n保持原始内容', metadata: { title: '测试目标', expireAt: '2026-10-21T15:59:59.000Z', taskStatus: 'todo' } } });
    const action = { action: 'update', taskId: task.id, title: null, description: null, progress: '完成初稿', nextStep: '边界验证', planDate: '2026-10-22', due: null, priority: null, status: 'open', reason: '用户昨日说明', postponeReason: '' };
    const create = { ...action, action: 'create', taskId: null, title: '测试新增', description: '今日新增目标', progress: '', nextStep: '整理资料' };
    await prisma.message.create({ data: { conversationId, role: 'user', content: '昨日完成初稿，今日边界验证并新增整理资料', createdAt: new Date('2026-10-22T01:00:00Z'), metadata: { workflow: { key: 'daily', reviewDate: '2026-10-22' }, sources: [{ id: task.id, type: 2, updatedAt: task.updatedAt.toISOString() }] } } });
    const message = await prisma.message.create({ data: { conversationId, role: 'assistant', createdAt: new Date('2026-10-22T01:00:01Z'), content: JSON.stringify({ kind: 'daily', title: '测试日报', content: '未确认建议', actions: [action, create] }) } });
    const input = dailySyncInput.parse({ messageId: message.id, saveReport: true, title: '测试日报', content: '不应保存未经确认正文', actions: [{ index: 0, value: action }, { index: 1, value: create }] });
    const first = await syncDailyWorkflow(input, owner.id);
    expect(first.errors).toEqual({});
    const updated = await prisma.notes.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.content).toBe(task.content);
    expect((updated.metadata as any).expireAt).toBe('2026-10-21T15:59:59.000Z');
    expect((updated.metadata as any).planDate).toBe('2026-10-22');
    expect((updated.metadata as any).progressHistory).toHaveLength(1);
    expect((updated.metadata as any).taskStatus).toBe('doing');
    const retry = await syncDailyWorkflow(input, owner.id);
    expect(retry).toEqual(first);
    expect(await prisma.notes.count({ where: { accountId: owner.id, type: 2 } })).toBe(2);
    await expect(syncDailyWorkflow(input, owner.id + 1000000)).rejects.toThrow('不存在');
    // A second result on the same day must reuse the report and reject duplicate creates.
    await prisma.message.create({ data: { conversationId, role: 'user', content: '补充事项', metadata: { workflow: { key: 'daily', reviewDate: '2026-10-22' }, sources: [] } } });
    const supplement = await prisma.message.create({ data: { conversationId, role: 'assistant', content: JSON.stringify({ kind: 'daily', title: '测试日报', content: '', actions: [create] }) } });
    const second = await syncDailyWorkflow(dailySyncInput.parse({ ...input, messageId: supplement.id, actions: [{ index: 0, value: create }] }), owner.id);
    expect(second.reportId).toBe(first.reportId);
    expect(second.errors[0]).toContain('已有同名待办');
    expect(await prisma.notes.count({ where: { accountId: owner.id, type: 1 } })).toBe(1);
    const report = await prisma.notes.findUniqueOrThrow({ where: { id: first.reportId! } });
    expect(report.content).not.toContain('未经确认正文');
  } finally {
    await prisma.noteHistory.deleteMany({ where: { accountId: owner.id } });
    await prisma.notes.deleteMany({ where: { accountId: owner.id } });
    if (conversationId) { await prisma.message.deleteMany({ where: { conversationId } }); await prisma.conversation.delete({ where: { id: conversationId } }); }
    await prisma.accounts.delete({ where: { id: owner.id } });
    await prisma.$disconnect();
  }
});
