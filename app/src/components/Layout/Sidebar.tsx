import { rememberHomeUrl } from '@/lib/profileIdentity';
import { UserStore } from '@/store/user';
import { ShowSettingsDialog } from '../BlinkoSettings/SettingsDialog';
import { SiteBrand } from '../Common/SiteBrand';
import {
  parseWorkspaceMenu,
  DEFAULT_WORKSPACE_MENU,
  resolveMenuLabel,
  type WorkspaceMenuItem,
} from '../Common/SiteQuickLinks';
import { Icon } from '@/components/Common/Iconify/icons';
import { observer } from 'mobx-react-lite';
import { ScrollShadow, Tooltip, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownSection } from '@heroui/react';
import { RootStore } from '@/store';
import { BaseStore } from '@/store/baseStore';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'usehooks-ts';
import { UserAvatarDropdown } from '../Common/UserAvatarDropdown';
import { TagListPanel } from '../Common/TagListPanel';
import { useEffect, useRef, useTransition, type MouseEvent } from 'react';
import { BlinkoStore } from '@/store/blinkoStore';
import { useLocation, useSearchParams, useNavigate, Link } from 'react-router-dom';

import { AiStore } from '@/store/aiStore';
import { AiConversactionList } from '../BlinkoAi/aiConversactionList';

interface SidebarProps {
  onItemClick?: () => void;
}

/** Sidebar sections, in display order. Keys match `BaseStore.routerList[].group`. */
const NAV_GROUPS = [
  { key: 'record', label: 'group-record' },
  { key: 'tidy', label: 'group-tidy' },
  { key: 'tool', label: 'group-tool' },
] as const;

/**
 * 图标着色表 —— 对齐原型 blinko-home-redesign.html：记录组的三个图标带色
 * （闪念 yellow-500 / 笔记 blue-500 / 待办 green-500），其它图标保持 muted。
 * 折叠态下用户能凭颜色一眼分辨记录类型，符合用户反馈「图标要明显区别」。
 */
const NAV_ICON_COLOR: Record<string, string> = {
  blinko: 'text-yellow-500',
  notes: 'text-blue-500',
  todo: 'text-green-500',
};


