import { Icon } from '@/components/Common/Iconify/icons';
import { EditorStore } from '../../editorStore';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';

interface Props {
  store: EditorStore;
  isSendLoading?: boolean;
}

/**
 * Edit-mode counterpart of SendButton.
 *
 * With autosave in place the content is already on the server, and uploads,
 * references and note type persist on their own — so this button no longer
 * saves anything, it just flushes whatever is still queued and closes.
 * Create mode keeps SendButton: there the note does not exist yet.
 */
export const DoneButton = observer(({ store, isSendLoading }: Props) => {
  const { t } = useTranslation();
  return (
    <div
      title={t('done')}
      onClick={
        (e) => {
          if (isSendLoading) return
          store.handleDone()
        }
      }
      onTouchEnd={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (isSendLoading) return
        store.handleDone()
      }}
    >
      <div
        className='w-[60px] group ml-2 bg-primary text-foreground flex items-center justify-center rounded-[11px] cursor-pointer h-[32px]'
      >
        {(store.files?.some(i => i.uploadPromise?.loading?.value) || isSendLoading) ? (
          <Icon icon="eos-icons:three-dots-loading" width="24" height="24" className='text-[#F5A524]' />
        ) : (
          <Icon icon="mingcute:check-line" width="22" height="22" className='!text-primary-foreground' />
        )}
      </div>
    </div>
  );
})
