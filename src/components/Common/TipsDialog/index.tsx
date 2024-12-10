import { RootStore } from "@/store"
import { DialogStore } from "@/store/module/Dialog"
import { Icon } from "@iconify/react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Popover, PopoverTrigger, PopoverContent, Button } from "@nextui-org/react";

const TipsDialog = observer(({ content, onConfirm }: any) => {
  const { t } = useTranslation()
  return <div className='flex flex-col'>
    <div className='flex gap-4 items-center '>
      <div className="ml-4">{content}</div>
    </div>
    <div className='flex my-4 gap-4'>
      <Button className="ml-auto" color='default'
        onPress={e => {
          RootStore.Get(DialogStore).close()
        }}>{t('cancel')}</Button>
      <Button color='danger' onPress={async e => {
        onConfirm?.()
      }}>{t('confrim')}</Button>
    </div>
  </div>
})

export const showTipsDialog = async (props: { title: string, content: string, onConfirm }) => {
  RootStore.Get(DialogStore).setData({
    isOpen: true,
    onlyContent: false,
    size: 'xl',
    title: props.title,
    content: <TipsDialog {...props} />
  })
}

export const TipsPopover = observer((props: { children: React.ReactNode, content, onConfirm, isLoading?: boolean }) => {
  const { t } = useTranslation()
  const { isLoading = false } = props
  return <Popover placement="bottom" showArrow={true}>
    <PopoverTrigger>
      {props.children}
    </PopoverTrigger>
    <PopoverContent>
      <div className="px-1 py-2 flex flex-col">
        <div className='text-yellow-500 '>
          <div className="font-bold">{props.content}</div>
        </div>
        <div className='flex my-1 gap-2'>
          <Button size="sm" className="ml-auto" color='default' onPress={e => {
            RootStore.Get(DialogStore).close()
          }}>{t('cancel')}</Button>
          <Button isLoading={isLoading} size="sm" color='danger' onPress={async e => {
            props.onConfirm?.()
          }}>{t('confirm')}</Button>
        </div>
      </div>
    </PopoverContent>
  </Popover>
})