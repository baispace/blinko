import { observer } from 'mobx-react-lite';
import { Card } from '@heroui/react';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { NoteType, type Note } from '@shared/lib/types';
import { ShowTodoEditModal } from './TodoEditModal';
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';
import dayjs from '@/lib/dayjs';
import { _ } from '@/lib/lodash';
import { getNoteTagPaths } from './noteContent';
import { api } from '@/lib/trpc';
import { PromiseCall } from '@/store/standard/PromiseState';
import { useState } from 'react';

type BlinkoItem = Note & { isBlog?: boolean; title?: string; isExpand?: boolean };

/** 四象限优先级：紧急 × 重要 */
const QUADRANT = {
  ui: { label: 'priority-urgent-important', color: '#ef4444' },
  in: { label: 'priority-important',        color: '#f59e0b' },
  un: { label: 'priority-urgent',           color: '#3b82f6' },
  nn: { label: 'priority-normal',           color: '#9ca3af' },
} as const;

type QuadrantKey = keyof typeof QUADRANT;

function getQuadrant(item: BlinkoItem): QuadrantKey {
  const u = Boolean(item.metadata?.priorityUrgent);
  const i = Boolean(item.metadata?.priorityImportant);
  if (u && i) return 'ui';
  if (!u && i) return 'in';
  if (u && !i) return 'un';
  return 'nn';
}

