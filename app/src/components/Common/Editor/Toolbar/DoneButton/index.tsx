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
  const isUploading = store.activeUploads > 0 || store.files?.some(item => item.uploadPromise?.loading?.value);
  const isBusy = Boolean(isSendLoading || isUploading);

  return (
    <button
      type="button"
      title={t('done')}
      aria-label={t('done')}
      disabled={isBusy}
      onClick={() => { if (!isBusy) void store.handleDone(); }}
      className="group ml-2 flex h-8 w-[60px] cursor-pointer items-center justify-center rounded-[11px] bg-primary text-foreground disabled:cursor-wait disabled:opacity-70"
    >
      {isBusy ? (
        <Icon icon="eos-icons:three-dots-loading" width="24" height="24" className="text-[#F5A524]" />
      ) : (
        <Icon icon="mingcute:check-line" width="22" height="22" className="text-primary-foreground" />
      )}
    </button>
  );
})
