import { observer } from 'mobx-react-lite';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { RootStore } from '@/store';
import { PageWidthStore, type PageWidthMode } from '@/store/pageWidthStore';

interface GlyphProps {
  mode: PageWidthMode;
  size?: 'sm' | 'lg';
}

/**
 * Window-with-document glyph: the outer frame is the window, the inner block
 * is the note body. The inner block widens with the selected mode.
 */
const PageWidthGlyph = ({ mode, size = 'sm' }: GlyphProps) => {
  const block = {
    default: { x: 6, width: 8 },
    wide: { x: 3.5, width: 13 },
    full: { x: 1.5, width: 17 },
  }[mode];

  if (size === 'lg') {
    return (
      <svg width="56" height="40" viewBox="0 0 56 40" fill="none" aria-hidden="true">
        <rect
          x="2" y="4" width="52" height="32" rx="3"
          stroke="currentColor" strokeWidth="2" opacity="0.25"
        />
        <rect
          x={block.x * 2.8} y="10" width={block.width * 2.8} height="20" rx="2"
          fill="currentColor" opacity="0.85"
        />
      </svg>
    );
  }

  return (
    <svg width="20" height="16" viewBox="0 0 20 16" fill="none" aria-hidden="true">
      <rect
        x="1" y="2" width="18" height="12" rx="1.5"
        stroke="currentColor" strokeWidth="1.2" opacity="0.45"
      />
      <rect
        x={block.x} y="4.5" width={block.width} height="7" rx="1"
        fill="currentColor"
      />
    </svg>
  );
};

const MODE_ORDER: PageWidthMode[] = ['default', 'wide', 'full'];

/**
 * Opens a panel with three visual cards (default / wide / full).
 * Each card shows a preview of the resulting layout.
 */
export const PageWidthButton = observer(() => {
  const { t } = useTranslation();
  const pageWidth = RootStore.Get(PageWidthStore);
  const [isOpen, setIsOpen] = useState(false);

  const selectMode = (m: PageWidthMode) => {
    pageWidth.setMode(m);
    setIsOpen(false);
  };

  return (
    <Popover placement="bottom-end" showArrow offset={8} isOpen={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger>
        <Button
          isIconOnly
          variant="light"
          size="sm"
          aria-label={t('page-width')}
          className="text-foreground hover:bg-default-100"
        >
          <PageWidthGlyph mode={pageWidth.mode} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-3 w-[17rem]">
        <div className="text-sm font-medium text-foreground mb-3">
          {t('page-width-prompt')}
        </div>
        <div className="flex gap-2 justify-between">
          {MODE_ORDER.map((m) => {
            const selected = pageWidth.mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => selectMode(m)}
                className={
                  `flex-1 h-auto min-w-0 flex-col items-center justify-center py-3 px-1 rounded-lg border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40 ` +
                  (selected
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-default-50 border-default-200 text-foreground hover:bg-default-100')
                }
              >
                <PageWidthGlyph mode={m} size="lg" />
                <span className="text-xs mt-2 font-medium">{t('page-width-' + m)}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
});
