import { Icon } from '@iconify/react';
import React from 'react';
import { observer } from 'mobx-react-lite';
import { RootStore } from '@/store';
import { TipsPopover } from '@/components/Common/TipsDialog';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { DialogStore } from '@/store/module/Dialog';
import { useTranslation } from 'react-i18next';
import { PromiseState } from '@/store/standard/PromiseState';
import { BlinkoStore } from '@/store/blinkoStore';
import { helper } from '@/lib/helper';
import { FileType } from '../Editor/type';
import { DialogStandaloneStore } from '@/store/module/DialogStandalone';

export const DeleteIcon = observer(({ className, file, files, size = 20 }: { className: string, file: FileType, files: FileType[], size?: number }) => {
  const store = RootStore.Local(() => ({
    deleteFile: new PromiseState({
      function: async (file) => {
        await fetch('/api/file/delete', {
          method: 'POST',
          body: JSON.stringify({ attachment_path: file.uploadPromise?.value }),
        });
        const index = files.findIndex(i => i.name == file.name)
        files.splice(index, 1)
        RootStore.Get(DialogStandaloneStore).close()
        RootStore.Get(ToastPlugin).success(t('delete-success'))
        RootStore.Get(BlinkoStore).updateTicker++
      }
    })
  }))

  const { t } = useTranslation()
  return <>
    <TipsPopover isLoading={store.deleteFile.loading.value} content={t('this-operation-will-be-delete-resource-are-you-sure')}
      onConfirm={async e => {
        store.deleteFile.call(file)
      }}>
      <div className={`opacity-70 hover:opacity-100 bg-black cursor-pointer rounded-sm transition-al ${className}`}>
        <Icon className='!text-white' icon="basil:cross-solid" width={size} height={size} />
      </div>
    </TipsPopover >
  </>
})

export const DownloadIcon = observer(({ className, file, size = 20 }: { className?: string, file: FileType, size?: number }) => {
  return <div className={`hidden p-1 group-hover:block transition-all absolute z-10 right-[5px] top-[5px] !text-background opacity-70 hover:opacity-100 !bg-foreground cursor-pointer rounded-sm transition-all ${className}`}>
    <Icon onClick={() => {
      helper.download.downloadByLink(file.uploadPromise.value)
    }} icon="tabler:download" width="15" height="15" />
  </div>
})
