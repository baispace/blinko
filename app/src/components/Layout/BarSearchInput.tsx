import React, { useEffect, useState } from 'react';
import { Button, Tooltip } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';
import { eventBus } from '@/lib/event';
import { GlobalSearch } from './GlobalSearch';

interface BarSearchInputProps {
  isPc: boolean;
  /**
   * 只藏掉触发按钮，⌘K 监听与全局搜索弹窗照常工作。
   *
   * 这个组件把「快捷键 + 弹窗」和「按钮」绑在一起了：AI 页顶栏不需要这个按钮入口，
   * 但直接不渲染组件会让 ⌘K 在聊天页一起失效，所以要分开控制。
   */
  hideButton?: boolean;
}

export const BarSearchInput = observer(({ hideButton }: BarSearchInputProps) => {
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
    {!hideButton && <Tooltip content={searchLabel} delay={400}>
      <Button isIconOnly size="sm" variant="light" aria-label={searchLabel}
        className="text-default-500 hover:text-foreground rounded-lg"
        onPress={() => setIsGlobalSearchOpen(true)}>
        <Icon icon="lets-icons:search" width="22" height="22" />
      </Button>
    </Tooltip>}
  </>;
});
