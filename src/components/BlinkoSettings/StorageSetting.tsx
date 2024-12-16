import { observer } from "mobx-react-lite";
import { Button, Card, DropdownItem, DropdownMenu, DropdownTrigger, Dropdown, Input } from "@nextui-org/react";
import { RootStore } from "@/store";
import { BlinkoStore } from "@/store/blinkoStore";
import { PromiseCall } from "@/store/standard/PromiseState";
import { Icon } from "@iconify/react";
import { api } from "@/lib/trpc";
import { Item } from "./Item";
import { useTranslation } from "react-i18next";
import { useMediaQuery } from "usehooks-ts";
import { useEffect } from "react";
import { PasswordInput } from "@/components/Common/PasswordInput";


export const StorageSetting = observer(() => {
  const isPc = useMediaQuery('(min-width: 768px)')
  const { t } = useTranslation()
  const blinko = RootStore.Get(BlinkoStore)
  const store = RootStore.Local(() => ({
    s3AccessKeyId: "",
    s3AccessKeySecret: "",
    s3Endpoint: "",
    s3Region: "",
    s3Bucket: "",
    s3CustomPath: "",
  }))

  useEffect(() => {
    store.s3AccessKeyId = blinko.config.value?.s3AccessKeyId!
    store.s3AccessKeySecret = blinko.config.value?.s3AccessKeySecret!
    store.s3Endpoint = blinko.config.value?.s3Endpoint!
    store.s3Region = blinko.config.value?.s3Region!
    store.s3Bucket = blinko.config.value?.s3Bucket!
    store.s3CustomPath = blinko.config.value?.s3CustomPath!
  }, [blinko.config.value])


  return <Card shadow="none" className="flex flex-col p-4 bg-background">
    <div className='text-desc flex items-center gap-2'>
      <Icon icon="tabler:brush" width="20" height="20" />
      <div className="text-sm">{t('storage')}</div>
    </div>
    <Item
      leftContent={<div className="flex flex-col  gap-2">
        <div>{t('object-storage')}</div>
      </div>}
      rightContent={<div>
        <Dropdown>
          <DropdownTrigger>
            <Button startContent={<Icon icon="mdi:storage" width="20" height="20" />} color='primary' >
              {blinko.config.value?.objectStorage ?? t('local-file-system')}
            </Button>
          </DropdownTrigger>
          <DropdownMenu onAction={async (key) => {
            await PromiseCall(api.config.update.mutate({
              key: 'objectStorage',
              value: key.toString()
            }))
          }}>
            <DropdownItem key="local">  {t('local-file-system')}</DropdownItem>
            <DropdownItem key="s3">S3</DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </div>} />

    {
      blinko.config.value?.objectStorage === 's3' && <>
        <Item
          leftContent={<>{t('access-key-id')}</>}
          rightContent={<PasswordInput
            value={store.s3AccessKeyId}
            onChange={e => store.s3AccessKeyId = e.target.value}
            placeholder={t('access-key-id')}
            onBlur={async (e) => {
              await PromiseCall(api.config.update.mutate({
                key: 's3AccessKeyId',
                value: e.target.value
              }))
            }} />} />
        <Item
          leftContent={<>{t('access-key-secret')}</>}
          rightContent={<PasswordInput
            value={store.s3AccessKeySecret}
            onChange={e => store.s3AccessKeySecret = e.target.value}
            placeholder={t('access-key-secret')}
            onBlur={async (e) => {
              await PromiseCall(api.config.update.mutate({
                key: 's3AccessKeySecret',
                value: e.target.value
              }))
            }} />} />
        <Item
          leftContent={<>{t('endpoint')}</>}
          rightContent={<Input value={store.s3Endpoint} onChange={e => store.s3Endpoint = e.target.value} placeholder="Endpoint" onBlur={async (e) => {
            await PromiseCall(api.config.update.mutate({
              key: 's3Endpoint',
              value: e.target.value
            }))
          }} />} />
        <Item
          leftContent={<>{t('region')}</>}
          rightContent={<Input value={store.s3Region} onChange={e => store.s3Region = e.target.value} placeholder="Region" onBlur={async (e) => {
            await PromiseCall(api.config.update.mutate({
              key: 's3Region',
              value: e.target.value
            }))
          }} />} />
        <Item
          leftContent={<>{t('bucket')}</>}
          rightContent={<Input value={store.s3Bucket} onChange={e => store.s3Bucket = e.target.value} placeholder="Bucket" onBlur={async (e) => {
            await PromiseCall(api.config.update.mutate({
              key: 's3Bucket',
              value: e.target.value
            }))
          }} />} />
        <Item
          leftContent={<>
            <div>{t('custom-path')}</div>
          </>}
          rightContent={<Input
            value={store.s3CustomPath}
            onChange={e => store.s3CustomPath = e.target.value}
            placeholder="/custom/path/"
            onBlur={async (e) => {
              await PromiseCall(api.config.update.mutate({
                key: 's3CustomPath',
                value: e.target.value
              }))
            }} />} />
      </>
    }
  </Card>
})