export type TodoPriority = 'ui' | 'in' | 'un' | 'nn';
export const TODO_PRIORITIES = [
  { key: 'ui' as const, u: true, i: true, labelKey: 'priority-urgent-important', color: '#ef4444' },
  { key: 'in' as const, u: false, i: true, labelKey: 'priority-important', color: '#f59e0b' },
  { key: 'un' as const, u: true, i: false, labelKey: 'priority-urgent', color: '#3b82f6' },
  { key: 'nn' as const, u: false, i: false, labelKey: 'priority-normal', color: '#9ca3af' },
];
const flag = (value: unknown) => value === true || value === 1 || value === 'true';
export function getTodoPriority(metadata: any): TodoPriority {
  if (metadata?.priorityUrgent != null || metadata?.priorityImportant != null) {
    const urgent = flag(metadata.priorityUrgent), important = flag(metadata.priorityImportant);
    return urgent ? important ? 'ui' : 'un' : important ? 'in' : 'nn';
  }
  // Older tasks stored only 1/high, 2/medium or 3/low.
  return metadata?.priority === 1 || metadata?.priority === 'high' ? 'ui' : metadata?.priority === 2 || metadata?.priority === 'medium' ? 'in' : 'nn';
}
export function todoPriorityMetadata(key: TodoPriority) {
  const option = TODO_PRIORITIES.find(item => item.key === key)!;
  return { priorityUrgent: option.u, priorityImportant: option.i, priority: key === 'ui' ? 1 : key === 'nn' ? 3 : 2 };
}
export function compareTodoPriority(a: { metadata?: any; isArchived?: boolean }, b: { metadata?: any; isArchived?: boolean }) {
  const done = Number(!!a.isArchived) - Number(!!b.isArchived);
  if (done) return done;
  const ranks = { ui: 0, in: 1, un: 2, nn: 3 };
  const rank = ranks[getTodoPriority(a.metadata)] - ranks[getTodoPriority(b.metadata)];
  if (rank) return rank;
  const due = (item: typeof a) => { const date = Date.parse(item.metadata?.expireAt); return Number.isFinite(date) ? date : Infinity; };
  return due(a) === due(b) ? 0 : due(a) - due(b);
}
