import { observer } from 'mobx-react-lite';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { NoteType } from '@shared/lib/types';
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

// Inline flag SVG — tinted by the priority color; outline for "none"
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

export const TodoQuickAdd = observer(({ compact = false }: { compact?: boolean }) => {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);
  const [content, setContent] = useState('');
  const [priorityKey, setPriorityKey] = useState<PrioKey>('nn');
  // 默认「无截止日」：以前固定填今天，于是随手记一条无期限的事会变成今日到期、
  // 直接落进「今天」列表。要今天就点下面的「今天」，一步可达。
  const [due, setDue] = useState('');
  const [prioOpen, setPrioOpen] = useState(false);
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

  // 提交后只清正文，保留日期+优先级，方便连续添加同类任务
  const resetContent = () => setContent('');

  // 编辑器（Cmd/Ctrl+Enter）与工具栏发送按钮都会走到这里
  const submit = async (args: OnSendContentType) => {
    const text = (args?.content ?? content).trim();
    if (!text) return;
    const saved = await blinko.upsertNote.call({
      content: text,
      type: NoteType.TODO,
      references: args?.references ?? [],
      attachments: (args?.files ?? []).map((i) => ({
        name: i.name,
        path: i.uploadPath ?? (i as any).preview,
        size: i.size,
        type: i.type,
      })) as any,
      metadata: {
        priorityUrgent: cur.u,
        priorityImportant: cur.i,
        expireAt: due ? dayjs(due).toISOString() : undefined,
      },
    });
    if (!saved) throw new Error('保存失败，待办草稿已保留');
    resetContent();
  };

  return (
    <div className={compact ? "px-3 pb-3" : "rounded-xl border border-default-200 bg-background p-4 shadow-sm"}>
      {/* 正文编辑器：与闪念/笔记同一套 Tiptap 编辑器；待办类型固定，元信息置于正文上方。 */}
      <div>
        <Editor
          composerVariant="todo"
          mode="create"
          content={content}
          onChange={setContent}
          onSend={submit}
          isSendLoading={blinko.upsertNote.loading.value}
          fixedNoteType={NoteType.TODO}
          hideNoteTypeButton
          withoutOutline
          topSlot={<>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 border-b border-default-100 px-1 pb-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <input
            type="datetime-local"
            aria-label={t('due-date')}
            title={t('due-date')}
            value={due}
            onChange={(e) => setDue(e.target.value)}
            onClick={(e) => {
              try { e.currentTarget.showPicker?.(); } catch { /* Browser may restrict native pickers. */ }
            }}
            className="h-8 min-w-[180px] max-w-full cursor-pointer rounded-md border border-default-200 bg-transparent px-2 text-[13px] leading-none text-default-700 outline-none transition-[border-color,background-color,box-shadow] duration-150 hover:border-primary/50 hover:bg-default-50 focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          {!due ? (
            <button
              type="button"
              onClick={() => setDue(dayjs().endOf('day').format('YYYY-MM-DDTHH:mm'))}
              className="shrink-0 rounded-md border border-default-200 px-2 h-7 text-[13px] leading-none text-default-600 transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {t('today')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setDue('')}
              aria-label={t('no-date')}
              title={t('no-date')}
              className="shrink-0 rounded-md px-1.5 h-7 inline-flex items-center text-default-500 transition-colors hover:bg-default-100 hover:text-foreground"
            >
              <Icon icon="mdi:close" width={14} height={14} />
            </button>
          )}
        </div>

        <div ref={prioWrapRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setPrioOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2 h-7 text-[13px] leading-none transition-colors ${
              prioOpen
                ? 'border-primary/50 text-foreground'
                : 'border-default-200 text-default-700 hover:border-primary/50'
            }`}
            aria-label={`${t('priority')}：${t(cur.labelKey)}`}
            title={t(cur.labelKey)}
            aria-haspopup="listbox"
            aria-expanded={prioOpen}
          >
            <FlagIcon color={cur.color} outline={priorityKey === 'nn'} />
            <span className="hidden sm:inline">{t(cur.labelKey)}</span>
          </button>
          {prioOpen && (
            <div
              role="listbox"
              className="absolute right-0 top-full mt-1.5 z-30 min-w-[180px] rounded-lg border border-default-200 bg-background shadow-lg p-1"
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

</>}
        />
      </div>
    </div>
  );
});