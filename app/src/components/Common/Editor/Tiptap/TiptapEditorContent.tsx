import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'usehooks-ts';
import { EditorContent, BubbleMenu } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import type { EditorStore } from '../editorStore';
import { DragHandle } from './DragHandle';
import { SlashMenuView } from './ToolbarButtons';
import { CalloutIconMenu } from './CalloutIconMenu';
import { Icon } from '@/components/Common/Iconify/icons';
import './tiptap.css';

/**
 * Renders the Tiptap document + drag handle + bubble menu + slash menu,
 * driven by the adapter stored on EditorStore.
 */
export const TiptapEditorContent = observer(({ store }: { store: EditorStore }) => {
  const { t } = useTranslation();
  const pc = useMediaQuery('(min-width: 768px)');
  const adapter = store.vditor;
  const editor = adapter?.editor ?? null;

  if (!editor) return null;

  return (
    <div className={`tiptap-wrap ${store.isFullscreen ? 'flex-1 min-h-0 overflow-y-auto' : ''}`}>
      <EditorContent editor={editor} />
      {pc && <DragHandle editor={editor} />}
      <BubbleMenu
        editor={editor}
        tippyOptions={{ duration: 120, maxWidth: 'none' }}
      >
        <div className="tiptap-bubble">
          <BubbleBtn editor={editor} title={t('bold')} icon="mdi:format-bold" active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()} />
          <BubbleBtn editor={editor} title={t('italic')} icon="mdi:format-italic" active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()} />
          <BubbleBtn editor={editor} title={t('underline')} icon="mdi:format-underline" active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()} />
          <BubbleBtn editor={editor} title={t('strike')} icon="mdi:format-strikethrough-variant" active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()} />
          <div className="bubble-divider" />
          <BubbleBtn editor={editor} title={t('highlight')} icon="mdi:format-color-highlight" active={editor.isActive('highlight')}
            onClick={() => editor.chain().focus().toggleHighlight().run()} />
          <BubbleBtn editor={editor} title={t('inline-code')} icon="mdi:code-tags" active={editor.isActive('code')}
            onClick={() => editor.chain().focus().toggleCode().run()} />
        </div>
      </BubbleMenu>
      <SlashMenuView state={adapter.slashMenu} />
      <CalloutIconMenu editor={editor} />
    </div>
  );
});

const BubbleBtn = ({ editor, title, icon, active, onClick }: {
  editor: Editor; title: string; icon: string; active?: boolean; onClick: () => void
}) => (
  <button
    className={active ? 'is-active' : ''}
    title={title}
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
  >
    <Icon icon={icon} width={15} height={15} />
  </button>
);
