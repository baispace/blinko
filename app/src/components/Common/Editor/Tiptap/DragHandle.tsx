import { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';

/**
 * Block drag handle (⠿) for the hovered top-level block.
 * Notion-like behaviour: only visible while the pointer is over a block
 * (or over the handle itself) — never pinned to the caret position, so it
 * stays out of the way for quick capture notes.
 * DOM-direct positioning (no React state per transaction) to avoid
 * re-render storms when combined with BubbleMenu.
 */
export const DragHandle = ({ editor }: { editor: Editor }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const posRef = useRef<{ nodeStart: number } | null>(null);
  const hideTimer = useRef<number | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !editor) return;
    const editorDom = editor.view.dom as HTMLElement;

    const hide = () => { el.style.display = 'none'; };
    const cancelHide = () => {
      if (hideTimer.current != null) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    };
    // Delay hiding so the pointer can travel from the block onto the handle
    const scheduleHide = () => {
      cancelHide();
      hideTimer.current = window.setTimeout(() => {
        if (draggingRef.current) return;
        if (el.matches(':hover')) return;
        hide();
      }, 120);
    };

    const locate = (clientX: number, clientY: number) => {
      try {
        const coords = editor.view.posAtCoords({ left: clientX, top: clientY });
        if (!coords) return false;
        const $pos = editor.state.doc.resolve(coords.pos);
        if ($pos.depth < 1) return false;
        const start = $pos.before(1);
        const dom = editor.view.nodeDOM(start);
        if (!dom || !(dom instanceof HTMLElement)) return false;
        const editorRect = editorDom.getBoundingClientRect();
        const nodeRect = dom.getBoundingClientRect();
        if (nodeRect.width === 0) return false;
        el.style.top = `${nodeRect.top - editorRect.top + 4}px`;
        posRef.current = { nodeStart: start };
        return true;
      } catch {
        return false;
      }
    };

    const onMove = (e: MouseEvent) => {
      if (draggingRef.current) return;
      if (!locate(e.clientX, e.clientY)) { scheduleHide(); return; }
      cancelHide();
      el.style.display = 'flex';
    };

    const onLeave = () => scheduleHide();

    editorDom.addEventListener('mousemove', onMove);
    editorDom.addEventListener('mouseleave', onLeave);
    el.addEventListener('mouseenter', cancelHide);
    el.addEventListener('mouseleave', scheduleHide);

    return () => {
      editorDom.removeEventListener('mousemove', onMove);
      editorDom.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('mouseenter', cancelHide);
      el.removeEventListener('mouseleave', scheduleHide);
      cancelHide();
    };
  }, [editor]);

  return (
    <div
      ref={ref}
      className="tiptap-drag-handle"
      style={{ display: 'none' }}
      title="拖拽移动该块"
      draggable
      onDragStart={(e) => {
        const pos = posRef.current;
        if (!editor || pos == null) return;
        const node = editor.state.doc.nodeAt(pos.nodeStart);
        if (!node) return;
        draggingRef.current = true;
        editor.commands.setNodeSelection(pos.nodeStart);
        const slice = editor.state.doc.slice(pos.nodeStart, pos.nodeStart + node.nodeSize);
        e.dataTransfer.effectAllowed = 'move';
        try {
          e.dataTransfer.setData('text/html', node.toHTML());
        } catch { /* ignore */ }
        // ProseMirror internal drag protocol: drop is handled as a "move"
        (editor.view as any).dragging = { slice, move: true };
      }}
      onDragEnd={() => {
        draggingRef.current = false;
        const el = ref.current;
        if (el && !el.matches(':hover')) el.style.display = 'none';
      }}
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
        {[6, 12, 18].flatMap(y => [8.5, 15.5].map(x =>
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.7" />
        ))}
      </svg>
    </div>
  );
};
