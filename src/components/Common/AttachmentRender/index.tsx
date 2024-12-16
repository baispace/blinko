import React, { useEffect, useState } from 'react';
import { FileIcons } from '../FileIcon';
import { observer } from 'mobx-react-lite';
import { helper } from '@/lib/helper';
import { type Attachment } from '@/server/types';
import { FileType } from '../Editor/type';
import { DeleteIcon, DownloadIcon } from './icons';
import { ImageRender } from './imageRender';
import { HandleFileType } from '../Editor/editorUtils';
import { Icon } from '@iconify/react';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { Popover, PopoverContent, PopoverTrigger } from '@nextui-org/popover';
import { BlinkoCard } from '@/components/BlinkoCard';
import { api } from '@/lib/trpc';
import { PromiseState } from '@/store/standard/PromiseState';
import { cache } from '@/lib/cache';
import { reaction } from 'mobx';
import { EditorStore } from '../Editor/editorStore';

//https://www.npmjs.com/package/browser-thumbnail-generator

type IProps = {
  files: FileType[]
  preview?: boolean
  columns?: number
}

const AttachmentsRender = observer((props: IProps) => {
  const { files, preview = false, columns = 3 } = props
  return <>
    {/* image render  */}
    <ImageRender {...props} />
    {/* video render  todo:improve style*/}
    <div className={`columns-1 md:columns-1`}>
      {files?.filter(i => i.previewType == 'video').map((file, index) => (
        <div className='group relative flex p-2 items-center gap-2 cursor-pointer tansition-all rounded-2xl'>
          <video onDoubleClick={(e) => e.stopPropagation()} src={file.preview} id="player" playsInline controls className='rounded-2xl w-full z-0 max-h-[150px]' />
          {!file.uploadPromise?.loading?.value && !preview &&
            <DeleteIcon className='absolute z-10 right-[5px] top-[5px]' files={files} file={file} />
          }
          {preview && <DownloadIcon className='top-[8px] right-[8px]' file={file} />}
        </div>
      ))}
    </div>

    {/* audio render  todo:improve style*/}
    <div className={`columns-1 md:columns-1`}>
      {files?.filter(i => i.previewType == 'audio').map((file, index) => (
        <div className='group relative flex p-2 items-center gap-2 cursor-pointer tansition-all rounded-2xl'>
          <audio src={file.preview} id="player" playsInline controls className='rounded-2xl w-full' />
          {!file.uploadPromise?.loading?.value && !preview &&
            <DeleteIcon files={files} className='absolute z-10 right-[5px] top-[5px] group-hover:opacity-100 opacity-0' file={file} />
          }
          {preview && <DownloadIcon className='top-[8px] right-[8px]' file={file} />}
        </div>
      ))}
    </div >


    {/* other file render  */}
    <div className={`grid grid-cols-${(columns - 1) < 1 ? 1 : (columns - 1)} md:grid-cols-${columns} gap-2 mt-3 select-none`}>
      {files?.filter(i => i.previewType == 'other').map((file, index) => (
        <div onClick={() => {
          if (preview) {
            helper.download.downloadByLink(file.uploadPromise.value)
          }
        }} className='relative flex p-2 w-full items-center gap-2 cursor-pointer bg-sencondbackground hover:bg-hover tansition-all rounded-md group'>
          <FileIcons path={file.name} isLoading={file.uploadPromise?.loading?.value} />
          <div className='truncate text-sm font-bold'>{file.name}</div>
          {!file.uploadPromise?.loading?.value && !preview &&
            <DeleteIcon className='ml-auto group-hover:opacity-100 opacity-0' files={files} file={file} />}
        </div>
      ))}
    </div >
  </>
})

const FilesAttachmentRender = observer(({ files, preview, columns }: { files: Attachment[], preview?: boolean, columns?: number }) => {
  const [handledFiles, setFiles] = useState<FileType[]>([])
  useEffect(() => {
    setFiles(HandleFileType(files))
  }, [files])
  return <AttachmentsRender files={handledFiles} preview={preview} columns={columns} />
})


const ReferenceRender = observer(({ store }: { store: EditorStore }) => {
  return <div className='grid grid-cols-2 md:grid-cols-3 gap-2'>
    {
      store?.currentReferences?.map(i => {
        return <Popover placement="bottom">
          <PopoverTrigger>
            <div className="flex items-center gap-1 blinko-tag cursor-pointer hover:opacity-80 group">
              <Icon className="min-w-[24px] !text-[#C35AF7]" icon="uim:arrow-up-left" width="24" height="24" />
              <div className="truncate">{i.content}</div>
              <div onClick={(e) => {
                e.stopPropagation()
                store.noteListByIds.value = store.noteListByIds.value?.filter(t => i.id !== t.id)
                store.deleteReference(i.id)
              }} className={`group-hover:opacity-100 md:opacity-0 hover:opacity-100 cursor-pointer rounded-sm transition-al`}>
                <Icon icon="basil:cross-solid" width={20} height={20} />
              </div>
            </div>
          </PopoverTrigger>
          <PopoverContent className='max-w-[300px]'>
            <div className="px-1 py-2 max-w-[300px]" >
              <BlinkoCard blinkoItem={i} />
            </div>
          </PopoverContent>
        </Popover>
      })
    }
  </div>
})

export { AttachmentsRender, FilesAttachmentRender, ReferenceRender }

