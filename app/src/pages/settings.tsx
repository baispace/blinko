import { observer } from 'mobx-react-lite';
import { ScrollArea } from '@/components/Common/ScrollArea';
import { UserStore } from '@/store/user';
import { RootStore } from '@/store';
import { useTranslation } from 'react-i18next';
import { ScrollableTabs, TabItem } from '@/components/Common/ScrollableTabs';
import { useState, useEffect } from 'react';
import { BlinkoStore } from '@/store/blinkoStore';
import { ImportAIDialog } from '@/components/BlinkoSettings/ImportAIDialog';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Icon } from '@/components/Common/Iconify/icons';
import { isDesktop } from '@/lib/tauriHelper';
import { allSettings } from '@/components/BlinkoSettings/settingsRegistry';

export { allSettings };

const Page = observer(() => {
  const user = RootStore.Get(UserStore);
  const blinkoStore = RootStore.Get(BlinkoStore);
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string>(() => {
    // Deep links from GlobalSearch land here as /settings?section=xxx
    const section = new URLSearchParams(window.location.search).get('section');
    return section && allSettings.some((s) => s.key === section) ? section : 'basic';
  });
  const isMobile = useMediaQuery('(max-width: 768px)');

  const getVisibleSettings = () => {
    let settings = allSettings.filter((setting) => !setting.requireAdmin || user.isSuperAdmin);

    // Hide hotkey settings on mobile platforms
    settings = settings.filter((setting) =>
      (setting.key !== 'hotkey' || isDesktop())
    );

    if (blinkoStore.searchText) {
      const lowerSearchText = blinkoStore.searchText.toLowerCase();
      const filteredSettings = settings.filter((setting) =>
        setting.title.toLowerCase().includes(lowerSearchText) ||
        setting.keywords?.some((keyword) => keyword.toLowerCase().includes(lowerSearchText))
      );

      // If no settings match the search criteria, return all settings instead of an empty list
      if (filteredSettings.length === 0) {
        return settings;
      }

      return filteredSettings;
    }

    return settings;
  };

  const getCurrentComponent = () => {
    const setting = allSettings.find((s) => s.key === selected);
    return setting ? <div key={setting.key}>{setting.component}</div> : null;
  };

  const tabItems: TabItem[] = getVisibleSettings().map((setting) => ({
    key: setting.key,
    title: setting.title,
    icon: setting.icon,
  }));

  return (
    <div className="h-full flex flex-col">
      <ImportAIDialog onSelectTab={setSelected} />

      {isMobile ? (
        <div className="w-full">
          <div className="sticky top-0 z-10 w-full">
            <div className="mx-1 backdrop-blur-md bg-background rounded-2xl">
              {isMobile && <div className='h-16'></div>}
              <ScrollableTabs
                items={tabItems}
                selectedKey={selected}
                onSelectionChange={setSelected}
                color="primary"
              />
            </div>
          </div>
          <ScrollArea onBottom={() => { }} className="flex-1">
            <div className="max-w-[1024px] mx-auto flex flex-col gap-6 px-2 py-4">
              {getCurrentComponent()}
            </div>
          </ScrollArea>
        </div>
      ) : (
        <div className="w-full max-w-[1200px] mx-auto px-4 py-4 flex flex-row h-full">
          <div className="w-56 mr-6">
            <div className="rounded-xl bg-background p-1 mb-4">
              <ScrollArea onBottom={() => { }} className="h-auto max-h-[calc(100vh-140px)]">
                <div className="p-1 flex flex-col flex-nowrap gap-1">
                  {tabItems.map((item) => (
                    <button
                      key={item.key}
                      onClick={() => setSelected(item.key)}
                      className={`cursor-pointer flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${selected === item.key
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-muted/50 text-foreground/80 hover:text-foreground'
                        }`}
                    >
                      {item.icon && (
                        <span className="flex-shrink-0 mr-2">
                          <Icon icon={item.icon} width="18" />
                        </span>
                      )}
                      <span className="font-bold">{typeof item.title === 'string' ? t(item.title) : item.title}</span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            <ScrollArea onBottom={() => { }} className="h-full">
              <div className="max-w-[900px] mx-auto flex flex-col gap-6">
                {getCurrentComponent()}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
});

export default Page;
