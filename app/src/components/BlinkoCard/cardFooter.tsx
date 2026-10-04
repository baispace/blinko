import { Icon } from '@/components/Common/Iconify/icons';
import { Tooltip } from '@heroui/react';
import { Note, NoteType } from '@shared/lib/types';
import { ConvertItemFunction, LeftCickMenu, ShowEditTimeModel } from '../BlinkoRightClickMenu';
import { BlinkoStore } from '@/store/blinkoStore';
import { useTranslation } from 'react-i18next';
import { _ } from '@/lib/lodash';
import { CommentCount, CommentButton } from './commentButton';
import { BlinkoItem } from '.';
import { RootStore } from '@/store';
import dayjs from '@/lib/dayjs';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMemo } from 'react';
import { helper } from '@/lib/helper';
import { getNoteTagPaths } from './noteContent';
import { NoteTime, PinButton, ShareButton } from './cardHeader';
import { useIsIOS } from '@/lib/hooks';
import { api } from '@/lib/trpc';
import { PromiseCall } from '@/store/standard/PromiseState';

interface CardFooterProps {
  blinkoItem: BlinkoItem;
  blinko: BlinkoStore;
  isShareMode?: boolean;
  /** Blog-style card layout: show the timestamp here instead of the header. */
  showTime?: boolean;
  /** Weibo-style: tags live inline in the body, so the footer skips the chips. */
  hideTags?: boolean;
}

/** 卡片左下角标签区：正文里的 #标签 提取出来单独展示 */
const CardTagChips = ({ blinkoItem, isShareMode }: { blinkoItem: BlinkoItem; isShareMode?: boolean }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const tagPaths = useMemo(() => getNoteTagPaths(blinkoItem), [blinkoItem.tags]);

  if (tagPaths.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0 flex-1 overflow-hidden mr-2">
      {tagPaths.map(path => (
        <span
          key={path}
          className={`text-desc text-xs blinko-tag whitespace-nowrap font-bold select-none !transition-all max-w-full overflow-hidden text-ellipsis ${isShareMode ? '' : 'cursor-pointer hover:opacity-80'}`}
          onClick={(e) => {
            if (isShareMode) return;
            e.stopPropagation();
            // 保持当前所在视图（闪念/笔记/待办），仅做标签搜索，不跳离当前页面
            const currentPath = new URLSearchParams(location.search).get('path');
            const searchText = encodeURIComponent('#' + path);
            navigate(currentPath
              ? `/?path=${currentPath}&searchText=${searchText}`
              : `/?searchText=${searchText}`);
            RootStore.Get(BlinkoStore).forceQuery++;
          }}
        >
          #{path}
        </span>
      ))}
    </div>
  );
};

/** 博客卡片 footer 操作栏：与 compact 闪念卡一致（评论/分享/置顶/溢出菜单） */
const BlogCardActions = ({ blinkoItem, blinko }: { blinkoItem: BlinkoItem; blinko: BlinkoStore }) => {
  const isIOSDevice = useIsIOS();
  return (
    <div className="flex items-center gap-3 shrink-0">
      {blinkoItem._count?.comments ? (
        <CommentCount blinkoItem={blinkoItem} />
      ) : (
        <CommentButton blinkoItem={blinkoItem} alwaysShow />
      )}
      <ShareButton blinkoItem={blinkoItem} isIOSDevice={isIOSDevice} alwaysShow />
      <PinButton blinkoItem={blinkoItem} blinko={blinko} />
      <LeftCickMenu
        className="cursor-pointer"
        onTrigger={() => { blinko.curSelectedNote = _.cloneDeep(blinkoItem) }}
      />
    </div>
  );
};

/** 分享状态图标：从 CardHeader 挪来，博客卡片没有 header 行 */
const ShareMetaIcons = ({ blinkoItem, iconSize = '16' }: { blinkoItem: Note; iconSize?: string }) => {
  const { t } = useTranslation();
  return (
    <>
      {blinkoItem.isShare && (
        <Tooltip content={t('shared')} delay={1000}>
          <Icon icon="prime:eye" width={iconSize} height={iconSize} className="mr-2 shrink-0" />
        </Tooltip>
      )}
      {blinkoItem.isInternalShared && (
        <Tooltip content={t('internal-shared')} delay={1000}>
          <Icon icon="prime:users" width={iconSize} height={iconSize} className="mr-2 shrink-0" />
        </Tooltip>
      )}
    </>
  );
};

