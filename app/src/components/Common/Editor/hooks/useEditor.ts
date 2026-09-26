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
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { Markdown } from 'tiptap-markdown';
import { TiptapEditorAdapter } from '../Tiptap/adapter';
import { SlashCommand, SendShortcut, TaskListInputRules } from '../Tiptap/extensions';
import { Callout, CalloutClickOutside } from '../Tiptap/Callout';

export const useEditorInit = (
  store: EditorStore,
  onChange: ((content: string) => void) | undefined,
  onSend: (args: OnSendContentType) => Promise<any>,
  mode: 'create' | 'edit' | 'comment',
  originReference: number[] = [],
  content: string
) => {
  const { t } = useTranslation()
  const isPc = useMediaQuery('(min-width: 768px)')
  const blinko = RootStore.Get(BlinkoStore)
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const adapter = new TiptapEditorAdapter()
    const initialContent = (content ?? '').replace(/\r\n/g, '\n')

    const editor = new Editor({
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
        Placeholder.configure({
          placeholder: t('i-have-a-new-idea'),
          showOnlyWhenEditable: true,
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Callout,
        CalloutClickOutside,
        Highlight,
        Underline,
        Link.configure({ openOnClick: false, autolink: true }),
        Image,
        Table.configure({ resizable: false }),
        TableRow,
        TableHeader,
        TableCell,
        Markdown.configure({
          html: true,
          linkify: true,
          breaks: false,
          transformPastedText: false,
          transformCopiedText: false,
        }),
        SlashCommand.configure({
          slashMenu: adapter.slashMenu,
          aiRunner: (writeType, content, onComplete) => {
            const ai = RootStore.Get(AiStore)
            // writeStream funnels into a single shared writingResponseText;
            // a second concurrent run would interleave into the wrong block.
            if (ai.isLoading) {
              RootStore.Get(ToastPlugin).error(i18n.t('ai-writing-in-progress'))
              return
            }
            ai.writeStream(writeType, content, onComplete)
          },
        }),
        TaskListInputRules,
        SendShortcut.configure({ onSend: () => store.handleSend() }),
      ],
      content: initialContent,
      editorProps: {
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
    store.init({ onChange, onSend, mode, vditor: adapter })

    // Normalize initial markdown if serialization differs from source content
    if (adapter.getValue() !== initialContent) {
      adapter.setValue(initialContent)
    }

    isPc ? store.focus() : FocusEditorFixMobile()

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

  useEffect(() => {
    if (mode == 'create') {
      if (searchParams.get('path') == 'notes') {
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
      store.noteType = toNoteTypeEnum(blinko.curSelectedNote?.type)
    }
  }, [mode, searchParams.get('path'), searchParams.get('tagId')]);

  // Update editor content when content prop changes (e.g. switching notes in edit mode)
  useEffect(() => {
    const adapter = store.vditor
    if (adapter?.editor && content !== undefined) {
      const incoming = content.replace(/\r\n/g, '\n')
      const current = adapter.getValue()
      if (current !== incoming) {
        adapter.setValue(incoming)
      }
    }
  }, [content, store.vditor]);
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
      console.log({ originFiles })
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