/** 去掉正文里的 #标签# token，取纯文本标题/内容 */
function stripContent(item: BlinkoItem): string {
  const tagPaths = getNoteTagPaths(item);
  const text = (item.content ?? '')
    .split('\n')
    .map((line) => {
      if (!line.includes('#')) return line;
      return line
        .split(/\s+/)
        .filter((tok) => {
          if (!tok.startsWith('#') || tok.length < 2) return true;
          const bare = tok.slice(1).replace(/[**?.。]+$/u, '');
          return !tagPaths.some((p) => p === bare || p === tok.slice(1, -1));
        })
        .join(' ');
    })
    .join('\n')
    .replace(/#([^#\n]+)#/g, '')
    .trim();
  return text;
}

interface TodoCardProps {
  todo: BlinkoItem;
}

export const TodoCard = observer(({ todo }: TodoCardProps) => {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);
  const [expanded, setExpanded] = useState(false);
  const done = Boolean(todo.isArchived);
  const quad = getQuadrant(todo);
  const quadMeta = QUADRANT[quad];

  // expireAt 可能被脏数据/旧版本写成非法值，这里做有效性校验，避免出现 "Invalid Date"
  const rawDue = todo.metadata?.expireAt ? dayjs(todo.metadata.expireAt) : null;
  const due = rawDue && rawDue.isValid() ? rawDue : null;
  const todayStart = dayjs().startOf('day');
  const isOverdue = !done && due != null && due.isBefore(todayStart, 'day');
  const overdueDays = isOverdue ? todayStart.diff(due!.startOf('day'), 'day') : 0;
  const snooze = Number(todo.metadata?.snoozeCount ?? 0);
  const tags = (todo.tags ?? [])
    .map((tg: any) => tg?.tag?.name)
    .filter(Boolean) as string[];

  // 多行提示：昨日创建但今日仍未完成 → 带到今天
  const carriedFromYesterday = !done && dayjs().subtract(1, 'day').isSame(dayjs(todo.createdAt), 'day');

  const content = stripContent(todo);
  const contentLines = content.split('\n');
  const isLong = contentLines.length > 3 || content.length > 140;

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const willArchive = !done;

    // 同步更新两份 list 的内存数据：保证「点完即生效」，
    // 行为与刷新后一致，避免 updateTicker 只刷 todoList 不刷 doneTodoList
    // 导致的「点完消失、刷新又出现」错位。
    const todoList = (blinko.todoList.value ?? []) as any[];
    const doneList = (blinko.doneTodoList.value ?? []) as any[];
    const updated = {
      ...todo,
      isArchived: willArchive,
      updatedAt: new Date().toISOString(),
    };

    if (willArchive) {
      blinko.todoList.setValue(todoList.filter((n) => n.id !== todo.id));
      if (!doneList.some((n) => n.id === todo.id)) {
        blinko.doneTodoList.setValue([updated, ...doneList]);
      }
    } else {
      blinko.doneTodoList.setValue(doneList.filter((n) => n.id !== todo.id));
      if (!todoList.some((n) => n.id === todo.id)) {
        blinko.todoList.setValue([updated, ...todoList]);
      }
    }

    // 异步通知后端；refresh 默认会自增 updateTicker → refreshData() 再次拉 todoList
    blinko.upsertNote.call({
      id: todo.id,
      type: NoteType.TODO,
      isArchived: willArchive,
    });
  };

  const openEdit = () => {
    blinko.curSelectedNote = _.cloneDeep(todo);
    ShowTodoEditModal(todo);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    openEdit();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (todo.id == null) return;
    if (!window.confirm(`${t('confirm')}：${t('delete')}？`)) return;
    PromiseCall(api.notes.deleteMany.mutate({ ids: [todo.id] }));
    PromiseCall(api.ai.embeddingDelete.mutate({ id: todo.id }));
    blinko.todoList.resetAndCall({});
  };

  const handleSnooze = (e: React.MouseEvent) => {
    e.stopPropagation();
    const base = due ?? dayjs().startOf('day');
    const next = base.add(1, 'day').toISOString();
    blinko.upsertNote.call({
      id: todo.id,
      type: NoteType.TODO,
      metadata: {
        expireAt: next,
        snoozeCount: snooze + 1,
      },
    });
  };

  return (
    <Card
      shadow='none'
      className="relative flex flex-row gap-3 items-start p-3.5 pl-4 bg-background border border-default-200 rounded-xl shadow-sm !transition-all group/card hover:border-primary/40 hover:shadow-md hover:-translate-y-px"
    >
      <div
        className="absolute left-0 top-2 bottom-2 w-1 rounded-full"
        style={{ backgroundColor: quadMeta.color }}
      />

      <button
        type="button"
        onClick={toggle}
        aria-label={done ? t('restore') : t('complete')}
        className="mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors"
        style={{
          borderColor: done ? quadMeta.color : '#cbd5e1',
          backgroundColor: done ? quadMeta.color : 'transparent',
        }}
      >
        {done && <Icon icon="mdi:check" width={13} height={13} className="text-white" />}
      </button>

      <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 cursor-pointer" onDoubleClick={openEdit}>
          <div
            className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${
              done ? 'line-through opacity-60' : ''
            } ${!expanded && isLong ? 'line-clamp-3' : ''}`}
          >
            {content || <span className="text-default-400">(空)</span>}
          </div>

          {isLong && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
              className="mt-0.5 text-[11px] text-primary hover:underline"
            >
              {expanded ? t('collapse') : t('expand')}
            </button>
          )}

          {/* 多行提示：昨日未完成，带到今天 */}
          {carriedFromYesterday && (
            <div className="mt-1 text-[11px] text-amber-500">
              {t('carried-from-yesterday')}
            </div>
          )}

          {/* 时间信息（左侧）+ 标签 */}
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {due && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  isOverdue
                    ? 'bg-red-500/10 text-red-500'
                    : 'bg-default-100 text-default-600'
                }`}
              >
                <Icon icon={isOverdue ? 'mdi:alert-circle-outline' : 'mdi:calendar-outline'} width={11} height={11} />
                {isOverdue
                  ? `${t('overdue')} ${overdueDays}${t('days')}`
                  : dayjs(todo.metadata.expireAt).format('MM/DD')}
              </span>
            )}

            {carriedFromYesterday && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-amber-500/10 text-amber-500">
                {t('carried-from-yesterday')}
              </span>
            )}

            {snooze > 0 && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-default-200 text-default-500">
                {t('snoozed')} {snooze} {t('times')}
              </span>
            )}

            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-primary/10 text-primary"
              >
                {tag}
              </span>
            ))}
          </div>

          {done && todo.updatedAt && (
            <div className="text-[11px] text-default-400 mt-1">
              {t('completed-at')} {dayjs(todo.updatedAt).format('MM/DD HH:mm')}
            </div>
          )}
        </div>

        {/* 右侧：优先级 chip + 顺延 / 编辑 / 删除 */}
        <div className="flex items-center gap-1 shrink-0">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium mr-0.5"
            style={{
              color: quadMeta.color,
              backgroundColor: `${quadMeta.color}14`,
            }}
            title={t(quadMeta.label)}
          >
            {t(quadMeta.label)}
          </span>
          <button
            type="button"
            onClick={handleSnooze}
            aria-label={t('snooze-1-day')}
            title={t('snooze-1-day')}
            className="w-7 h-7 rounded-md flex items-center justify-center text-default-500 hover:bg-default-100 hover:text-primary transition-colors"
          >
            <Icon icon="mdi:chevron-double-right" width={16} height={16} />
          </button>
          <button
            type="button"
            onClick={handleEdit}
            aria-label={t('edit')}
            title={t('edit')}
            className="w-7 h-7 rounded-md flex items-center justify-center text-default-500 hover:bg-default-100 hover:text-foreground transition-colors"
          >
            <Icon icon="mdi:pencil-outline" width={16} height={16} />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            aria-label={t('delete')}
            title={t('delete')}
            className="w-7 h-7 rounded-md flex items-center justify-center text-default-500 hover:bg-danger/10 hover:text-danger transition-colors"
          >
            <Icon icon="mdi:trash-can-outline" width={16} height={16} />
          </button>
        </div>
      </div>
    </Card>
  );
});
