import { IconButton } from '../IconButton';
import { useTranslation } from 'react-i18next';
import { EditorStore } from '../../editorStore';
import { useMediaQuery } from 'usehooks-ts';

interface Props {
  store: EditorStore;
}

export const HashtagButton = ({ store }: Props) => {
  const { t } = useTranslation();
  const isPc = useMediaQuery('(min-width: 768px)')
  return (
    <div
      onClick={() => store.inertHash()}
      onTouchEnd={e => {
        e.preventDefault()
        store.inertHash()
      }}
    >
      <IconButton
        tooltip={t('insert-hashtag')}
        icon="mdi:hashtag"
      />
    </div>

  );
}; 