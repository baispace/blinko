import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { EditorDocumentSurface, EditorBubbleSurface } from './EditorSurface';
import type { Editor } from '@tiptap/core';
import { CellSelection } from '@tiptap/pm/tables';
import type { EditorStore } from '../editorStore';
import { SlashMenuView, useEditorTick } from './ToolbarButtons';
import { Tooltip } from '@heroui/react';
import { CalloutIconMenu } from './CalloutIconMenu';
import { TableToolbar } from './TableToolbar';
import { TableHandles } from './TableHandles'; // Feishu-style table controls
import { ImageToolbar } from './ImageToolbar'; // Feishu-style image controls
import { NoteMentionList } from './NoteMentionList'; // 输入 @ 时的笔记引用列表
import { HashtagList } from './HashtagList'; // 输入 # 时的标签建议列表
import { BlockComment } from './BlockComment'; // Block-level comment
import { Icon } from '@/components/Common/Iconify/icons';
import { SelectionColorPicker } from './SelectionColorPicker';
import './tiptap.css';
import './outline.css';

/**
 * Renders the Tiptap document + bubble menu + slash menu,
 * driven by the adapter stored on EditorStore.
 */
export const TiptapEditorContent = observer(({ store, readOnly = false, fill = false, pageScroll = false }: { store: EditorStore, readOnly?: boolean, fill?: boolean, pageScroll?: boolean }) => {
  const { t } = useTranslation();
  const adapter = store.vditor;
  const editor = adapter?.editor ?? null;
  useEditorTick(editor);
  useEffect(() => { if (adapter) adapter.noteMention.currentNoteId = store.noteId; }, [adapter, store.noteId]);

  if (!adapter || !editor) return null;

  /* pageScroll: the fullscreen reading/editing page scrolls at the window level
     (cover + title + body scroll away together, scrollbar at the viewport edge),
     so the editor body must grow naturally instead of scrolling internally. */
  return (
    <div className={`tiptap-wrap ${readOnly ? 'is-readonly' : ''} ${pageScroll ? 'page-scroll' : ''} ${!pageScroll && (fill || store.isFullscreen) ? 'flex-1 min-h-0 overflow-y-auto' : ''}`}>
      <EditorDocumentSurface editor={editor} />
      {/*
        这些浮层都不做条件卸载：Tiptap 的 BubbleMenu 在卸载时会去移除 tippy 节点，
        阅读态 ↔ 编辑态频繁切换容易触发 removeChild 崩溃。它们内部各自按
        editor.isEditable 决定是否显示，交给它们自己判断即可。
      */}
      <EditorBubbleSurface
        editor={editor}
        shouldShow={({ editor }) => {
          if (!editor || !editor.isEditable) return false;
          const inToolbar = !!document.activeElement?.closest('.tiptap-bubble');
          if (!editor.isFocused && !inToolbar) return false;
          const { selection } = editor.state;
          // 默认行为：只在真正选中了文本内容时才显示；空光标时不显示。
          if (selection.empty || selection instanceof CellSelection) return false;
          const node = (selection as any)?.node;
          // 选中图片时只显示图片专用工具栏，避免文本气泡和图片工具栏重叠
          return !(node?.type?.name === 'image' || node?.type?.name === 'table');
        }}
        tippyOptions={{ duration: 120, maxWidth: 'none', interactive: true, placement: 'top', offset: [0, 8] }}
      >
        <div className="tiptap-bubble" role="toolbar" aria-label="选中文字格式">
          <label className="bubble-block-select" title="将选中段落转换为正文或标题">
            <select aria-label="段落格式" value={editor.isActive('heading') ? String(editor.getAttributes('heading').level) : 'paragraph'}
              onChange={(event) => {
                const value = event.target.value;
                if (value === 'paragraph') editor.chain().focus().setParagraph().run();
                else editor.chain().focus().setHeading({ level: Number(value) as 1 | 2 | 3 }).run();
              }}>
              <option value="paragraph">正文</option>
              <option value="1">标题 1</option><option value="2">标题 2</option><option value="3">标题 3</option>
              {[4, 5, 6].map(level => <option key={level} value={level}>标题 {level}</option>)}
            </select>
          </label>
          <div className="bubble-divider" role="separator" />
          <BubbleBtn editor={editor} title={t('bold')} shortcut="Ctrl/⌘ B" icon="mdi:format-bold" active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()} />
          <BubbleBtn editor={editor} title={t('italic')} shortcut="Ctrl/⌘ I" icon="mdi:format-italic" active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()} />
          <BubbleBtn editor={editor} title={t('underline')} shortcut="Ctrl/⌘ U" icon="mdi:format-underline" active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()} />
          <BubbleBtn editor={editor} title={t('strike')} icon="mdi:format-strikethrough-variant" active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()} />
          <div className="bubble-divider" />
          <SelectionColorPicker editor={editor} />
          <BubbleBtn editor={editor} title={t('inline-code')} icon="mdi:code-tags" active={editor.isActive('code')}
            onClick={() => editor.chain().focus().toggleCode().run()} />
          <div className="bubble-divider" role="separator" />
          <BubbleBtn editor={editor} title="清除文字格式（保留段落结构）" icon="tabler:clear-formatting"
            onClick={() => editor.chain().focus().unsetAllMarks().run()} />
          </div>
      </EditorBubbleSurface>
      <SlashMenuView state={adapter.slashMenu} />
      {/* 两个 Suggestion 实例（@ 引用笔记、# 标签）共用这一个挂载点，
          只渲染其中之一会让另一个彻底失灵 */}
      <NoteMentionList state={adapter.noteMention} />
      <HashtagList state={adapter.hashtagMenu} />
      <BlockComment editor={editor} />
      <CalloutIconMenu editor={editor} />
      <TableToolbar editor={editor} />
      <TableHandles editor={editor} />
      <ImageToolbar editor={editor} store={store} />
    </div>
  );
});

const BubbleBtn = ({ title, icon, active, onClick, shortcut, label }: {
  editor: Editor; title: string; icon: string; active?: boolean; onClick: () => void; shortcut?: string; label?: string
}) => (
  <Tooltip content={<span>{title}{shortcut && <span className="ml-3 opacity-60">{shortcut}</span>}</span>} delay={250} placement="top">
    <button type="button" className={`${active ? 'is-active' : ''} ${label ? 'bubble-labeled' : ''}`}
      aria-label={title} aria-pressed={active} onMouseDown={(event) => event.preventDefault()} onClick={onClick}>
      <Icon icon={icon} width={18} height={18} />
      {label && <span>{label}</span>}
    </button>
  </Tooltip>
);
