import '@mdxeditor/editor/style.css';
import '@/styles/editor.css';
import { RootStore } from '@/store';
import { useTheme } from 'next-themes';
import React, { ReactElement, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { observer, useLocalObservable } from 'mobx-react-lite';
import { OnSendContentType, TranslationEditor } from './type';
import { MyPlugins, ProcessCodeBlocks } from './editorPlugins';
import { BlinkoStore } from '@/store/blinkoStore';
import { _ } from '@/lib/lodash';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'usehooks-ts';
import { type Attachment } from '@/server/types';
import { BlockTypeSelect, BoldItalicUnderlineToggles, ChangeCodeMirrorLanguage, ConditionalContents, CreateLink, InsertCodeBlock, InsertImage, InsertSandpack, InsertTable, ListsToggle, MDXEditorMethods, ShowSandpackInfo, toolbarPlugin, ViewMode } from '@mdxeditor/editor';
import { Card } from '@nextui-org/react';
import { AttachmentsRender, ReferenceRender } from '../AttachmentRender';
import { EditorStore } from './editorStore';
import { UploadButtons } from './Toolbar/UploadButtons';
import { ReferenceButton } from './Toolbar/ReferenceButton';
import { NoteTypeButton } from './Toolbar/NoteTypeButton';
import { HashtagButton } from './Toolbar/HashtagButton';
import { ViewModeButton } from './Toolbar/ViewModeButton';
import { SendButton } from './Toolbar/SendButton';
import {
  useEditorInit,
  useEditorEvents,
  useEditorFiles,
  useEditorPaste,
  useEditorHeight
} from './hooks/useEditor';

const { MDXEditor } = await import('@mdxeditor/editor')

// https://mdxeditor.dev/editor/docs/theming
// https://react-dropzone.js.org/
type IProps = {
  mode: 'create' | 'edit',
  content: string,
  onChange?: (content: string) => void,
  onHeightChange?: () => void,
  onSend: (args: OnSendContentType) => Promise<any>,
  isSendLoading?: boolean,
  bottomSlot?: ReactElement<any, any>,
  originFiles?: Attachment[],
  originReference?: number[],
}

const Editor = observer(({ content, onChange, onSend, isSendLoading, originFiles, originReference = [], mode, onHeightChange }: IProps) => {
  content = ProcessCodeBlocks(content)
  const { t } = useTranslation()
  const isPc = useMediaQuery('(min-width: 768px)')
  const { theme } = useTheme();

  const mdxEditorRef = useRef<MDXEditorMethods>(null)
  const cardRef = React.useRef(null)

  const store = useLocalObservable(() => new EditorStore())
  const blinko = RootStore.Get(BlinkoStore)

  useEditorInit(store, mdxEditorRef, onChange, onSend, mode, originReference);
  useEditorEvents(store);
  useEditorFiles(store, blinko, originFiles);
  useEditorPaste(store, cardRef);
  useEditorHeight(onHeightChange, blinko, content, store.files);

  const {
    getRootProps,
    isDragAccept,
    getInputProps,
    open
  } = useDropzone({ multiple: true, noClick: true, onDrop: acceptedFiles => { store.uploadFiles(acceptedFiles) } });

  return <Card
    shadow='none' {...getRootProps()}
    className={`p-2 relative border-2 border-border transition-all
    ${isDragAccept ? 'border-2 border-green-500 border-dashed' : ''} 
    ${store.viewMode == 'source' ? 'border-red-500' : ''}`}>

    <div ref={cardRef}
      onKeyUp={async event => {
        event.preventDefault();
        if (event.key === 'Enter' && event.ctrlKey) {
          await store.handleSend()
        }
      }}
      onKeyDown={e => {
        onHeightChange?.()
      }}>
      <MDXEditor
        translation={(key, defaultValue, interpolations) => TranslationEditor(key, defaultValue, interpolations, t)}
        ref={mdxEditorRef}
        placeholder={t('i-have-a-new-idea')}
        className={theme == 'dark' ? "dark-theme dark-editor" : ''}
        contentEditableClassName='prose'
        onChange={v => {
          onChange?.(v)
          store.handlePopTag()
          store.handlePopAiWrite()
        }}
        autoFocus={{
          defaultSelection: 'rootEnd'
        }}
        markdown={content}
        plugins={[
          toolbarPlugin({
            toolbarContents: () => (
              <div className='flex flex-col w-full'>
                {
                  (() => {
                    const visibility = blinko.config.value?.toolbarVisibility;
                    if (visibility === 'always-hide-toolbar') return null;
                    if (visibility === 'hide-toolbar-on-mobile' && !isPc) return null;
                    
                    return (
                      <div className='flex w-full items-center'>
                        {/******************** Insert List *****************/}
                        <ListsToggle />
                        {isPc && <BoldItalicUnderlineToggles />}
                        <InsertTable />
                        <InsertImage />
                        {/* <CreateLink /> */}
                        {/******************** Insert Code *****************/}
                        <ConditionalContents
                          options={[
                            { when: (editor) => editor?.editorType === 'codeblock', contents: () => <ChangeCodeMirrorLanguage /> },
                            { when: (editor) => editor?.editorType === 'sandpack', contents: () => <ShowSandpackInfo /> },
                            {
                              fallback: () => (<>
                                <InsertCodeBlock />
                                <InsertSandpack />
                              </>)
                            }
                          ]}
                        />
                        {isPc && <BlockTypeSelect />}
                        <div className={`${store.viewMode == 'source' ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-[-5px]'} font-bold  ml-auto text-red-500 text-xs select-none transition-all duration-300 ease-in-out`}>
                          {t('source-code-mode')}
                        </div>
                      </div>
                    )
                  })()
                }
              </div>
            )
          }),
          ...MyPlugins
        ]}
      />

      {/******************** AttchMent Render *****************/}
      {store.files.length > 0 && (
        <div className='w-full my-2'>
          <AttachmentsRender files={store.files} />
        </div>
      )}

      <div className='w-full mb-2'>
        <ReferenceRender store={store} />
      </div>

      {/******************** Toolbar Render *****************/}
      <div className='flex w-full items-center gap-1'>
        <NoteTypeButton />
        <HashtagButton store={store} />
        <ReferenceButton store={store} />
        <UploadButtons
          getInputProps={getInputProps}
          open={open}
          onFileUpload={store.uploadFiles}
        />
        <ViewModeButton viewMode={store.viewMode} />
        <SendButton store={store} isSendLoading={isSendLoading} />
      </div>
    </div>
  </Card >
})

export default Editor

