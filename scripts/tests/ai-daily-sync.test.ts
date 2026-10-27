import { test, expect, mock } from 'bun:test';
const action = { action: 'update', taskId: 7, title: null, description: null, due: null, priority: null, status: 'done', reason: '昨日已完成', postponeReason: '' };
let state: any;
const initialize = () => {
  state = { notes: [{ id: 7, accountId: 1, type: 2, content: '原待办', metadata: { title: '原待办' }, isArchived: false, updatedAt: new Date('2026-10-15T00:00:00Z') }], histories: [], metadata: {}, created: 0, actions: [action], source: { id: 7, type: 2, updatedAt: '2026-10-15T00:00:00.000Z' } };
};
let savepoint: any;
const tx = {
  $queryRaw: async () => [],
  $executeRawUnsafe: async (sql: string) => {
    if (sql.startsWith('SAVEPOINT')) savepoint = structuredClone({ notes: state.notes, histories: state.histories, created: state.created });
    if (sql.startsWith('ROLLBACK')) Object.assign(state, savepoint);
  },
  message: {
    findFirst: async ({where}: any) => where.role === 'assistant' ? { id: state.messageId || 20, conversationId: 1, createdAt: new Date('2026-10-22T03:00:00Z'), content: JSON.stringify({ kind: 'daily', title: '日报', content: '未确认事项不能作为成果', actions: state.actions }), metadata: state.metadata } : { createdAt: new Date('2026-10-22T03:00:00Z'), metadata: { workflow: { key: 'daily', reviewDate: '2026-10-22' }, sources: [state.source] } },
    update: async ({data}: any) => { state.metadata = data.metadata; },
  },
  notes: {
    findFirst: async ({where}: any) => state.notes.find((note: any) => note.accountId === where.accountId && (!where.type || note.type === where.type) && (where.id ? note.id === where.id : where.AND ? note.metadata?.workflow === 'daily' && note.metadata?.dailyDate === '2026-10-22' : note.metadata?.title === where.metadata?.equals)),
    update: async ({where,data}: any) => { Object.assign(state.notes.find((note: any) => note.id === where.id), data); },
    create: async ({data}: any) => { state.created++; const note = { ...data, id: 100 + state.created }; state.notes.push(note); return note; },
  },
  noteHistory: { findFirst: async () => null, create: async ({data}: any) => { state.histories.push(data); } },
};
mock.module('../../server/prisma', () => ({ prisma: { $transaction: async (run: any) => { const snapshot = structuredClone(state); try { return await run(tx); } catch(error) { state = snapshot; throw error; } } } }));
const { syncDailyWorkflow, dailySyncInput } = await import('../../server/lib/dailyWorkflow');
const input = (selected = state.actions) => dailySyncInput.parse({ messageId: state.messageId || 20, saveReport: true, title: '日报', content: '未经确认的建议', actions: selected.map((value: any, index: number) => ({ index, value })) });
test('confirmed updates and report save are idempotent and preserve original task history', async () => {
  initialize();
  const first = await syncDailyWorkflow(input(), 1);
  expect(state.notes[0].isArchived).toBe(true);
  expect(state.notes[0].metadata.taskStatus).toBe('done');
  expect(state.histories).toHaveLength(1);
  expect(first.reportId).toBe(101);
  const second = await syncDailyWorkflow(input(), 1);
  expect(second).toEqual(first);
  expect(state.created).toBe(1);
  expect(state.histories).toHaveLength(1);
  expect(state.notes[1].content).not.toContain('未经确认的建议');
  expect(state.notes[1].content).toContain('/detail?id=7');
});
test('stale task snapshot is reported as a retryable item without changing task', async () => {
  initialize(); state.notes[0].updatedAt = new Date('2026-10-15T01:00:00Z');
  const result = await syncDailyWorkflow(input(), 1);
  expect(result.errors[0]).toContain('已变化');
  expect(result.actions).toEqual({});
  expect(state.notes[0].isArchived).toBe(false);
  expect(state.histories).toHaveLength(0);
});
test('updates outside quoted sources cannot write tasks', async () => {
  initialize(); state.source.id = 99;
  const result = await syncDailyWorkflow(input(), 1);
  expect(result.errors[0]).toContain('不在本次引用来源');
  expect(state.histories).toHaveLength(0);
});
test('same-day supplements reuse the report and retrying skips successful items', async () => {
  initialize();
  state.actions = [action, { ...action, action: 'create', taskId: null, title: '新增事项', description: '明确目标', status: 'open', planDate: '2026-10-22' }];
  state.notes[0].updatedAt = new Date('2026-10-15T01:00:00Z');
  const first = await syncDailyWorkflow(input(), 1);
  expect(Object.keys(first.actions)).toEqual(['1']);
  expect(first.errors[0]).toContain('已变化');
  state.source.updatedAt = state.notes[0].updatedAt.toISOString();
  const second = await syncDailyWorkflow(input(), 1);
  expect(second.reportId).toBe(first.reportId);
  expect(Object.keys(second.actions)).toHaveLength(2);
  expect(second.errors).toEqual({});
  expect(state.notes.filter((note: any) => note.type === 2)).toHaveLength(2);
  state.messageId = 21; state.metadata = {}; state.actions = [{ ...action, status: null, progress: '补充进展' }];
  const third = await syncDailyWorkflow(input(), 1);
  expect(third.reportId).toBe(first.reportId);
  expect(state.notes.filter((note: any) => note.type === 1)).toHaveLength(1);
  expect(state.notes.find((note: any) => note.type === 1).metadata.dailyEntries).toHaveLength(3);
});
test('same-name creation is blocked across different AI messages', async () => {
  initialize(); state.actions = [{ ...action, action: 'create', taskId: null, title: '原待办', description: '重复事项' }];
  const result = await syncDailyWorkflow(input(), 1);
  expect(result.errors[0]).toContain('已有同名待办');
  expect(state.notes.filter((note: any) => note.type === 2)).toHaveLength(1);
});
test('duplicate submitted indexes are rejected before writing', () => {
  initialize(); const value = input();
  expect(dailySyncInput.safeParse({ ...value, actions: [value.actions[0], value.actions[0]] }).success).toBe(false);
});
