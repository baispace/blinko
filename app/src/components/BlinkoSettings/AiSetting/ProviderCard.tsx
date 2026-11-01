import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Chip, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { RootStore } from '@/store';
import { DialogStore } from '@/store/module/Dialog';
import { DialogStandaloneStore } from '@/store/module/DialogStandalone';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { AiSettingStore, type AiProvider } from '@/store/aiSettingStore';
import { api } from '@/lib/trpc';
import { Icon } from '../../Common/Iconify/icons';
import { showTipsDialog } from '../../Common/TipsDialog';
import ProviderDialogContent from './ProviderDialogContent';
import ModelDialogContent from './ModelDialogContent';
import { ProviderIcon } from './AIIcon';
import { CAPABILITY_ICONS, CAPABILITY_LABELS } from './constants';

type CapabilityKey = keyof typeof CAPABILITY_LABELS;

export default observer(function ProviderCard({ provider }: { provider: AiProvider }) {
  const { t, i18n } = useTranslation();
  const text = (zh: string, en: string) => i18n.language.startsWith('zh') ? zh : en;
  const ai = RootStore.Get(AiSettingStore), toast = RootStore.Get(ToastPlugin);
  const [testing, setTesting] = useState<number | null>(null);
  const [filterCapability, setFilterCapability] = useState<CapabilityKey | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const confirmDelete = (model?: NonNullable<AiProvider['models']>[number]) =>
    showTipsDialog({
      title: t('confirm-to-delete'),
      content: model
        ? text(`删除模型「${model.title}」？已有对话记录会保留。`, `Delete model “${model.title}”? Existing conversations will remain.`)
        : text(`删除服务商「${provider.title}」及其模型？`, `Delete provider “${provider.title}” and its models?`),
      onConfirm: async () => {
        if (model) await ai.deleteModel.call({ id: model.id });
        else await ai.deleteProvider.call(provider.id);
        RootStore.Get(DialogStandaloneStore).close();
      },
    });

  const handleRefreshModels = async () => {
    setRefreshing(true);
    try {
      await ai.fetchProviderModels.call(provider as any);
      toast.success(text('模型列表已更新', 'Model list updated'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('operation-failed'));
    } finally {
      setRefreshing(false);
    }
  };

  const handleAddModelWithCapability = (capability: CapabilityKey) => {
    RootStore.Get(DialogStore).setData({
      isOpen: true,
      size: '3xl',
      title: text('添加专用模型', 'Add specialized model'),
      content: <ModelDialogContent
        model={{
          id: 0,
          providerId: provider.id,
          title: '',
          modelKey: '',
          capabilities: {
            inference: capability === 'inference',
            tools: capability === 'tools',
            image: capability === 'image',
            imageGeneration: capability === 'imageGeneration',
            video: capability === 'video',
            audio: capability === 'audio',
            embedding: capability === 'embedding',
            rerank: capability === 'rerank',
          },
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }}
      />,
    });
  };

  const filteredModels = filterCapability
    ? provider.models?.filter(m => m.capabilities[filterCapability])
    : provider.models;

  return (
    <section className="overflow-hidden rounded-xl border border-default-200/70">
      <header className="flex flex-wrap items-center gap-3 bg-default-50 px-4 py-3">
        <ProviderIcon provider={provider.provider === 'custom' ? 'openai' : provider.provider} className="h-6 w-6 shrink-0" />
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-semibold">{provider.title}</h4>
          <p className="truncate text-xs text-default-400">
            {provider.models?.length || 0} {text('个模型', 'models')}
          </p>
        </div>
        <Button
          size="sm"
          variant="light"
          isLoading={refreshing}
          isDisabled={refreshing}
          startContent={<Icon icon="famicons:sync" width="16" height="16" />}
          onPress={handleRefreshModels}
        >
          {text('刷新模型', 'Refresh models')}
        </Button>
        <Dropdown>
          <DropdownTrigger>
            <Button size="sm" variant="light" isIconOnly aria-label={text('服务商操作', 'Provider actions')}>
              <Icon icon="tabler:dots" width="18" />
            </Button>
          </DropdownTrigger>
          <DropdownMenu aria-label={text('服务商操作', 'Provider actions')}>
            <DropdownItem
              key="edit"
              onPress={() =>
                RootStore.Get(DialogStore).setData({
                  isOpen: true,
                  size: '2xl',
                  title: text('连接设置', 'Connection settings'),
                  content: <ProviderDialogContent provider={provider} />,
                })
              }
            >
              {text('连接设置', 'Connection settings')}
            </DropdownItem>
            <DropdownItem
              key="delete"
              color="danger"
              className="text-danger"
              onPress={() => confirmDelete()}
            >
              {text('删除服务商', 'Delete provider')}
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </header>

      {/* Capability filter chips */}
      <div className="flex flex-wrap gap-2 border-b border-default-100 px-4 py-2">
        {(Object.keys(CAPABILITY_LABELS) as CapabilityKey[]).map((key) => (
          <Chip
            key={key}
            size="sm"
            variant={filterCapability === key ? 'solid' : 'bordered'}
            color={filterCapability === key ? 'primary' : 'default'}
            startContent={CAPABILITY_ICONS[key]}
            className="cursor-pointer"
            onClick={() => setFilterCapability(filterCapability === key ? null : key)}
          >
            {CAPABILITY_LABELS[key]}
          </Chip>
        ))}
      </div>

      {/* Model list */}
      <div className="divide-y divide-default-100">
        {filteredModels?.length ? (
          filteredModels.map((model) => (
            <div key={model.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{model.title}</div>
                {model.title !== model.modelKey && (
                  <p className="truncate text-xs text-default-400">{model.modelKey}</p>
                )}
              </div>
              <div className="flex gap-1">
                {(Object.keys(CAPABILITY_LABELS) as CapabilityKey[])
                  .filter((key) => model.capabilities[key])
                  .map((key) => (
                    <Chip key={key} size="sm" variant="flat" startContent={CAPABILITY_ICONS[key]}>
                      {CAPABILITY_LABELS[key]}
                    </Chip>
                  ))}
              </div>
              <Button
                size="sm"
                variant="light"
                isLoading={testing === model.id}
                isDisabled={testing !== null}
                onPress={async () => {
                  setTesting(model.id);
                  try {
                    const result = await api.ai.testConnect.mutate({
                      providerId: provider.id,
                      modelKey: model.modelKey,
                      capabilities: model.capabilities,
                    });
                    const failures = Object.values(result.capabilities as Record<string, any>).filter(
                      (value) => value?.success === false,
                    );
                    if (!result.success || failures.length)
                      throw new Error(
                        failures.map((value) => value.error).filter(Boolean).join('；') || t('check-connect-error'),
                      );
                    toast.success(t('check-connect-success'));
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : t('check-connect-error'));
                  } finally {
                    setTesting(null);
                  }
                }}
              >
                {text('测试', 'Test')}
              </Button>
              <Button
                size="sm"
                variant="light"
                onPress={() =>
                  RootStore.Get(DialogStore).setData({
                    isOpen: true,
                    size: '3xl',
                    title: text('编辑模型', 'Edit model'),
                    content: <ModelDialogContent model={model} />,
                  })
                }
              >
                {t('edit')}
              </Button>
              <Dropdown>
                <DropdownTrigger>
                  <Button size="sm" variant="light" isIconOnly aria-label={text('模型操作', 'Model actions')}>
                    <Icon icon="tabler:dots" width="16" />
                  </Button>
                </DropdownTrigger>
                <DropdownMenu aria-label={text('模型操作', 'Model actions')}>
                  <DropdownItem
                    key="delete"
                    color="danger"
                    className="text-danger"
                    onPress={() => confirmDelete(model)}
                  >
                    {text('删除模型', 'Delete model')}
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
            </div>
          ))
        ) : (
          <p className="px-4 py-5 text-xs text-default-400">
            {filterCapability
              ? text('该能力下没有模型', 'No models with this capability')
              : text('连接已保存，刷新模型后即可使用。', 'Connection saved. Refresh to load models.')}
          </p>
        )}
      </div>

      {/* Add model button per capability */}
      <div className="border-t border-default-100 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CAPABILITY_LABELS) as CapabilityKey[]).map((key) => (
            <Button
              key={key}
              size="sm"
              variant="flat"
              startContent={CAPABILITY_ICONS[key]}
              onPress={() => handleAddModelWithCapability(key)}
            >
              {text('添加', 'Add')} {CAPABILITY_LABELS[key]}
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
});
