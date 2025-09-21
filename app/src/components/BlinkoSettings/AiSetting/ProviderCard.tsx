import { observer } from 'mobx-react-lite';
import { Card, CardBody, Button, Chip, Divider, Select, SelectItem } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { RootStore } from '@/store';
import { AiStore, AiProvider, ModelCapabilities } from '@/store/aiStore';
import { DialogStore } from '@/store/module/Dialog';
import ProviderDialogContent from './ProviderDialogContent';
import ModelDialogContent from './ModelDialogContent';
import { ProviderIcon, ModelIcon } from '@/components/Common/AIIcon';
import { PROVIDER_TEMPLATES } from './ProviderDialogContent';
import { useMediaQuery } from 'usehooks-ts';

const CAPABILITY_ICONS = {
  inference: <Icon icon="hugeicons:cpu" width="16" height="16" />,
  tools: <Icon icon="hugeicons:settings-02" width="16" height="16" />,
  image: <Icon icon="hugeicons:view" width="16" height="16" />,
  imageGeneration: <Icon icon="hugeicons:image-01" width="16" height="16" />,
  video: <Icon icon="hugeicons:video-01" width="16" height="16" />,
  audio: <Icon icon="hugeicons:mic-01" width="16" height="16" />,
  embedding: <Icon icon="hugeicons:database-01" width="16" height="16" />,
  rerank: <Icon icon="hugeicons:arrow-up-down" width="16" height="16" />
};

const CAPABILITY_LABELS = {
  inference: 'Chat',
  tools: 'Tools',
  image: 'Vision',
  imageGeneration: 'Image Gen',
  video: 'Video',
  audio: 'Audio',
  embedding: 'Embedding',
  rerank: 'Rerank'
};

const CAPABILITY_COLORS = {
  inference: 'primary',
  tools: 'secondary',
  image: 'success',
  imageGeneration: 'warning',
  video: 'danger',
  audio: 'default',
  embedding: 'primary',
  rerank: 'secondary'
} as const;

interface ProviderCardProps {
  provider: AiProvider;
}

