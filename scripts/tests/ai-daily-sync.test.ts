import { test, expect, mock } from 'bun:test';
const action = { action: 'update', taskId: 7, title: null, description: null, due: null, priority: null, status: 'done', reason: '昨日已完成', postponeReason: '' };
let state: any;
const initialize = () => {
  state = { notes: [{ id: 7, accountId: 1, type: 2, content: '原待办', metadata: {}, isArchived: false, updatedAt: new Date('2026-10-15T00:00:00Z') }], histories: [], metadata: {}, created: 0, source: { id: 7, type: 2, updatedAt: '2026-10-15T00:00:00.000Z' } };
};
const tx = {
  $queryRaw: async () => [],
  message: {
    findFirst: async ({where}: any) => where.role === 'assistant' ? { id: 20, conversationId: 1, createdAt: new Date(), content: JSON.stringify({ kind: 'daily', title: '日报', content: '正文', actions: [action] }), metadata: state.metadata } : { metadata: { workflow: { key: 'daily' }, sources: [state.source] } },
    update: async ({data}: any) => { state.metadata = data.metadata; },
  },
  notes: {
    findFirst: async ({where}: any) => state.notes.find((note: any) => note.id === where.id && note.accountId === where.accountId),
    update: async ({where,data}: any) => { Object.assign(state.notes.find((note: any) => note.id === where.id), data); },
    create: async ({data}: any) => { state.created++; const note = { ...data, id: 100 + state.created }; state.notes.push(note); return note; },
  },
  noteHistory: { findFirst: async () => null, create: async ({data}: any) => { state.histories.push(data); } },
};
mock.module('../../server/prisma', () => ({ prisma: { $transaction: async (run: any) => { const snapshot = structuredClone(state); try { return await run(tx); } catch(error) { state = snapshot; throw error; } } } }));
const { syncDailyWorkflow, dailySyncInput } = await import('../../server/lib/dailyWorkflow');
const input = () => dailySyncInput.parse({ messageId: 20, saveReport: true, title: '日报', content: '正文', actions: [{ index: 0, value: action }] });
test('confirmed updates and report save are idempotent and record the original task', async () => {
  initialize();
  const first = await syncDailyWorkflow(input(), 1);
  expect(state.notes[0].isArchived).toBe(true);
  expect(state.histories).toHaveLength(1);
  expect(first.reportId).toBe(101);
  const second = await syncDailyWorkflow(input(), 1);
  expect(second).toEqual(first);
  expect(state.created).toBe(1);
  expect(state.histories).toHaveLength(1);
});
test('stale task snapshots reject the whole synchronization without saving a report', async () => {
  initialize(); state.notes[0].updatedAt = new Date('2026-10-15T01:00:00Z');
  await expect(syncDailyWorkflow(input(), 1)).rejects.toThrow('已变化');
  expect(state.created).toBe(0);
  expect(state.notes[0].isArchived).toBe(false);
});
test('updates outside the quoted source set are rejected', async () => {
  initialize(); state.source.id = 99;
  await expect(syncDailyWorkflow(input(), 1)).rejects.toThrow('不在本次引用来源');
  expect(state.histories).toHaveLength(0);
});
