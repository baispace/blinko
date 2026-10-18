import {getTodoStatus,readTodoStatuses,todoStatusPatch} from '@shared/lib/todoStatus';
import type { TodoView } from '@shared/lib/todoViews';
import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, useDraggable, useDroppable, type CollisionDetection, type DragEndEvent } from '@dnd-kit/core';
import { groupTodos, type TodoGrouping } from '@shared/lib/todoGrouping';
import { todoPriorityMetadata, type TodoPriority } from '@shared/lib/todoPriority';
import { api } from '@/lib/trpc';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { TodoCard } from './TodoCard';
import type { Note } from '@shared/lib/types';
import { Icon } from '@/components/Common/Iconify/icons';
import { getTodoPriority } from '@shared/lib/todoPriority';

/**
 * 看板列命中判定。
 *
 * 不用 dnd-kit 自带的 closestCorners / rectIntersection / pointerWithin：
 * 它们第一行都是 `droppableContainers.filter(c => c.measured?.droppable != null)`，
 * 而这里每个列的 measured 始终是 null（实测 [["todo",false,false],...]），
 * 结果就是 over 永远是 undefined，拖到底什么都不发生。
 * droppableRects 和 pointerCoordinates 本身是准的，直接用它们判定即可。
 */
const columnCollision: CollisionDetection = (args) => {
  const { droppableContainers, droppableRects, pointerCoordinates, collisionRect } = args;
  const probe = pointerCoordinates
    ? { x: pointerCoordinates.x, y: pointerCoordinates.y }
    : collisionRect
      ? { x: collisionRect.left + collisionRect.width / 2, y: collisionRect.top + collisionRect.height / 2 }
      : null;
  if (!probe) return [];
  const hits = droppableContainers
    .map(container => {
      const rect = droppableRects.get(container.id);
      if (!rect) return null;
      const inside = probe.x >= rect.left && probe.x <= rect.right && probe.y >= rect.top && probe.y <= rect.bottom;
      return inside ? { container, area: rect.width * rect.height } : null;
    })
    .filter(Boolean) as { container: (typeof droppableContainers)[number]; area: number }[];
  if (!hits.length) return [];
  // 列可能嵌套时命中面积最小的那个。注意字段名是 id 不是 droppableId ——
  // DndContext 内部取的是 firstCollision.id，写错字段 over 会静默变成 undefined。
  hits.sort((a, b) => a.area - b.area);
  const winner = hits[0]!.container;
  return [{ id: winner.id, data: { droppableContainer: winner, value: winner.data.current } }];
};

function TaskDrag({ task, disabled, fields }: { task: Note; disabled: boolean; fields: TodoView['fields'] }) {
  const drag = useDraggable({ id: `task-${task.id}`, data: { task }, disabled });
  return <div ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} className={`todo-board-card-wrap ${drag.isDragging ? 'opacity-30' : ''}`}>
    <TodoCard todo={task} compact board fields={fields} />
  </div>;
}

function BoardColumn({ id, title, count, color, children, hint }: { id: string; title: string; count: number; color?: string; children: React.ReactNode; hint?: string }) {
  const drop = useDroppable({ id, data: { priority: id } });
  return <section aria-label={title} className="todo-board-column">
    <h3 className="todo-board-column-head"><span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color || '#94a3b8' }} />{title}<span className="ml-auto tabular-nums">{count}</span></h3>
    <div ref={drop.setNodeRef} data-over={drop.isOver || undefined} className="todo-board-dropzone">
      {children}
      {!count && <p className="todo-board-empty">{hint || '拖动卡片到这里'}</p>}
    </div>
  </section>;
}

