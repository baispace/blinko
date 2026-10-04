import { Icon } from '@/components/Common/Iconify/icons';
import { Tooltip } from '@heroui/react';
import { Copy } from "../Common/Copy";
import { LeftCickMenu, ShowEditTimeModel } from "../BlinkoRightClickMenu";
import { BlinkoStore } from '@/store/blinkoStore';
import { Note, NoteType } from '@shared/lib/types';
import { RootStore } from '@/store';
import dayjs from '@/lib/dayjs';
import { useTranslation } from 'react-i18next';
import { _ } from '@/lib/lodash';
import { useIsIOS } from '@/lib/hooks';
import { DialogStore } from '@/store/module/Dialog';
import { BlinkoShareDialog } from '../BlinkoShareDialog';
import { observer } from 'mobx-react-lite';
import { AvatarAccount, CommentButton, CommentCount, UserAvatar } from './commentButton';
import { HistoryButton } from '../BlinkoNoteHistory/HistoryButton';
import { api } from '@/lib/trpc';
import { PromiseCall } from '@/store/standard/PromiseState';

interface CardHeaderProps {
  /** `isBlog` is assigned by BlinkoCard (article-tier cards); it decides whether
      the title row already owns the icon. */
  blinkoItem: Note & { isBlog?: boolean };
  blinko: BlinkoStore;
  isShareMode: boolean;
  isExpanded?: boolean;
  account?: AvatarAccount;
  /** Blog-style card layout: hide the timestamp from the header (it moves to the footer). */
  hideTime?: boolean;
  /**
   * Weibo-style compact action bar: only comment / share / pin stay visible
   * (always shown, like Weibo's action row); copy, history and trash move
   * into the overflow menu so the card header is not crowded with icons.
   */
  compactActions?: boolean;
}

/** 置顶开关：闪念卡常显，未置顶时为弱化的描边图标 */
export const PinButton = observer(({ blinkoItem, blinko, iconSize = '15' }: { blinkoItem: Note; blinko: BlinkoStore; iconSize?: string }) => {
  const { t } = useTranslation();
  return (
    <Tooltip content={blinkoItem.isTop ? t('cancel-top') : t('top')} delay={1000}>
      <Icon
        icon="solar:bookmark-bold"
        width={iconSize}
        height={iconSize}
        className={`cursor-pointer !transition-colors ${blinkoItem.isTop ? 'text-[#EFC646]' : 'text-desc hover:text-[#EFC646]'}`}
        onClick={(e) => {
          e.stopPropagation();
          blinko.upsertNote.call({ id: blinkoItem.id, isTop: !blinkoItem.isTop });
        }}
      />
    </Tooltip>
  );
});

/** Shared timestamp display; click opens the edit-time dialog. */
export const NoteTime = ({ blinkoItem, blinko, isExpanded }: { blinkoItem: Note; blinko: BlinkoStore; isExpanded?: boolean }) => {
  const { t } = useTranslation();
  return (
    <Tooltip content={t('edit-time')} delay={1000}>
      <div
        className={`${isExpanded ? 'text-sm' : 'text-xs'} text-desc cursor-pointer transition-colors`}
        onClick={(e) => {
          e.stopPropagation();
          blinko.curSelectedNote = _.cloneDeep(blinkoItem);
          ShowEditTimeModel();
        }}
      >
        {blinko.config.value?.timeFormat == 'relative'
          ? dayjs(blinko.config.value?.isOrderByCreateTime ? blinkoItem.createdAt : blinkoItem.updatedAt).fromNow()
          : dayjs(blinko.config.value?.isOrderByCreateTime ? blinkoItem.createdAt : blinkoItem.updatedAt).format(blinko.config.value?.timeFormat ?? 'YYYY-MM-DD HH:mm:ss')
        }
      </div>
    </Tooltip>
  );
};

