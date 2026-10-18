import { readTodoStatuses, getTodoStatus } from '@shared/lib/todoStatus';
import { getTodoPriority, todoPriorityMetadata, type TodoPriority } from '@shared/lib/todoPriority';
import { Button } from '@heroui/react';
import { historyText } from '@/lib/historyDiff';
import { getFullNote } from '@/lib/fullNote';
import { observer } from 'mobx-react-lite';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { DialogStore } from '@/store/module/Dialog';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { NoteType, type Note } from '@shared/lib/types';
import { api } from '@/lib/trpc';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import dayjs from '@/lib/dayjs';
import { Icon } from '@/components/Common/Iconify/icons';
import Editor from '@/components/Common/Editor';
import type { OnSendContentType } from '@/components/Common/Editor/type';
import { TodoDateCell } from './TodoDateCell';
import { TodoPriorityChip, TodoStatusChip } from './TodoPropertyChips';
import './todoTable.css';

/**
 * 待办详情弹窗。
 *
 * 布局参考成熟的任务详情面板：标题就是标题（不是「任务标题」标签 + 输入框），
 * 属性就是属性（状态 / 优先级 / 时间排成一行可点的胶囊，点开即改），
 * 正文和附件各自成块 —— 而不是四个带 label 的表单项堆在一起。
 *
 * 结构上刻意拆成「固定头部 / 可滚动主体 / 固定底部」三段：
 *  · 关闭键放在固定头部内。共享弹窗宿主提供的是绝对定位在弹窗右上角的关闭键，
 *    而本项目 HeroUI 主题下 ModalContent 是 padding:0，头部只有 29px 高，
 *    绝对定位的 × 会横跨在头部分隔线上（已实测）。
 *  · 保存键在滚动区之外，右下角永远不会和编辑器自己的按钮重叠。
 */

export const ShowTodoEditModal = async (note: Note) => {
  try { note = await getFullNote(note); } catch { RootStore.Get(ToastPlugin).error('读取待办全文失败，请重试'); return; }
  const blinko = RootStore.Get(BlinkoStore);
  RootStore.Get(DialogStore).setData({
    isOpen: true,
    size: '2xl' as any,
    animated: true,
    // onlyContent：头/体/脚的排布完全由本组件掌控
    onlyContent: true,
    content: <TodoEditModal note={note} />,
  });
  blinko.curSelectedNote = note;
};

/** 标题就地编辑：单行起步，随内容自动增高；Enter 提交、Esc 取消、失焦提交 */
const TitleInput = ({ value, onSave, done }: { value: string; onSave: (next: string) => void; done: boolean }) => {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const cancelled = useRef(false);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  const commit = () => {
    if (cancelled.current) { cancelled.current = false; return; }
    const next = draft.trim();
    setDraft(value);
    if (next && next !== value) onSave(next);
  };
  return (
    <textarea
      ref={ref}
      value={draft}
      rows={1}
      aria-label="任务标题"
      placeholder="输入任务标题"
      onChange={e => {
        setDraft(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = `${e.target.scrollHeight}px`;
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancelled.current = true; setDraft(value); }
      }}
      onBlur={commit}
      data-done={done ? 'true' : undefined}
      className="todo-modal-title w-full resize-none overflow-hidden border-none bg-transparent p-0 text-[17px] font-semibold leading-7 placeholder:font-normal placeholder:text-default-300"
    />
  );
};

