import { follows } from "@/lib/prismaZodType"
import { api } from "@/lib/trpc"
import { RootStore } from "@/store"
import { DialogStore } from "@/store/module/Dialog"
import { PromiseCall } from "@/store/standard/PromiseState"
import { Icon } from "@iconify/react"

import { Button, Input, Link, user } from "@nextui-org/react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { UserAvatar } from "../BlinkoCard/commentButton"

export const BlinkoFollowDialog = observer(({ onConfirm }: { onConfirm: () => void }) => {
  const { t } = useTranslation()
  const store = RootStore.Local(() => ({
    siteUrl: '',
  }))
  return (
    <div>
      <Input
        value={store.siteUrl}
        onChange={(e) => store.siteUrl = e.target.value}
        label={t('site-url')} placeholder={"https://www.blinko.com"} endContent={
          <Button onPress={async () => {
            await PromiseCall(api.follows.follow.mutate({ siteUrl: store.siteUrl, mySiteUrl: window.location.origin }))
            onConfirm()
            RootStore.Get(DialogStore).close()
          }} size="sm" color="primary" radius="full" startContent={<Icon icon="fluent:people-add-32-regular" className="w-4 h-4" />}>
            {t('follow')}
          </Button>
        } />

      <div className="flex items-center gap-2 text-ignore text-bold mx-auto mt-4">
        Blinko Hub List (comming soon)
      </div>
    </div>
  )
})

export const BlinkoFollowingDialog = observer(({ data, onConfirm }: { data: follows[], onConfirm: () => void }) => {
  const { t } = useTranslation()
  return (
    <div>
      {data.map(item => (
        <div className="flex items-center gap-1 mt-2">
          <UserAvatar
            key={item.id}
            guestName={item.siteName}
            account={{
              image: item.siteAvatar
            }}
            size={35}
          />
          <div className="flex flex-col">
            <div>{item.siteName}</div>
            <Link href={item.siteUrl} target="_blank" className="text-blue-500 text-xs">{item.siteUrl}</Link>
          </div>
          <Button size="sm" className="ml-auto" startContent={<Icon icon="icon-park-twotone:people-delete" width="14" height="14" />} color='primary' onPress={() => {
            PromiseCall(api.follows.unfollow.mutate({ siteUrl: item.siteUrl, mySiteUrl: window.location.origin })).then(() => {
              onConfirm()
              RootStore.Get(DialogStore).close()
            })
          }}>
            {t('unfollow')}
          </Button>
        </div>
      ))}
    </div>
  )
})  