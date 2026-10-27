import { observer } from 'mobx-react-lite';
import { Button, Select, SelectItem } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { CollapsibleCard } from '../../Common/CollapsibleCard';
import { ModelIcon, ProviderIcon } from '@/components/BlinkoSettings/AiSetting/AIIcon';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { PromiseCall } from '@/store/standard/PromiseState';
import { api } from '@/lib/trpc';
import { AiSettingStore } from '@/store/aiSettingStore';
import { ServiceCapabilityStore } from '@/store/serviceCapabilityStore';

export const DefaultModelsSection = observer(() => {
  const { t,i18n } = useTranslation();
  const [advanced,setAdvanced]=useState(false);
  const aiSettingStore = RootStore.Get(AiSettingStore);
  const blinko = RootStore.Get(BlinkoStore);

  // 模型列表是异步加载的：首帧 items 还是空，而 config 里已有 id，
  // 直接把 id 塞进 selectedKeys 会触发 HeroUI 告警
  // "Keys \"x\" passed to \"selectedKeys\" are not present in the collection"。
  // 只有当该 id 确实存在于候选列表时才回显，避免这个时序告警。
  const selectedKeyIfPresent = (id: number | null | undefined, list: { id: number }[] = []) =>
    id != null && list.some(m => m.id === id) ? [String(id)] : [];

  useEffect(() => {
    blinko.config.call();
    aiSettingStore.aiProviders.call();
    aiSettingStore.allModels.call();
  }, []);

  // Also refresh when returning to this component (in case models were created)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        aiSettingStore.allModels.call();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  return (
    <CollapsibleCard icon="hugeicons:settings-02" title={t('settings-default-models')}>
      <div className="space-y-6">
        <div className={advanced ? "grid grid-cols-1 md:grid-cols-2 gap-6" : "grid grid-cols-1 gap-4"}>
          {/* Main Chat Model */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Icon icon="hugeicons:cpu" width="16" height="16" />
              <label className="text-sm font-medium">{t('settings-chat-model')}</label>
            </div>
            <Select
              classNames={{
                trigger: "h-12",
              }}
              aria-label={t('settings-chat-model')}
              placeholder={t('settings-choose-model')}
              selectedKeys={selectedKeyIfPresent(blinko.config.value?.mainModelId, aiSettingStore.inferenceModels)}
              renderValue={(items) => {
                return items.map((item) => {
                  const model = aiSettingStore.inferenceModels.find(m => m.id === Number(item.key));
                  if (!model) return null;
                  return (
                    <div key={item.key} className="flex items-center gap-2">
                      <ModelIcon modelName={model.modelKey} className="shrink-0 w-6 h-6" />
                      <div className="flex flex-col">
                        <span className="text-sm">{model.title}</span>
                        <div className="flex items-center gap-1">
                          <ProviderIcon provider={model.provider?.provider || ''} className="shrink-0 w-3 h-3" />
                          <span className="text-xs text-default-500">{model.provider?.title}</span>
                        </div>
                      </div>
                    </div>
                  );
                });
              }}
              onSelectionChange={(keys) => {
                const value = Array.from(keys)[0];
                if (value) {
                  PromiseCall(api.config.update.mutate({
                    key: 'mainModelId',
                    value: Number(value)
                  }), { autoAlert: false }).then(() => {
                    blinko.config.call()
                    // 默认对话模型换了 —— 依赖它的入口要按新结论显示。
                    RootStore.Get(ServiceCapabilityStore).load(true);
                  });
                }
              }}
            >
              {aiSettingStore.inferenceModels.map(model => (
                <SelectItem key={String(model.id)} textValue={model.title}>
                  <div className="flex gap-2 items-center">
                    <ModelIcon modelName={model.modelKey} className="shrink-0 w-6 h-6" />
                    <div className="flex flex-col">
                      <span className="text-sm">{model.title}</span>
                      <div className="flex items-center gap-1">
                        <ProviderIcon provider={model.provider?.provider || ''} className="shrink-0 w-3 h-3" />
                        <span className="text-xs text-default-400">{model.provider?.title}</span>
                      </div>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </Select>
          </div>

          {advanced && <>
          {/* Embedding Model */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Icon icon="hugeicons:database-01" width="16" height="16" />
              <label className="text-sm font-medium">{t('embedding-model')}</label>
            </div>
            <Select
              classNames={{
                trigger: "h-12",
              }}
              aria-label={t('embedding-model')}
              placeholder={t('settings-choose-model')}
              selectedKeys={selectedKeyIfPresent(blinko.config.value?.embeddingModelId, aiSettingStore.embeddingModels)}
              renderValue={(items) => {
                return items.map((item) => {
                  const model = aiSettingStore.embeddingModels.find(m => m.id === Number(item.key));
                  if (!model) return null;
                  return (
                    <div key={item.key} className="flex items-center gap-2">
                      <ModelIcon modelName={model.modelKey} className="shrink-0 w-6 h-6" />
                      <div className="flex flex-col">
                        <span className="text-sm">{model.title}</span>
                        <div className="flex items-center gap-1">
                          <ProviderIcon provider={model.provider?.provider || ''} className="shrink-0 w-3 h-3" />
                          <span className="text-xs text-default-500">{model.provider?.title}</span>
                        </div>
                      </div>
                    </div>
                  );
                });
              }}
              onSelectionChange={(keys) => {
                const value = Array.from(keys)[0];
                if (value) {
                  PromiseCall(api.config.update.mutate({
                    key: 'embeddingModelId',
                    value: Number(value)
                  }), { autoAlert: false }).then(() => {
                    blinko.config.call();
                    // 默认向量模型换了 —— 「关联笔记」这类入口要按新结论显示。
                    RootStore.Get(ServiceCapabilityStore).load(true);
                  });
                }
              }}
            >
              {aiSettingStore.embeddingModels.map(model => (
                <SelectItem key={String(model.id)} textValue={model.title}>
                  <div className="flex gap-2 items-center">
                    <ModelIcon modelName={model.modelKey} className="shrink-0 w-6 h-6" />
                    <div className="flex flex-col">
                      <span className="text-sm">{model.title}</span>
                      <div className="flex items-center gap-1">
                        <ProviderIcon provider={model.provider?.provider || ''} className="shrink-0 w-3 h-3" />
                        <span className="text-xs text-default-400">{model.provider?.title}</span>
                      </div>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </Select>
          </div>

          {/* Voice Model */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Icon icon="hugeicons:mic-01" width="16" height="16" />
              <label className="text-sm font-medium">{t('settings-voice-model')}</label>
            </div>
            <Select
              classNames={{
                trigger: "h-12",
              }}
              aria-label={t('settings-voice-model')}
              placeholder={t('settings-choose-model')}
              selectedKeys={selectedKeyIfPresent(blinko.config.value?.voiceModelId, aiSettingStore.voiceModels)}
              renderValue={(items) => {
                return items.map((item) => {
                  const model = aiSettingStore.voiceModels.find(m => m.id === Number(item.key));
                  if (!model) return null;
                  return (
                    <div key={item.key} className="flex items-center gap-2">
                      <ModelIcon modelName={model.modelKey} className="shrink-0 w-6 h-6" />
                      <div className="flex flex-col">
                        <span className="text-sm">{model.title}</span>
                        <div className="flex items-center gap-1">
                          <ProviderIcon provider={model.provider?.provider || ''} className="shrink-0 w-3 h-3" />
                          <span className="text-xs text-default-500">{model.provider?.title}</span>
                        </div>
                      </div>
                    </div>
                  );
                });
              }}
              onSelectionChange={(keys) => {
                const value = Array.from(keys)[0];
                if (value) {
                  PromiseCall(api.config.update.mutate({
                    key: 'voiceModelId',
                    value: Number(value)
                  }), { autoAlert: false }).then(() => {
                    blinko.config.call();
                  });
                }
              }}
            >
              {aiSettingStore.voiceModels.map(model => (
                <SelectItem key={String(model.id)} textValue={model.title}>
                  <div className="flex gap-2 items-center">
                    <ModelIcon modelName={model.modelKey} className="shrink-0 w-6 h-6" />
                    <div className="flex flex-col">
                      <span className="text-sm">{model.title}</span>
                      <div className="flex items-center gap-1">
                        <ProviderIcon provider={model.provider?.provider || ''} className="shrink-0 w-3 h-3" />
                        <span className="text-xs text-default-400">{model.provider?.title}</span>
                      </div>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </Select>
          </div>

          {/* Vision Model */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Icon icon="hugeicons:view" width="16" height="16" />
              <label className="text-sm font-medium">{t('settings-vision-model')}</label>
            </div>
            <Select
              classNames={{
                trigger: "h-12",
              }}
              aria-label={t('settings-vision-model')}
              placeholder={t('settings-choose-model')}
              selectedKeys={selectedKeyIfPresent(blinko.config.value?.imageModelId, aiSettingStore.imageModels)}
              renderValue={(items) => {
                return items.map((item) => {
                  const model = aiSettingStore.imageModels.find(m => m.id === Number(item.key));
                  if (!model) return null;
                  return (
                    <div key={item.key} className="flex items-center gap-2">
                      <ModelIcon modelName={model.modelKey} className="shrink-0 w-6 h-6" />
                      <div className="flex flex-col">
                        <span className="text-sm">{model.title}</span>
                        <div className="flex items-center gap-1">
                          <ProviderIcon provider={model.provider?.provider || ''} className="shrink-0 w-3 h-3" />
                          <span className="text-xs text-default-500">{model.provider?.title}</span>
                        </div>
                      </div>
                    </div>
                  );
                });
              }}
              onSelectionChange={(keys) => {
                const value = Array.from(keys)[0];
                if (value) {
                  PromiseCall(api.config.update.mutate({
                    key: 'imageModelId',
                    value: Number(value)
                  }), { autoAlert: false }).then(() => {
                    blinko.config.call();
                  });
                }
              }}
            >
              {aiSettingStore.imageModels.map(model => (
                <SelectItem key={String(model.id)} textValue={model.title}>
                  <div className="flex gap-2 items-center">
                    <ModelIcon modelName={model.modelKey} className="shrink-0 w-6 h-6" />
                    <div className="flex flex-col">
                      <span className="text-sm">{model.title}</span>
                      <div className="flex items-center gap-1">
                        <ProviderIcon provider={model.provider?.provider || ''} className="shrink-0 w-3 h-3" />
                        <span className="text-xs text-default-400">{model.provider?.title}</span>
                      </div>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </Select>
          </div>
          </>}
        </div>
        <Button size="sm" variant="light" onPress={()=>setAdvanced(value=>!value)}>{i18n.language.startsWith('zh')?(advanced?'收起其他默认模型':'其他默认模型：知识库、语音、视觉'):(advanced?'Hide other models':'Other defaults: embedding, voice & vision')}</Button>
      </div>
    </CollapsibleCard>
  );
});