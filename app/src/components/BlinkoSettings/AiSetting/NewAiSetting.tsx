import { observer } from 'mobx-react-lite';
import { Button, Select, SelectItem } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { CollapsibleCard } from '../../Common/CollapsibleCard';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { RootStore } from '@/store';
import { AiStore, AiModel } from '@/store/aiStore';
import { DialogStore } from '@/store/module/Dialog';
import { BlinkoStore } from '@/store/blinkoStore';
import { PromiseCall } from '@/store/standard/PromiseState';
import { api } from '@/lib/trpc';
import ProviderCard from './ProviderCard';
import ProviderDialogContent from './ProviderDialogContent';
import { DefaultModelsSection } from './DefaultModelsSection';
import { GlobalPromptSection } from './GlobalPromptSection';
import { AiPostProcessingSection } from './AiPostProcessingSection';
import { AiToolsSection } from './AiToolsSection';
import { EmbeddingSettingsSection } from './EmbeddingSettingsSection';

const PROVIDER_OPTIONS = [
  {
    value: 'openai',
    label: 'OpenAI',
    defaultName: 'OpenAI',
    defaultBaseURL: 'https://api.openai.com/v1',
    website: 'https://openai.com',
    docs: 'https://platform.openai.com/docs'
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    defaultName: 'Anthropic',
    defaultBaseURL: 'https://api.anthropic.com',
    website: 'https://anthropic.com',
    docs: 'https://docs.anthropic.com'
  },
  {
    value: 'ollama',
    label: 'Ollama',
    defaultName: 'Ollama',
    defaultBaseURL: 'http://localhost:11434',
    website: 'https://ollama.ai',
    docs: 'https://ollama.ai/docs'
  },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    defaultName: 'OpenRouter',
    defaultBaseURL: 'https://openrouter.ai/api/v1',
    website: 'https://openrouter.ai',
    docs: 'https://openrouter.ai/docs'
  },
  {
    value: 'siliconflow',
    label: 'SiliconFlow',
    defaultName: 'SiliconFlow',
    defaultBaseURL: 'https://api.siliconflow.cn/v1',
    website: 'https://siliconflow.cn',
    docs: 'https://docs.siliconflow.cn'
  },
  {
    value: 'custom',
    label: 'Custom',
    defaultName: 'Custom Provider',
    defaultBaseURL: 'https://api.example.com/v1',
    website: '',
    docs: ''
  }
];

export default observer(function NewAiSetting() {
  const { t } = useTranslation();
  const aiStore = RootStore.Get(AiStore);
  const blinko = RootStore.Get(BlinkoStore);

  useEffect(() => {
    blinko.config.call();
    aiStore.aiProviders.call();
  }, []);

  return (
    <div className='flex flex-col gap-4'>
      <CollapsibleCard icon="hugeicons:ai-magic" title="AI Providers & Models">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <Button
              size='md'
              className='ml-auto'
              color="primary"
              startContent={<Icon icon="fluent:cube-add-20-regular" width="16" height="16" />}
              onPress={() => {
                RootStore.Get(DialogStore).setData({
                  isOpen: true,
                  size: '2xl',
                  title: 'Add Provider',
                  content: <ProviderDialogContent />,
                });
              }}
            >
              {t('add-provider')}
            </Button>
          </div>

          {aiStore.aiProviders.value?.map(provider => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </div>
      </CollapsibleCard>

      <DefaultModelsSection />

      <EmbeddingSettingsSection />


      <GlobalPromptSection />

      <AiPostProcessingSection />

      <AiToolsSection />
    </div>
  );
});