import { test, expect } from 'bun:test';
import { dailyDraftSchema, parseDailyDraft, workflows, hasSavedWorkflowResult } from '../../shared/lib/aiWorkflows';
import { buildDailyTaskPatch } from '../../shared/lib/dailyTaskPatch';
const base = { action: 'update' as const, taskId: 7, title: null, description: null, due: null, priority: null, status: null, reason: '用户明确说明', postponeReason: '' };
const task = { content: '原任务\n\n保留描述 #工作', isArchived: false, metadata: { title: '原任务', expireAt: '2026-10-15T15:59:59.000Z', priorityUrgent: false, priorityImportant: true, snoozeCount: 2, custom: '保留字段' } };
test('daily schema rejects invented update ids, duplicate updates and invalid calendar dates', () => {
  const draft = { kind: 'daily', title: '日报', content: '正文', actions: [base] };
  expect(dailyDraftSchema.safeParse(draft).success).toBe(true);
  expect(dailyDraftSchema.safeParse({ ...draft, actions: [{ ...base, taskId: null }] }).success).toBe(false);
  expect(dailyDraftSchema.safeParse({ ...draft, actions: [base, base] }).success).toBe(false);
  expect(dailyDraftSchema.safeParse({ ...draft, actions: [{ ...base, due: '2026-02-30' }] }).success).toBe(false);
  expect(parseDailyDraft('```json\n' + JSON.stringify(draft) + '\n```')?.actions[0]?.taskId).toBe(7);
});
test('unspecified fields preserve task content, date, priority and unrelated metadata', () => {
  const result = buildDailyTaskPatch(task, base);
  expect(result.content).toBe(task.content);
  expect(result.metadata).toEqual(task.metadata);
  expect(result.isArchived).toBeUndefined();
});
test('confirmed task changes reuse site priority and snooze fields and preserve existing tags', () => {
  const result = buildDailyTaskPatch(task, { ...base, due: '2026-10-17', priority: 'ui', status: 'done', description: '新的下一步动作', postponeReason: '等待接口依赖' }, new Date('2026-10-15T03:00:00Z'));
  expect(result.metadata.expireAt).toBe('2026-10-17T15:59:59.000Z');
  expect(result.metadata.snoozeCount).toBe(3);
  expect(result.metadata.priorityImportant && result.metadata.priorityUrgent).toBe(true);
  expect(result.metadata.completedAt).toBe('2026-10-15T03:00:00.000Z');
  expect(result.isArchived).toBe(true);
  expect(result.content).toContain('#工作');
  expect(result.metadata.custom).toBe('保留字段');
});
test('date corrections do not count as postponements and explicit clears are honored', () => {
  expect(buildDailyTaskPatch(task, { ...base, due: '2026-10-17' }).metadata.snoozeCount).toBe(2);
  const result = buildDailyTaskPatch({ ...task, isArchived: true, metadata: { ...task.metadata, completedAt: 'old' } }, { ...base, due: '', status: 'open' });
  expect(result.metadata.expireAt).toBeNull();
  expect(result.metadata.completedAt).toBeNull();
  expect(result.isArchived).toBe(false);
});
test('workflows distinguish time-range review, task synchronization, and article critique', () => {
  expect(workflows.find(workflow => workflow.key === 'weekly')?.prompt).toContain('updatedAt');
  expect(workflows.find(workflow => workflow.key === 'daily')?.prompt).toContain('不要重复创建');
  expect(workflows.find(workflow => workflow.key === 'practice')?.prompt).toContain('不提前给完整答案');
});

test('saved workflow results are protected from destructive regeneration', () => {
  expect(hasSavedWorkflowResult({ savedDrafts: { 0: 12 } })).toBe(true);
  expect(hasSavedWorkflowResult({ dailySaved: { reportId: 13, actions: {} } })).toBe(true);
  expect(hasSavedWorkflowResult({ dailySaved: { actions: { 0: 7 } } })).toBe(true);
  expect(hasSavedWorkflowResult({ savedDrafts: {}, dailySaved: { actions: {} } })).toBe(false);
});
