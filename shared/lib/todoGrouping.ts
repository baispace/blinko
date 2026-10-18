import {getTodoStatus,defaultTodoStatuses,type TodoStatus} from './todoStatus';
import { TODO_PRIORITIES, getTodoPriority, compareTodoPriority } from './todoPriority';

export type TodoGrouping = 'none' | 'status' | 'priority' | 'date' | 'tag';
type GroupableTask = { id?: number; metadata?: any; isArchived?: boolean; tags?: { tag?: { id?: number; name?: string } }[] };
export type TodoGroup<T> = { key: string; title: string; labelKey?: string; color?: string; items: T[] };
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function groupTodos<T extends GroupableTask>(items: T[], mode: TodoGrouping, today = dateKey(new Date()), preserveOrder = false, statuses:TodoStatus[] = defaultTodoStatuses): TodoGroup<T>[] {
  const sorted = preserveOrder ? [...items] : [...items].sort(compareTodoPriority);
  if(mode==='status') { const known=new Set(statuses.map(s=>s.id));const list=statuses.map(status=>({key:status.id,title:status.name,color:status.color,items:sorted.filter(task=>getTodoStatus(task)===status.id)}));const other=sorted.filter(task=>!known.has(getTodoStatus(task)));if(other.length)list.push({key:'other',title:'其他状态',color:'#94a3b8',items:other});return list; }
  if (mode === 'none') return [{ key: 'all', title: '全部任务', items: sorted }];
  if (mode === 'priority') return TODO_PRIORITIES.map(priority => ({ key: priority.key, title: '', labelKey: priority.labelKey, color: priority.color, items: sorted.filter(item => getTodoPriority(item.metadata) === priority.key) }));
  if (mode === 'date') {
    const groups: TodoGroup<T>[] = [
      { key: 'past', title: sorted.some(item => !item.isArchived) ? '已逾期' : '较早日期', color: '#ef4444', items: [] },
      { key: 'today', title: '今天截止', items: [] }, { key: 'future', title: '未来截止', items: [] }, { key: 'none', title: '未设置日期', items: [] },
    ];
    const mixed = sorted.some(task => task.isArchived) && sorted.some(task => !task.isArchived);
    if (mixed) groups.push({ key: 'done', title: '已完成', items: [] });
    for (const task of sorted) {
      if (mixed && task.isArchived) { groups[4]!.items.push(task); continue; }
      const due = task.metadata?.expireAt ? new Date(task.metadata.expireAt) : null;
      const key = due && Number.isFinite(due.getTime()) ? dateKey(due) : null;
      groups[key === null ? 3 : key < today ? 0 : key === today ? 1 : 2]!.items.push(task);
    }
    return groups;
  }
  const groups = new Map<string, TodoGroup<T>>();
  for (const task of sorted) {
    const tags = new Map((task.tags || []).filter(tag => tag.tag?.name).map(tag => [String(tag.tag!.id ?? tag.tag!.name), tag.tag!.name!]));
    if (!tags.size) tags.set('untagged', '未分类');
    for (const [key, title] of tags) {
      if (!groups.has(key)) groups.set(key, { key, title, items: [] });
      groups.get(key)!.items.push(task);
    }
  }
  return [...groups.values()].sort((a, b) => a.key === 'untagged' ? 1 : b.key === 'untagged' ? -1 : a.title.localeCompare(b.title, 'zh-CN'));
}