export default observer(function ProviderCard({ provider }: ProviderCardProps) {
  const { t } = useTranslation();
  const aiStore = RootStore.Get(AiStore);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [isModelsCollapsed, setIsModelsCollapsed] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [availableModels, setAvailableModels] = useState<any[]>([]);

  // Load collapse state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`provider-${provider.id}-collapsed`);
    if (saved !== null) {
      setIsModelsCollapsed(JSON.parse(saved));
    }
  }, [provider.id]);

  // Save collapse state to localStorage
  const toggleModelsCollapse = () => {
    const newState = !isModelsCollapsed;
    setIsModelsCollapsed(newState);
    localStorage.setItem(`provider-${provider.id}-collapsed`, JSON.stringify(newState));
  };

  const handleDeleteProvider = async (id: number) => {
    if (!confirm('Are you sure you want to delete this provider?')) return;
    await aiStore.deleteProvider.call(id);
  };

  const handleDeleteModel = async (id: number, providerId: number) => {
    if (!confirm('Are you sure you want to delete this model?')) return;
    await aiStore.deleteModel.call({ id, providerId });
  };

  const renderCapabilityChips = (capabilities: ModelCapabilities) => {
    return Object.entries(capabilities)
      .filter(([_, enabled]) => enabled)
      .map(([capability]) => (
        <Chip
          key={capability}
          size="sm"
          startContent={CAPABILITY_ICONS[capability as keyof ModelCapabilities]}
          variant="solid"
          color={CAPABILITY_COLORS[capability as keyof ModelCapabilities]}
        >
          {CAPABILITY_LABELS[capability as keyof ModelCapabilities]}
        </Chip>
      ));
  };

  return (
    <Card className="mb-4 bg-sencondbackground" shadow='none'>
      <CardBody>
        <div className={`flex ${isMobile ? 'flex-col space-y-3' : 'justify-between items-start'} mb-3`}>
          <div className="flex items-center gap-3">
            <div className="relative">
              <ProviderIcon
                provider={provider.provider === 'custom' ? 'openai' : provider.provider}
                className="w-8 h-8"
              />
              {provider.provider === 'custom' && (
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary rounded-full flex items-center justify-center">
                  <Icon icon="hugeicons:settings-03" className="w-2 h-2 text-white" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold truncate">{provider.title}</h3>
              {provider.baseURL && (
                <p className="text-tiny text-gray-400 truncate">{provider.baseURL}</p>
              )}
            </div>
          </div>
          <div className={`flex gap-2 ${isMobile ? 'self-end' : ''}`}>
            <Button
              size="sm"
              variant="flat"
              isIconOnly
              startContent={<Icon icon="hugeicons:settings-02" width="16" height="16" />}
              onPress={() => {
                RootStore.Get(DialogStore).setData({
                  isOpen: true,
                  size: isMobile ? 'full' : '2xl',
                  title: 'Edit Provider',
                  content: <ProviderDialogContent provider={provider} />,
                });
              }}
            >
            </Button>
            <Button
              size="sm"
              color="danger"
              isIconOnly
              variant="flat"
              startContent={<Icon icon="hugeicons:delete-01" width="16" height="16" />}
              onPress={() => handleDeleteProvider(provider.id)}
            >
            </Button>
          </div>
        </div>

        {/* Models Section */}
        <div className="space-y-3">
          <div className={`flex ${isMobile ? 'flex-col space-y-2' : 'justify-between items-center'}`}>
            <h4 className="text-sm font-semibold text-default-600">
              {t('model')} {provider.models && provider.models.length > 0 && (
                <span className="text-xs bg-default-100 text-default-500 px-2 py-1 rounded-full ml-2">
                  {provider.models.length}
                </span>
              )}
            </h4>
            <div className={`flex gap-2 ${isMobile ? 'self-end' : ''}`}>
              <Button
                size="sm"
                variant="flat"
                startContent={<Icon icon="hugeicons:refresh" width="14" height="14" />}
                onPress={async () => {
                  try {
                    // Clear cache and fetch fresh models
                    aiStore.clearProviderModelsCache(provider.id);
                    const models = await aiStore.fetchProviderModels.call(provider);
                    if (models && models.length > 0) {
                      setAvailableModels(models);
                      // Don't automatically save to database, just show in dropdown
                    }
                  } catch (error) {
                    console.error('Failed to fetch models:', error);
                  }
                }}
              >
                {isMobile ? '获取' : '获取模型'}
              </Button>
              <Button
                size="sm"
                color="primary"
                startContent={<Icon icon="hugeicons:add-01" width="14" height="14" />}
                onPress={() => {
                  RootStore.Get(DialogStore).setData({
                    isOpen: true,
                    size: isMobile ? 'full' : '3xl',
                    title: `Add Model to ${provider.title}`,
                    content: <ModelDialogContent model={{
                      id: 0,
                      providerId: provider.id,
                      title: '',
                      modelKey: '',
                      capabilities: {
                        inference: true,
                        tools: false,
                        image: false,
                        imageGeneration: false,
                        video: false,
                        audio: false,
                        embedding: false,
                        rerank: false
                      },
                      sortOrder: 0
                    }} />,
                  });
                }}
              >
                {isMobile ? '添加' : '添加模型'}
              </Button>
              <Button
                size="sm"
                variant="flat"
                isIconOnly
                startContent={<Icon icon={isModelsCollapsed ? "hugeicons:arrow-down-01" : "hugeicons:arrow-up-01"} width="14" height="14" />}
                onPress={toggleModelsCollapse}
              />
            </div>
          </div>

          {/* Model Selection Dropdown - Only show when models are fetched but not collapsed */}
          {availableModels.length > 0 && !isModelsCollapsed && (
            <div className="mb-3">
              <Select
                size="sm"
                label="从获取的模型中选择"
                placeholder="选择要添加的模型"
                selectedKeys={selectedModel ? [selectedModel] : []}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0];
                  if (value) {
                    setSelectedModel(String(value));
                    const model = availableModels.find(m => m.id === value);
                    if (model) {
                      RootStore.Get(DialogStore).setData({
                        isOpen: true,
                        size: isMobile ? 'full' : '3xl',
                        title: `Add ${model.name} to ${provider.title}`,
                        content: <ModelDialogContent model={{
                          id: 0,
                          providerId: provider.id,
                          title: model.name,
                          modelKey: model.id,
                          capabilities: aiStore.inferModelCapabilities(model.id),
                          sortOrder: 0
                        }} />,
                      });
                      setSelectedModel('');
                    }
                  }
                }}
                className="w-full"
              >
                {availableModels.map(model => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </Select>
            </div>
          )}

          {/* Models List */}
          {!isModelsCollapsed && (
            <div className="space-y-2">
              {provider.models && provider.models.length > 0 ? (
              provider.models.map(model => (
                <div key={model.id} className={`${isMobile ? 'block' : 'flex items-center'} gap-3 p-3 bg-default-50 rounded-lg hover:bg-default-100 transition-colors group`}>
                  {/* Mobile Layout */}
                  {isMobile ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <ModelIcon modelName={model.modelKey} className="w-8 h-8" />
                        <div className="flex-1 min-w-0">
                          <h5 className="font-medium text-sm truncate">{model.title}</h5>
                          <p className="text-xs text-default-500 truncate">{model.modelKey}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="flat"
                            isIconOnly
                            startContent={<Icon icon="hugeicons:settings-02" width="12" height="12" />}
                            onPress={() => {
                              RootStore.Get(DialogStore).setData({
                                isOpen: true,
                                size: 'full',
                                title: 'Edit Model',
                                content: <ModelDialogContent model={model} />,
                              });
                            }}
                          />
                          <Button
                            size="sm"
                            color="danger"
                            variant="flat"
                            isIconOnly
                            startContent={<Icon icon="hugeicons:delete-01" width="12" height="12" />}
                            onPress={() => handleDeleteModel(model.id, model.providerId)}
                          />
                        </div>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {renderCapabilityChips(model.capabilities)}
                      </div>
                    </div>
                  ) : (
                    /* Desktop Layout */
                    <>
                      {/* Model Icon */}
                      <div className="flex-shrink-0">
                        <ModelIcon modelName={model.modelKey} className="w-8 h-8" />
                      </div>

                      {/* Model Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h5 className="font-medium text-sm truncate">{model.title}</h5>
                          <div className="flex gap-1">
                            {renderCapabilityChips(model.capabilities)}
                          </div>
                        </div>
                        <p className="text-xs text-default-500 truncate">{model.modelKey}</p>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="sm"
                          variant="flat"
                          isIconOnly
                          startContent={<Icon icon="hugeicons:settings-02" width="12" height="12" />}
                          onPress={() => {
                            RootStore.Get(DialogStore).setData({
                              isOpen: true,
                              size: '3xl',
                              title: 'Edit Model',
                              content: <ModelDialogContent model={model} />,
                            });
                          }}
                        />
                        <Button
                          size="sm"
                          color="danger"
                          variant="flat"
                          isIconOnly
                          startContent={<Icon icon="hugeicons:delete-01" width="12" height="12" />}
                          onPress={() => handleDeleteModel(model.id, model.providerId)}
                        />
                      </div>
                    </>
                  )}
                </div>
              ))
              ) : (
                <div className="text-center py-8 text-default-400">
                  <Icon icon="hugeicons:file-search" className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">暂无模型配置</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Documentation and Website Links */}
        {(() => {
          const template = PROVIDER_TEMPLATES.find(t => t.value === provider.provider.toLowerCase());
          if (template && (template.website || template.docs)) {
            return (
              <div className="mt-4 pt-3 border-t border-default-200">
                <p className="text-xs text-default-400">
                  查看 {template.label} 的{' '}
                  {template.docs && (
                    <>
                      <a
                        href={template.docs}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary-600 underline cursor-pointer"
                      >
                        文档
                      </a>
                      {template.website && ' 和 '}
                    </>
                  )}
                  {template.website && (
                    <a
                      href={template.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary-600 underline cursor-pointer"
                    >
                      网站
                    </a>
                  )}
                  {' 获取更多信息'}
                </p>
              </div>
            );
          }
          return null;
        })()}
      </CardBody>
    </Card>
  );
});