import { Icon } from '@/components/Common/Iconify/icons';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@heroui/react';
import { Popover, PopoverContent, PopoverTrigger } from '@heroui/react';
import { useEffect, useReducer, useState } from 'react';
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
export const UploadImageButton = ({ getInputProps, open, store }: {
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
    <IconButtonWrap tooltip={t('upload-file')} onClick={open} icon="tdesign:image">
      <input {...getInputProps()} />
    </IconButtonWrap>
  );
};

const IconButtonWrap = ({ tooltip, onClick, icon, children }: {
  tooltip: string, onClick: (e: any) => void, icon: string, children?: any
}) => (
  <Tooltip content={tooltip} placement="bottom" delay={300}>
    <div
      onClick={onClick}
      className="hover:bg-hover !transition-all duration-200 cursor-pointer rounded-md flex items-center justify-center w-[23px] h-[23px] text-default-600"
    >
      <Icon icon={icon} width={20} height={20} />
      {children}
    </div>
  </Tooltip>
);

/**
 * List toggle buttons (bullet / ordered) with active state.
 */
export const ListToggleButton = ({ editor, type }: { editor: Editor | null | undefined; type: 'bullet' | 'ordered' }) => {
  const { t } = useTranslation();
  useEditorTick(editor);
  if (!editor) return null;
  const isActive = type === 'bullet' ? editor.isActive('bulletList') : editor.isActive('orderedList');
  const onClick = () => {
    type === 'bullet'
      ? editor.chain().focus().toggleBulletList().run()
      : editor.chain().focus().toggleOrderedList().run();
  };
  return (
    <IconButtonWrap
      tooltip={t(type === 'bullet' ? 'bullet-list' : 'ordered-list')}
      onClick={onClick}
      icon={type === 'bullet' ? 'mdi:format-list-bulleted' : 'mdi:format-list-numbered'}
    />
  );
};

/**
 * Task list toggle button (Notion-style checkboxes) with active state.
 */
export const TaskListButton = ({ editor }: { editor: Editor | null | undefined }) => {
  const { t } = useTranslation();
  useEditorTick(editor);
  if (!editor) return null;
  const isActive = editor.isActive('taskList');
  const onClick = () => editor.chain().focus().toggleTaskList().run();
  return (
    <IconButtonWrap
      tooltip={t('task-list')}
      onClick={onClick}
      icon="mdi:format-list-checks"
    />
  );
};

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
 * Callout / highlight block button with a color + emoji picker popover.
 */
export const CalloutButton = ({ editor }: { editor: Editor | null | undefined }) => {
  const [open, setOpen] = useState(false);
  useEditorTick(editor);
  if (!editor) return null;

  const isActive = editor.isActive('callout');

  return (
    <Popover placement="bottom-start" isOpen={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <div
          className={`hover:bg-hover !transition-all duration-200 cursor-pointer rounded-md flex items-center justify-center w-[23px] h-[23px]
            ${isActive ? 'text-primary' : 'text-default-600'}`}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
        >
          <Icon icon="mdi:lightbulb-on-outline" width={20} height={20} />
        </div>
      </PopoverTrigger>
      <PopoverContent className="p-2 w-[224px]">
        <CalloutPickerContent editor={editor} />
      </PopoverContent>
    </Popover>
  );
};

/**
 * "Aa" format menu: headings / rich text marks / quote & code block.
 */
export const FormatMenuButton = ({ editor }: { editor: Editor | null | undefined }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
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
    <Popover placement="bottom-start" isOpen={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <div
          className="hover:bg-hover !transition-all duration-200 cursor-pointer rounded-md flex items-center justify-center w-[23px] h-[23px] text-default-600"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
        >
          <Icon icon="tabler:letter-case" width={20} height={20} />
        </div>
      </PopoverTrigger>
      <PopoverContent className="p-1.5 w-[168px]">
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
          onClick={() => state.selectCurrent()}
          onMouseEnter={() => { state.selectedIndex = index; }}
        >
          <div className="icon-wrap"><Icon icon={item.icon} width={17} height={17} /></div>
          <div className="label">{t(item.title)}</div>
        </div>
      ))}
    </div>
  );
});
