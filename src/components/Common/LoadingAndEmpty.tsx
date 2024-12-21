import { Icon } from '@iconify/react';
import { useTranslation } from 'react-i18next';

interface LoadingAndEmptyProps {
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
}

export const LoadingAndEmpty = ({ isLoading, isEmpty, emptyMessage }: LoadingAndEmptyProps) => {
  const { t } = useTranslation();
  
  return (
    <div className='text-ignore flex items-center justify-center gap-1 w-full'>
      <Icon 
        className={`text-ignore mt-2 mb-[-5px] transition-all ${isLoading ? 'h-[30px]' : 'h-0'}`} 
        icon="eos-icons:three-dots-loading" 
        width="40" 
        height="40" 
      />
      {isEmpty && (
        <div className='absolute top-[40%] select-none text-ignore flex items-center justify-center gap-2 w-full mt-2 md:mt-10'>
          <Icon icon="line-md:coffee-half-empty-twotone-loop" width="24" height="24" />
          <div className='text-md text-ignore font-bold'>
            {emptyMessage || t('no-data-here-well-then-time-to-write-a-note')}
          </div>
        </div>
      )}
    </div>
  );
}; 