import { splitDailyInput, joinDailyInput } from '../../shared/lib/dailyInput';
import { test, expect } from 'bun:test';
import { dailyDraftSchema, parseDailyDraft, workflows, hasSavedWorkflowResult } from '../../shared/lib/aiWorkflows';
import { buildDailyTaskPatch } from '../../shared/lib/dailyTaskPatch';
import { isNumericLeadingTagName } from '../../shared/lib/tags';
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

test('AI workflows forbid "#" for source ids because it is this app’s tag syntax', () => {
  // `#34` 在本应用里就是标签；模型用它标注来源待办 ID 会生成一排垃圾标签。
  for (const key of ['daily', 'weekly', 'note', 'ideas']) {
    const prompt = workflows.find(workflow => workflow.key === key)?.prompt ?? '';
    expect(prompt).toContain('(ID 数字)');
    expect(prompt).toContain('严禁使用 # 前缀');
    expect(prompt).not.toMatch(/来源\s*#\d/);
  }
  // 提取待办本来就不产出正文，不要求带来源规范
  expect(workflows.find(workflow => workflow.key === 'tasks')?.prompt ?? '').not.toContain('严禁使用 # 前缀');
});

test('digit-leading hashtag names are recognized so AI notes never persist them as tags', () => {
  // 贪心解析会把 `来源 #34「测试下」已于` 整串当成标签，所以要判「数字开头」而不是「纯数字」
  expect(isNumericLeadingTagName('34')).toBe(true);
  expect(isNumericLeadingTagName('107')).toBe(true);
  expect(isNumericLeadingTagName('34「测试下」已于')).toBe(true);
  expect(isNumericLeadingTagName('36「AI')).toBe(true);
  // 用户自己写的正经标签不能被误伤
  expect(isNumericLeadingTagName('工作')).toBe(false);
  expect(isNumericLeadingTagName('3D模型')).toBe(true);
  expect(isNumericLeadingTagName('Welcome')).toBe(false);
});

test('daily progress appends without replacing goal or postponing deadlines', () => {
  const now = new Date('2026-10-22T03:00:00Z');
  const value = dailyDraftSchema.parse({ kind: 'daily', title: '日报', content: '', actions: [{ ...base, progress: '完成方案初稿', nextStep: '验证边界情况', planDate: '2026-10-22', status: 'open' }] }).actions[0]!;
  const result = buildDailyTaskPatch(task, value, now);
  expect(result.content).toBe(task.content);
  expect(result.metadata.expireAt).toBe(task.metadata.expireAt);
  expect(result.metadata.snoozeCount).toBe(2);
  expect(result.metadata.planDate).toBe('2026-10-22');
  expect(result.metadata.taskStatus).toBe('doing');
  expect(result.metadata.nextStep).toBe('验证边界情况');
  expect(result.metadata.progressHistory).toHaveLength(1);
  expect(buildDailyTaskPatch(result, value, now).metadata.progressHistory).toHaveLength(1);
});
test('daily uncertainty and plan dates are parsed independently of deadlines', () => {
  const parse = (action: any) => dailyDraftSchema.safeParse({ kind: 'daily', title: '日报', content: '', actions: [action] });
  expect(parse({ ...base, planDate: '2026-02-30' }).success).toBe(false);
  const result = parse({ ...base, needsConfirmation: true, planDate: '2026-10-22' });
  expect(result.success).toBe(true);
  if (result.success) expect(result.data.actions[0]?.due).toBeNull();
});

test('daily two-part composer preserves multiline input and plain-text drafts', () => {
  expect(splitDailyInput(joinDailyInput('完成初稿\n等待确认', '验证方案\n整理资料'))).toEqual({ yesterday: '完成初稿\n等待确认', today: '验证方案\n整理资料' });
  expect(splitDailyInput('原有补充输入')).toEqual({ yesterday: '原有补充输入', today: '' });
  expect(joinDailyInput('', '')).toBe('');
});
