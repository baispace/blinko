import { useEffect, useRef } from 'react';
import { Icon } from '@/components/Common/Iconify/icons';

export type TableMenuItem =
  | {
      key: string;
      label: string;
      icon?: string;
      danger?: boolean;
      disabled?: boolean;
      onClick: () => void;
    }
  | { divider: true };

export const TableMenu = ({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: TableMenuItem[];
  onClose: () => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Capture so any click elsewhere closes the menu first.
    document.addEventListener('mousedown', close, true);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', close, true);
      document.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  // Keep the menu inside the viewport.
  const rect = ref.current?.getBoundingClientRect();
  const width = rect?.width ?? 160;
  const height = rect?.height ?? items.length * 34;
  const left = Math.min(Math.max(8, x), window.innerWidth - width - 8);
  const top = Math.min(Math.max(8, y), window.innerHeight - height - 8);

  return (
    <div
      ref={ref}
      className="tiptap-table-menu"
      style={{ left, top }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.map((item, index) => {
        if ('divider' in item) {
          return <div key={`div-${index}`} className="tiptap-table-menu-divider" />;
        }
        return (
          <button
            key={item.key}
            className={`tiptap-table-menu-item${item.danger ? ' is-danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.icon && (
              <span className="tiptap-table-menu-icon">
                <Icon icon={item.icon} width={14} height={14} />
              </span>
            )}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};
