import React, { useEffect, useRef, useState } from 'react';
import { Button, Input, Tooltip } from '@heroui/react';
import { Icon } from '@iconify/react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { _ } from '@/lib/lodash';
import { useRouter } from 'next/router';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { observer } from 'mobx-react-lite';
import { eventBus } from '@/lib/event';
import { GlobalSearch } from './GlobalSearch';

interface BarSearchInputProps {
  isPc: boolean;
}

export const BarSearchInput = observer(({ isPc }: BarSearchInputProps) => {
  const { t } = useTranslation();
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        eventBus.emit('open-global-search');
      }
    };

    eventBus.on('open-global-search', () => {
      setIsGlobalSearchOpen(true);
    });

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleGlobalSearch = () => {
    // Emit an event that will be caught by the CommonLayout to open the global search
    eventBus.emit('open-global-search');
  };

  return (
    <>
      <GlobalSearch isOpen={isGlobalSearchOpen} onOpenChange={setIsGlobalSearchOpen} />
      {!isPc && !showSearchInput ? (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}>
          <Button isIconOnly className="ml-auto" size="sm" variant="light" onPress={() => handleGlobalSearch()}>
            <Icon className="text-default-600" icon="lets-icons:search" width="24" height="24" />
          </Button>
        </motion.div>
      ) : (
        <Button size="sm" variant="light" onPress={() => setIsGlobalSearchOpen(true)} className="hidden md:flex items-center gap-1 px-3 border-2 border-desc">
          <Icon className="text-default-500" icon="lets-icons:search" width="16" height="16" />
          <span className="text-default-500">{t('search')}</span>
          <div className="flex items-center gap-1 ml-2">
            <kbd className="px-1.5 py-0.5 bg-default-100 rounded text-default-600 text-xs">Ctrl</kbd>
            <span className="text-default-600">+</span>
            <kbd className="px-1.5 py-0.5 bg-default-100 rounded text-default-600 text-xs">K</kbd>
          </div>
        </Button>
      )}
    </>
  );
});