export const CardHeader = observer(({ blinkoItem, blinko, isShareMode, isExpanded, account, hideTime, compactActions }: CardHeaderProps) => {
  const { t } = useTranslation();
  const iconSize = isExpanded ? '20' : '16';
  const isIOSDevice = useIsIOS();

  const handleTodoToggle = async (e) => {
    e.stopPropagation();

    try {
      if (blinkoItem.isArchived) {
        await blinko.upsertNote.call({
          id: blinkoItem.id,
          isArchived: false
        });
        blinko.updateTicker++
      } else {
        await blinko.upsertNote.call({
          id: blinkoItem.id,
          isArchived: true
        });
        blinko.updateTicker++
      }
    } catch (error) {
      console.error('Error toggling TODO status:', error);
    }
  };

  return (
    <div className={`flex items-center select-none ${isExpanded ? 'mb-4' : 'mb-1'}`}>
      <div className={`flex items-center w-full gap-1 ${isExpanded ? 'text-base' : 'text-xs'}`}>
        {blinkoItem.isShare && !isShareMode && (
          <Tooltip content={t('shared')} delay={1000}>
            <div className="flex items-center gap-2">
              <Icon
                className="cursor-pointer "
                icon="prime:eye"
                width={iconSize}
                height={iconSize}
              />
            </div>
          </Tooltip>
        )}

        {blinkoItem.isInternalShared && (
          <Tooltip content={t('internal-shared')} delay={1000}>
            <div className="flex items-center gap-2">
              <Icon
                className="cursor-pointer "
                icon="prime:users"
                width={iconSize}
                height={iconSize}
              />
            </div>
          </Tooltip>
        )}

        {isShareMode && account && (
          <UserAvatar account={account} blinkoItem={blinkoItem} />
        )}

        {/* Skip when the icon is already shown in the NoteTitleDisplay row
            (non-blog NOTE cards with an icon or a title) — otherwise it
            renders twice, once above and once next to the timestamp. */}
        {blinkoItem.metadata?.icon && (blinkoItem.isBlog || blinkoItem.type !== NoteType.NOTE) && (
          <span className="text-base leading-none select-none">{blinkoItem.metadata.icon}</span>
        )}

        {blinkoItem.type === NoteType.TODO && (
          <Tooltip content={blinkoItem.isArchived ? t('restore') : t('complete')} delay={1000}>
            <div
              className="flex items-center cursor-pointer"
              onClick={handleTodoToggle}
            >
              <Icon
                icon={blinkoItem.isArchived ? "solar:refresh-circle-bold" : "mdi:circle-outline"}
                className={`${blinkoItem.isArchived ? 'text-blue-500' : 'text-green-500'} hover:opacity-80`}
                width="16"
                height="16"
              />
            </div>
          </Tooltip>
        )}

        {!hideTime && <NoteTime blinkoItem={blinkoItem} blinko={blinko} isExpanded={isExpanded} />}

        {compactActions && !isShareMode ? (
          <div className="ml-auto flex items-center gap-3 shrink-0">
            {blinkoItem._count?.comments ? (
              <CommentCount blinkoItem={blinkoItem} />
            ) : (
              <CommentButton blinkoItem={blinkoItem} alwaysShow />
            )}
            <ShareButton blinkoItem={blinkoItem} isIOSDevice={isIOSDevice} alwaysShow />
            <PinButton blinkoItem={blinkoItem} blinko={blinko} iconSize={iconSize} />
            <LeftCickMenu
              className="cursor-pointer"
              onTrigger={() => { blinko.curSelectedNote = _.cloneDeep(blinkoItem) }}
            />
          </div>
        ) : (
          <>
            <Copy
              size={16}
              className={`ml-auto ${isIOSDevice
                ? 'opacity-100'
                : 'opacity-0 group-hover/card:opacity-100 group-hover/card:translate-x-0 translate-x-1'
                }`}
              content={blinkoItem.content + `\n${blinkoItem.attachments?.map(i => window.location.origin + i.path).join('\n')}`}
            />

            <CommentButton blinkoItem={blinkoItem} />

            {isShareMode && (
              <Tooltip content="RSS" delay={1000}>
                <div className="flex items-center gap-2">
                  <Icon onClick={e => {
                    window.open(window.location.origin + `/api/rss/${blinkoItem.accountId}/atom?row=20`)
                  }} icon="mingcute:rss-2-fill" className='opacity-0 group-hover/card:opacity-100 group-hover/card:translate-x-0 ml-2 cursor-pointer hover:text-primary' width="16" height="16" />
                </div>
              </Tooltip>
            )}

            {!isShareMode && (
              <ShareButton blinkoItem={blinkoItem} isIOSDevice={isIOSDevice} />
            )}

            {/* History button for viewing note versions */}
            {!isShareMode && !!blinkoItem._count?.histories && blinkoItem._count?.histories > 0 && (
              <HistoryButton
                noteId={blinkoItem.id!}
                className={'opacity-0 group-hover/card:opacity-100 group-hover/card:translate-x-0 ml-2 cursor-pointer hover:text-primary text-desc mt-[1px]'}
              />
            )}

            {/* Trash/Recycle bin button */}
            {!isShareMode && (
              <Tooltip content={t('trash')} delay={1000}>
                <Icon
                  icon="mingcute:delete-2-line"
                  width={iconSize}
                  height={iconSize}
                  className={`opacity-0 group-hover/card:opacity-100 group-hover/card:translate-x-0 ml-2 cursor-pointer hover:text-red-500 text-desc ${blinkoItem.isRecycle ? 'text-red-500 opacity-100' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    PromiseCall(api.notes.trashMany.mutate({ ids: [blinkoItem.id!] })).then(() => {
                      blinko.updateTicker++;
                    });
                  }}
                />
              </Tooltip>
            )}

            {blinkoItem.isTop && (
              <Icon
                className={isIOSDevice ? 'ml-[10px] text-[#EFC646]' : "ml-auto group-hover/card:ml-2 text-[#EFC646]"}
                icon="solar:bookmark-bold"
                width={iconSize}
                height={iconSize}
              />
            )}

            {!isShareMode && (
              <LeftCickMenu
                className={isIOSDevice ? 'ml-[10px]' : (blinkoItem.isTop ? "ml-[10px]" : 'ml-auto group-hover/card:ml-2')}
                onTrigger={() => { blinko.curSelectedNote = _.cloneDeep(blinkoItem) }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
});

export const ShareButton = observer(({ blinkoItem, isIOSDevice, alwaysShow }: { blinkoItem: Note, isIOSDevice: boolean, alwaysShow?: boolean }) => {
  const { t } = useTranslation()
  const blinko = RootStore.Get(BlinkoStore);
  return (
    <Tooltip content={t('share')} delay={1000}>
      <div className="flex items-center gap-2">
        <Icon
          icon="tabler:share-2"
          width="16"
          height="16"
          className={`cursor-pointer text-desc ml-2 ${isIOSDevice || alwaysShow
            ? 'opacity-100'
            : 'opacity-0 group-hover/card:opacity-100 group-hover/card:translate-x-0 translate-x-1'
            }`}
          onClick={async (e) => {
            e.stopPropagation()
            blinko.curSelectedNote = _.cloneDeep(blinkoItem)
            RootStore.Get(DialogStore).setData({
              isOpen: true,
              size: 'md',
              title: t('share'),
              content: <BlinkoShareDialog defaultSettings={{
                shareUrl: blinkoItem.shareEncryptedUrl ? window.location.origin + '/share/' + blinkoItem.shareEncryptedUrl : undefined,
                expiryDate: blinkoItem.shareExpiryDate ?? undefined,
                password: blinkoItem.sharePassword ?? '',
                isShare: blinkoItem.isShare
              }} />
            })
          }}
        />
      </div>
    </Tooltip>
  );
})
