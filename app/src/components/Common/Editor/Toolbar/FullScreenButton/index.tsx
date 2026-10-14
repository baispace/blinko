import { IconButton } from '../IconButton';
import { useTranslation } from 'react-i18next';

interface Props {
  isFullscreen: boolean;
  onClick: () => void;
}

export const FullScreenButton = ({ isFullscreen, onClick }: Props) => {
  const { t } = useTranslation();

  return (
    <div className='' onClick={onClick}>
      <IconButton
        tooltip={isFullscreen ? t('exit-fullscreen') : t('fullscreen')}
        icon={isFullscreen ? 'lucide:minimize' : 'basil:expand-outline'}
      />
    </div>
  );
}; 