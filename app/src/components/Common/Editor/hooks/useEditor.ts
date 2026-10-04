import { useEffect } from 'react';
import { eventBus } from '@/lib/event';
import { EditorStore } from '../editorStore';
import { FocusEditorFixMobile, HandleFileType } from '../editorUtils';
import { BlinkoStore } from '@/store/blinkoStore';
import { OnSendContentType } from '../type';
import { RootStore } from '@/store';
import { AiStore } from '@/store/aiStore';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import i18n from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'usehooks-ts';
import { NoteType, toNoteTypeEnum } from '@shared/lib/types';
import { api } from '@/lib/trpc';
import { useSearchParams } from 'react-router-dom';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { ContentImage } from '../Tiptap/contentImage';
import { MarkdownTable, MarkdownTableCell, MarkdownTableHeader, TablePreserveHtml } from '../Tiptap/tableExtension';
import TableRow from '@tiptap/extension-table-row';
import { Markdown } from 'tiptap-markdown';
import { TiptapEditorAdapter } from '../Tiptap/adapter';
import { SlashCommand, SendShortcut, TaskListInputRules, AiPendingIndicator } from '../Tiptap/extensions';
import { Callout, CalloutClickOutside } from '../Tiptap/Callout';
import { MarkdownHardBreak } from '../Tiptap/markdownHardBreak';
import { MarkdownBlankLine, normalizeBlankLines } from '../Tiptap/markdownBlankLine';