const TodoEditModal = observer(({ note }: { note: Note }) => {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);
  const statuses = readTodoStatuses(blinko.config.value?.todoStatuses);
  const [status, setStatus] = useState(getTodoStatus(note));
  // 勾选完成后要能退回「原来那个未完成状态」，而不是一律打回 todo
  const openStatus = useRef(status === 'done' ? 'todo' : status);
  const [started, setStarted] = useState(note.metadata?.startAt ? dayjs(note.metadata.startAt).format('YYYY-MM-DD') : '');
  const [due, setDue] = useState(note.metadata?.expireAt ? dayjs(note.metadata.expireAt).format('YYYY-MM-DD') : '');
  const [priorityKey, setPriorityKey] = useState<TodoPriority>(getTodoPriority(note.metadata));
  const [title, setTitle] = useState(note.metadata?.title || historyText(note.content || '').split('\n').find(line => line.trim()) || '');
  const [content, setContent] = useState(note.content ?? '');
  const [saving, setSaving] = useState(false);
  const submitRef = useRef<(() => Promise<any>) | null>(null);
  const done = status === 'done';

  const close = () => RootStore.Get(DialogStore).close();

  const dueValue = due ? dayjs(due).toISOString() : null;
  const isOverdue = !done && dueValue != null && dayjs(dueValue).isBefore(dayjs().startOf('day'), 'day');

  const patchStatus = (id: string) => {
    if (id !== 'done') openStatus.current = id;
    setStatus(id);
  };

  // 编辑器发送（Cmd/Ctrl+Enter）走同一条保存路径
  const save = async (args: OnSendContentType) => {
    const text = (args?.content ?? content).trim();
    if ((!text && !title.trim()) || note.id == null || saving) return;
    setSaving(true);
    try {
      await api.notes.upsert.mutate({
        id: note.id,
        isArchived: done,
        content: text,
        type: NoteType.TODO,
        references: args?.references ?? [],
        // 编辑态下已有附件走 HandleFileType，只有 preview（=原 path）没有 uploadPath，需兜底，否则保存会丢附件
        attachments: (args?.files ?? []).map((i) => ({
          name: i.name,
          path: i.uploadPath ?? (i as any).preview,
          size: i.size,
          type: i.type,
        })) as any,
        metadata: {
          ...(note.metadata ?? {}),
          title: title.trim(),
          taskStatus: status,
          startAt: started ? dayjs(started).toISOString() : null,
          ...todoPriorityMetadata(priorityKey),
          expireAt: dueValue,
        },
      });
      void blinko.refreshData();
      close();
    } catch (error) {
      RootStore.Get(ToastPlugin).error('保存失败，修改已保留，请重试。');
      throw error;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex max-h-[80vh] flex-col overflow-hidden rounded-xl">
      {/* 固定头部：勾选 + 标题 + 关闭键。关闭键放这里而不是绝对定位，标题再长也不会错位 */}
      <header className="flex shrink-0 items-start gap-3 border-b border-default-200 px-5 pb-4 pt-5">
        <button
          type="button"
          onClick={() => patchStatus(done ? openStatus.current : 'done')}
          aria-label={done ? t('restore') : t('complete')}
          className="mt-1 grid size-6 shrink-0 place-items-center rounded-full hover:bg-default-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className={`grid size-[19px] place-items-center rounded-full border-[1.5px] transition-colors ${done ? 'border-success bg-success text-white' : 'border-default-400'}`}>
            {done && <Icon icon="tabler:check" width={12} height={12} />}
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <TitleInput value={title} done={done} onSave={setTitle} />
        </div>
        <Button isIconOnly size="sm" radius="sm" variant="light" aria-label="关闭任务详情" onPress={close} className="-mr-1 -mt-1 shrink-0 text-default-500 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40">
          <Icon icon="tabler:x" width={18} />
        </Button>
      </header>

      {/* 主体：唯一可滚动的区域 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {/* 属性行：点开即改，不占纵向空间 */}
        <div className="todo-detail-attrs">
          <TodoStatusChip statusId={status} statuses={statuses} onPick={patchStatus} className="text-[13px]" />
          <TodoDateCell
            label="截止时间"
            prefix="截止"
            icon="tabler:calendar"
            value={dueValue}
            isOverdue={isOverdue}
            overdueDays={isOverdue ? dayjs().startOf('day').diff(dayjs(dueValue!).startOf('day'), 'day') : 0}
            onPick={iso => setDue(iso ? dayjs(iso).format('YYYY-MM-DD') : '')}
          />
          <TodoDateCell
            label="开始时间"
            prefix="开始"
            icon="tabler:clock"
            value={started ? dayjs(started).toISOString() : null}
            isOverdue={false}
            overdueDays={0}
            onPick={iso => setStarted(iso ? dayjs(iso).format('YYYY-MM-DD') : '')}
          />
          <TodoPriorityChip priorityKey={priorityKey} onPick={setPriorityKey} busy={saving} />
        </div>

        {/* 描述 */}
        <div className="mt-5">
          <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-default-500">
            <Icon icon="tabler:notes" width={14} height={14} />任务描述
          </h3>
          <div className="min-h-[180px]">
            {/* 正文编辑器：与闪念/笔记同一套 Tiptap。刻意不传 withoutOutline ——
                一旦同时隐藏发送/全屏/类型按钮，Editor 会走「裸文档」分支把格式工具栏
                一起省掉，正文就退化成没有加粗/清单/插图的纯文本框了。
                发送按钮仍由 hideDoneButton 关掉，保存只认底部固定操作条。 */}
            <Editor
              mode="edit"
              content={content}
              onChange={setContent}
              onSend={save}
              submitRef={submitRef}
              isSendLoading={saving}
              fixedNoteType={NoteType.TODO}
              focusOnMount={false}
              hideDoneButton
              hideNoteTypeButton
              hideFullscreenButton
              originFiles={note.attachments ?? []}
              originReference={note.references?.map((i: any) => i.toNoteId) ?? []}
            />
          </div>
        </div>
      </div>

      {/* 固定底部操作条 */}
      <footer className="flex shrink-0 items-center gap-2 border-t border-default-200 bg-default-50/50 px-5 py-3">
        <span className="text-[11px] text-default-400">⌘/Ctrl + Enter</span>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="light" onPress={close}>{t('cancel')}</Button>
          <Button size="sm" color="primary" isLoading={saving} onPress={() => void submitRef.current?.()}>保存任务</Button>
        </div>
      </footer>
    </div>
  );
});