export const TodoGroupedView = observer(({ tasks, mode, board, preserveOrder = false, fields = ['priority','due','tags'] }: { tasks: Note[]; mode: TodoGrouping; board: boolean; preserveOrder?: boolean; fields?: TodoView['fields'] }) => {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);
  const [saving, setSaving] = useState(false);
  const [activeTask, setActiveTask] = useState<Note | null>(null);
  // 跟随源卡片宽度：列宽自适应后写死一个宽度会让卡片在拖起瞬间「跳」一下，
  // dnd-kit 的 rect.current.initial 就是被拖元素拖起来之前的实际宽度。
  const [activeWidth, setActiveWidth] = useState<number | undefined>(undefined);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const statuses=readTodoStatuses(blinko.config.value?.todoStatuses);
  // 看板按「无分组」打开时，列本身就是状态的集合 —— 直接按状态分列，
  // 否则只有一列「全部任务」，拖动无从谈起（这也是之前「看板不能拖状态」的另一半原因）。
  const effective = board && mode === 'none' ? 'status' : mode;
  const groups = groupTodos(tasks, effective, undefined, preserveOrder, statuses);
  // 可拖动 = 列的含义就是「状态」或「优先级」。日期/标签分组下拖动没有对应语义，明确禁用。
  const draggable = !board || effective === 'status' || effective === 'priority';
  // 看板已经按状态分列了，卡片里再重复一个「待办」纯属噪音 —— 直接从展示字段里剔掉
  const cardFields = board && effective === 'status' ? fields.filter(f => f !== 'status') : fields;
  const drop = async (event: DragEndEvent) => {
    const task = event.active.data.current?.task as Note | undefined;
    const target = event.over?.data.current?.priority as string | undefined;
    if(!task || task.id == null || !target || saving)return;
    if(effective==='status'){if(!statuses.some(s=>s.id===target)||getTodoStatus(task)===target)return;}
    else if(effective!=='priority'||task.isArchived||!['ui','in','un','nn'].includes(target)||getTodoPriority(task.metadata)===target)return;
    setSaving(true);
    try {
      const result = await api.notes.upsert.mutate({ id: task.id, ...(effective==='status'?todoStatusPatch(target):{metadata:todoPriorityMetadata(target as TodoPriority)}) });
      blinko.todoFeed.setValue((blinko.todoFeed.value || []).map(item => item.id === task.id ? { ...item, metadata: result.metadata,isArchived:result.isArchived } : item));
      await blinko.todoFeed.resetAndCall({});
    } catch { RootStore.Get(ToastPlugin).error(effective==='status'?'状态调整失败，请重试':'优先级调整失败，请重试'); }
    finally { setSaving(false); }
  };
  if (board) return <div className="todo-board">
    <p className="sr-only">{effective === 'priority' ? '拖动卡片调整优先级，点击标题编辑。' : draggable ? '拖动卡片可切换任务状态，单击标题打开、双击编辑。' : '单击标题打开任务；按状态分组后即可拖动切换状态。'}</p>
    <DndContext sensors={sensors} collisionDetection={columnCollision} onDragStart={event => { setActiveTask(event.active.data.current?.task || null); setActiveWidth(event.active.rect.current.initial?.width); }} onDragCancel={() => { setActiveTask(null); setActiveWidth(undefined); }} onDragEnd={event => { setActiveTask(null); setActiveWidth(undefined); void drop(event); }}><div className="todo-board-track" style={{ '--todo-board-cols': groups.length } as React.CSSProperties}>
      {groups.map(group => <BoardColumn key={group.key} id={group.key} title={group.labelKey ? t(group.labelKey) : group.title} count={group.items.length} color={group.color} hint={draggable ? '拖动卡片到这里' : '此分组下不可拖动'}>
        {group.items.map(task => <TaskDrag key={task.id} task={task} fields={cardFields} disabled={!draggable || saving || (effective !== 'status' && !!task.isArchived)} />)}
      </BoardColumn>)}
    </div><DragOverlay zIndex={10020} dropAnimation={null}>{activeTask ? <div className="rotate-1 cursor-grabbing drop-shadow-xl" style={activeWidth ? { width: activeWidth } : undefined}><TodoCard todo={activeTask} compact board fields={cardFields}/></div> : null}</DragOverlay></DndContext>
  </div>;
  return <div className="overflow-x-auto">
    <div className="todo-compact-grid hidden min-h-10 items-center gap-2 border-b border-default-200 px-3 text-xs text-default-500 md:grid" style={{'--todo-columns':`minmax(220px,1fr) ${fields.map(field=>({status:'100px',start:'120px',priority:'140px',due:'120px',tags:'110px',created:'120px'})[field]).join(' ')} 32px`} as React.CSSProperties}><span className="pl-9">任务标题</span>{fields.map(field=><span key={field}>{({status:'任务状态',start:'开始时间',priority:'优先级',due:'截止时间',tags:'标签',created:'创建时间'})[field]}</span>)}<span/></div>
    {mode === 'tag' && <p className="text-xs text-default-500">多标签任务会出现在对应的各个分组中。</p>}
    {groups.filter(group => group.items.length).map(group => <section key={group.key}>
      {mode!=='none' && <button type="button" aria-expanded={!collapsed[group.key]} className="flex w-full items-center gap-2 border-b border-default-200 bg-default-50/50 px-4 py-2.5 text-left text-xs font-medium" onClick={() => setCollapsed(value => ({ ...value, [group.key]: !value[group.key] }))}>
      <Icon icon={collapsed[group.key] ? 'tabler:chevron-right' : 'tabler:chevron-down'} width={14} height={14} />{group.labelKey ? t(group.labelKey) : group.title}<span className="text-xs font-normal text-default-400">{group.items.length}</span>
      </button>}
      {!collapsed[group.key] && <div>

        {group.items.map(task => <TodoCard key={task.id} todo={task} compact fields={fields}/>)}
      </div>}
    </section>)}
    {!tasks.length && <p className="py-10 text-center text-sm text-default-400">当前范围没有任务。</p>}
  </div>;
});
