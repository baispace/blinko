import { observer } from 'mobx-react-lite';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { DialogStore } from '@/store/module/Dialog';
import { PromiseCall } from '@/store/standard/PromiseState';
import { NoteType, type Note } from '@shared/lib/types';
import { api } from '@/lib/trpc';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import dayjs from '@/lib/dayjs';
import { Icon } from '@/components/Common/Iconify/icons';
import Editor from '@/components/Common/Editor';
import type { OnSendContentType } from '@/components/Common/Editor/type';

type PrioKey = 'ui' | 'in' | 'un' | 'nn';

const PRIORITY_OPTIONS: { key: PrioKey; u: boolean; i: boolean; labelKey: string; color: string }[] = [
  { key: 'ui', u: true,  i: true,  labelKey: 'priority-urgent-important', color: '#ef4444' },
  { key: 'in', u: false, i: true,  labelKey: 'priority-important',        color: '#f59e0b' },
  { key: 'un', u: true,  i: false, labelKey: 'priority-urgent',           color: '#3b82f6' },
  { key: 'nn', u: false, i: false, labelKey: 'priority-normal',           color: '#9ca3af' },
];

// SVG flag — tinted by the priority color; outline for "nn"
const FlagIcon = ({ color, outline }: { color: string; outline?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill={outline ? 'none' : color}
    stroke={color}
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 22V3" />
    <path d="M4 4h13l-2.5 5L20 14H4" />
  </svg>
);

function quadKeyFromMeta(item: Note): PrioKey {
  const u = Boolean(item.metadata?.priorityUrgent);
  const i = Boolean(item.metadata?.priorityImportant);
  if (u && i) return 'ui';
  if (!u && i) return 'in';
  if (u && !i) return 'un';
  return 'nn';
}

/**
 * Open a dedicated edit dialog for a TODO note. The standard BlinkoEditor
 * (used by ShowEditBlinkoModel) does not expose TODO-specific metadata like
 * expireAt / priorityUrgent / priorityImportant — this dialog does.
 */
export const ShowTodoEditModal = (note: Note) => {
  const blinko = RootStore.Get(BlinkoStore);
  RootStore.Get(DialogStore).setData({
    isOpen: true,
    size: 'xl' as any,
    title: '编辑待办',
    content: <TodoEditModal note={note} />,
  });
  // Stash for the dialog body to read
  blinko.curSelectedNote = note;
};

const TodoEditModal = observer(({ note }: { note: Note }) => {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);
  const [content, setContent] = useState(note.content ?? '');
  const [priorityKey, setPriorityKey] = useState<PrioKey>(quadKeyFromMeta(note));
  const initialDue = note.metadata?.expireAt ? dayjs(note.metadata.expireAt) : dayjs();
  const [due, setDue] = useState(initialDue.format('YYYY-MM-DD'));
  const [prioOpen, setPrioOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const prioWrapRef = useRef<HTMLDivElement>(null);

  const cur = PRIORITY_OPTIONS.find((p) => p.key === priorityKey)!;

  // outside-click closes the priority popover
  useEffect(() => {
    if (!prioOpen) return;
    const handler = (e: MouseEvent) => {
      if (prioWrapRef.current && !prioWrapRef.current.contains(e.target as Node)) {
        setPrioOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [prioOpen]);

  const close = () => RootStore.Get(DialogStore).close();

  // 编辑器发送（Cmd/Ctrl+Enter 或工具栏按钮）走同一条保存路径
  const save = async (args: OnSendContentType) => {
    const text = (args?.content ?? content).trim();
    if (!text || note.id == null) return;
    setSaving(true);
    try {
      await PromiseCall(
        api.notes.upsert.mutate({
          id: note.id,
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
            priorityUrgent: cur.u,
            priorityImportant: cur.i,
            expireAt: due ? dayjs(due).toISOString() : null,
          },
        })
      );
      // refresh store lists so the updated card shows up immediately
      blinko.todoList.resetAndCall({});
      blinko.doneTodoList.resetAndCall({});
      close();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-default-200 bg-background p-4 shadow-sm">
      {/* Top: due date on the left, priority flag on the right */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-default-200">
        <label className="inline-flex items-center gap-1.5 h-7">
          <Icon icon="mdi:calendar-outline" width={15} height={15} className="text-default-500 shrink-0 self-center" />
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="cursor-pointer bg-transparent text-[13px] text-default-700 outline-none border border-default-200 rounded-md px-2 h-7 leading-none transition-colors hover:border-primary/50 focus:border-primary"
          />
        </label>

        <div ref={prioWrapRef} className="relative">
          <button
            type="button"
            onClick={() => setPrioOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 h-7 text-[13px] leading-none transition-colors ${
              prioOpen
                ? 'border-primary/50 text-foreground'
                : 'border-default-200 text-default-700 hover:border-primary/50'
            }`}
            aria-label={t('priority')}
            aria-haspopup="listbox"
            aria-expanded={prioOpen}
          >
            <FlagIcon color={cur.color} outline={priorityKey === 'nn'} />
            <span>{t(cur.labelKey)}</span>
          </button>
          {prioOpen && (
            <div
              role="listbox"
              className="absolute right-0 top-full mt-1.5 z-30 min-w-[200px] rounded-lg border border-default-200 bg-background shadow-lg p-1"
            >
              {PRIORITY_OPTIONS.map((p) => {
                const active = p.key === priorityKey;
                return (
                  <button
                    key={p.key}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setPriorityKey(p.key);
                      setPrioOpen(false);
                    }}
                    className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-default-700 hover:bg-hover transition-colors ${
                      active ? 'bg-hover' : ''
                    }`}
                  >
                    <FlagIcon color={p.color} outline={p.key === 'nn'} />
                    <span className="flex-1 text-left">{t(p.labelKey)}</span>
                    {active && (
                      <Icon icon="mdi:check" width={14} height={14} className="text-primary" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 正文编辑器：与闪念/笔记同一套 Tiptap 编辑器，锁定待办类型 */}
      <div className="pt-3">
        <Editor
          mode="edit"
          content={content}
          onChange={setContent}
          onSend={save}
          isSendLoading={saving}
          fixedNoteType={NoteType.TODO}
          hideNoteTypeButton
          hideFullscreenButton
          withoutOutline
          originFiles={note.attachments ?? []}
          originReference={note.references?.map((i: any) => i.toNoteId) ?? []}
        />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={close}
          className="rounded-lg px-3 py-1.5 text-[13px] text-default-500 hover:text-foreground"
        >
          {t('cancel')}
        </button>
        <span className="ml-auto text-[11px] text-default-400">⌘/Ctrl + Enter</span>
      </div>
    </div>
  );
});