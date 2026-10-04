import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { EditorContent, BubbleMenu } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import type { EditorStore } from '../editorStore';
import { SlashMenuView } from './ToolbarButtons';
import { CalloutIconMenu } from './CalloutIconMenu';
import { TableToolbar } from './TableToolbar';
import { TableHandles } from './TableHandles'; // Feishu-style table controls
import { ImageToolbar } from './ImageToolbar'; // Feishu-style image controls
import { NoteMentionList } from './NoteMentionList'; // Note mention popup
import { BlockComment } from './BlockComment'; // Block-level comment
import { Icon } from '@/components/Common/Iconify/icons';
import './tiptap.css';

/**
 * Renders the Tiptap document + bubble menu + slash menu,
 * driven by the adapter stored on EditorStore.
 */
export const TiptapEditorContent = observer(({ store, readOnly = false, fill = false, pageScroll = false }: { store: EditorStore, readOnly?: boolean, fill?: boolean, pageScroll?: boolean }) => {
  const { t } = useTranslation();
  const adapter = store.vditor;
  const editor = adapter?.editor ?? null;

  if (!adapter || !editor) return null;

  /* pageScroll: the fullscreen reading/editing page scrolls at the window level
     (cover + title + body scroll away together, scrollbar at the viewport edge),
     so the editor body must grow naturally instead of scrolling internally. */
  return (
    <div className={`tiptap-wrap ${readOnly ? 'is-readonly' : ''} ${pageScroll ? 'page-scroll' : ''} ${!pageScroll && (fill || store.isFullscreen) ? 'flex-1 min-h-0 overflow-y-auto' : ''}`}>
      <EditorContent editor={editor} />
      {/*
        这些浮层都不做条件卸载：Tiptap 的 BubbleMenu 在卸载时会去移除 tippy 节点，
        阅读态 ↔ 编辑态频繁切换容易触发 removeChild 崩溃。它们内部各自按
        editor.isEditable 决定是否显示，交给它们自己判断即可。
      */}
      <BubbleMenu
        editor={editor}
        shouldShow={({ editor }) => {
          if (!editor) return false;
          const { selection } = editor.state;
          // 默认行为：只在真正选中了文本内容时才显示；空光标时不显示。
          if (selection.empty) return false;
          const node = (selection as any)?.node;
          // 选中图片时只显示图片专用工具栏，避免文本气泡和图片工具栏重叠
          return !(node?.type?.name === 'image');
        }}
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
      <NoteMentionList state={adapter.noteMention} />
      <BlockComment editor={editor} />
      <CalloutIconMenu editor={editor} />
      <TableToolbar editor={editor} />
      <TableHandles editor={editor} />
      <ImageToolbar editor={editor} store={store} />
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
