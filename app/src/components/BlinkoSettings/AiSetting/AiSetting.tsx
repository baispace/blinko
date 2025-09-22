import { observer } from 'mobx-react-lite';
import { Button, Select, SelectItem } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { CollapsibleCard } from '../../Common/CollapsibleCard';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { RootStore } from '@/store';
import { DialogStore } from '@/store/module/Dialog';
import { BlinkoStore } from '@/store/blinkoStore';
import ProviderCard from './ProviderCard';
import ProviderDialogContent from './ProviderDialogContent';
import { DefaultModelsSection } from './DefaultModelsSection';
import { GlobalPromptSection } from './GlobalPromptSection';
import { AiPostProcessingSection } from './AiPostProcessingSection';
import { AiToolsSection } from './AiToolsSection';
import { EmbeddingSettingsSection } from './EmbeddingSettingsSection';
import ModelDialogContent from './ModelDialogContent';
import { AiSettingStore } from '@/store/aiSettingStore';


export default observer(function AiSetting() {
  const { t } = useTranslation();
  const aiStore = RootStore.Get(AiSettingStore);
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
              startContent={<Icon icon="iconamoon:cloud-add-light" width="20" height="20" />}
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
            <ProviderCard key={provider.id} provider={provider as any} />
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