import React, { useEffect } from "react";
import { ScrollShadow, Image, Button } from "@nextui-org/react";
import { Icon } from "@iconify/react";
import Link from "next/link";
import { useRouter } from "next/router";
import { observer } from "mobx-react-lite";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { TagListPanel } from "../Common/TagListPanel";
import { SideBarItem } from "./index";
import { RootStore } from "@/store";
import { BaseStore } from "@/store/baseStore";
import { BlinkoStore } from "@/store/blinkoStore";
import { useMediaQuery } from "usehooks-ts";

interface SidebarProps {
  onItemClick?: () => void;
}

export const Sidebar = observer(({ onItemClick }: SidebarProps) => {
  const router = useRouter();
  const isPc = useMediaQuery('(min-width: 768px)')
  const { theme } = useTheme();
  const { t } = useTranslation();
  const base = RootStore.Get(BaseStore);
  const blinkoStore = RootStore.Get(BlinkoStore);

  useEffect(() => {
    if (!isPc) {
      base.collapseSidebar();
    }
  }, [isPc]);

  return (
    <div
      style={{ width: `${base.sideBarWidth}px` }}
      className={`flex h-full flex-1 flex-col p-4 relative bg-background 
        ${!base.isDragging ? 'transition-all duration-300' : 'transition-none'} 
        group/sidebar`}
    >
      {!base.isSidebarCollapsed && (
        <div
          className={`absolute right-0 top-0 h-full w-2 cursor-col-resize 
            hover:bg-primary/20 active:bg-primary/40 z-50
            ${base.isResizing ? 'bg-primary/40' : ''}`}
          onMouseDown={base.startResizing}
          onClick={(e) => e.stopPropagation()}
          style={{ touchAction: 'none' }}
        />
      )}
      <div className="flex items-center  select-none w-full">
        {!base.isSidebarCollapsed && (
          theme == 'dark' ? (
            <Image src="/logo-dark.png" width={100} radius="none"/>
          ) : (
            <Image src="/logo-light.png" width={100} radius="none"/>
          )
        )}
        {
          isPc && <Button
            isIconOnly
            variant="light"
            className={`opacity-0  group-hover/sidebar:opacity-100  ${!base.isSidebarCollapsed ? 'ml-auto group-hover/sidebar:-translate-x-1' : 'opacity-100 translate-x-0'}`}
            onPress={base.toggleSidebar}
          >
            <Icon
              icon={base.isSidebarCollapsed ? "mdi:chevron-right" : "mdi:chevron-left"}
              width="20"
              height="20"
            />
          </Button>
        }
      </div>
      <ScrollShadow className="-mr-[16px] mt-[-5px] h-full max-h-full pr-6">
        <div className={`flex flex-col gap-2 mt-4 font-semibold ${base.isSidebarCollapsed ? 'items-center gap-4' : ''}`}>
          {base.routerList.map(i => (
            <Link
              key={i.title}
              shallow={i.shallow}
              href={i.href}
              onClick={() => {
                base.currentRouter = i;
                onItemClick?.();
              }}
            >
              <div
                className={`group ${SideBarItem} ${i?.href == router.pathname ? '!bg-primary !text-primary-foreground' : ''}`}
              >
                <Icon
                  className={`${base.isSidebarCollapsed ? '' : 'group-hover:translate-x-1'} transition-all`}
                  icon={i.icon}
                  width="20"
                  height="20"
                />
                {!base.isSidebarCollapsed && (
                  <div className="group-hover:translate-x-1 transition-all">
                    {t(i.title)}
                  </div>
                )}
              </div>
            </Link>
          ))}
          {!base.isSidebarCollapsed &&
            blinkoStore.tagList.value?.listTags.length != 0 &&
            blinkoStore.tagList.value?.listTags && (
              <TagListPanel />
            )}
        </div>
      </ScrollShadow>

      {/* ***** background *****  */}
      <div className="halation absolute inset-0 h-[250px] w-[250px] overflow-hidden blur-3xl z-[0] pointer-events-none">
        <div
          className="w-full h-[100%] bg-[#ffc65c] opacity-20"
          style={{ clipPath: "circle(35% at 50% 50%)" }}
        />
      </div>
    </div>
  );
}); 