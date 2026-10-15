import React, { useEffect, useState } from 'react';
import { Button, Tooltip } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';
import { eventBus } from '@/lib/event';
import { GlobalSearch } from './GlobalSearch';

interface BarSearchInputProps {
  isPc: boolean;
}

export const BarSearchInput = observer(({}: BarSearchInputProps) => {
  const { t } = useTranslation();
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);

  // ⌘K must work no matter where focus currently is, so the listener lives on
  // window (not on the search input) and must not be re-bound on every keystroke.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        eventBus.emit('open-global-search');
      }
    };

    const handleOpen = () => setIsGlobalSearchOpen(true);

    eventBus.on('open-global-search', handleOpen);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      eventBus.off('open-global-search', handleOpen);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl+K';
  const searchLabel = `${t('search')} · ${shortcut}`;
  return <>
    <GlobalSearch isOpen={isGlobalSearchOpen} onOpenChange={setIsGlobalSearchOpen} />
    <Tooltip content={searchLabel} delay={400}>
      <Button isIconOnly size="sm" variant="light" aria-label={searchLabel}
        className="text-default-500 hover:text-foreground rounded-lg"
        onPress={() => setIsGlobalSearchOpen(true)}>
        <Icon icon="lets-icons:search" width="22" height="22" />
      </Button>
    </Tooltip>
  </>;
});
