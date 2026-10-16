import { getFullNote } from '@/lib/fullNote';
import { getTodoPriority, todoPriorityMetadata, TODO_PRIORITIES, type TodoPriority } from '@shared/lib/todoPriority';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { observer } from 'mobx-react-lite';
import { Card, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/react';
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
import { useRef, useState } from 'react';
import { MarkdownRender } from '@/components/Common/MarkdownRender';
import { FilesAttachmentRender } from '@/components/Common/AttachmentRender';

type BlinkoItem = Note & { isBlog?: boolean; title?: string; isExpand?: boolean };

/** 四象限优先级：紧急 × 重要 */
const QUADRANT = {
  ui: { label: 'priority-urgent-important', color: '#ef4444' },
  in: { label: 'priority-important',        color: '#f59e0b' },
  un: { label: 'priority-urgent',           color: '#3b82f6' },
  nn: { label: 'priority-normal',           color: '#9ca3af' },
} as const;

type QuadrantKey = keyof typeof QUADRANT;

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
  const [toggleSaving, setToggleSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const done = Boolean(todo.isArchived);
  const quad = getTodoPriority(todo.metadata);
  const [prioritySaving, setPrioritySaving] = useState(false);
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
  const isLong = (todo.contentLength || content.length) > 140 || contentLines.length > 3;

  // 正文里的任务清单可直接在卡片上勾选。
  // updater 基于「原始 content」计算（stripContent 只删 #标签# token，任务项序号与原文一致），
  // 用 ref 持有最新值，避免连续快速点击时用陈旧闭包覆盖前一次结果。
  const rawContentRef = useRef(todo.content ?? '');
  rawContentRef.current = todo.content ?? '';

  const handleContentChange = async (updater: (current: string) => string) => {
    if (todo.id == null) return;
    try { const full = await getFullNote(todo); rawContentRef.current = full.content || ''; } catch { RootStore.Get(ToastPlugin).error('读取全文失败，未修改内容'); return; }
    const next = updater(rawContentRef.current);
    if (next === rawContentRef.current) return;
    rawContentRef.current = next;
    todo.content = next;
    // refresh: false —— 不重拉列表，避免勾选后卡片跳动
    blinko.upsertNote.call({ id: todo.id, content: next, refresh: false });
  };

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (toggleSaving) return;
    setToggleSaving(true);
    try {
      await api.notes.upsert.mutate({ id: todo.id, type: NoteType.TODO, isArchived: !done });
      await blinko.refreshData();
    } catch { RootStore.Get(ToastPlugin).error('状态更新失败，请重试'); }
    finally { setToggleSaving(false); }
  };

  const openEdit = () => {
    blinko.curSelectedNote = _.cloneDeep(todo);
    ShowTodoEditModal(todo);
  };

  const snoozeTodo = () => {
    if (done) return;
    const base = due ?? dayjs().startOf('day');
    blinko.upsertNote.call({
      id: todo.id,
      type: NoteType.TODO,
      metadata: {
        expireAt: base.add(1, 'day').toISOString(),
        snoozeCount: snooze + 1,
      },
    });
  };

  const deleteTodo = async () => {
    if (todo.id == null || !window.confirm(`${t('confirm')}：${t('delete')}？`)) return;
    await PromiseCall(api.notes.deleteMany.mutate({ ids: [todo.id] }));
    void PromiseCall(api.ai.embeddingDelete.mutate({ id: todo.id }), { autoAlert: false });
    await blinko.refreshData();
  };

  const changePriority = async (key: TodoPriority) => {
    if (prioritySaving || done || key === quad) return;
    setPrioritySaving(true);
    try {
      const saved = await api.notes.upsert.mutate({ id: todo.id, type: NoteType.TODO, metadata: todoPriorityMetadata(key) });
      // Replace list entries so both MobX readers and memoized groups update.
      for (const list of [blinko.todoFeed, blinko.todoList, blinko.doneTodoList, blinko.noteList]) {
        list.setValue((list.value ?? []).map(item => item.id === todo.id ? { ...item, metadata: saved.metadata } : item));
      }
      if (new URLSearchParams(window.location.search).get('path') === 'todo') await blinko.todoFeed.resetAndCall({});
    } catch { RootStore.Get(ToastPlugin).error('优先级修改失败，请重试。'); }
    finally { setPrioritySaving(false); }
  };

  const stopAndRun = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  return (
    <Card
      shadow='none'
      className="group/card relative flex flex-row items-start gap-2.5 rounded-xl border border-default-200/70 bg-card p-3 pl-3.5 shadow-sm transition-[border-color,box-shadow,transform] duration-200 md:hover:-translate-y-px md:hover:border-primary/30 md:hover:shadow-md"
    >
      <div
        className="absolute left-0 top-2 bottom-2 w-1 rounded-full"
        style={{ backgroundColor: quadMeta.color }}
      />

      <button
        type="button"
        onClick={toggle}
        disabled={toggleSaving}
        aria-label={done ? t('restore') : t('complete')}
        className="-ml-1 -mt-1 grid size-9 shrink-0 place-items-center rounded-full transition-colors hover:bg-default-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <span
          className="flex size-5 items-center justify-center rounded-full border-2 transition-colors"
          style={{
            borderColor: done ? quadMeta.color : '#cbd5e1',
            backgroundColor: done ? quadMeta.color : 'transparent',
          }}
        >
          {done && <Icon icon="mdi:check" width={13} height={13} className="text-white" />}
        </span>
      </button>

      <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 cursor-pointer" onDoubleClick={openEdit}>
          <div
            className={`text-sm leading-relaxed break-words ${
              done ? 'line-through opacity-60' : ''
            } ${!expanded && isLong ? 'max-h-[4.5rem] overflow-hidden' : ''}`}
          >
            {content
              ? <MarkdownRender content={content} onChange={handleContentChange} />
              : <span className="text-default-400">(空)</span>}
          </div>

          {(todo.attachments?.length ?? 0) > 0 && (
            <div className="mt-1.5">
              <FilesAttachmentRender files={todo.attachments ?? []} columns={3} />
            </div>
          )}

          {isLong && (
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                if (!expanded) { try { Object.assign(todo, await getFullNote(todo)); } catch { RootStore.Get(ToastPlugin).error('读取全文失败，请重试'); return; } }
                setExpanded((v) => !v);
              }}
              className="mt-0.5 text-[11px] text-primary hover:underline"
            >
              {expanded ? t('collapse') : t('expand')}
            </button>
          )}

          {/* 时间信息（左侧）+ 标签 */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Dropdown isDisabled={done || prioritySaving}>
              <DropdownTrigger><button type="button" disabled={done || prioritySaving}
                aria-label={`${t('priority')}：${t(quadMeta.label)}`} title={t('priority')}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-75 disabled:cursor-default disabled:opacity-70"
                style={{ color: quadMeta.color, backgroundColor: `${quadMeta.color}14` }}>
                {prioritySaving ? t('saving') : t(quadMeta.label)}{!done && <Icon icon="tabler:chevron-down" width="11" />}
              </button></DropdownTrigger>
              <DropdownMenu aria-label={t('priority')} selectionMode="single" selectedKeys={[quad]}
                onAction={key => { void changePriority(key as TodoPriority); }}>
                {TODO_PRIORITIES.map(option => <DropdownItem key={option.key} textValue={t(option.labelKey)}
                  startContent={<span className="h-2 w-2 rounded-full" style={{ backgroundColor: option.color }} />}>
                  {t(option.labelKey)}
                </DropdownItem>)}
              </DropdownMenu>
            </Dropdown>
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
              {t('completed-at')} {dayjs((todo.metadata as any)?.completedAt || todo.updatedAt).format('MM/DD HH:mm')}
            </div>
          )}
        </div>

        {/* 桌面端展示高频动作；移动端收进菜单，避免挤压正文。 */}
        <div className="hidden shrink-0 items-center gap-0.5 md:flex">
          {!done && (
            <button
              type="button"
              onClick={(e) => stopAndRun(e, snoozeTodo)}
              aria-label={t('snooze-1-day')}
              title={t('snooze-1-day')}
              className="grid size-8 place-items-center rounded-lg text-default-500 transition-colors hover:bg-default-100 hover:text-primary"
            >
              <Icon icon="mdi:chevron-double-right" width={16} height={16} />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => stopAndRun(e, openEdit)}
            aria-label={t('edit')}
            title={t('edit')}
            className="grid size-8 place-items-center rounded-lg text-default-500 transition-colors hover:bg-default-100 hover:text-foreground"
          >
            <Icon icon="mdi:pencil-outline" width={16} height={16} />
          </button>
          <button
            type="button"
            onClick={(e) => stopAndRun(e, () => void deleteTodo())}
            aria-label={t('delete')}
            title={t('delete')}
            className="grid size-8 place-items-center rounded-lg text-default-500 transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <Icon icon="mdi:trash-can-outline" width={16} height={16} />
          </button>
        </div>

        <Dropdown placement="bottom-end">
          <DropdownTrigger>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              aria-label={t('more')}
              className="grid size-9 shrink-0 place-items-center rounded-lg text-default-500 transition-colors hover:bg-default-100 hover:text-foreground md:hidden"
            >
              <Icon icon="ri:more-fill" width={18} height={18} />
            </button>
          </DropdownTrigger>
          <DropdownMenu
            aria-label={t('todo')}
            onAction={(key) => {
              if (key === 'snooze') snoozeTodo();
              if (key === 'edit') openEdit();
              if (key === 'delete') void deleteTodo();
            }}
          >
            {!done ? <DropdownItem key="snooze" startContent={<Icon icon="mdi:chevron-double-right" width={16} height={16} />}>{t('snooze-1-day')}</DropdownItem> : null}
            <DropdownItem key="edit" startContent={<Icon icon="mdi:pencil-outline" width={16} height={16} />}>{t('edit')}</DropdownItem>
            <DropdownItem key="delete" color="danger" className="text-danger" startContent={<Icon icon="mdi:trash-can-outline" width={16} height={16} />}>{t('delete')}</DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </div>
    </Card>
  );
});
