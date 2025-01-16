import { Icon } from '@iconify/react';
import { Tooltip } from '@nextui-org/react';
import { Note, NoteType } from '@/server/types';
import { ConvertItemFunction } from "../BlinkoRightClickMenu";
import { BlinkoStore } from '@/store/blinkoStore';
import { useTranslation } from 'react-i18next';
import { _ } from '@/lib/lodash';
import { ShowBlinkoReference } from '../BlinkoReference';
import { CommentCount } from './commentButton';
import { getDisplayTime } from '@/lib/helper';
import { api } from '@/lib/trpc';
import { RootStore } from '@/store';
import { DialogStore } from '@/store/module/Dialog';
import { BlinkoCard } from '.';
import { DialogStandaloneStore } from '@/store/module/DialogStandalone';

interface CardFooterProps {
  blinkoItem: Note & {
    isBlog?: boolean;
    blogCover?: string;
    title?: string;
  };
  blinko: BlinkoStore;
  isShareMode?: boolean;
}

export const CardFooter = ({ blinkoItem, blinko, isShareMode }: CardFooterProps) => {
  const { t } = useTranslation();

  return (
    <div className='flex flex-col gap-1'>
      <div className='flex flex-col gap-2'>
        {blinkoItem.references?.map(item => {
          return <div key={item.toNoteId} className='blinko-reference flex flex-col gap-1 rounded-md !p-2' onClick={async (e) => {
            e.stopPropagation()
            const note = await api.notes.detail.mutate({ id: item.toNoteId! })
            RootStore.Get(DialogStandaloneStore).setData({
              isOpen: true,
              onlyContent: true,
              showOnlyContentCloseButton: true,
              size: '4xl',
              content: <BlinkoCard blinkoItem={note!} withoutHoverAnimation />
            })
          }}>
            <div className='text-desc text-xs ml-1 select-none flex'>
              {getDisplayTime(item.toNote?.createdAt, item.toNote?.updatedAt)}
              <Icon icon="iconamoon:arrow-top-right-1" className='text-primary ml-auto' width="16" height="16" />
            </div>
            <div className='text-default-700 text-xs font-bold ml-1 select-none line-clamp-3 '>{item.toNote?.content}</div>
          </div>
        })}
      </div>

      <div className="flex items-center mt-2">
        <ConvertTypeButton blinkoItem={blinkoItem} blinko={blinko} t={t} />
        <RightContent blinkoItem={blinkoItem} t={t} />
      </div>
    </div>
  );
};

const ConvertTypeButton = ({ blinkoItem, blinko, t }) => {
  const handleClick = (e) => {
    e.stopPropagation();
    blinko.curSelectedNote = _.cloneDeep(blinkoItem);
    ConvertItemFunction();
  };

  if (blinkoItem.type === NoteType.BLINKO) {
    return (
      <Tooltip content={t('convert-to') + ' Note'} delay={1000}>
        <div className='flex items-center justify-start cursor-pointer' onClick={handleClick}>
          <Icon className='text-yellow-500' icon="basil:lightning-solid" width="12" height="12" />
          <div className='text-desc text-xs font-bold ml-1 select-none'>{t('blinko')}
            {blinkoItem.isBlog ? ` · ${t('article')}` : ''}
            {blinkoItem.isArchived ? ` · ${t('archived')}` : ''}
            {blinkoItem.isOffline ? ` · ${t('offline')}` : ''}
          </div>
        </div>
      </Tooltip>
    );
  }

  return (
    <Tooltip content={t('convert-to') + ' Blinko'} delay={1000}>
      <div className='flex items-center justify-start cursor-pointer' onClick={handleClick}>
        <Icon className='text-blue-500' icon="solar:notes-minimalistic-bold-duotone" width="12" height="12" />
        <div className='text-desc text-xs font-bold ml-1 select-none'>{t('note')}
          {blinkoItem.isBlog ? ` · ${t('article')}` : ''}
          {blinkoItem.isArchived ? ` · ${t('archived')}` : ''}
          {blinkoItem.isOffline ? ` · ${t('offline')}` : ''}
        </div>
      </div>
    </Tooltip>
  );
};

const RightContent = ({ blinkoItem, t }: { blinkoItem: Note, t: any }) => {
  return (
    <div className='ml-auto flex items-center gap-2'>
      {
        <CommentCount blinkoItem={blinkoItem} />
      }
      {
        blinkoItem?.metadata?.isIndexed && <Tooltip content={"Indexed"} delay={1000}>
          <Icon className='text-ignore opacity-50' icon="mingcute:ai-line" width="16" height="16" />
        </Tooltip>
      }
    </div>
  );
};
