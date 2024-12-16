// blinko.public.value?.version

import { observer } from "mobx-react-lite";
import { Card, Tooltip } from "@nextui-org/react";
import { RootStore } from "@/store";
import { BlinkoStore } from "@/store/blinkoStore";
import { PromiseState } from "@/store/standard/PromiseState";
import { Icon } from "@iconify/react";
import { api } from "@/lib/trpc";
import { AiStore } from "@/store/aiStore";
import { useTranslation } from "react-i18next";
import { Item } from "./Item";
import { useEffect } from "react";
import { useMediaQuery } from "usehooks-ts";
import { CollapsibleCard } from "@/components/Common/CollapsibleCard";

export const AboutSetting = observer(() => {
  const blinko = RootStore.Get(BlinkoStore)
  const ai = RootStore.Get(AiStore)
  const { t } = useTranslation()
  const isPc = useMediaQuery('(min-width: 768px)')
  const store = RootStore.Local(() => ({
    version: new PromiseState({
      function: async () => {
        return await api.public.version.query()
      }
    }),
    latestVersion: new PromiseState({
      function: async () => {
        return await api.public.latestVersion.query()
      }
    })
  }))
  useEffect(() => {
    store.version.call()
    store.latestVersion.call()
  }, [])
  return <CollapsibleCard
    icon="tabler:info-circle"
    title={t('about')}
  >
    <Item
      leftContent={<>{t('version')}</>}
      rightContent={
        <div className="flex items-center" onClick={() => { }}>
          <div>v{store.version.value}</div>
          {
            store.latestVersion.value != '' && store.latestVersion.value != store.version.value && <Tooltip content={t('new-version-available')}>
              <Icon onClick={() => {
                window.open(`https://github.com/blinko-space/blinko`, '_blank')
              }} icon="mingcute:up-fill" width="24" height="24" className="text-green-500 cursor-pointer" />
            </Tooltip>
          }
        </div>} />
    <Item
      leftContent={<>Github</>}
      rightContent={<a href="https://github.com/blinko-space/blinko">https://github.com/blinko-space/blinko</a>} />
  </CollapsibleCard>
})