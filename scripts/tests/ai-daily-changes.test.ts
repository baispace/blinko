import { test, expect } from 'bun:test';
import { dailyDeltas, dailyReceiptLabel, dailyDate } from '../../shared/lib/dailyChanges';
import { dailyActionSchema } from '../../shared/lib/aiWorkflows';
const source = { id: 7, content: '推荐结果调优', isArchived: false, metadata: { title: '推荐结果调优', taskStatus: 'doing', planDate: '2026-10-28', expireAt: '2026-10-30T15:59:59.000Z' } };
const action = dailyActionSchema.parse({ action: 'update', taskId: 7, progress: '完成首轮验证', nextStep: '继续复测', planDate: '2026-10-29', status: 'open', reason: '用户提供进展' });
test('daily delta shows actual changes without implying a postponed deadline', () => {
 const changes = dailyDeltas(action, source);
 expect(changes.find(item => item.field === 'planDate')).toMatchObject({ before: '2026-10-28', after: '2026-10-29' });
 expect(changes.find(item => item.field === 'progress')?.after).toBe('完成首轮验证');
 expect(changes.some(item => item.field === 'due' || item.field === 'status' || item.field === 'title')).toBe(false);
});
test('completion, clearing a deadline and adding a task have distinct labels', () => {
 expect(dailyDeltas({ ...action, status: 'done' }, source).find(item => item.field === 'status')?.after).toBe('已完成');
 expect(dailyDeltas({ ...action, due: '' }, source).find(item => item.field === 'due')?.after).toBe('未设置');
 expect(dailyDeltas({ ...action, action: 'create', taskId: null, title: '新增', description: '明确目标' })[0].after).toBe('建议新增');
});
test('receipts distinguish saved report from executed task changes', () => {
 expect(dailyReceiptLabel({ reportId: 9 }, 2)).toBe('待同步');
 expect(dailyReceiptLabel({ reportId: 9 }, 0)).toBe('日报已保存');
 expect(dailyReceiptLabel({ actions: { 0: 7 } }, 2)).toBe('部分同步');
 expect(dailyReceiptLabel({ actions: { 0: 7, 1: 8 } }, 2)).toBe('已同步');
 expect(dailyDate('2026-10-29T23:00:00Z')).toBe('2026-10-30');
});
