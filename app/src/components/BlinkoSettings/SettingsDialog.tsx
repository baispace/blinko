import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollArea } from "@/components/Common/ScrollArea";
import { Icon } from "@/components/Common/Iconify/icons";
import { RootStore } from "@/store";
import { UserStore } from "@/store/user";
import { BlinkoStore } from "@/store/blinkoStore";
import { DialogStore } from "@/store/module/Dialog";
import { isDesktop } from "@/lib/tauriHelper";
import { allSettings } from "@/components/BlinkoSettings/settingsRegistry";

/**
 * Settings as an overlay instead of a route.
 *
 * `/settings` stays as a routable page (GlobalSearch deep-links to
 * /settings?section=xxx), but opening settings from the sidebar no longer
 * throws away whatever the user was reading. All 14 sections live in here,
 * including the heavy ones (AI, plugins, storage) — the panel is wide enough
 * and each section scrolls on its own.
 */
export const SettingsDialog = observer(({ initialSection }: { initialSection?: string }) => {
  const user = RootStore.Get(UserStore);
  const blinkoStore = RootStore.Get(BlinkoStore);
  const { t } = useTranslation();

  const [selected, setSelected] = useState<string>(() =>
    initialSection && allSettings.some((s) => s.key === initialSection) ? initialSection : 'basic'
  );
  const [keyword, setKeyword] = useState('');

  // GlobalSearch filters settings through blinkoStore.searchText; keep the
  // local box in sync when it is driven from there, and vice versa is not
  // needed because this overlay owns the box while it is open.
  useEffect(() => {
    if (blinkoStore.searchText && !keyword) setKeyword(blinkoStore.searchText);
  }, [blinkoStore.searchText]);

  const visible = allSettings
    .filter((setting) => !setting.requireAdmin || user.isSuperAdmin)
    .filter((setting) => setting.key !== 'hotkey' || isDesktop())
    .filter((setting) => {
      if (!keyword) return true;
      const q = keyword.toLowerCase();
      return (
        setting.title.toLowerCase().includes(q) ||
        setting.keywords?.some((k) => k.toLowerCase().includes(q))
      );
    });

  const current = allSettings.find((s) => s.key === selected);

  return (
    <div className="flex h-[min(78vh,720px)] min-h-[420px] w-full flex-col">
      <div className="flex items-center gap-3 border-b border-default-200 px-4 py-3">
        <span className="text-[15px] font-semibold">{t('settings')}</span>
        <div className="ml-2 flex h-8 max-w-[280px] flex-1 items-center gap-2 rounded-lg bg-default-100 px-3">
          <Icon icon="lets-icons:search" width="14" height="14" className="shrink-0 text-default-500" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t('search')}
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-default-400"
          />
          {keyword && (
            <button onClick={() => setKeyword('')} className="text-default-400 hover:text-default-600">
              <Icon icon="mingcute:close-circle-fill" width="14" height="14" />
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-[190px] shrink-0 overflow-y-auto bg-default-50 p-2">
          {visible.length === 0 && (
            <div className="px-3 py-6 text-center text-[12.5px] text-default-400">{t('no-results')}</div>
          )}
          {visible.map((item) => (
            <button
              key={item.key}
              onClick={() => setSelected(item.key)}
              className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
                selected === item.key
                  ? 'bg-primary/10 font-semibold text-primary'
                  : 'text-default-700 hover:bg-default-100'
              }`}
            >
              {item.icon && <Icon icon={item.icon} width="16" height="16" className="shrink-0" />}
              <span className="truncate font-medium">
                {typeof item.title === 'string' ? t(item.title) : item.title}
              </span>
            </button>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto">
          <ScrollArea onBottom={() => { }} className="h-full">
            {/* 内容区紧凑：max-w 760px + gap-4 + px-5，比 860/6/6 更密。
                section 内部组件各自管自己布局，这里只收紧外层节奏。 */}
            <div className="flex max-w-[760px] flex-col gap-4 px-5 py-4">
              {current ? <div key={current.key}>{current.component}</div> : null}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
});

/** Open the settings overlay from anywhere (sidebar gear, shortcut, …). */
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