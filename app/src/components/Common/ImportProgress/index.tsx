import { streamApi } from '@/lib/trpc'
import { type ProgressResult } from '@shared/lib/types'
import { RootStore } from '@/store'
import { BlinkoStore } from '@/store/blinkoStore'
import { DialogStore } from '@/store/module/Dialog'
import { Progress } from '@heroui/react'
import { observer } from 'mobx-react-lite'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

type ImportKind = 'markdown' | 'docx'

const TITLE_MAP: Record<ImportKind, string> = {
  markdown: 'Markdown Import Progress',
  docx: 'Word Import Progress',
}

export const ImportProgress = observer(({ filePath, kind = 'markdown' }: { filePath: string; kind?: ImportKind }) => {
  const { t } = useTranslation()
  const blinko = RootStore.Get(BlinkoStore)
  const store = RootStore.Local(() => ({
    progress: 0,
    total: 0,
    message: [] as ProgressResult[],
    status: '',
    get value() {
      const v = Math.round((store.progress / store.total) * 100)
      return isNaN(v) ? 0 : v
    },
    get isSuccess() { return store.status === 'success' },
    get isError() { return store.status === 'error' },
    handleAsyncGenerator: async () => {
      const asyncGen = async function* () {
        if (kind === 'markdown') {
          yield* await streamApi.task.importFromMarkdown.mutate({ filePath })
        } else {
          yield* await streamApi.task.importFromDocx.mutate({ filePath })
        }
      }
      for await (const item of asyncGen()) {
        store.progress = item.progress?.current ?? 0
        store.total = item.progress?.total ?? 0
        store.message.unshift(item)
        store.status = item.type === 'success' ? 'success' : 'error'
      }
      store.message.unshift({
        type: 'success',
        content: t('import-done'),
      })
      blinko.updateTicker++
    }
  }))

  useEffect(() => {
    store.handleAsyncGenerator()
  }, [])

  return <div>
    <Progress
      size="sm"
      radius="sm"
      color="warning"
      label={TITLE_MAP[kind]}
      value={store.value}
      showValueLabel={true}
    />
    <div className='flex flex-col max-h-[400px] overflow-y-auto mt-2'>
      {store.message.map((item, index) => (
        <div className='flex gap-2' key={index}>
          <div className={`${item.type === 'success' ? 'text-green-500' : item.type === 'error' ? 'text-red-500' : ''}`}>
            {item.type == 'skip' ? '🔄' : item.type == 'success' ? '✅' : '❌'}
          </div>
          <div className={`truncate text-gray-500`}>{item?.content}</div>
        </div>
      ))}
    </div>
  </div>
})

export const ShowImportProgressDialog = async (filePath: string, kind: ImportKind = 'markdown') => {
  RootStore.Get(DialogStore).setData({
    title: TITLE_MAP[kind],
    content: <ImportProgress filePath={filePath} kind={kind} />,
    isOpen: true,
    size: 'lg',
  })
}

// 保留旧 helper 以兼容现有调用
export const ShowMarkdownProgressDialog = async (filePath: string) => {
  return ShowImportProgressDialog(filePath, 'markdown')
}
