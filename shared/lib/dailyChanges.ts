import type { DailyAction } from './aiWorkflows';
import { buildDailyTaskPatch } from './dailyTaskPatch';
import { defaultTodoStatuses, getTodoStatus } from './todoStatus';
import { getTodoPriority } from './todoPriority';

export type DailyTaskSource = { id: number; type?: number; content: string; metadata?: any; isArchived?: boolean; updatedAt?: string | Date | null };
export type DailyDelta = { field: string; label: string; before?: string; after: string };
export type DailyReceipt = { reportId?: number; actions?: Record<string, number>; errors?: Record<string, string>; applied?: { key: string; taskId: number; title: string; action: DailyAction; source?: DailyTaskSource }[] };
export const dailyTaskTitle = (task?: DailyTaskSource) => String(task?.metadata?.title || task?.content?.split('\n')[0] || '待办事项').replace(/^#+\s*/, '');
export function dailyDate(value: unknown) {
  if (!value) return '未设置';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(date) : '未设置';
}
export function dailyStatus(task: Pick<DailyTaskSource, 'metadata' | 'isArchived'>) {
  const id = getTodoStatus(task);
  return defaultTodoStatuses.find(status => status.id === id)?.name || id;
}
const priorityLabels = { ui: '紧急且重要', in: '重要不紧急', un: '紧急不重要', nn: '普通' };
/** Only actual proposed differences; do not repeat the full task or unchanged fields. */
export function dailyDeltas(action: DailyAction, source?: DailyTaskSource): DailyDelta[] {
  if (action.action === 'create') return [
    { field: 'create', label: '任务', after: '建议新增' },
    ...(action.description ? [{ field: 'description', label: '目标', after: action.description }] : []),
    ...(action.planDate ? [{ field: 'planDate', label: '计划', after: dailyDate(action.planDate) }] : []),
    ...(action.due ? [{ field: 'due', label: '截止', after: dailyDate(action.due) }] : []),
  ];
  if (!source) return [{ field: 'association', label: '关联', after: '请选择已有任务' }];
  const next = buildDailyTaskPatch(source, action);
  const result: DailyDelta[] = [];
  const change = (field: string, label: string, before: string, after: string) => { if (before !== after) result.push({ field, label, before, after }); };
  change('status', '状态', dailyStatus(source), dailyStatus({ metadata: next.metadata, isArchived: next.isArchived ?? source.isArchived }));
  if (action.progress.trim()) result.push({ field: 'progress', label: '追加进展', after: action.progress });
  if (action.nextStep.trim()) change('nextStep', '下一步', source.metadata?.nextStep || '未设置', action.nextStep);
  if (action.planDate !== null) change('planDate', '计划', dailyDate(source.metadata?.planDate), dailyDate(action.planDate));
  if (action.due !== null) change('due', '截止', dailyDate(source.metadata?.expireAt), dailyDate(action.due));
  if (action.priority !== null) change('priority', '优先级', priorityLabels[getTodoPriority(source.metadata)], priorityLabels[action.priority]);
  if (action.title !== null) change('title', '标题', dailyTaskTitle(source), action.title);
  if (action.description !== null && next.content !== source.content) result.push({ field: 'description', label: '目标', after: action.description });
  return result;
}
export function dailyReceiptLabel(saved: DailyReceipt, total: number) {
  const count = Object.keys(saved.actions || {}).length;
  if (count >= total && total > 0) return '已同步';
  if (count) return '部分同步';
  return saved.reportId && !total ? '日报已保存' : '待同步';
}
