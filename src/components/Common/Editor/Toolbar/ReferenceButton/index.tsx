import { Icon } from '@iconify/react'
import { Input, Popover, PopoverContent, PopoverTrigger, Skeleton } from '@nextui-org/react'
import { observer } from 'mobx-react-lite'
import dayjs from 'dayjs'
import { IconButton } from '../IconButton'
import { ScrollArea } from '../../../ScrollArea'
import { BlinkoStore } from '@/store/blinkoStore'
import { RootStore } from '@/store'
import { EditorStore } from '../../editorStore'
import { useEffect } from 'react'

interface Props {
  store: EditorStore
}

export const ReferenceButton = observer(({ store }: Props) => {
  const blinko = RootStore.Get(BlinkoStore)
  useEffect(() => {
    blinko.referenceSearchList.resetAndCall({ searchText: ' ' })
  }, [])
  return (
    <Popover
      placement="bottom"
      isOpen={store.isShowSearch}
      onOpenChange={store.setIsShowSearch}
    >
      <PopoverTrigger>
        <div>
          <IconButton
            tooltip="@"
            icon="hugeicons:at"
            onClick={e => {
              blinko.referenceSearchList.resetAndCall({ searchText: ' ' })
            }}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent className='flex flex-col max-w-[300px]'>
        <Input
          onChange={e => store.handleSearch(e.target.value)}
          type='text'
          autoFocus
          className='w-full my-2 focus:outline-none focus:ring-0'
          placeholder='Search'
          size='sm'
        />
        <ScrollArea
          className='max-h-[400px] max-w-[290px] flex flex-col gap-1 p-2'
          onBottom={() => { blinko.referenceSearchList.callNextPage({}) }}
        >
          {blinko.referenceSearchList && blinko.referenceSearchList?.value?.map(i => {
            return (
              <div
                key={i.id}
                className={`flex flex-col w-full bg-background hover:bg-hover rounded-md cursor-pointer  p-1
                ${(store.references?.includes(i.id!) || i.id == blinko.curSelectedNote?.id) ? 'opacity-50 not-allowed' : ''}`}
                onClick={e => {
                  if (store.references?.includes(i.id!)) return
                  store.addReference(i.id!)
                  store.setIsShowSearch(false)
                }}
              >
                <div className='flex flex-col w-full p-1'>
                  <div className='text-xs text-desc'>
                    {blinko.config.value?.timeFormat == 'relative'
                      ? dayjs(blinko.config.value?.isOrderByCreateTime ? i.createdAt : i.updatedAt).fromNow()
                      : dayjs(blinko.config.value?.isOrderByCreateTime ? i.createdAt : i.updatedAt).format(blinko.config.value?.timeFormat ?? 'YYYY-MM-DD HH:mm:ss')
                    }
                  </div>
                  <div className='text-sm line-clamp-2'>
                    {i.content}
                  </div>
                </div>
              </div>
            )
          })}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}) 