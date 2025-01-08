import { observer } from "mobx-react-lite";
import { BasicSetting } from "@/components/BlinkoSettings/BasicSetting";
import { AiSetting } from "@/components/BlinkoSettings/AiSetting";
import { PerferSetting } from "@/components/BlinkoSettings/PerferSetting";
import { TaskSetting } from "@/components/BlinkoSettings/TaskSetting";
import { ImportSetting } from "@/components/BlinkoSettings/ImportSetting";
import { ScrollArea } from "@/components/Common/ScrollArea";
import { UserStore } from "@/store/user";
import { RootStore } from "@/store";
import { UserSetting } from "@/components/BlinkoSettings/UserSetting";
import { AboutSetting } from "@/components/BlinkoSettings/AboutSetting";
import { StorageSetting } from "@/components/BlinkoSettings/StorageSetting";
import { ExportSetting } from "@/components/BlinkoSettings/ExportSetting";
import { MusicSetting } from "@/components/BlinkoSettings/MusicSetting";
import { SSOSetting } from "@/components/BlinkoSettings/SSOSetting";
import { Tabs, Tab } from "@nextui-org/react";
import { Icon } from "@iconify/react";
import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { JSX } from "react";
import { Button } from "@nextui-org/react";

type SettingItem = {
  key: string;
  title: string;
  icon: string;
  component: JSX.Element;
  requireAdmin: boolean;
}

const Page = observer(() => {
  const user = RootStore.Get(UserStore)
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string>("all")
  const containerRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  const allSettings: SettingItem[] = [
    {
      key: "all",
      title: t('all'),
      icon: "tabler:settings",
      component: <></>,
      requireAdmin: false
    },
    {
      key: "basic",
      title: t('basic-information'),
      icon: "tabler:tool",
      component: <BasicSetting />,
      requireAdmin: false
    },
    {
      key: "prefer",
      title: t('preference'),
      icon: "tabler:settings-2",
      component: <PerferSetting />,
      requireAdmin: false
    },
    {
      key: "user",
      title: t('user-list'),
      icon: "tabler:users",
      component: <UserSetting />,
      requireAdmin: true
    },
    {
      key: "ai",
      title: 'AI',
      icon: "tabler:brain",
      component: <AiSetting />,
      requireAdmin: true
    },
    {
      key: "task",
      title: t('schedule-task'),
      icon: "tabler:list-check",
      component: <TaskSetting />,
      requireAdmin: true
    },
    {
      key: "storage",
      title: t('storage'),
      icon: "tabler:database",
      component: <StorageSetting />,
      requireAdmin: true
    },
    {
      key: "music",
      title: t('music-settings'),
      icon: "tabler:music",
      component: <MusicSetting />,
      requireAdmin: true
    },
    {
      key: "import",
      title: t('import'),
      icon: "tabler:file-import",
      component: <ImportSetting />,
      requireAdmin: true
    },
    {
      key: "sso",
      title: t('sso-settings'),
      icon: "tabler:key",
      component: <SSOSetting />,
      requireAdmin: true
    },
    {
      key: "export",
      title: t('export'),
      icon: "tabler:file-export",
      component: <ExportSetting />,
      requireAdmin: false
    },
    {
      key: "about",
      title: t('about'),
      icon: "tabler:info-circle",
      component: <AboutSetting />,
      requireAdmin: false
    }
  ]

  const getVisibleSettings = () => {
    return allSettings.filter(setting => !setting.requireAdmin || user.isSuperAdmin)
  }

  const getCurrentComponent = () => {
    if (selected === "all") {
      return getVisibleSettings()
        .filter(setting => setting.key !== "all")
        .map(setting => (
          <div key={setting.key}>{setting.component}</div>
        ))
    }
    const setting = allSettings.find(s => s.key === selected)
    return setting ? <div key={setting.key}>{setting.component}</div> : null
  }

  const checkScroll = () => {
    if (!containerRef.current) return;
    const tabList = containerRef.current.querySelector('[role="tablist"]');
    if (!tabList) return;
    
    const { scrollLeft, scrollWidth, clientWidth } = tabList as HTMLElement;
    setShowLeftArrow(scrollLeft > 0);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
  };

  useEffect(() => {
    const timer = setTimeout(checkScroll, 100);
    
    const tabList = containerRef.current?.querySelector('[role="tablist"]');
    if (tabList) {
      tabList.addEventListener('scroll', checkScroll);
    }

    window.addEventListener('resize', checkScroll);

    return () => {
      clearTimeout(timer);
      if (tabList) {
        tabList.removeEventListener('scroll', checkScroll);
      }
      window.removeEventListener('resize', checkScroll);
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(checkScroll, 100);
    return () => clearTimeout(timer);
  }, [user.isSuperAdmin]);

  const scroll = (direction: 'left' | 'right') => {
    if (!containerRef.current) return;
    const tabList = containerRef.current.querySelector('[role="tablist"]');
    if (!tabList) return;

    const scrollAmount = 200;
    (tabList as HTMLElement).scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  return <div className="h-mobile-full flex flex-col">
    <div className="sticky top-0 z-10 w-full">
      <div className="relative  md:max-w-[980px] md:-translate-x-[3px] mx-3 md:mx-auto backdrop-blur-md bg-background rounded-2xl" ref={containerRef}>
        {showLeftArrow && (
          <Button
            isIconOnly
            variant="light"
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-background/60 backdrop-blur-sm"
            size="sm"
            onPress={() => scroll('left')}
          >
            <Icon icon="tabler:chevron-left" width="18" />
          </Button>
        )}
        <Tabs
          aria-label="Settings categories"
          color="primary"
          selectedKey={selected}
          onSelectionChange={(key) => setSelected(key as string)}
          classNames={{
            base: "w-full",
            tabList: "gap-2 relative p-2 w-full bg-transparent text-foreground overflow-x-auto scroll-smooth",
            cursor: "shadow-medium rounded-xl bg-primary",
            tab: "max-w-fit px-3 h-10 data-[selected=true]:text-primary-foreground rounded-xl",
          }}
        >
          {getVisibleSettings().map(setting => (
            <Tab
              key={setting.key}
              title={
                <div className="flex items-center space-x-2">
                  <Icon icon={setting.icon} width="18" />
                  <span className="text-sm">{setting.title}</span>
                </div>
              }
            />
          ))}
        </Tabs>
        {showRightArrow && (
          <Button
            isIconOnly
            variant="light"
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-background/60 backdrop-blur-sm"
            size="sm"
            onPress={() => scroll('right')}
          >
            <Icon icon="tabler:chevron-right" width="18" />
          </Button>
        )}
      </div>
    </div>
    <ScrollArea onBottom={() => { }} className="flex-1 md:mb-[70px]">
      <div className="max-w-[1024px] mx-auto flex flex-col gap-6 px-4 md:px-6 py-4">
        {getCurrentComponent()}
      </div>
    </ScrollArea>
  </div>
});

export default Page