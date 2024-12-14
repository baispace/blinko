import { useEffect } from 'react';
import { eventBus } from '@/lib/event';
import { EditorStore } from '../editorStore';
import { handleEditorKeyEvents } from '../editorUtils';
import { HandleFileType } from '../editorUtils';
import { BlinkoStore } from '@/store/blinkoStore';
import { usePasteFile } from '@/lib/hooks';
import { OnSendContentType } from '../type';
import Vditor from 'vditor';
import { ToolbarPC } from '../EditorToolbar';
import { useTheme } from 'next-themes';
import { RootStore } from '@/store';
import { BaseStore } from '@/store/baseStore';
import { UserStore } from '@/store/user';

export const useEditorInit = (
  store: EditorStore,
  onChange: ((content: string) => void) | undefined,
  onSend: (args: OnSendContentType) => Promise<any>,
  mode: 'create' | 'edit',
  originReference: number[] = [],
  content: string,
) => {
  // useEffect(() => {
  //   store.init({
  //     onChange,
  //     onSend,
  //     mode,
  //   });
  // }, [onChange, mode, mdxEditorRef.current]);

  useEffect(() => {
    if (store.vditor) return
    const theme = RootStore.Get(UserStore).theme
    const vditor = new Vditor("vditor" + "-" + mode, {
      width: '100%',
      "toolbar": ToolbarPC,
      mode: 'wysiwyg',
      hint: {
        extend: [
          {
            key: '#',
            hint: (key) => {
              console.log(key)
              if ('vditor'.indexOf(key.toLocaleLowerCase()) > -1) {
                return [
                  {
                    value: '#Vditor ',
                    html: '<span style="color: #999;">#Vditor</span> ♏ ',
                  }]
              }
              return []
            },
          }
        ]
      },
      theme,
      counter: {
        enable: true,
        type: 'markdown',
      },
      lang: 'zh_CN',
      // i18n: {

      // },
      input: (value) => {
        console.log(value)
        onChange?.(value)
      },
      value: content,
      toolbarConfig: {
        // hide: true,
      },
      preview: {
        hljs: {
          style: theme === 'dark' ? 'github-dark' : 'github',
          lineNumber: true,
        },
        theme,
      },
      after: () => {
        vditor.setValue(`
  \`\`\`javascript
  const a = 1;
          const b = 2
          function test() {
  
          }
  \`\`\`
            `);
        console.log(vditor);
        store.init({
          onChange,
          onSend,
          mode,
          vditor
        });
      },
    });
    // Clear the effect
    return () => {
      store.vditor?.destroy();
      store.vditor = null;
    };

  }, [mode]);

  useEffect(() => {
    store.references = originReference
    if (store.references.length > 0) {
      store.noteListByIds.call({ ids: store.references })
    }
  }, []);

};

export const useEditorEvents = (store: EditorStore) => {
  useEffect(() => {
    eventBus.on('editor:replace', store.replaceMarkdownTag);
    eventBus.on('editor:clear', store.clearMarkdown);
    eventBus.on('editor:insert', store.insertMarkdownByEvent);
    eventBus.on('editor:deleteLastChar', store.deleteLastChar);
    eventBus.on('editor:focus', store.focus);
    eventBus.on('editor:setMarkdownLoading', store.setMarkdownLoading);
    eventBus.on('editor:setViewMode', (mode) => store.viewMode = mode);

    handleEditorKeyEvents();
    store.handleIOSFocus();

    return () => {
      eventBus.off('editor:replace', store.replaceMarkdownTag);
      eventBus.off('editor:clear', store.clearMarkdown);
      eventBus.off('editor:insert', store.insertMarkdownByEvent);
      eventBus.off('editor:deleteLastChar', store.deleteLastChar);
      eventBus.off('editor:focus', store.focus);
      eventBus.off('editor:setMarkdownLoading', store.setMarkdownLoading);
      eventBus.off('editor:setViewMode', (mode) => store.viewMode = mode);
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

export const useEditorPaste = (store: EditorStore, cardRef: React.RefObject<any>) => {
  const pastedFiles = usePasteFile(cardRef);

  useEffect(() => {
    if (pastedFiles) {
      store.uploadFiles(pastedFiles);
    }
  }, [pastedFiles]);
};

export const useEditorHeight = (
  onHeightChange: (() => void) | undefined,
  blinko: BlinkoStore,
  content: string,
  files: any[]
) => {
  useEffect(() => {
    onHeightChange?.();
  }, [blinko.noteTypeDefault, content, files?.length]);
}; 