export const Sidebar = observer(({ onItemClick }: SidebarProps) => {
  const isPc = useMediaQuery('(min-width: 768px)');
  const { t,i18n } = useTranslation();
  const text=(zh:string,en:string)=>i18n.language.startsWith('zh')?zh:en;
  const user=RootStore.Get(UserStore);
  const [isSwitching,startTransition]=useTransition();
  const base = RootStore.Get(BaseStore);
  const blinkoStore = RootStore.Get(BlinkoStore);
  const location = useLocation();
  const navigate = useNavigate();
  const aiStore = RootStore.Get(AiStore);
  const aiMode = location.pathname === "/ai";
  const previousHome = useRef('/');
  const homeUrl = rememberHomeUrl(location, previousHome.current);
  const workspaceMenuConfig = parseWorkspaceMenu(blinkoStore.config.value?.customQuickLinks);
  const isSuperAdmin = user.role === 'superadmin';
  const isZh = i18n.language.startsWith('zh');
  // 用户未配置时直接走代码内置默认；超级管理员才看得到 appearance 项。
  const workspaceMenu: WorkspaceMenuItem[] =
    workspaceMenuConfig.length > 0
      ? workspaceMenuConfig.filter(item => !(item.type === 'system' && item.action === 'appearance' && !isSuperAdmin))
      : DEFAULT_WORKSPACE_MENU().filter(item => !(item.type === 'system' && item.action === 'appearance' && !isSuperAdmin));

  useEffect(() => { previousHome.current = homeUrl; }, [homeUrl]);

  const dispatchMenuItem = (item: WorkspaceMenuItem) => {
    onItemClick?.();
    if (item.type === 'external') {
      window.open(item.target, '_blank', 'noopener,noreferrer');
      return;
    }
    if (item.type === 'system') {
      if (item.action === 'home') {
        startTransition(() => { void navigate(homeUrl); });
        return;
      }
      if (item.action === 'appearance') { ShowSettingsDialog('site'); return; }
      if (item.action === 'about') { ShowSettingsDialog('about'); return; }
      return;
    }
    if (item.type === 'internal') {
      startTransition(() => { void navigate(item.target); });
    }
  };

  const renderMenuStart = (item: WorkspaceMenuItem) => {
    if (item.icon?.startsWith('data:')) {
      return <img src={item.icon} alt="" width={18} height={18} className="size-[18px] shrink-0 rounded-sm object-contain" />;
    }
    return <Icon icon={item.icon} width={18} height={18} className="shrink-0" />;
  };
  const switchMode = (event:MouseEvent<HTMLAnchorElement>, destination:string) => {
    if(event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    startTransition(() => { void navigate(destination); });
    onItemClick?.();
  };
  const [searchParams] = useSearchParams();

  const routerInfo = {
    pathname: location.pathname,
    searchParams
  };

  useEffect(() => {
    if (!isPc) {
      base.collapseSidebar();
    }
  }, [isPc]);

  const hasTags = !!(blinkoStore.tagList.value?.listTags?.length);

  return (
    <div
      style={{ width: isPc ? `${base.sideBarWidth}px` : '100%', fontSize: '14px' }}
      className={`flex h-full min-h-0 flex-1 flex-col py-2 relative isolate bg-background
        ${!base.isDragging ? 'transition-[width] duration-200' : 'transition-none'}
        group/sidebar`}
    >
      {/* 浮动圆形折叠按钮 —— 原型设计：贴在侧边栏右边缘，常显。
          仅 PC 显示；用 absolute -right-3 让它压在侧边栏边缘上。 */}
      {isPc && (
        <button
          type="button"
          onClick={base.toggleSidebar}
          aria-label={base.isSidebarCollapsed ? t('expand-sidebar') : t('collapse-sidebar')}
          data-testid="sidebar-collapse-btn"
          className={`absolute top-3 -right-3 z-50 w-6 h-6 rounded-full
            bg-background border border-default-300 shadow-sm
            flex items-center justify-center text-default-500
            hover:!text-primary hover:!border-primary
            !transition-all duration-200
            ${base.isSidebarCollapsed ? 'rotate-180' : ''}`}
        >
          <Icon icon="mdi:chevron-double-right" width="14" height="14" />
        </button>
      )}

      {/* resize handle */}
      {!base.isSidebarCollapsed && (
        <div
          className={`absolute right-0 top-0 h-full w-2 cursor-col-resize z-40
            ${base.isResizing ? 'bg-primary/40' : ''}`}
          onMouseDown={base.startResizing}
          onClick={(e) => e.stopPropagation()}
          style={{ touchAction: 'none' }}
        />
      )}

      {/* Workspace identity stays separate from the personal account menu. */}
      <div data-testid="sidebar-brand" className={`flex min-h-14 shrink-0 items-center py-2 ${base.isSidebarCollapsed ? 'justify-center px-2' : 'px-2.5'}`}>
        <Dropdown placement="bottom-start"><DropdownTrigger>
          <button type="button" aria-label={text('工作空间菜单','Workspace menu')} className="flex min-w-0 w-full items-center rounded-xl p-1 hover:bg-default-100/60 focus-visible:outline-primary">
            <SiteBrand compact={base.isSidebarCollapsed} framed size={30} />
          </button>
        </DropdownTrigger><DropdownMenu aria-label={text('工作空间菜单','Workspace menu')}>
          {workspaceMenu.map(item => (
            <DropdownItem key={item.id} startContent={renderMenuStart(item)} onPress={() => dispatchMenuItem(item)}>
              {resolveMenuLabel(item, isZh)}
            </DropdownItem>
          ))}
        </DropdownMenu></Dropdown>
      </div>

      <div aria-busy={isSwitching} className={`shrink-0 gap-1 px-2 mt-2 ${base.isSidebarCollapsed ? 'flex flex-col items-center' : 'grid grid-cols-2'}`}>
        <Tooltip content={text('主页','Home')} isDisabled={!base.isSidebarCollapsed} placement="right" delay={350} closeDelay={0}>
          <Link to={homeUrl} aria-label={text('主页','Home')} aria-current={!aiMode?'page':undefined} onClick={event=>switchMode(event,homeUrl)}
            className={`flex min-w-0 items-center justify-center gap-2 rounded-xl h-10 ${base.isSidebarCollapsed ? 'w-10' : 'w-full px-2'} ${!aiMode ? 'bg-default-100 text-foreground' : 'text-default-500 hover:bg-hover'}`}>
            <Icon className="shrink-0" icon="tabler:home" width="21" height="21" />
            {!base.isSidebarCollapsed && !aiMode && <span className="truncate font-medium">{text('主页','Home')}</span>}
          </Link>
        </Tooltip>
        <Tooltip content={text('对话','Chat')} isDisabled={!base.isSidebarCollapsed} placement="right" delay={350} closeDelay={0}>
          <Link to="/ai" aria-label={text('对话','Chat')} aria-current={aiMode?'page':undefined} onClick={event=>switchMode(event,'/ai')}
            className={`flex min-w-0 items-center justify-center gap-2 rounded-xl h-10 ${base.isSidebarCollapsed ? 'w-10' : 'w-full px-2'} ${aiMode ? 'bg-default-100 text-foreground' : 'text-default-500 hover:bg-hover'}`}>
            <Icon className="shrink-0" icon="hugeicons:message-01" width="21" height="21" />
            {!base.isSidebarCollapsed && aiMode && <span className="truncate font-medium">{text('对话','Chat')}</span>}
          </Link>
        </Tooltip>
      </div>

      {aiMode ? <>
        <div className="flex-1 min-h-0 mt-5 overflow-y-auto px-2">
          {!base.isSidebarCollapsed ? <>
            <div className="px-2 mb-3 text-xs text-default-400">{t('conversation-history')}</div>
            <AiConversactionList inline onSelect={onItemClick} />
          </> : <Tooltip content={t('conversation-history')} placement="right">
            <button type="button" aria-label={t('conversation-history')} onClick={base.toggleSidebar} className="flex mx-auto p-2 rounded-md hover:bg-hover">
              <Icon icon="hugeicons:clock-01" width="20" height="20" />
            </button>
          </Tooltip>}
        </div>
        <div className="shrink-0 px-3 pb-3 pt-2">
          <button type="button" disabled={aiStore.isAnswering || aiStore.currentConversation.loading.value} onClick={() => { aiStore.newChat(); onItemClick?.(); }}
            aria-label={t('new-conversation')} className="w-full flex items-center justify-center gap-2 rounded-full border border-default-200 bg-background py-3 shadow-sm hover:bg-default-100 disabled:opacity-40 transition-colors">
            <Icon icon="hugeicons:edit-02" width="20" height="20" />
            {!base.isSidebarCollapsed && <span>{t('new-conversation')}</span>}
          </button>
        </div>
      </> : <>
      <ScrollShadow className="-mr-[16px] mt-3 min-h-0 flex-1 pr-4 hide-scrollbar">
        <div className={`flex flex-col font-medium ${base.isSidebarCollapsed ? 'items-center gap-2' : ''}`}>
          {/* 三组导航：记录 / 整理 / 工具 */}
          {NAV_GROUPS.map((group) => {
            const items = base.routerList.filter((i) => i.group === group.key && !i.hiddenSidebar && i.href !== '/ai');
            if (items.length === 0) return null;
            return (
              <div key={group.key} className="mt-3 first:mt-0">
                {!base.isSidebarCollapsed && (
                  <div className="px-3 pb-1.5 text-[11.5px] font-medium tracking-[0.04em] uppercase text-default-400">
                    {t(group.label)}
                  </div>
                )}
                <div className="flex flex-col gap-0.5">
                  {items.map((i) => {
                    const isActive = base.isSideBarActive(routerInfo, i);
                    const label = t(i.title);
                    // 行级 count：从 tagList 聚合结果里取 viewCounts（按 routerList.title 对应）
                    //   blinko → blinko 计数, notes → note 计数, todo → todo 计数
                    const viewCounts = blinkoStore.tagList.value?.viewCounts as
                      | { blinko?: number; note?: number; todo?: number }
                      | undefined;
                    const titleToCountKey: Record<string, keyof NonNullable<typeof viewCounts>> = {
                      blinko: 'blinko',
                      notes: 'note',
                      todo: 'todo',
                    };
                    const countKey = titleToCountKey[i.title];
                    const viewCount = countKey ? viewCounts?.[countKey] : undefined;
                    // 记录组三个图标按原型着色；其余图标色
                    const iconColorClass = NAV_ICON_COLOR[i.title] ?? 'text-default-500';

                    const row = (
                      // 用 div 包一层做「左条 active 指示」
                      <div className={`relative group/row ${base.isSidebarCollapsed ? 'flex justify-center' : ''}`}>
                        {/* 左侧 active 指示条：active 时显示 2px 主题色条，对齐原型 */}
                        <span
                          aria-hidden
                          className={`absolute left-0 top-1/2 -translate-y-1/2 w-[2px] rounded-full bg-primary transition-all duration-200
                            ${isActive ? 'h-4 opacity-100' : 'h-0 opacity-0'}`}
                        />
                        <Link
                          to={i.href}
                          onClick={() => {
                            base.currentRouter = i;
                            onItemClick?.();
                          }}
                          className={`flex items-center gap-2.5 px-3 py-[6px] rounded-md cursor-pointer
                            !transition-colors duration-100
                            ${base.isSidebarCollapsed ? 'justify-center' : ''}
                            ${isActive
                              ? '!bg-primary/10 !text-primary font-medium'
                              : 'text-default-600 hover:!bg-hover hover:text-foreground'}`}
                        >
                          <Icon className={`shrink-0 ${base.isSidebarCollapsed ? 'mx-auto' : ''} ${iconColorClass}`} icon={i.icon} width="20" height="20" />
                          {!base.isSidebarCollapsed && <span className="flex-1 truncate">{label}</span>}
                          {/* 行级 count（对齐原型：右侧 muted 计数） */}
                          {!base.isSidebarCollapsed && typeof viewCount === 'number' && (
                            <span className="text-[11.5px] font-medium text-default-400 tabular-nums shrink-0">
                              {viewCount}
                            </span>
                          )}
                        </Link>
                      </div>
                    );

                    if (base.isSidebarCollapsed) {
                      // 折叠态把 count 也写进 tooltip：「闪念 (12)」
                      const tooltip = typeof viewCount === 'number' ? `${label} (${viewCount})` : label;
                      return (
                        <Tooltip key={i.title} content={tooltip} placement="right" delay={300} closeDelay={0}>
                          {row}
                        </Tooltip>
                      );
                    }
                    return <div key={i.title}>{row}</div>;
                  })}
                </div>
              </div>
            );
          })}

          {/* 标签面板：可折叠 section，对齐原型 */}
          {hasTags && (
            <div className="mt-3">
              {!base.isSidebarCollapsed ? (
                <>
                  <div className="px-3 pb-1.5 text-[11.5px] font-medium tracking-[0.04em] text-default-400">{t('total-tags')}</div>
                  <TagListPanel hideHeader />
                </>
              ) : (
                // 折叠态：标签入口收成一个图标入口，hover tooltip 提示「所有标签」
                <Tooltip content={t('total-tags')} placement="right" delay={300} closeDelay={0}>
                  <button
                    type="button"
                    onClick={() => {
                      base.toggleSidebar();
                    }}
                    className="w-8 h-8 rounded-md flex items-center justify-center mx-auto
                      text-default-600 hover:!bg-hover hover:text-foreground
                      !transition-colors"
                  >
                    <Icon icon="mingcute:hashtag-line" width="20" height="20" />
                  </button>
                </Tooltip>
              )}
            </div>
          )}
        </div>
      </ScrollShadow>
      </>}
      <div data-testid="sidebar-account" className={`mx-2 mt-2 flex shrink-0 items-center border-t border-default-200/60 pt-2 ${base.isSidebarCollapsed ? 'justify-center' : ''}`}>
        <UserAvatarDropdown onItemClick={onItemClick} collapsed={base.isSidebarCollapsed} />
      </div>
    </div>
  );
});