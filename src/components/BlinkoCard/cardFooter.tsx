import { Icon } from '@iconify/react';
import { Tooltip } from '@nextui-org/react';
import { Note, NoteType } from '@/server/types';
import { ConvertItemFunction } from "../BlinkoRightClickMenu";
import { BlinkoStore } from '@/store/blinkoStore';
import { useTranslation } from 'react-i18next';
import { _ } from '@/lib/lodash';
import { ShowBlinkoReference } from '../BlinkoReference';
import { CommentCount } from './commentButton';

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
    <div className="flex items-center mt-2">
      {isShareMode ? <></> : <ConvertTypeButton blinkoItem={blinkoItem} blinko={blinko} t={t} />}
      <RightContent blinkoItem={blinkoItem} t={t} />
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
        ((blinkoItem?.references?.length) ?? 0) > 0 && <Tooltip content={blinkoItem?.references?.length + ' ' + t('reference')} delay={1000}>
          <Icon icon="ix:reference" className='text-[#C35AF7] cursor-pointer' width="16" height="16" onClick={() => ShowBlinkoReference({ item: blinkoItem })} />
        </Tooltip>
      }
      {
        blinkoItem?.metadata?.isIndexed && <Tooltip content={"Indexed"} delay={1000}>
          <Icon className='text-ignore opacity-50' icon="mingcute:ai-line" width="16" height="16" />
        </Tooltip>
      }
    </div>
  );
};
