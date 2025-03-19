import { observer } from 'mobx-react-lite';
import { Autocomplete, AutocompleteItem, Button, Code, Input, Select, SelectItem, Switch, Tooltip, Chip, Slider, Textarea } from '@heroui/react';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { PromiseCall } from '@/store/standard/PromiseState';
import { Icon } from '@iconify/react';
import { api } from '@/lib/trpc';
import { AiStore } from '@/store/aiStore';
import { useTranslation } from 'react-i18next';
import { Item, ItemWithTooltip } from './Item';
import { useEffect, useState, useRef } from 'react';
import { useMediaQuery } from 'usehooks-ts';
import { ShowRebuildEmbeddingProgressDialog } from '../Common/RebuildEmbeddingProgress';
import { showTipsDialog } from '../Common/TipsDialog';
import TagSelector from '@/components/Common/TagSelector';
import { CollapsibleCard } from '../Common/CollapsibleCard';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { IconButton } from '../Common/Editor/Toolbar/IconButton';
import { StorageState } from '@/store/standard/StorageState';

export const AiSetting = observer(() => {
  const blinko = RootStore.Get(BlinkoStore);
  const ai = RootStore.Get(AiStore);
  const { t } = useTranslation();
  const isPc = useMediaQuery('(min-width: 768px)');
  const embeddingModelsStorage = new StorageState({ key: 'embeddingModels' });

  const [rebuildProgress, setRebuildProgress] = useState<{ percentage: number; isRunning: boolean } | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [embeddingModels, setEmbeddingModels] = useState<Record<string, Array<{ label: string, value: string }>>>({});

  // Load embedding models from localStorage when component mounts
  useEffect(() => {
    const savedEmbeddingModels = embeddingModelsStorage.load();
    if (savedEmbeddingModels) {
      setEmbeddingModels(savedEmbeddingModels);
      
      // Update AI store with the saved embedding models
      if (blinko.config.value?.aiModelProvider && savedEmbeddingModels[blinko.config.value.aiModelProvider]) {
        ai.embeddingSelect[blinko.config.value.aiModelProvider] = savedEmbeddingModels[blinko.config.value.aiModelProvider];
      }
    }
  }, []);

  const fetchRebuildProgress = async () => {
    try {
      const data = await api.ai.rebuildEmbeddingProgress.query();
      if (data) {
        setRebuildProgress({
          percentage: data.percentage,
          isRunning: data.isRunning,
        });

        if (data.isRunning && !pollingIntervalRef.current) {
          startPolling();
        } else if (!data.isRunning && pollingIntervalRef.current) {
          stopPolling();
        }
      }
    } catch (error) {
      console.error('Error fetching rebuild progress:', error);
    }
  };

  const startPolling = () => {
    if (!pollingIntervalRef.current) {
      fetchRebuildProgress();
      pollingIntervalRef.current = setInterval(() => {
        fetchRebuildProgress();
      }, 2000);
    }
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  useEffect(() => {
    fetchRebuildProgress();

    return () => {
      stopPolling();
    };
  }, []);

  const store = RootStore.Local(() => ({
    isVisible: false,
    isEmbeddingKeyVisible: false,
    apiKey: '',
    apiVersion: '',
    embeddingApiKey: '',
    aiPostProcessingPrompt: '',
    embeddingApiEndpoint: '',
    apiEndPoint: '',
    aiModel: '',
    tavilyApiKey: '',
    embeddingModel: '',
    embeddingDimensions: 0,
    embeddingTopK: 2,
    embeddingScore: 1.5,
    embeddingLambda: 0.5,
    tavilyMaxResult: 5,
    showEmeddingAdvancedSetting: false,
    excludeEmbeddingTagId: null as number | null,
    setIsOpen(open: boolean) {
      this.isOpen = open;
    },
  }));

  useEffect(() => {
    store.apiEndPoint = blinko.config.value?.aiApiEndpoint!;
    store.apiVersion = blinko.config.value?.aiApiVersion!;
    store.apiKey = blinko.config.value?.aiApiKey!;
    store.aiModel = blinko.config.value?.aiModel!;
    store.embeddingModel = blinko.config.value?.embeddingModel!;
    store.embeddingTopK = blinko.config.value?.embeddingTopK!;
    store.embeddingScore = blinko.config.value?.embeddingScore!;
    store.embeddingLambda = blinko.config.value?.embeddingLambda!;
    store.embeddingApiEndpoint = blinko.config.value?.embeddingApiEndpoint!;
    store.embeddingApiKey = blinko.config.value?.embeddingApiKey!;
    store.excludeEmbeddingTagId = blinko.config.value?.excludeEmbeddingTagId!;
    store.embeddingDimensions = blinko.config.value?.embeddingDimensions!;
    store.tavilyApiKey = blinko.config.value?.tavilyApiKey!;
    store.tavilyMaxResult = Number(blinko.config.value?.tavilyMaxResult!);
    store.aiPostProcessingPrompt = blinko.config.value?.aiPostProcessingPrompt!;
  }, [blinko.config.value]);

  return (
    <>
      <CollapsibleCard icon="mingcute:ai-line" title="AI">
        <Item
          leftContent={
            <div className="flex items-center gap-2">
              {t('use-ai')}
              <Tooltip
                content={
                  <div className="w-[300px] flex flex-col gap-2">
                    <div>
                      {t('in-addition-to-the-gpt-model-there-is-a-need-to-ensure-that-it-is-possible-to-invoke-the')}
                      <Code color="primary">text-embedding</Code>
                    </div>
                    <div>
                      {t('speech-recognition-requires-the-use-of')}
                      <Code color="primary">whisper</Code>
                    </div>
                  </div>
                }
              >
                <Icon icon="proicons:info" width="18" height="18" />
              </Tooltip>
            </div>
          }
          rightContent={
            <Switch
              isSelected={blinko.config.value?.isUseAI}
              onChange={(e) => {
                PromiseCall(
                  api.config.update.mutate({
                    key: 'isUseAI',
                    value: e.target.checked,
                  }),
                  { autoAlert: false },
                );
                window.location.reload();
              }}
            />
          }
        />
        <Item
          leftContent={<>{t('model-provider')}</>}
          rightContent={
            <Select
              radius="lg"
              selectedKeys={[blinko.config.value?.aiModelProvider!]}
              onSelectionChange={(key) => {
                const value = Array.from(key)[0] as string;
                blinko.config.value!.aiModelProvider = value as any;
                PromiseCall(
                  api.config.update.mutate({
                    key: 'aiModelProvider',
                    value: value,
                  }),
                  { autoAlert: false },
                );
              }}
              size="sm"
              className="w-[200px]"
              label={t('select-model-provider')}
            >
              {ai.modelProviderSelect.map((item) => (
                <SelectItem key={item.value ?? ''} startContent={item.icon}>
                  {item.label}
                </SelectItem>
              ))}
            </Select>
          }
        />

        <Item
          leftContent={<>{t('model')}</>}
          rightContent={
            <div className="flex items-center gap-2">
              <Autocomplete
                radius="lg"
                allowsCustomValue={true}
                selectedKey={store.aiModel ?? ''}
                inputValue={store.aiModel ?? ''}
                onInputChange={(e) => {
                  store.aiModel = e;
                }}
                onBlur={(e) => {
                  PromiseCall(
                    api.config.update.mutate({
                      key: 'aiModel',
                      value: store.aiModel,
                    }),
                    { autoAlert: false },
                  );
                }}
                onSelectionChange={(key) => {
                  store.aiModel = key as string;
                }}
                size="sm"
                className="w-[200px] md:w-[300px]"
                label={t('select-model')}
              >
                {(ai.modelSelect[blinko.config.value?.aiModelProvider!] || []).map((item) => (
                  <AutocompleteItem key={item.value}>{item.label}</AutocompleteItem>
                ))}
              </Autocomplete>
              <Button 
                size="sm"
                color="primary"
                variant='light'
                isIconOnly
                onPress={async () => {
                  try {
                    const provider = blinko.config.value?.aiModelProvider!;
                    let endpoint = '';
                    let url = '';
                    let token = '';
                    console.log(provider,'Ollama')
                    if (provider === 'Ollama') {
                      endpoint = store.apiEndPoint || "http://127.0.0.1:11434";
                      url = `${endpoint}/tags`;
                    } else {
                      endpoint = store.apiEndPoint || "https://api.openai.com";
                      url = `${endpoint}/models`;
                      token = store.apiKey;
                    }
                    
                    const response = await fetch(url, {
                      method: 'GET',
                      headers: provider === 'Ollama' ? {
                        'Content-Type': 'application/json'
                      } : {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                      }
                    });
                    
                    const data = await response.json();
                    
                    if (provider === 'Ollama') {
                      if (data && data.models && Array.isArray(data.models)) {
                        // Create a new array of models in the format expected by the app
                        const modelsList = data.models.map(model => ({
                          label: model.name,
                          value: model.name
                        }));
                        
                        // Update the model selection list for the current provider
                        ai.modelSelect[provider] = modelsList;
                        
                        // For Ollama, use the same models for embedding
                        if (modelsList.length > 0) {
                          const currentEmbeddingModels = embeddingModelsStorage.value || {};
                          currentEmbeddingModels[provider] = modelsList;
                          embeddingModelsStorage.setValue(currentEmbeddingModels);
                          setEmbeddingModels(currentEmbeddingModels);
                          ai.embeddingSelect[provider] = modelsList;
                        }
                      }
                    } else {
                      if (data && data.data && Array.isArray(data.data)) {
                        // Create a new array of models in the format expected by the app
                        const modelsList = data.data.map(model => ({
                          label: model.id,
                          value: model.id
                        }));
                        
                        // Update the model selection list for the current provider
                        ai.modelSelect[provider] = modelsList;
                        
                        // For other providers, filter embedding models
                        const embeddingModelsList = data.data
                          .filter(model => model.id.toLowerCase().includes('embedding'))
                          .map(model => ({
                            label: model.id,
                            value: model.id
                          }));
                        
                        if (embeddingModelsList.length > 0) {
                          const currentEmbeddingModels = embeddingModelsStorage.value || {};
                          currentEmbeddingModels[provider] = embeddingModelsList;
                          embeddingModelsStorage.setValue(currentEmbeddingModels);
                          setEmbeddingModels(currentEmbeddingModels);
                          ai.embeddingSelect[provider] = embeddingModelsList;
                        }
                      }
                    }
                    
                    RootStore.Get(ToastPlugin).success(t('model-list-updated'));
                  } catch (error) {
                    console.error('Error fetching models:', error);
                    RootStore.Get(ToastPlugin).error(error.message || 'ERROR');
                  }
                }}
              >
                <Icon className='hover:rotate-180 transition-all' icon="fluent:arrow-sync-12-filled" width={18} height={18} />
              </Button>
            </div>
          }
        />

        <Item
          type={isPc ? 'row' : 'col'}
          leftContent={
            <div className="flex items-center gap-2">
              {t('embedding-model')}
              <Tooltip
                content={
                  <div className="w-[300px] flex flex-col gap-2">
                    <div>{t('embedding-model-description')}</div>
                  </div>
                }
              >
                <Icon icon="proicons:info" width="18" height="18" />
              </Tooltip>
              <Chip size="sm" color="warning" className="text-white cursor-pointer" onClick={() => (store.showEmeddingAdvancedSetting = !store.showEmeddingAdvancedSetting)}>
                Advanced
              </Chip>
            </div>
          }
          rightContent={
            <div className="flex w-full ml-auto justify-start">
              <Autocomplete
                radius="lg"
                allowsCustomValue={true}
                inputValue={store.embeddingModel ?? ''}
                selectedKey={store.embeddingModel ?? ''}
                onInputChange={(e) => {
                  store.embeddingModel = e;
                }}
                onBlur={(e) => {
                  PromiseCall(
                    api.config.update.mutate({
                      key: 'embeddingModel',
                      value: store.embeddingModel,
                    }),
                    { autoAlert: false },
                  );
                }}
                onSelectionChange={(key) => {
                  store.embeddingModel = key as string;
                }}
                size="sm"
                className={`${isPc ? 'w-[250px]' : 'w-full'}`}
                label={t('embedding-model')}
              >
                {((embeddingModels[blinko.config.value?.aiModelProvider!]) || 
                  ai.embeddingSelect[blinko.config.value?.aiModelProvider!] || []).map((item) => (
                  <AutocompleteItem key={item.value}>{item.label}</AutocompleteItem>
                ))}
              </Autocomplete>
            </div>
          }
        />

        {store.showEmeddingAdvancedSetting && (
          <Item
            className="ml-6"
            type={isPc ? 'row' : 'col'}
            leftContent={<>{t('embedding-api-endpoint')}</>}
            rightContent={
              <div className="flex md:w-[300px] w-full ml-auto justify-start">
                <Input
                  size="sm"
                  label={t('api-endpoint')}
                  variant="bordered"
                  className="w-full"
                  placeholder="https://api.openapi.com/v1/"
                  value={store.embeddingApiEndpoint}
                  onChange={(e) => {
                    store.embeddingApiEndpoint = e.target.value;
                  }}
                  onBlur={() => {
                    PromiseCall(
                      api.config.update.mutate({
                        key: 'embeddingApiEndpoint',
                        value: store.embeddingApiEndpoint,
                      }),
                      { autoAlert: false },
                    );
                  }}
                />
              </div>
            }
          />
        )}

        {store.showEmeddingAdvancedSetting && (
          <Item
            className="ml-6"
            type={isPc ? 'row' : 'col'}
            leftContent={<>{t('embedding-api-key')}</>}
            rightContent={
              <div className="flex md:w-[300px] w-full ml-auto justify-start">
                <Input
                  size="sm"
                  label="API key"
                  variant="bordered"
                  className="w-full"
                  placeholder="Enter your embedding api key"
                  value={store.embeddingApiKey}
                  onChange={(e) => {
                    store.embeddingApiKey = e.target.value;
                  }}
                  onBlur={() => {
                    PromiseCall(
                      api.config.update.mutate({
                        key: 'embeddingApiKey',
                        value: store.embeddingApiKey,
                      }),
                      { autoAlert: false },
                    );
                  }}
                  endContent={
                    <button className="focus:outline-none" type="button" onClick={(e) => (store.isEmbeddingKeyVisible = !store.isEmbeddingKeyVisible)}>
                      {store.isEmbeddingKeyVisible ? <Icon icon="mdi:eye-off" width="20" height="20" /> : <Icon icon="mdi:eye" width="20" height="20" />}
                    </button>
                  }
                  type={store.isEmbeddingKeyVisible ? 'text' : 'password'}
                />
              </div>
            }
          />
        )}

        {store.showEmeddingAdvancedSetting && (
          <Item
            className="ml-6"
            type={isPc ? 'row' : 'col'}
            leftContent={
              <ItemWithTooltip
                content={<>{t('embedding-dimensions')}</>}
                toolTipContent={
                  <div className="md:w-[300px] flex flex-col gap-2">
                    <div>{t('embedding-dimensions-description')}</div>
                  </div>
                }
              />
            }
            rightContent={
              <div className="flex md:w-[300px] w-full ml-auto justify-start">
                <Input
                  type="number"
                  size="sm"
                  variant="bordered"
                  //@ts-ignore
                  value={store.embeddingDimensions}
                  onChange={(e) => {
                    store.embeddingDimensions = Number(e.target.value);
                  }}
                  onBlur={() => {
                    PromiseCall(
                      api.config.update.mutate({
                        key: 'embeddingDimensions',
                        value: store.embeddingDimensions,
                      }),
                      { autoAlert: false },
                    );
                  }}
                />
              </div>
            }
          />
        )}

        {store.showEmeddingAdvancedSetting && (
          <Item
            className="ml-6"
            type={isPc ? 'row' : 'col'}
            leftContent={
              <ItemWithTooltip
                content={<>Top K</>}
                toolTipContent={
                  <div className="md:w-[300px] flex flex-col gap-2">
                    <div>{t('top-k-description')}</div>
                  </div>
                }
              />
            }
            rightContent={
              <div className="flex md:w-[300px] w-full ml-auto justify-start">
                <Slider
                  onChangeEnd={(e) => {
                    PromiseCall(
                      api.config.update.mutate({
                        key: 'embeddingTopK',
                        value: store.embeddingTopK,
                      }),
                      { autoAlert: false },
                    );
                  }}
                  onChange={(e) => {
                    store.embeddingTopK = Number(e);
                  }}
                  value={store.embeddingTopK}
                  size="md"
                  step={1}
                  color="foreground"
                  label={'value'}
                  showSteps={true}
                  maxValue={10}
                  minValue={1}
                  defaultValue={2}
                  className="w-full"
                />
              </div>
            }
          />
        )}

        {store.showEmeddingAdvancedSetting && (
          <Item
            className="ml-6"
            type={isPc ? 'row' : 'col'}
            leftContent={
              <ItemWithTooltip
                content={<>Score</>}
                toolTipContent={
                  <div className="md:w-[300px] flex flex-col gap-2">
                    <div>{t('embedding-score-description')}</div>
                  </div>
                }
              />
            }
            rightContent={
              <div className="flex md:w-[300px] w-full ml-auto justify-start">
                <Slider
                  onChangeEnd={(e) => {
                    PromiseCall(
                      api.config.update.mutate({
                        key: 'embeddingScore',
                        value: store.embeddingScore,
                      }),
                      { autoAlert: false },
                    );
                  }}
                  onChange={(e) => {
                    store.embeddingScore = Number(e);
                  }}
                  value={store.embeddingScore}
                  size="md"
                  step={0.01}
                  color="foreground"
                  label={'value'}
                  showSteps={true}
                  maxValue={1.0}
                  minValue={0.2}
                  defaultValue={0.75}
                  className="w-full"
                />
              </div>
            }
          />
        )}

        {store.showEmeddingAdvancedSetting && (
          <Item
            className="ml-6"
            type={isPc ? 'row' : 'col'}
            leftContent={
              <div className="flex flex-col gap-1">
                <ItemWithTooltip content={<>{t('exclude-tag-from-embedding')}</>} toolTipContent={t('exclude-tag-from-embedding-tip')} />
                <div className="text-desc text-xs">{t('exclude-tag-from-embedding-desc')}</div>
              </div>
            }
            rightContent={
              <TagSelector
                selectedTag={store.excludeEmbeddingTagId?.toString() || null}
                onSelectionChange={(key) => {
                  store.excludeEmbeddingTagId = key ? Number(key) : null;
                  PromiseCall(
                    api.config.update.mutate({
                      key: 'excludeEmbeddingTagId',
                      value: key ? Number(key) : null,
                    }),
                    { autoAlert: false },
                  );
                }}
              />
            }
          />
        )}

        {blinko.config.value?.aiModelProvider != 'Ollama' && !process.env.NEXT_PUBLIC_IS_DEMO && (
          <Item
            type={isPc ? 'row' : 'col'}
            leftContent={
              <div className="flex flex-col ga-1">
                <div>API Key</div>
                <div className="text-desc text-xs">{t('user-custom-openai-api-key')}</div>
              </div>
            }
            rightContent={
              <Input
                size="sm"
                label="API key"
                variant="bordered"
                className="w-full md:w-[300px]"
                placeholder="Enter your api key"
                value={store.apiKey}
                onChange={(e) => {
                  store.apiKey = e.target.value;
                }}
                onBlur={(e) => {
                  PromiseCall(
                    api.config.update.mutate({
                      key: 'aiApiKey',
                      value: store.apiKey.trim(),
                    }),
                    { autoAlert: false },
                  );
                }}
                endContent={
                  <button className="focus:outline-none" type="button" onClick={(e) => (store.isVisible = !store.isVisible)} aria-label="toggle password visibility">
                    {store.isVisible ? <Icon icon="mdi:eye-off" width="20" height="20" /> : <Icon icon="mdi:eye" width="20" height="20" />}
                  </button>
                }
                type={store.isVisible ? 'text' : 'password'}
              />
            }
          />
        )}

        {blinko.config.value?.aiModelProvider == 'AzureOpenAI' && (
          <Item
            type={isPc ? 'row' : 'col'}
            leftContent={
              <div className="flex flex-col ga-1">
                <>{t('user-custom-azureopenai-api-version')}</>
              </div>
            }
            rightContent={
              <Input
                variant="bordered"
                className="w-full md:w-[300px]"
                placeholder="Enter API version"
                value={store.apiVersion}
                onChange={(e) => {
                  store.apiVersion = e.target.value;
                }}
                onBlur={(e) => {
                  PromiseCall(
                    api.config.update.mutate({
                      key: 'aiApiVersion',
                      value: store.apiVersion,
                    }),
                    { autoAlert: false },
                  );
                }}
                type="text"
              />
            }
          />
        )}

        {(blinko.config.value?.aiModelProvider == 'OpenAI' || blinko.config.value?.aiModelProvider == 'Ollama') && (
          <Item
            type={isPc ? 'row' : 'col'}
            leftContent={
              <div className="flex flex-col gap-1">
                <>{t('endpoint')}</>
                {blinko.config.value?.aiModelProvider == 'Ollama' && <div className="text-desc text-xs">http://127.0.0.1:11434/api</div>}
              </div>
            }
            rightContent={
              <div className="flex gap-2 items-center">
                <Input
                  size="sm"
                  label={t('api-endpoint')}
                  variant="bordered"
                  className="w-full md:w-[300px]"
                  placeholder="https://api.openapi.com/v1/"
                  value={store.apiEndPoint}
                  onChange={(e) => {
                    store.apiEndPoint = e.target.value;
                  }}
                  onBlur={(e) => {
                    PromiseCall(
                      api.config.update.mutate({
                        key: 'aiApiEndpoint',
                        value: store.apiEndPoint.trim(),
                      }),
                      { autoAlert: false },
                    );
                  }}
                />
                <IconButton
                  icon="hugeicons:connect"
                  containerSize={40}
                  tooltip={<div>{t('check-connect')}</div>}
                  onClick={async (e) => {
                    RootStore.Get(ToastPlugin).promise(api.ai.testConnect.mutate(), {
                      loading: t('loading'),
                      success: t('check-connect-success'),
                      error: t('check-connect-error'),
                    });
                  }}
                />
              </div>
            }
          />
        )}

        <Item
          type={isPc ? 'row' : 'col'}
          leftContent={
            <div className="flex flex-col  gap-2">
              <div>{t('rebuild-embedding-index')}</div>
              <div className="text-desc text-xs">{t('notes-imported-by-other-means-may-not-have-embedded-vectors')}</div>
            </div>
          }
          rightContent={
            <div className="flex w-full ml-auto justify-end gap-2">
              <Button
                color="danger"
                startContent={
                  rebuildProgress?.isRunning ? (
                    <div className="flex items-center gap-1">
                      <Icon icon="line-md:loading-twotone-loop" width="20" height="20" />
                      {rebuildProgress.percentage}%
                    </div>
                  ) : (
                    <Icon icon="mingcute:refresh-4-ai-line" width="20" height="20" />
                  )
                }
                onPress={() => {
                  if (rebuildProgress?.isRunning) {
                    showTipsDialog({
                      title: t('rebuild-in-progress'),
                      content: t('there-is-a-rebuild-task-in-progress-do-you-want-to-restart'),
                      onConfirm: async () => {
                        await api.ai.rebuildEmbeddingStart.mutate({ force: true });
                        setRebuildProgress((prev) => ({
                          percentage: 0,
                          isRunning: true,
                        }));
                        startPolling();
                        ShowRebuildEmbeddingProgressDialog(true);
                      },
                    });
                  } else {
                    showTipsDialog({
                      title: t('force-rebuild-embedding-index'),
                      content: t('if-you-have-a-lot-of-notes-you-may-consume-a-certain-number-of-tokens'),
                      onConfirm: async () => {
                        await api.ai.rebuildEmbeddingStart.mutate({ force: true });
                        setRebuildProgress((prev) => ({
                          percentage: 0,
                          isRunning: true,
                        }));
                        startPolling();
                        ShowRebuildEmbeddingProgressDialog(true);
                      },
                    });
                  }
                }}
              >
                {!!rebuildProgress?.isRunning ? t('rebuild-in-progress') : t('force-rebuild')}
              </Button>
            </div>
          }
        />
      </CollapsibleCard>

      <CollapsibleCard className="mt-4" icon="tabler:robot" title={t('ai-post-processing')}>
        <Item
          leftContent={
            <div className="flex items-center gap-2">
              {t('enable-ai-post-processing')}
              <Tooltip
                content={
                  <div className="w-[300px] flex flex-col gap-2">
                    <div>
                      {t('automatically-process-notes-after-creation-or-update')}
                    </div>
                    <div>
                      {t('can-generate-summaries-tags-or-perform-analysis')}
                    </div>
                  </div>
                }
              >
                <Icon icon="proicons:info" width="18" height="18" />
              </Tooltip>
            </div>
          }
          rightContent={
            <Switch
              isSelected={blinko.config.value?.isUseAiPostProcessing}
              onChange={(e) => {
                PromiseCall(
                  api.config.update.mutate({
                    key: 'isUseAiPostProcessing',
                    value: e.target.checked,
                  }),
                  { autoAlert: false },
                );
              }}
            />
          }
        />

        {blinko.config.value?.isUseAiPostProcessing && (
          <>
            <Item
              type={isPc ? 'row' : 'col'}
              leftContent={
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    {t('ai-post-processing-prompt')}
                    <Tooltip
                      content={
                        <div className="w-[300px] flex flex-col gap-2">
                          <div>{t('define-custom-prompt-for-ai-to-process-notes')}</div>
                        </div>
                      }
                    >
                      <Icon icon="proicons:info" width="18" height="18" />
                    </Tooltip>
                  </div>
                  <div className="text-[12px] text-default-400">{t('prompt-used-for-post-processing-notes')}</div>
                </div>
              }
              rightContent={
                <Textarea
                  radius="lg"
                  value={store.aiPostProcessingPrompt ?? t('analyze-the-following-note-content-and-suggest-appropriate-tags-and-provide-a-brief-summary')}
                  onBlur={(e) => {
                    PromiseCall(
                      api.config.update.mutate({
                        key: 'aiPostProcessingPrompt',
                        value: e.target.value,
                      }),
                      { autoAlert: false },
                    );
                  }}
                  onChange={(e) => {
                    store.aiPostProcessingPrompt = e.target.value;
                  }}
                  placeholder={t('enter-custom-prompt-for-post-processing')}
                  className="w-full"
                />
              }
            />

            <Item
              type={isPc ? 'row' : 'col'}
              leftContent={
                <div className="flex flex-col gap-1">
                  <div>{t('ai-post-processing-mode')}</div>
                  <div className="text-[12px] text-default-400">{t('choose-what-to-do-with-ai-results')}</div>
                </div>
              }
              rightContent={
                <Select
                  radius="lg"
                  selectedKeys={[blinko.config.value?.aiPostProcessingMode ?? 'comment']}
                  onSelectionChange={(key) => {
                    const value = Array.from(key)[0] as string;
                    PromiseCall(
                      api.config.update.mutate({
                        key: 'aiPostProcessingMode',
                        value: value,
                      }),
                      { autoAlert: false },
                    );
                  }}
                  size="sm"
                  className="w-[200px]"
                >
                  <SelectItem key="comment" startContent={<Icon icon="tabler:message" />}>
                    {t('add-as-comment')}
                  </SelectItem>
                  <SelectItem key="tags" startContent={<Icon icon="tabler:tags" />}>
                    {t('auto-add-tags')}
                  </SelectItem>
                  <SelectItem key="both" startContent={<Icon icon="tabler:analyze" />}>
                    {t('both')}
                  </SelectItem>
                </Select>
              }
            />
          </>
        )}
      </CollapsibleCard>

      <CollapsibleCard icon="pajamas:issue-type-enhancement" title={t('ai-tools')} className="mt-4">
        <Item
          leftContent={<>{t('tavily-api-key')}</>}
          rightContent={
            <Input
              size="sm"
              label="API key"
              variant="bordered"
              className="w-full md:w-[300px]"
              value={store.tavilyApiKey}
              onChange={(e) => {
                store.tavilyApiKey = e.target.value;
              }}
              onBlur={(e) => {
                PromiseCall(
                  api.config.update.mutate({
                    key: 'tavilyApiKey',
                    value: store.tavilyApiKey,
                  }),
                  { autoAlert: false },
                );
              }}
            />
          }
        />

        <Item
          leftContent={
            <div className="flex flex-col gap-1">
              <>{t('tavily-max-results')}</>
            </div>
          }
          rightContent={
            <div className="flex md:w-[300px] w-full ml-auto justify-start">
              <Slider
                onBlur={(e) => {
                  PromiseCall(
                    api.config.update.mutate({
                      key: 'tavilyMaxResult',
                      value: store.tavilyMaxResult,
                    }),
                    { autoAlert: false },
                  );
                }}
                onChange={(e) => {
                  store.tavilyMaxResult = Number(e);
                }}
                value={Number(store.tavilyMaxResult)}
                size="md"
                step={1}
                color="foreground"
                label={'value'}
                showSteps={true}
                maxValue={10}
                minValue={1}
                defaultValue={5}
                className="w-full"
              />
            </div>
          }
        />
      </CollapsibleCard>
    </>
  );
});
