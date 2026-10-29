import { Icon } from '@/components/Common/Iconify/icons';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@heroui/react';
import { Popover, PopoverContent, PopoverTrigger } from '@heroui/react';
import { useEffect, useReducer, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import type { CalloutType } from './Callout';
import type { SlashMenuState } from './slashMenuState';
import { eventBus } from '@/lib/event';

/** Force re-render on editor transactions (for active states) */
export const useEditorTick = (editor: Editor | null | undefined) => {
  const [tick, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!editor) return;
    const handler = () => force();
    editor.on('transaction', handler);
    editor.on('selectionUpdate', handler);
    return () => {
      editor.off('transaction', handler);
      editor.off('selectionUpdate', handler);
    };
  }, [editor]);
  return tick;
};

export const ToolbarDivider = () => (
  <div className="w-[1px] h-[16px] bg-default-300 dark:bg-default-100 mx-1 opacity-60" />
);

const TippyButton = ({ label, active, onClick, title }: {
  label: string, active?: boolean, onClick: () => void, title: string
}) => (
  <button
    title={title}
    className={`w-[26px] h-[26px] flex items-center justify-center rounded-md cursor-pointer !transition-all
      ${active ? 'bg-primary/15 text-primary' : 'text-default-600 hover:bg-hover'}`}
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
  >
    {label}
  </button>
);

/**
 * Image-like upload button (file picker), keeps the audio recording event listener.
 */
export const UploadImageButton = ({ getInputProps, open, store, label, icon = 'tdesign:image' }: {
  label?: string;
  icon?: string;
  getInputProps: () => any;
  open: () => void;
  store: any;
}) => {
  const { t } = useTranslation();

  // Listen for audio recording event from Android shortcuts (moved from UploadButtons)
  useEffect(() => {
    const handleStartAudioRecording = () => {
      import('../../AudioDialog').then(({ ShowAudioDialog }) => {
        ShowAudioDialog((file: File) => store.uploadFiles([file]));
      });
    };
    eventBus.on('editor:startAudioRecording', handleStartAudioRecording);
    return () => {
      eventBus.off('editor:startAudioRecording', handleStartAudioRecording);
    };
  }, [store]);

  return (
    <IconButtonWrap label={label} tooltip={t('upload-file')} onClick={open} icon={icon}>
      <input {...getInputProps()} />
    </IconButtonWrap>
  );
};

/** Detail-document image picker: images are routed inline by EditorStore for NOTE documents. */
export const DocumentImageUploadButton = ({ store, label }: { store: any; label?: string }) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Tooltip content={t('insert-image')} placement="bottom" delay={300}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`flex items-center justify-center rounded-md text-default-600 transition-colors hover:bg-hover ${
          label ? 'gap-1.5 px-2 py-1.5 text-xs' : 'h-[23px] w-[23px]'
        }`}
      >
        <Icon icon="tdesign:image" width={19} height={19} />
        {label && <span>{label}</span>}
        <input
          ref={inputRef}
          hidden
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            if (files.length) store.uploadFiles(files);
            event.currentTarget.value = '';
          }}
        />
      </button>
    </Tooltip>
  );
};

const IconButtonWrap = ({ tooltip, onClick, icon, children, label }: {
  label?: string, tooltip: string, onClick: (e: any) => void, icon: string, children?: any
}) => (
  <Tooltip content={tooltip} placement="bottom" delay={300}>
    <div
      onClick={onClick}
      className={`hover:bg-hover transition-colors cursor-pointer rounded-md flex items-center justify-center text-default-600 ${label ? "gap-1 px-2 py-1.5 text-xs" : "w-[23px] h-[23px]"}`}
    >
      <Icon icon={icon} width={20} height={20} />
      {label && <span>{label}</span>}
      {children}
    </div>
  </Tooltip>
);

/** Callout type → { label-key, color } (icon is user-selectable, defaults per type). */
const CALLOUT_TYPES: { type: CalloutType; color: string }[] = [
  { type: 'info', color: '#7454fc' },
  { type: 'warning', color: '#EAB308' },
  { type: 'success', color: '#22c55e' },
  { type: 'danger', color: '#ef4444' },
];

/** Frequently-used emoji for work scenarios. */
const CALLOUT_EMOJIS: string[] = [
  '💡', '📌', '✅', '⚠️', '🔥', '🚀', '🎯', '📝', '⭐', '❗',
  '⏰', '💪', '🧠', '🎉', '👀', '💬', '🔔', '📊', '🛠️', '📅',
];

