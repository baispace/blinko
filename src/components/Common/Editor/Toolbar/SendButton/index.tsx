import { Button } from '@nextui-org/react';
import { Icon } from '@iconify/react';
import { SendIcon } from '../../../Icons';
import { EditorStore } from '../../editorStore';
import { FocusEditor } from '../../editorUtils';
import { useMediaQuery } from 'usehooks-ts';
import { Div } from '@/components/Common/Div';

interface Props {
  store: EditorStore;
  isSendLoading?: boolean;
}

export const SendButton = ({ store, isSendLoading }: Props) => {
  const isPc = useMediaQuery('(min-width: 768px)')
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
}; 