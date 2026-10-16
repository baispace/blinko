import { RootStore } from '@/store';
import { DialogStore } from '@/store/module/Dialog';
import { SettingsWorkspace } from './SettingsWorkspace';

export const SettingsDialog = ({ initialSection }: { initialSection?: string }) => <div className="h-[min(84dvh,820px)] min-h-0 w-full"><SettingsWorkspace initialSection={initialSection} /></div>;

export const ShowSettingsDialog = (initialSection?: string) => {
  RootStore.Get(DialogStore).setData({
    isOpen: true,
    size: '5xl' as any,
    noPadding: true,
    onlyContent: true,
    showOnlyContentCloseButton: true,
    content: <SettingsDialog initialSection={initialSection} />,
  });
};