export const useEditorInit = (
  store: EditorStore,
  onChange: ((content: string) => void) | undefined,
  onSend: (args: OnSendContentType) => Promise<any>,
  mode: 'create' | 'edit' | 'comment',
  originReference: number[] = [],
  content: string,
  /** 显式锁定类型（待办场景固定 TODO），非空时覆盖下方基于 searchParams 的推断 */
  fixedNoteType?: NoteType,
  /**
   * 是否可编辑。只读态与编辑态共用同一棵 Tiptap 树，只靠 setEditable 切换，
   * 这样「打开即阅读、点一下即编辑」不会重新 mount、不会丢光标、不会闪烁。
   */
  editable: boolean = true
) => {
  const { t } = useTranslation()
  const isPc = useMediaQuery('(min-width: 768px)')
  const blinko = RootStore.Get(BlinkoStore)
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const adapter = new TiptapEditorAdapter()
    const initialContent = normalizeBlankLines((content ?? '').replace(/\r\n/g, '\n'))

    const editor = new Editor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4, 5, 6] },
          // 自定义 MarkdownHardBreak 接管 hardBreak 序列化（输出裸 \n 而非 \\\n）。
          // 关闭默认避免与自定义扩展产生 duplicate name 警告。
          hardBreak: false,
          // 自定义 MarkdownBlankLine 接管 paragraph 序列化（空段落 → nbsp 占位行，
          // 解决「编辑器空行保存后消失」）。同样需要关闭默认避免 duplicate name。
          paragraph: false,
        }),
        MarkdownHardBreak,
        MarkdownBlankLine,
        Placeholder.configure({
          placeholder: t('i-have-a-new-idea'),
          showOnlyWhenEditable: true,
        }),
        TaskList,
        TaskItem.configure({
          nested: true,
          /**
           * 只读态勾选任务：Tiptap 默认会把这次勾选撤销。这里手动派发一次
           * transaction 让它真正落到文档里 —— onUpdate 随之触发，自动保存接手，
           * 于是「阅读时也能打勾」不需要先切进编辑态。
           */
          onReadOnlyChecked: (node, checked) => {
            const ed = adapter.editor
            if (!ed) return false
            let pos = -1
            ed.state.doc.descendants((n, p) => {
              if (pos === -1 && n === node) { pos = p; return false }
              return true
            })
            if (pos < 0) return false
            ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked }))
            return true
          },
        }),
        Callout,
        CalloutClickOutside,
        Highlight,
        Underline,
        Link.configure({ openOnClick: false, autolink: true }),
        // 正文图片：渲染时解析内部路径（CDN / ?token=），markdown 仍写原始路径
        ContentImage,
        MarkdownTable.configure({
          resizable: true,
          lastColumnResizable: true,
          allowTableNodeSelection: true,
        }),
        TableRow,
        MarkdownTableHeader,
        MarkdownTableCell,
        TablePreserveHtml,
        Markdown.configure({
          html: true,
          linkify: true,
          // breaks:true —— 决定「单个裸换行」在 markdown 往返中的处理。
          // 旧值 false 时：源码/Markdown 视图里回车、粘贴或 AI 生成产生的「单换行」(如 "A\nB")
          // 在 getMarkdown 序列化时会被折叠成一个空格（直接输出 "A B"），再打开即「换行没了」。
          // 段落(双换行 "A\n\nB") 与反斜杠续行硬换行 ("A\\\nB") 不受该选项影响，故问题只出现在单换行形态。
          // 改为 true 后：单换行被解析/序列化为硬换行并稳定保留，符合笔记类应用直觉；
          // 对已有的段落与反斜杠形态完全向后兼容（实测序列化结果不变）。
          breaks: true,
          transformPastedText: false,
          transformCopiedText: false,
        }),
        SlashCommand.configure({
          slashMenu: adapter.slashMenu,
          noteMention: adapter.noteMention,
          aiBridge: {
            run: (writeType, content, onComplete) => {
              const ai = RootStore.Get(AiStore)
              // writeStream funnels into a single shared writingResponseText;
              // a second concurrent run would interleave into the wrong block.
              if (ai.isLoading) {
                RootStore.Get(ToastPlugin).error(i18n.t('ai-writing-in-progress'))
                return
              }
              ai.writeStream(writeType, content, onComplete)
            },
            notify: (message) => RootStore.Get(ToastPlugin).error(i18n.t(message)),
            abort: () => RootStore.Get(AiStore).abortAiWrite(),
          },
        }),
        AiPendingIndicator,
        TaskListInputRules,
        // Edit mode has an onDone: ⌘+Enter should flush + close, not re-save.
        SendShortcut.configure({ onSend: () => (store.onDone ? store.handleDone() : store.handleSend()) }),
      ],
      content: initialContent,
      editable,
      editorProps: {
        // 粘贴/拖放的图片统一交给 store.uploadFiles：分流（闪念→附件，笔记→正文内联）
        // 只在那里按 noteType 判定一次，这里不做类型判断，避免规则分散。
        handlePaste: (_view, event) => {
          const files = Array.from(event.clipboardData?.files ?? [])
          if (files.length) {
            store.uploadFiles(files)
            return true
          }
          return false
        },
        handleDrop: (_view, event, _slice, moved) => {
          if (moved) return false
          const files = Array.from(event.dataTransfer?.files ?? [])
          if (files.length) {
            store.uploadFiles(files)
            return true
          }
          return false
        },
      },
      onUpdate: () => {
        onChange?.(adapter.getValue())
      },
    })

    adapter.editor = editor
    store.init({
      onChange,
      onSend,
      mode,
      vditor: adapter,
      // Edit mode edits an existing note, so icon/cover already stored in
      // metadata have to be visible in the header instead of starting blank.
      metadata: mode === 'create' ? {} : (blinko.curSelectedNote?.metadata ?? {}),
      noteId: mode === 'create' ? undefined : blinko.curSelectedNote?.id,
    })

    // Normalize initial markdown if serialization differs from source content
    if (adapter.getValue() !== initialContent) {
      adapter.setValue(initialContent)
    }

    // 只读态只是「不能输入」，不该抢焦点，否则会出现一个没有输入能力的空光标
    if (editable) {
      isPc ? store.focus() : FocusEditorFixMobile()
    }

    return () => {
      adapter.slashMenu.close()
      adapter.destroy()
      if (store.vditor === adapter) {
        store.vditor = null
      }
    }
  }, [mode, isPc]);

  useEffect(() => {
    store.references = originReference
    if (store.references.length > 0) {
      store.noteListByIds.call({ ids: store.references })
    }
  }, []);

  // Switching notes must repopulate icon/cover; the init effect above only
  // runs when mode/isPc change.
  useEffect(() => {
    if (mode === 'create') {
      store.metadata = {}
      store.noteId = undefined
      return
    }
    store.metadata = blinko.curSelectedNote?.metadata ?? {}
    store.noteId = blinko.curSelectedNote?.id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, blinko.curSelectedNote?.id]);

  useEffect(() => {
    if (mode == 'create') {
      if (fixedNoteType != null) {
        store.noteType = fixedNoteType
      } else if (searchParams.get('path') == 'notes') {
        store.noteType = NoteType.NOTE
      } else if (searchParams.get('path') == 'todo') {
        store.noteType = NoteType.TODO
      } else {
        store.noteType = NoteType.BLINKO
      }
      if (searchParams.get('tagId')) {
        try {
          api.tags.fullTagNameById.query({ id: Number(searchParams.get('tagId')) }).then(res => {
            store.currentTagLabel = res
          })
        } catch (error) {
          console.error(error)
        }
      } else {
        store.currentTagLabel = ''
      }
    } else {
      // curSelectedNote 可能尚未加载完成。此时 toNoteTypeEnum 会静默 fallback 成 BLINKO，
      // 导致图片被分流成附件而非直接插入正文。未就绪时先不赋值，等 id 变化后重新判定。
      const selectedNote = blinko.curSelectedNote
      if (selectedNote && selectedNote.type != null) {
        store.noteType = toNoteTypeEnum(selectedNote.type)
      }
    }
  }, [mode, searchParams.get('path'), searchParams.get('tagId'), fixedNoteType, blinko.curSelectedNote?.id]);

  // Update editor content when content prop changes (e.g. switching notes in edit mode)
  useEffect(() => {
    const adapter = store.vditor
    if (adapter?.editor && content !== undefined) {
      const incoming = normalizeBlankLines(content.replace(/\r\n/g, '\n'))
      const current = adapter.getValue()
      if (current !== incoming) {
        adapter.setValue(incoming)
      }
    }
  }, [content, store.vditor]);

  // 阅读态 ↔ 编辑态：同一棵树原地切换，不重建、不丢光标
  useEffect(() => {
    const ed = store.vditor?.editor
    if (!ed) return
    if (ed.isEditable !== editable) {
      ed.setEditable(editable)
    }
  }, [editable, store.vditor]);
};


