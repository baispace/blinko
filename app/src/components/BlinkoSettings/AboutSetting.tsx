// blinko.public.value?.version

import { observer } from "mobx-react-lite";
import { Link, Image, Chip } from "@heroui/react";
import { RootStore } from "@/store";
import { PromiseState } from "@/store/standard/PromiseState";
import { Icon } from '@/components/Common/Iconify/icons';
import { api } from "@/lib/trpc";
import { useTranslation } from "react-i18next";
import { Item } from "./Item";
import { useEffect } from "react";
import { CollapsibleCard } from "@/components/Common/CollapsibleCard";
import packageJson from '../../../src-tauri/tauri.conf.json';

export const AboutSetting = observer(() => {
  const { t } = useTranslation()
  const store = RootStore.Local(() => ({
    serverVersion: new PromiseState({
      function: async () => {
        return await api.public.serverVersion.query()
      }
    }),
    latestServerVersion: new PromiseState({
      function: async () => {
        return await api.public.latestServerVersion.query()
      }
    }),
    latestClientVersion: new PromiseState({
      function: async () => {
        return await api.public.latestClientVersion.query()
      }
    })
  }))

  useEffect(() => {
    store.serverVersion.call()
    store.latestServerVersion.call()
    store.latestClientVersion.call()
  }, [])

  return (
    <CollapsibleCard
      icon="tabler:info-circle"
      title={t('about')}
    >
      <div className="flex items-start space-x-4 mb-6">
        <Image src="/logo.svg" alt="Blinko" className="w-16 h-16 rounded-xl" />
        <div>
          <h2 className="text-xl font-semibold">Blinko</h2>
          <div className="flex flex-col gap-2 mt-1">
            <div className="flex items-center gap-2">
              <Chip
                color="warning"
                variant="flat"
                size="sm"
                className="text-xs"
                startContent={<Icon icon="mingcute:version-fill" width="16" height="16" />}
              >
                {t('server')}: v{store.serverVersion.value}
              </Chip>
              {store.latestServerVersion.value != '' && store.latestServerVersion.value != store.serverVersion.value && (
                <Chip
                  classNames={{
                    base: "bg-gradient-to-br from-indigo-500 to-pink-500 border-small border-white/50 shadow-pink-500/30",
                    content: "drop-shadow shadow-black text-white",
                  }}
                  size="sm"
                  className="cursor-pointer"
                  onClick={() => {
                    window.open(`https://hub.docker.com/r/blinkospace/blinko/tags`, '_blank')
                  }}
                >
                  {t('new-server-version-available')}: v{store.latestServerVersion.value}
                </Chip>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Chip
                color="primary"
                variant="flat"
                size="sm"
                className="text-xs"
                startContent={<Icon icon="mingcute:version-fill" width="16" height="16" />}
              >
                {t('client')}: v{packageJson.version}
              </Chip>
              {store.latestClientVersion.value != '' && store.latestClientVersion.value != packageJson.version && (
                <Chip
                  classNames={{
                    base: "bg-gradient-to-br from-indigo-500 to-pink-500 border-small border-white/50 shadow-pink-500/30",
                    content: "drop-shadow shadow-black text-white",
                  }}
                  size="sm"
                  className="cursor-pointer"
                  onClick={() => {
                    window.open(`https://github.com/blinko-space/blinko/releases`, '_blank')
                  }}
                >
                  {t('new-client-version-available')}: v{store.latestClientVersion.value}
                </Chip>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-medium text-gray-500 mb-2">{t('community')}</h3>
        <Item
          leftContent={<>GitHub</>}
          rightContent={
            <Link
              href="https://github.com/blinko-space/blinko"
              target="_blank"
              className="text-primary flex items-center gap-1"
            >
              <Icon icon="mdi:github" width="20" />
              blinko-space/blinko
            </Link>
          }
        />
        <Item
          leftContent={<>Discord</>}
          rightContent={
            <Link
              href="https://discord.gg/e5UdKX7w"
              target="_blank"
              className="text-primary flex items-center gap-1"
            >
              <Icon icon="mdi:discord" width="20" />
              Blinko Community
            </Link>
          }
        />
        <Item
          leftContent={<>Telegram</>}
          rightContent={
            <Link
              href="https://t.me/blinkoEnglish"
              target="_blank"
              className="text-primary flex items-center gap-1"
            >
              <Icon icon="mdi:telegram" width="20" />
              @blinko
            </Link>
          }
        />

      </div>
    </CollapsibleCard>
  );
});