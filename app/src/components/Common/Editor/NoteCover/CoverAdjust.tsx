import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Common/Iconify/icons';
import { DEFAULT_OFFSET, toObjectPosition, type CoverOffset } from './coverOffset';

interface CoverAdjustProps {
  src?: string
  offset: CoverOffset
  /** Called live while panning, so the editor reflects the framing instantly. */
  onChange: (next: CoverOffset) => void
  onDone: () => void
}

/**
 * Feishu-style inline framing: the picture pans right where it already sits,
 * no modal and no "apply" step. Offsets are written through on every frame
 * (rAF-throttled) which keeps the editor's preview perfectly WYSIWYG.
 */
export const CoverAdjust = ({ src, offset, onChange, onDone }: CoverAdjustProps) => {
  const { t } = useTranslation();
  const frameRef = useRef<HTMLDivElement>(null);
  const pending = useRef<CoverOffset | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }, []);

  const flush = () => {
    rafRef.current = null;
    if (pending.current) onChange(pending.current);
  };

  const apply = (clientX: number, clientY: number) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return;
    pending.current = {
      x: Math.min(100, Math.max(0, Math.round(((clientX - rect.left) / rect.width) * 100))),
      y: Math.min(100, Math.max(0, Math.round(((clientY - rect.top) / rect.height) * 100))),
    };
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(flush);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return;
    e.preventDefault();
    apply(e.clientX, e.clientY);
  };

  return (
    <div className="relative w-full h-full">
      <div
        ref={frameRef}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          apply(e.clientX, e.clientY);
        }}
        onPointerMove={handlePointerMove}
        className="w-full h-full cursor-grab active:cursor-grabbing touch-none select-none"
      >
        {src && (
          <img
            src={src}
            alt=""
            draggable={false}
            style={{ objectPosition: toObjectPosition(offset) }}
            className="w-full h-full object-cover pointer-events-none"
          />
        )}
      </div>

      <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/55 px-3 py-1 text-[11px] text-white backdrop-blur-sm">
        {t('drag-to-adjust')}
      </span>

      <div className="absolute right-2 top-2 flex items-center gap-1.5">
        <button
          type="button"
          title={t('reset-position')}
          onClick={() => onChange({ ...DEFAULT_OFFSET })}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/55 text-white text-xs backdrop-blur-sm hover:bg-black/75 !transition-colors"
        >
          <Icon icon="mingcute:refresh-2-line" width={13} height={13} />
          {t('reset-position')}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary text-white text-xs backdrop-blur-sm hover:opacity-90 !transition-colors"
        >
          <Icon icon="mingcute:check-line" width={13} height={13} />
          {t('finish')}
        </button>
      </div>
    </div>
  );
};