/** 回收站按钮：博客卡片 footer 使用 */
const TrashButton = ({ blinkoItem, blinko, iconSize = '16' }: { blinkoItem: BlinkoItem; blinko: BlinkoStore; iconSize?: string }) => {
  const { t } = useTranslation();
  return (
    <Tooltip content={t('trash')} delay={1000}>
      <Icon
        icon="mingcute:delete-2-line"
        width={iconSize}
        height={iconSize}
        className={`cursor-pointer hover:text-red-500 text-desc ${blinkoItem.isRecycle ? 'text-red-500' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          PromiseCall(api.notes.trashMany.mutate({ ids: [blinkoItem.id!] })).then(() => {
            blinko.updateTicker++;
          });
        }}
      />
    </Tooltip>
  );
};

/** 博客卡片 · 标题上方行：左=内容类型，右=操作栏（评论/分享/置顶/菜单/垃圾桶） */
export const BlogCardTopRow = ({ blinkoItem, blinko, isShareMode }: { blinkoItem: BlinkoItem; blinko: BlinkoStore; isShareMode?: boolean }) => {
  return (
    <div className="flex items-center justify-between mt-4 mb-2 gap-2">
      <ConvertTypeButton blinkoItem={blinkoItem} />
      <div className="flex items-center gap-3 shrink-0">
        <BlogCardActions blinkoItem={blinkoItem} blinko={blinko} />
        {!isShareMode && <TrashButton blinkoItem={blinkoItem} blinko={blinko} />}
      </div>
    </div>
  );
};

/** 博客卡片 · 标题下方行：左=标签，右=分享状态图标+时间 */
export const BlogCardBottomRow = ({ blinkoItem, blinko, isShareMode }: { blinkoItem: BlinkoItem; blinko: BlinkoStore; isShareMode?: boolean }) => {
  return (
    <div className="flex items-center justify-between gap-2">
      <CardTagChips blinkoItem={blinkoItem} isShareMode={isShareMode} />
      <div className="flex items-center shrink-0 ml-auto">
        <ShareMetaIcons blinkoItem={blinkoItem} />
        <NoteTime blinkoItem={blinkoItem} blinko={blinko} />
      </div>
    </div>
  );
};

export const CardFooter = ({ blinkoItem, blinko, isShareMode, showTime, hideTags }: CardFooterProps) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center">
      {showTime && (
        <div className="flex items-center mr-2 shrink-0">
          <NoteTime blinkoItem={blinkoItem} blinko={blinko} />
        </div>
      )}
      {!hideTags && <CardTagChips blinkoItem={blinkoItem} isShareMode={isShareMode} />}
      <div className="ml-auto flex items-center gap-2 shrink-0">
        <ConvertTypeButton blinkoItem={blinkoItem} />
        <RightContent blinkoItem={blinkoItem} t={t} />
      </div>
    </div>
  );
};

export const ConvertTypeButton = ({
  blinkoItem,
  tooltip,
  toolTipClassNames,
  tooltipPlacement,
}: {
  blinkoItem: BlinkoItem & any;
  tooltip?: React.ReactNode;
  toolTipClassNames?: any;
  tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right';
}) => {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);

  const handleClick = (e) => {
    e.stopPropagation();
    blinko.curSelectedNote = _.cloneDeep(blinkoItem);
    
    if (blinkoItem.type === NoteType.TODO) {
      ShowEditTimeModel(true);
    } else {
      ConvertItemFunction();
    }
  };

  const getTodoStatus = () => {
    if (!blinkoItem.metadata?.expireAt) {
      return { color: 'text-green-500', status: 'no-deadline' };
    }
    
    const expireDate = dayjs(blinkoItem.metadata.expireAt);
    const now = dayjs();
    
    if (expireDate.isBefore(now)) {
      return { color: 'text-red-500', status: 'expired' };
    } else if (expireDate.diff(now, 'day') <= 3) {
      return { color: 'text-yellow-500', status: 'warning' };
    } else {
      return { color: 'text-green-500', status: 'normal' };
    }
  };

  if (blinkoItem.type === NoteType.BLINKO) {
    return (
      <Tooltip placement={tooltipPlacement} classNames={toolTipClassNames} content={tooltip ?? t('convert-to') + ' Note'} delay={1000}>
        <div className="flex items-center justify-start cursor-pointer" onClick={handleClick}>
          <Icon className="text-yellow-500" icon="basil:lightning-solid" width="12" height="12" />
          <div className="text-desc text-xs font-bold ml-1 select-none">
            {t('blinko')}
            {blinkoItem.isBlog ? ` · ${t('article')}` : ''}
            {blinkoItem.isArchived ? ` · ${t('archived')}` : ''}
            {blinkoItem.isOffline ? ` · ${t('offline')}` : ''}
          </div>
        </div>
      </Tooltip>
    );
  }

  if (blinkoItem.type === NoteType.TODO) {
    const todoStatus = getTodoStatus();
    const getTooltipContent = () => {
      if (!blinkoItem.metadata?.expireAt) {
        return t('set-deadline');
      }
      const expireDate = dayjs(blinkoItem.metadata.expireAt);
      if (todoStatus.status === 'expired') {
        return `${t('expired')}: ${expireDate.format('YYYY-MM-DD HH:mm')}`;
      }
      return `${t('expiry-time')}: ${expireDate.format('YYYY-MM-DD HH:mm')}`;
    };

    const getTimeDisplay = () => {
      if (!blinkoItem.metadata?.expireAt) {
        return null;
      }
      
      const expireDate = dayjs(blinkoItem.metadata.expireAt);
      const now = dayjs();
      
      if (todoStatus.status === 'expired') {
        const diffInMinutes = now.diff(expireDate, 'minute');
        const diffInHours = now.diff(expireDate, 'hour');
        const diffInDays = now.diff(expireDate, 'day');
        
        if (diffInDays > 0) {
          return t('expired-days', { count: diffInDays });
        } else if (diffInHours > 0) {
          return t('expired-hours', { count: diffInHours });
        } else if (diffInMinutes > 0) {
          return t('expired-minutes', { count: diffInMinutes });
        } else {
          return t('just-expired');
        }
      } else {
        const diffInMinutes = expireDate.diff(now, 'minute');
        const diffInHours = expireDate.diff(now, 'hour');
        const diffInDays = expireDate.diff(now, 'day');
        
        if (diffInDays > 0) {
          return t('days-left', { count: diffInDays });
        } else if (diffInHours > 0) {
          return t('hours-left', { count: diffInHours });
        } else if (diffInMinutes > 0) {
          return t('minutes-left', { count: diffInMinutes });
        } else {
          return t('about-to-expire');
        }
      }
    };

    return (
      <Tooltip placement={tooltipPlacement} classNames={toolTipClassNames} content={tooltip ?? getTooltipContent()} delay={1000}>
        <div className="flex items-center justify-start cursor-pointer" onClick={handleClick}>
          <Icon className={todoStatus.color} icon="solar:folder-check-bold" width="12" height="12" />
          <div className="text-desc text-xs font-bold ml-1 select-none">
            {t('todo')}
            {blinkoItem.metadata?.expireAt && (
              <span className={todoStatus.color}>
                {' · '}{getTimeDisplay()}
              </span>
            )}
            {blinkoItem.isBlog ? ` · ${t('article')}` : ''}
            {blinkoItem.isArchived ? ` · ${t('archived')}` : ''}
            {blinkoItem.isOffline ? ` · ${t('offline')}` : ''}
          </div>
        </div>
      </Tooltip>
    );
  }

  return (
    <Tooltip content={t('convert-to') + ' Blinko'} delay={1500}>
      <div className="flex items-center justify-start cursor-pointer" onClick={handleClick}>
        <Icon className="text-blue-500" icon="solar:notes-minimalistic-bold-duotone" width="12" height="12" />
        <div className="text-desc text-xs font-bold ml-1 select-none">
          {t('note')}
          {blinkoItem.isBlog ? ` · ${t('article')}` : ''}
          {blinkoItem.isArchived ? ` · ${t('archived')}` : ''}
          {blinkoItem.isOffline ? ` · ${t('offline')}` : ''}
        </div>
      </div>
    </Tooltip>
  );
};

const RightContent = ({ blinkoItem, t }: { blinkoItem: Note; t: any }) => {
  return (
    <div className="ml-auto flex items-center gap-2">
      {<CommentCount blinkoItem={blinkoItem} />}
      {blinkoItem?.metadata?.isIndexed && (
        <Tooltip content={'Indexed'} delay={1500}>
          <Icon className="!text-ignore opacity-50" icon="hugeicons:ai-beautify" width="16" height="16" />
        </Tooltip>
      )}
    </div>
  );
};
