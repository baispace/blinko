import "vditor/dist/index.css";
import '@/styles/vditor.css';
import { RootStore } from '@/store';
import { useTheme } from 'next-themes';
import React, { ReactElement, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { observer, useLocalObservable } from 'mobx-react-lite';
import { OnSendContentType } from './type';
import { BlinkoStore } from '@/store/blinkoStore';
import { _ } from '@/lib/lodash';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'usehooks-ts';
import { type Attachment } from '@/server/types';
import { Card } from '@nextui-org/react';
import { AttachmentsRender, ReferenceRender } from '../AttachmentRender';
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
  useEditorHeight
} from './hooks/useEditor';
import { EditorStore } from "./editorStore";

//https://ld246.com/guide/markdown
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
  const cardRef = React.useRef(null)
  const isPc = useMediaQuery('(min-width: 768px)')
  const store = useLocalObservable(() => new EditorStore())
  const blinko = RootStore.Get(BlinkoStore)

  useEditorInit(store, onChange, onSend, mode, originReference, content);
  useEditorEvents(store);
  useEditorFiles(store, blinko, originFiles);
  useEditorHeight(onHeightChange, blinko, content, store);

  const {
    getRootProps,
    isDragAccept,
    getInputProps,
    open
  } = useDropzone({
    multiple: true,
    noClick: true,
    onDrop: acceptedFiles => {
      store.uploadFiles(acceptedFiles)
    },
    onDragOver: (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onDragEnter: (e) => {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  return <Card
    shadow='none' {...getRootProps()}
    className={`p-2 relative border-2 border-border transition-all  overflow-visible 
    ${isDragAccept ? 'border-2 border-green-500 border-dashed' : ''} `}>

    <div ref={cardRef}
      className="overflow-visible relative"
      onKeyDown={e => {
        console.log('onKeyDown')
        onHeightChange?.()
        if (isPc) return
        store.adjustMobileEditorHeight()
      }}>

      <div id={`vditor-${mode}`} className="vditor" />
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
        <HashtagButton store={store} content={content} />
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

