import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Item } from "./Item"
import { RootStore } from "@/store"
import { BlinkoStore } from "@/store/blinkoStore"
import { PromiseState } from "@/store/standard/PromiseState"
import { api } from "@/lib/trpc"
import { Alert, Button, Input, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/react"
import { Icon } from '@/components/Common/Iconify/icons'
import { DialogStore } from "@/store/module/Dialog"
import { CollapsibleCard } from "../Common/CollapsibleCard"
import { showTipsDialog } from "../Common/TipsDialog"
import { ToastPlugin } from "@/store/module/Toast/Toast"
import { DialogStandaloneStore } from "@/store/module/DialogStandalone"
import { ZOAuth2ProviderSchema } from "@shared/lib/types"
import { z } from "zod"
import { PasswordInput } from "../Common/PasswordInput"
import { Select, SelectItem } from "@heroui/react"

const OAUTH_TEMPLATES = {
  custom: {
    id: 'custom',
    name: 'Custom Provider',
    icon: '',
    isCustom: true
  },
  github: {
    id: 'github',
    name: 'GitHub',
    icon: 'skill-icons:github-dark',
  },
  google: {
    id: 'google',
    name: 'Google',
    icon: 'logos:google',
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook',
    icon: 'logos:facebook',
  },
  apple: {
    id: 'apple',
    name: 'Apple',
    icon: 'vscode-icons:file-type-applescript',
  },
  spotify: {
    id: 'spotify',
    name: 'Spotify',
    icon: 'logos:spotify',
  },
  discord: {
    id: 'discord',
    name: 'Discord',
    icon: 'logos:discord',
  },
  twitter: {
    id: 'twitter',
    name: 'Twitter',
    icon: 'skill-icons:twitter',
  },
  slack: {
    id: 'slack',
    name: 'Slack',
    icon: 'logos:slack',
  },
  twitch: {
    id: 'twitch',
    name: 'Twitch',
    icon: 'logos:twitch',
  },
  line: {
    id: 'line',
    name: 'LINE',
    icon: 'cib:line',
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    icon: 'skill-icons:instagram',
  },
  coinbase: {
    id: 'coinbase',
    name: 'Coinbase',
    icon: 'simple-icons:coinbase',
  },
  yandex: {
    id: 'yandex',
    name: 'Yandex',
    icon: 'vscode-icons:file-type-yandex',
  },
} as const;

const UpdateSSOProvider = observer(({ provider }: { provider?: z.infer<typeof ZOAuth2ProviderSchema> }) => {
  const { t } = useTranslation()
  const blinko = RootStore.Get(BlinkoStore)
  const store = RootStore.Local(() => ({
    template: (provider ? (OAUTH_TEMPLATES[provider.id as keyof typeof OAUTH_TEMPLATES]?.id ?? 'custom') : 'custom') as keyof typeof OAUTH_TEMPLATES,
    id: provider?.id || '',
    name: provider?.name || '',
    icon: provider?.icon || '',
    wellKnown: provider?.wellKnown || '',
    scope: provider?.scope || '',
    authorizationUrl: provider?.authorizationUrl || '',
    tokenUrl: provider?.tokenUrl || '',
    userinfoUrl: provider?.userinfoUrl || '',
    clientId: provider?.clientId || '',
    clientSecret: provider?.clientSecret || '',
    upsertProvider: new PromiseState({
      function: async () => {
        const config = blinko.config.value || {}
        const providers = config.oauth2Providers || []
        const id = store.id.trim()

        if (!id) {
          RootStore.Get(ToastPlugin).error(t('provider-id-required'))
          return
        }
        // 同 id 只能存在一条：重复会让列表 key 撞车，也会让 /api/auth/callback/:id 回调路由产生歧义
        if (providers.some(p => p.id === id && p.id !== provider?.id)) {
          RootStore.Get(ToastPlugin).error(t('provider-id-exists'))
          return
        }
        if (!store.clientId.trim() || !store.clientSecret.trim()) {
          RootStore.Get(ToastPlugin).error(t('client-id-secret-required'))
          return
        }

        const newProvider = {
          id,
          name: store.name.trim() || id,
          icon: store.icon,
          wellKnown: store.wellKnown,
          scope: store.scope,
          authorizationUrl: store.authorizationUrl,
          tokenUrl: store.tokenUrl,
          userinfoUrl: store.userinfoUrl,
          clientId: store.clientId,
          clientSecret: store.clientSecret,
        }

        const newProviders = provider
          ? providers.map(p => p.id === provider.id ? newProvider : p)
          : [...providers, newProvider]

        await api.config.update.mutate({
          key: 'oauth2Providers',
          value: newProviders
        })
        RootStore.Get(DialogStore).close()
        RootStore.Get(ToastPlugin).success(t('your-changes-have-been-saved'))
        await blinko.config.call()
      }
    })
  }))

  const handleTemplateChange = (templateId: string) => {
    const template = OAUTH_TEMPLATES[templateId as keyof typeof OAUTH_TEMPLATES]
    if (template) {
      store.template = templateId as keyof typeof OAUTH_TEMPLATES
      store.id = template.id === 'custom' ? '' : template.id
      store.name = template.id === 'custom' ? '' : template.name
      store.icon = template.icon
    }
  }

  return <div className="flex flex-col gap-4">
    <Select
      variant="bordered"
      aria-label="OAuth template"
      selectedKeys={[store.template]}
      onChange={e => handleTemplateChange(e.target.value)}
      startContent={store.icon && <Icon icon={store.icon} width="20" height="20" />}
    >
      {Object.entries(OAUTH_TEMPLATES).map(([key, template]) => (
        <SelectItem
          key={key}
          startContent={template.icon && <Icon icon={template.icon} width="20" height="20" />}
        >
          {template.name}
        </SelectItem>
      ))}
    </Select>

    {store.template === 'custom' && (
      <>
        <Input
          label={t('provider-id')}
          placeholder="custom-provider"
          labelPlacement="outside"
          variant="bordered"
          value={store.id}
          onChange={e => { store.id = e.target.value }}
        />
        <Input
          label={t('provider-name')}
          placeholder="Custom Provider"
          labelPlacement="outside"
          variant="bordered"
          value={store.name}
          onChange={e => { store.name = e.target.value }}
        />
        <Input
          label={t('provider-icon')}
          placeholder="logos:custom-icon"
          description={<div className="flex items-center gap-2">
            {t('please-select-icon-from-iconify')}
            <br />
            <a className="text-blue-500" href="https://icon-sets.iconify.design/" target="_blank">Iconify</a>
          </div>}
          labelPlacement="outside"
          variant="bordered"
          value={store.icon}
          onChange={e => { store.icon = e.target.value }}
          startContent={store.icon && <Icon icon={store.icon} width="20" height="20" />}
        />
        <Input
          label={t('well-known-url')}
          placeholder="https://example.com/.well-known/openid-configuration"
          labelPlacement="outside"
          variant="bordered"
          value={store.wellKnown}
          onChange={e => { store.wellKnown = e.target.value }}
        />
        {!store.wellKnown && (
          <>
            <Input
              label={t('authorization-url')}
              placeholder="https://example.com/oauth/authorize"
              labelPlacement="outside"
              variant="bordered"
              value={store.authorizationUrl}
              onChange={e => { store.authorizationUrl = e.target.value }}
            />
            <Input
              label={t('token-url')}
              placeholder="https://example.com/oauth/token"
              labelPlacement="outside"
              variant="bordered"
              value={store.tokenUrl}
              onChange={e => { store.tokenUrl = e.target.value }}
            />
            <Input
              label={t('userinfo-url')}
              placeholder="https://example.com/oauth/userinfo"
              labelPlacement="outside"
              variant="bordered"
              value={store.userinfoUrl}
              onChange={e => { store.userinfoUrl = e.target.value }}
            />
            <Input
              label={t('scope')}
              placeholder="email profile"
              labelPlacement="outside"
              variant="bordered"
              value={store.scope}
              onChange={e => { store.scope = e.target.value }}
            />
          </>
        )}
      </>
    )}

    <Input
      label={t('client-id')}
      placeholder="your-client-id"
      labelPlacement="outside"
      variant="bordered"
      value={store.clientId}
      onChange={e => { store.clientId = e.target.value }}
    />
    <PasswordInput
      label={t('client-secret')}
      placeholder="your-client-secret"
      value={store.clientSecret}
      onChange={e => { store.clientSecret = e.target.value }}
    />
    <Alert color={'warning'} title={t('redirect-url')} description={`${window.location.origin}/api/auth/callback/${store.id || store.template}`} />
    <div className="text-xs text-default-500 mt-1">
      {t('please-add-this-url-to-your-oauth-provider-settings')}
    </div>
    <div className="flex w-full mt-2">
      <Button
        isLoading={store.upsertProvider.loading.value}
        className="ml-auto"
        color='primary'
        onPress={async () => {
          await store.upsertProvider.call()
        }}
      >
        {t('save')}
      </Button>
    </div>
  </div>
})

export const SSOSetting = observer(() => {
  const { t } = useTranslation()
  const blinko = RootStore.Get(BlinkoStore)
  const providers = blinko.config.value?.oauth2Providers || []

  return (
    <CollapsibleCard
      icon="tabler:key"
      title={t('sso-settings')}
    >
      <Item
        leftContent={<>{t('oauth2-providers')}</>}
        rightContent={
          <Button
            size="sm"
            color="primary"
            startContent={<Icon icon="tabler:plus" width="18" height="18" />}
            onPress={() => {
              RootStore.Get(DialogStore).setData({
                size: '2xl',
                isOpen: true,
                title: t('add-oauth2-provider'),
                content: <UpdateSSOProvider />
              })
            }}
          >
            {t('add-provider')}
          </Button>
        }
      />

      <Item
        leftContent={
          <Table shadow="none" aria-label={t('sso-settings')} className="mb-2">
            <TableHeader>
              <TableColumn>{t('provider-id')}</TableColumn>
              <TableColumn>{t('provider-name')}</TableColumn>
              <TableColumn>{t('provider-icon')}</TableColumn>
              <TableColumn>{t('action')}</TableColumn>
            </TableHeader>
            <TableBody>
              {providers.map((provider, index) => (
                <TableRow key={`${provider.id}-${index}`}>
                  <TableCell>{provider.id}</TableCell>
                  <TableCell>{provider.name}</TableCell>
                  <TableCell>
                    {provider.icon && <Icon icon={provider.icon} width="20" height="20" />}
                  </TableCell>
                  <TableCell>
                    <div className="flex">
                      <Button
                        isIconOnly
                        variant="flat"
                        size="sm"
                        startContent={<Icon icon="tabler:edit" width="18" height="18" />}
                        onPress={() => {
                          RootStore.Get(DialogStore).setData({
                            isOpen: true,
                            title: t('edit-oauth2-provider'),
                            content: <UpdateSSOProvider provider={provider} />
                          })
                        }}
                      />
                      <Button
                        isIconOnly
                        color="danger"
                        size="sm"
                        className="ml-2"
                        startContent={<Icon icon="tabler:trash" width="18" height="18" />}
                        onPress={() => {
                          showTipsDialog({
                            size: 'sm',
                            title: t('confirm-to-delete'),
                            content: t('confirm-delete-provider'),
                            onConfirm: async () => {
                              try {
                                const newProviders = providers.filter(p => p.id !== provider.id)
                                await RootStore.Get(ToastPlugin).promise(
                                  api.config.update.mutate({
                                    key: 'oauth2Providers',
                                    value: newProviders
                                  }),
                                  {
                                    loading: t('in-progress'),
                                    success: <b>{t('your-changes-have-been-saved')}</b>,
                                    error: (e) => <b>{e.message}</b>,
                                  }
                                )
                                await blinko.config.call()
                                RootStore.Get(DialogStandaloneStore).close()
                              } catch (e) {
                                RootStore.Get(DialogStandaloneStore).close()
                              }
                            }
                          })
                        }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        }
      />
    </CollapsibleCard>
  )
})