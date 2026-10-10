import { Icon } from '@/components/Common/Iconify/icons';
import { observer } from 'mobx-react-lite';
import { ScrollShadow, Tooltip } from '@heroui/react';
import { RootStore } from '@/store';
import { BaseStore } from '@/store/baseStore';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'usehooks-ts';
import { UserAvatarDropdown } from '../Common/UserAvatarDropdown';
import { TagListPanel } from '../Common/TagListPanel';
import { useEffect, useState } from 'react';
import { BlinkoStore } from '@/store/blinkoStore';
import { useLocation, useSearchParams, Link } from 'react-router-dom';
import { eventBus } from '@/lib/event';
import { ShowSettingsDialog } from '../BlinkoSettings/SettingsDialog';

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

const TAGS_PANEL_KEY = 'blinko_sidebar_tags_collapsed';

export const Sidebar = observer(({ onItemClick }: SidebarProps) => {
  const isPc = useMediaQuery('(min-width: 768px)');
  const { t } = useTranslation();
  const base = RootStore.Get(BaseStore);
  const blinkoStore = RootStore.Get(BlinkoStore);
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [isHovering, setIsHovering] = useState(false);

  // 标签面板折叠态：持久化到 localStorage，与原型一致
  const [tagsCollapsed, setTagsCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(TAGS_PANEL_KEY) === '1';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(TAGS_PANEL_KEY, tagsCollapsed ? '1' : '0');
  }, [tagsCollapsed]);

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
      className={`flex h-full flex-1 flex-col py-2 relative bg-background
        ${!base.isDragging ? '!transition-all duration-300' : 'transition-none'}
        group/sidebar`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
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

      {/* 顶部：头像 + 设置入口（移动端用） */}
      <div className={`flex items-center px-2 ${base.isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
        <div className={`flex w-full ${base.isSidebarCollapsed ? 'flex-col gap-2 justify-center items-center' : 'items-center'}`}>
          <UserAvatarDropdown onItemClick={onItemClick} collapsed={base.isSidebarCollapsed} showOverlay={isHovering} />

          {/* 移动端：设置入口用按钮放在头像旁边（折叠按钮 PC 已用浮动版） */}
          {!isPc && (
            <button
              type="button"
              onClick={() => {
                ShowSettingsDialog();
                eventBus.emit('close-sidebar');
              }}
              aria-label={t('settings')}
              className="ml-auto p-1.5 rounded-md text-default-500 hover:!bg-hover hover:!text-foreground !transition-all"
            >
              <Icon icon="hugeicons:settings-01" width="20" height="20" />
            </button>
          )}
        </div>
      </div>

      <ScrollShadow className="-mr-[16px] mt-3 h-full max-h-full pr-4 hide-scrollbar">
        <div className={`flex flex-col font-medium ${base.isSidebarCollapsed ? 'items-center gap-2' : ''}`}>
          {/* 三组导航：记录 / 整理 / 工具 */}
          {NAV_GROUPS.map((group) => {
            const items = base.routerList.filter((i) => i.group === group.key && !i.hiddenSidebar);
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
                  <button
                    type="button"
                    onClick={() => setTagsCollapsed(v => !v)}
                    className="w-full flex items-center justify-between px-3 pb-1.5
                      text-[11.5px] font-medium tracking-[0.04em] uppercase text-default-400
                      hover:!text-foreground !transition-colors"
                    aria-expanded={!tagsCollapsed}
                  >
                    <span>{t('total-tags')}</span>
                    <Icon
                      icon="mdi:chevron-down"
                      width="14"
                      height="14"
                      className={`!transition-transform duration-150 ${tagsCollapsed ? '-rotate-90' : ''}`}
                    />
                  </button>
                  {!tagsCollapsed && <TagListPanel hideHeader />}
                </>
              ) : (
                // 折叠态：标签入口收成一个图标入口，hover tooltip 提示「所有标签」
                <Tooltip content={t('total-tags')} placement="right" delay={300} closeDelay={0}>
                  <button
                    type="button"
                    onClick={() => {
                      base.toggleSidebar();
                      setTagsCollapsed(false);
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
    </div>
  );
});