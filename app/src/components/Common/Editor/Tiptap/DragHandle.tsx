import { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';

/**
 * Block drag handle (⠿) positioned to the current top-level block.
 * DOM-direct positioning (no React state per transaction) to avoid
 * re-render storms when combined with BubbleMenu.
 */
export const DragHandle = ({ editor }: { editor: Editor }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const posRef = useRef<{ nodeStart: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !editor) return;

    const hide = () => { el.style.display = 'none'; };

    const update = () => {
      try {
        const { from, empty } = editor.state.selection;
        if (!empty) return hide();
        const $pos = editor.state.doc.resolve(from);
        if ($pos.depth < 1) return hide();
        const start = $pos.before(1);
        const dom = editor.view.nodeDOM(start);
        if (!dom || !(dom instanceof HTMLElement)) return hide();
        const editorRect = editor.view.dom.getBoundingClientRect();
        const nodeRect = dom.getBoundingClientRect();
        if (nodeRect.width === 0) return hide();
        el.style.display = 'flex';
        el.style.top = `${nodeRect.top - editorRect.top + 4}px`;
        posRef.current = { nodeStart: start };
      } catch {
        hide();
      }
    };

    update();
    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
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
        editor.commands.setNodeSelection(pos.nodeStart);
        const slice = editor.state.doc.slice(pos.nodeStart, pos.nodeStart + node.nodeSize);
        e.dataTransfer.effectAllowed = 'move';
        try {
          e.dataTransfer.setData('text/html', node.toHTML());
        } catch { /* ignore */ }
        // ProseMirror internal drag protocol: drop is handled as a "move"
        (editor.view as any).dragging = { slice, move: true };
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
