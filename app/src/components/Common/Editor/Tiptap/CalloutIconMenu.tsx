import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { CalloutPickerContent } from './ToolbarButtons';

/**
 * Floating color/icon picker that opens when the user clicks the emoji badge
 * on a callout block. Listens for the `callout-icon-click` DOM event emitted
 * by the CalloutClickOutside ProseMirror plugin and renders near the cursor.
 */
export const CalloutIconMenu = ({ editor }: { editor: Editor | null | undefined }) => {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { x: number; y: number };
      setPos({ x: detail.x, y: detail.y });
    };

    const closeOnOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setPos(null);
      }
    };
    const closeOnKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPos(null);
    };

    dom.addEventListener('callout-icon-click', handler);
    document.addEventListener('mousedown', closeOnOutside, true);
    document.addEventListener('keydown', closeOnKey);
    return () => {
      dom.removeEventListener('callout-icon-click', handler);
      document.removeEventListener('mousedown', closeOnOutside, true);
      document.removeEventListener('keydown', closeOnKey);
    };
  }, [editor]);

  if (!editor || !pos) return null;

  // Keep the menu inside the viewport.
  const MENU_W = 224;
  const MENU_H = 380;
  const left = Math.min(pos.x - 10, window.innerWidth - MENU_W - 12);
  const top = Math.min(pos.y + 6, window.innerHeight - MENU_H - 12);

  return (
    <div
      ref={menuRef}
      className="fixed z-[9997] p-2 w-[224px] rounded-xl bg-background shadow-[0_6px_24px_rgba(0,0,0,0.14),0_0_0_1px_rgba(0,0,0,0.04)]"
      style={{ left: Math.max(8, left), top: Math.max(8, top) }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <CalloutPickerContent editor={editor} onDone={() => setPos(null)} />
    </div>
  );
};