export const useEditorEvents = (store: EditorStore) => {
  useEffect(() => {
    eventBus.on('editor:clear', store.clearMarkdown);
    eventBus.on('editor:insert', store.insertMarkdown);
    eventBus.on('editor:replace', store.replaceMarkdown);
    eventBus.on('editor:focus', store.focus);
    // Tiptap is WYSIWYG-only; keep the listener for backward compatibility
    eventBus.on('editor:setViewMode', () => { });
    eventBus.on('editor:setFullScreen', (value: boolean) => {
      store.setFullscreen(value);
    });
    store.handleIOSFocus();

    return () => {
      eventBus.off('editor:clear', store.clearMarkdown);
      eventBus.off('editor:insert', store.insertMarkdown);
      eventBus.off('editor:replace', store.replaceMarkdown);
      eventBus.off('editor:focus', store.focus);
      eventBus.off('editor:setViewMode', () => { });
      eventBus.off('editor:setFullScreen', (value: boolean) => {
        store.setFullscreen(value);
      });
    };
  }, []);
};

export const useEditorFiles = (
  store: EditorStore,
  blinko: BlinkoStore,
  originFiles?: any[],
) => {
  useEffect(() => {
    if (originFiles?.length) {
      store.files = HandleFileType(originFiles);
    }
  }, [originFiles]);
};

export const useEditorHeight = (
  onHeightChange: (() => void) | undefined,
  blinko: BlinkoStore,
  content: string,
  store: EditorStore
) => {
  useEffect(() => {
    onHeightChange?.();
  }, [store.noteType, content, store.files?.length]);
};
