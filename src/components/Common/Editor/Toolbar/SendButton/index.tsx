import { Button } from '@nextui-org/react';
import { Icon } from '@iconify/react';
import { SendIcon } from '../../../Icons';
import { EditorStore } from '../../editorStore';
import { useMediaQuery } from 'usehooks-ts';
import { Div } from '@/components/Common/Div';
import { observer } from 'mobx-react-lite';

interface Props {
  store: EditorStore;
  isSendLoading?: boolean;
}

export const SendButton = observer(({ store, isSendLoading }: Props) => {
  return (
    <div>
      <Button
        isDisabled={!store.canSend}
        size='sm'
        radius='md'
        isLoading={isSendLoading}
        className={`ml-2 w-[60px] group`}
        isIconOnly
        color='primary'
        onPress={(e) => {
          store.handleSend()
        }}
      >
        {store.files?.some(i => i.uploadPromise?.loading?.value) ? (
          <Icon icon="line-md:uploading-loop" width="24" height="24" />
        ) : (
          <SendIcon className='primary-foreground !text-primary-foreground group-hover:rotate-[-35deg] transition-all' />
        )}
      </Button>
    </div>
  );
})