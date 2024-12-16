import { useEffect } from 'react';
import { eventBus } from '@/lib/event';
import { EditorStore } from '../editorStore';
import { FocusEditorFixMobile, HandleFileType } from '../editorUtils';
import { BlinkoStore } from '@/store/blinkoStore';
import { handlePaste, usePasteFile } from '@/lib/hooks';
import { OnSendContentType } from '../type';
import Vditor from 'vditor';
import { ToolbarMobile, ToolbarPC } from '../EditorToolbar';
import { RootStore } from '@/store';
import { UserStore } from '@/store/user';
import { i18nEditor } from '../EditorToolbar/i18n';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'usehooks-ts';
import { Extend } from '../EditorToolbar/extends';

export const useEditorInit = (
  store: EditorStore,
  onChange: ((content: string) => void) | undefined,
  onSend: (args: OnSendContentType) => Promise<any>,
  mode: 'create' | 'edit',
  originReference: number[] = [],
  content: string,
) => {
  const { t } = useTranslation()
  const isPc = useMediaQuery('(min-width: 768px)')
  const blinko = RootStore.Get(BlinkoStore)
  useEffect(() => {
    const showToolbar = store.isShowEditorToolbar(isPc)
    if (store.vditor) {
      store.vditor?.destroy();
      store.vditor = null
    }

    const theme = RootStore.Get(UserStore).theme
    const vditor = new Vditor("vditor" + "-" + mode, {
      width: '100%',
      "toolbar": isPc ? ToolbarPC : ToolbarMobile,
      mode: isPc ? store.viewMode : (store.viewMode == 'wysiwyg' ? 'ir' : store.viewMode),
      theme,
      counter: {
        enable: true,
        type: 'markdown',
      },
      hint: {
        extend: Extend
      },
      async ctrlEnter(md) {
        await store.handleSend()
      },
      placeholder: t('i-have-a-new-idea'),
      i18n: {
        ...i18nEditor(t)
      },
      input: (value) => {
        onChange?.(value)
        store.handlePopAiWrite()
      },
      upload: {
        url: '/api/file/upload',
        success: (editor, res) => {
          console.log(res)
          const { fileName, filePath, type, size } = JSON.parse(res)
          store.handlePasteFile({
            fileName,
            filePath,
            type,
            size
          })
        },
        max: 1024 * 1024 * 1000,
        fieldName: 'file',
        multiple: false,
        linkToImgUrl: '/api/file/upload-by-url',
        linkToImgFormat(res) {
          const data = JSON.parse(res)
          const result = {
            msg: '',
            code: 0,
            data: {
              originalURL: data.originalURL,
              url: data.filePath,
            }
          }
          console.log(result)
          return JSON.stringify(result)
        }
      },
      undoDelay: 20,
      value: content,
      toolbarConfig: {
        hide: !showToolbar,
      },
      preview: {
        hljs: {
          style: theme === 'dark' ? 'github-dark' : 'github',
          lineNumber: true,
        },
        theme,
        delay: 20
      },
      after: () => {
        vditor.setValue(content);
        store.init({
          onChange,
          onSend,
          mode,
          vditor
        });
        isPc ? store.focus() : FocusEditorFixMobile()
      },
    });
    // Clear the effect
    return () => {
      store.vditor?.destroy();
      store.vditor = null;
    };

  }, [mode, blinko.config.value?.toolbarVisibility, store.viewMode, isPc]);

  useEffect(() => {
    store.references = originReference
    if (store.references.length > 0) {
      store.noteListByIds.call({ ids: store.references })
    }
  }, []);

};


export const useEditorEvents = (store: EditorStore) => {
  useEffect(() => {
    eventBus.on('editor:clear', store.clearMarkdown);
    eventBus.on('editor:insert', store.insertMarkdown);
    eventBus.on('editor:deleteLastChar', store.deleteLastChar);
    eventBus.on('editor:focus', store.focus);
    eventBus.on('editor:setViewMode', (mode) => {
      store.viewMode = mode
    });

    // handleEditorKeyEvents();
    store.handleIOSFocus();

    return () => {
      eventBus.off('editor:clear', store.clearMarkdown);
      eventBus.off('editor:insert', store.insertMarkdown);
      eventBus.off('editor:deleteLastChar', store.deleteLastChar);
      eventBus.off('editor:focus', store.focus);
      eventBus.off('editor:setViewMode', (mode) => {
        store.viewMode = mode
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

// export const useEditorPaste = (store: EditorStore, cardRef: React.RefObject<any>) => {
//   const pastedFiles = usePasteFile(cardRef);
//   useEffect(() => {
//     if (pastedFiles) {
//       store.uploadFiles(pastedFiles);
//     }
//   }, [pastedFiles]);
// };



export const useEditorHeight = (
  onHeightChange: (() => void) | undefined,
  blinko: BlinkoStore,
  content: string,
  store: EditorStore
) => {
  useEffect(() => {
    onHeightChange?.();
  }, [blinko.noteTypeDefault, content, store.files?.length, store.viewMode]);
}; 