/**
 * Shared callout picker content: color types + emoji grid + random.
 * Used by the toolbar button popover and the click-on-icon floating menu.
 */
export const CalloutPickerContent = ({ editor, onDone }: { editor: Editor; onDone?: () => void }) => {
  const { t } = useTranslation();
  const currentType = (editor.getAttributes('callout')?.type as CalloutType) || 'info';
  const currentIcon = editor.getAttributes('callout')?.icon as string | undefined;

  const pickType = (type: CalloutType) => {
    if (editor.isActive('callout')) {
      editor.chain().focus().setCalloutType(type).run();
    } else {
      editor.chain().focus().toggleCallout({ type }).run();
    }
    onDone?.();
  };
  const pickIcon = (icon: string) => {
    if (editor.isActive('callout')) {
      editor.chain().focus().setCalloutIcon(icon).run();
    } else {
      editor.chain().focus().toggleCallout({ type: 'info', icon }).run();
    }
  };
  const randomIcon = () => {
    const pool = CALLOUT_EMOJIS.filter((e) => e !== currentIcon);
    const icon = pool[Math.floor(Math.random() * pool.length)] ?? CALLOUT_EMOJIS[0];
    pickIcon(icon);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* color / type picker */}
      <div>
        <div className="text-[11px] text-default-400 mb-1.5 px-1">{t('callout-color')}</div>
        <div className="flex flex-col gap-0.5">
          {CALLOUT_TYPES.map((c) => (
            <button
              key={c.type}
              className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-sm !transition-all cursor-pointer
                ${currentType === c.type ? 'bg-primary/10 text-primary font-medium' : 'text-default-700 hover:bg-hover'}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pickType(c.type)}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
              <span>{t(`callout-${c.type}`)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="h-[1px] bg-default-200" />

      {/* emoji picker */}
      <div>
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span className="text-[11px] text-default-400">{t('callout-icon')}</span>
          <button
            className="text-[11px] text-primary hover:bg-hover px-1.5 py-0.5 rounded cursor-pointer !transition-all"
            onMouseDown={(e) => e.preventDefault()}
            onClick={randomIcon}
          >
            {t('callout-random')}
          </button>
        </div>
        <div className="grid grid-cols-10 gap-0.5">
          {CALLOUT_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              className={`w-7 h-7 flex items-center justify-center rounded-md text-base leading-none !transition-all cursor-pointer
                ${currentIcon === emoji ? 'bg-primary/15 ring-1 ring-primary/40' : 'hover:bg-hover'}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { pickIcon(emoji); onDone?.(); }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * "Aa" format menu: headings / rich text marks / quote & code block.
 */
export const FormatMenuButton = ({ editor, label }: { editor: Editor | null | undefined; label?: string }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [showCallout, setShowCallout] = useState(false);
  useEditorTick(editor);
  if (!editor) return null;

  const chain = () => editor.chain().focus();
  const Item = ({ label, icon, active, action }: {
    label: string; icon: string; active?: boolean; action: () => void
  }) => (
    <button
      className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-sm !transition-all cursor-pointer
        ${active ? 'bg-primary/15 text-primary font-medium' : 'text-default-700 hover:bg-hover'}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => { action(); setOpen(false); }}
    >
      <Icon icon={icon} width={17} height={17} />
      <span>{label}</span>
    </button>
  );

  return (
    <Popover placement="bottom-start" isOpen={open} onOpenChange={(v) => { setOpen(v); if (!v) setShowCallout(false); }}>
      <PopoverTrigger>
        <div
          className={`hover:bg-hover transition-colors cursor-pointer rounded-md flex items-center justify-center text-default-600 ${label ? "gap-1 px-2 py-1.5 text-xs" : "w-[23px] h-[23px]"}`}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
        >
          <Icon icon="tabler:letter-case" width={20} height={20} />
          {label && <span>{label}</span>}
        </div>
      </PopoverTrigger>
      {/* 展开标注选择器时需要更宽，否则颜色/表情网格会被挤 */}
      <PopoverContent className={`p-1.5 ${showCallout ? 'w-[248px]' : 'w-[168px]'}`}>
        <div className="flex flex-col gap-0.5">
          <Item label={t('context')} icon="mdi:format-text" active={editor.isActive('paragraph')} action={() => chain().setParagraph().run()} />
          <Item label={t('heading-1')} icon="mdi:format-header-1" active={editor.isActive('heading', { level: 1 })} action={() => chain().toggleHeading({ level: 1 }).run()} />
          <Item label={t('heading-2')} icon="mdi:format-header-2" active={editor.isActive('heading', { level: 2 })} action={() => chain().toggleHeading({ level: 2 }).run()} />
          <Item label={t('heading-3')} icon="mdi:format-header-3" active={editor.isActive('heading', { level: 3 })} action={() => chain().toggleHeading({ level: 3 }).run()} />
          <div className="h-[1px] bg-default-200 my-1 mx-2" />
          <Item label={t('bold')} icon="mdi:format-bold" active={editor.isActive('bold')} action={() => chain().toggleBold().run()} />
          <Item label={t('italic')} icon="mdi:format-italic" active={editor.isActive('italic')} action={() => chain().toggleItalic().run()} />
          <Item label={t('underline')} icon="mdi:format-underline" active={editor.isActive('underline')} action={() => chain().toggleUnderline().run()} />
          <Item label={t('strike')} icon="mdi:format-strikethrough-variant" active={editor.isActive('strike')} action={() => chain().toggleStrike().run()} />
          <Item label={t('highlight')} icon="mdi:format-color-highlight" active={editor.isActive('highlight')} action={() => chain().toggleHighlight().run()} />
          <Item label={t('inline-code')} icon="mdi:code-tags" active={editor.isActive('code')} action={() => chain().toggleCode().run()} />
          <div className="h-[1px] bg-default-200 my-1 mx-2" />
          <Item label={t('quote')} icon="mdi:format-quote-close" active={editor.isActive('blockquote')} action={() => chain().toggleBlockquote().run()} />
          <Item label={t('code-block')} icon="mdi:code-braces" active={editor.isActive('codeBlock')} action={() => chain().toggleCodeBlock().run()} />
          {/* 列表：原本是顶栏 3 个独立按钮（无序 / 有序 / 任务），收进格式菜单，
              顶栏因此从 9 个降到 5 个（💬 # 🖼 Aa @），能力一条不少 */}
          <div className="h-[1px] bg-default-200 my-1 mx-2" />
          <Item label={t('bullet-list')} icon="mdi:format-list-bulleted" active={editor.isActive('bulletList')} action={() => chain().toggleBulletList().run()} />
          <Item label={t('ordered-list')} icon="mdi:format-list-numbered" active={editor.isActive('orderedList')} action={() => chain().toggleOrderedList().run()} />
          <Item label={t('task-list')} icon="mdi:format-list-checks" active={editor.isActive('taskList')} action={() => chain().toggleTaskList().run()} />
          {/* 标注带类型 / 颜色 / 表情选择器，不能压成一行，展开成子面板保住完整 picker */}
          <div
            className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-sm !transition-all cursor-pointer
              ${editor.isActive('callout') ? 'bg-primary/15 text-primary font-medium' : 'text-default-700 hover:bg-hover'}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowCallout((v) => !v)}
          >
            <Icon icon="mdi:lightbulb-on-outline" width={17} height={17} />
            <span className="flex-1 text-left">{t('callout')}</span>
            <Icon icon={showCallout ? 'tabler:chevron-up' : 'mdi:chevron-down'} width={15} height={15} className="opacity-60" />
          </div>
          {showCallout && (
            <>
              <div className="h-[1px] bg-default-200 my-1 mx-2" />
              <CalloutPickerContent editor={editor} onDone={() => setOpen(false)} />
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

/**
 * Slash menu view, positioned from the suggestion clientRect.
 */
export const SlashMenuView = observer(({ state }: { state: SlashMenuState }) => {
  const { t } = useTranslation();
  if (!state.isOpen || !state.rect || !state.items.length) return null;
  const top = Math.min(state.rect.bottom + 6, window.innerHeight - 320);

  return (
    <div
      className="slash-menu"
      style={{ position: 'fixed', top, left: state.rect.left, zIndex: 9998 }}
    >
      {state.items.map((item, index) => (
        <div
          key={item.title}
          className={`item ${index === state.selectedIndex ? 'is-selected' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { state.selectedIndex = index; state.selectCurrent(); }}
          onMouseEnter={() => { state.selectedIndex = index; }}
        >
          <div className="icon-wrap"><Icon icon={item.icon} width={17} height={17} /></div>
          <div className="label">{t(item.title)}</div>
        </div>
      ))}
    </div>
  );
});
