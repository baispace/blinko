import React from "react";
import { Icon } from "@iconify/react";
import Link from "next/link";
import { useRouter } from "next/router";
import { observer } from "mobx-react-lite";
import { RootStore } from "@/store";
import { BaseStore } from "@/store/baseStore";
import { BlinkoStore } from "@/store/blinkoStore";
import { SideBarItem } from "./index";
import { useTranslation } from "react-i18next";

interface MobileNavBarProps {
  onItemClick?: () => void;
}

export const MobileNavBar = observer(({ onItemClick }: MobileNavBarProps) => {
  const router = useRouter();
  const base = RootStore.Get(BaseStore);
  const { t } = useTranslation(); 
  const blinkoStore = RootStore.Get(BlinkoStore);

  if (blinkoStore.config.value?.isHiddenMobileBar) {
    return null;
  }

  return (
    <div className="h-[70px] flex w-full px-4 py-2 gap-2 bg-background block md:hidden overflow-hidden">
      {base.routerList.filter(i => !i.hiddenMobile).map(i => (
        <Link
          className="flex-1"
          key={i.title}
          href={i.href}
          shallow={i.shallow}
          onClick={() => {
            base.currentRouter = i;
            onItemClick?.();
          }}
        >
          <div
            className={`flex flex-col group ${SideBarItem} ${
              base.isSideBarActive(router, i) ? '!text-foreground' : '!text-desc'
            }`}
          >
            <Icon className={`text-center`} icon={i.icon} width="20" height="20" />
            <div className="text-center text-[10px] mt-[-4px]">{t(i.title)}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}); 