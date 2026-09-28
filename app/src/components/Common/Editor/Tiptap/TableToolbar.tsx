import { useCallback, useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';
import { findTableDom, moveRow, moveColumn } from './tableUtils';

/** Cell background swatches. Soft tints so text stays readable in both themes. */
const CELL_COLORS = [
  { value: '', label: 'table-color-default' },
  { value: '#fef3c7', label: 'table-color-amber' },
  { value: '#dcfce7', label: 'table-color-green' },
  { value: '#dbeafe', label: 'table-color-blue' },
  { value: '#f3e8ff', label: 'table-color-purple' },
  { value: '#ffe4e6', label: 'table-color-red' },
  { value: '#e2e8f0', label: 'table-color-gray' },
];

type Rect = { top: number; left: number; width: number };

const TOOLBAR_HEIGHT = 34;

/**
 * Floating toolbar shown above the table whenever the cursor is inside one.
 * Position is viewport-based so it works with the scrolling editor container.
 */
export const TableToolbar = ({ editor }: { editor: Editor | null | undefined }) => {
  const { t } = useTranslation();
  const [rect, setRect] = useState<Rect | null>(null);
  const [showColors, setShowColors] = useState(false);

  const update = useCallback(() => {
    if (!editor || !editor.isEditable || !editor.isActive('table')) {
      setRect(null);
      setShowColors(false);
      return;
    }
    const table = findTableDom(editor);
    if (!table) {
      setRect(null);
      return;
    }
    const box = table.getBoundingClientRect();
    if (box.bottom < 0 || box.top > window.innerHeight) {
      setRect(null);
      return;
    }
    const above = box.top - TOOLBAR_HEIGHT - 6;
    const top = above < 8 ? box.bottom + 6 : above;
    setRect({
      top: Math.max(8, top),
      left: Math.min(Math.max(8, box.left), Math.max(8, window.innerWidth - 60)),
      width: box.width,
    });
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    update();
    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    editor.on('focus', update);
    editor.on('blur', update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
      editor.off('focus', update);
      editor.off('blur', update);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [editor, update]);

  if (!editor || !rect) return null;

  const run = (fn: (editor: Editor) => void) => () => {
    fn(editor);
    setShowColors(false);
    update();
  };

  const chain = (name: string) => run((e) => (e.chain().focus() as any)[name]().run());

  const setAlign = (align: string | null) =>
    run((e) => {
      e.chain().focus().updateAttributes('tableCell', { textAlign: align }).run();
      e.chain().focus().updateAttributes('tableHeader', { textAlign: align }).run();
    });

  const setColor = (color: string | null) =>
    run((e) => {
      e.chain().focus().updateAttributes('tableCell', { backgroundColor: color }).run();
      e.chain().focus().updateAttributes('tableHeader', { backgroundColor: color }).run();
    });

  return (
    <div
      className="tiptap-table-toolbar"
      style={{ top: rect.top, left: rect.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <TbBtn icon="mdi:table-row-plus-before" title={t('table-row-above')} onClick={chain('addRowBefore')} />
      <TbBtn icon="mdi:table-row-plus-after" title={t('table-row-below')} onClick={chain('addRowAfter')} />
      <TbBtn icon="mdi:arrow-up" title={t('table-move-row-up')} onClick={run((e) => moveRow(e, -1))} />
      <TbBtn icon="mdi:arrow-down" title={t('table-move-row-down')} onClick={run((e) => moveRow(e, 1))} />
      <TbBtn icon="mdi:table-row-remove" title={t('table-delete-row')} onClick={chain('deleteRow')} />

      <span className="tiptap-table-toolbar-divider" />

      <TbBtn icon="mdi:table-column-plus-before" title={t('table-column-left')} onClick={chain('addColumnBefore')} />
      <TbBtn icon="mdi:table-column-plus-after" title={t('table-column-right')} onClick={chain('addColumnAfter')} />
      <TbBtn icon="mdi:arrow-left" title={t('table-move-column-left')} onClick={run((e) => moveColumn(e, -1))} />
      <TbBtn icon="mdi:arrow-right" title={t('table-move-column-right')} onClick={run((e) => moveColumn(e, 1))} />
      <TbBtn icon="mdi:table-column-remove" title={t('table-delete-column')} onClick={chain('deleteColumn')} />

      <span className="tiptap-table-toolbar-divider" />

      <TbBtn icon="mdi:table-merge-cells" title={t('table-merge-cells')} onClick={chain('mergeCells')} />
      <TbBtn icon="mdi:table-split-cell" title={t('table-split-cell')} onClick={chain('splitCell')} />
      <TbBtn icon="mdi:table-headings" title={t('table-toggle-header')} onClick={chain('toggleHeaderRow')} />

      <span className="tiptap-table-toolbar-divider" />

      <TbBtn icon="mdi:format-align-left" title={t('align-left')} onClick={() => setAlign('left')} />
      <TbBtn icon="mdi:format-align-center" title={t('align-center')} onClick={() => setAlign('center')} />
      <TbBtn icon="mdi:format-align-right" title={t('align-right')} onClick={() => setAlign('right')} />
      <TbBtn
        icon="mdi:format-color-fill"
        title={t('table-cell-color')}
        active={showColors}
        onClick={() => setShowColors((v) => !v)}
      />

      <span className="tiptap-table-toolbar-divider" />

      <TbBtn icon="mdi:table-remove" title={t('table-delete')} danger onClick={chain('deleteTable')} />

      {showColors && (
        <div className="tiptap-table-colors">
          {CELL_COLORS.map((color) => (
            <button
              key={color.label}
              className="tiptap-table-color-swatch"
              style={{ background: color.value || 'transparent' }}
              title={t(color.value ? color.label : 'default')}
              onClick={() => setColor(color.value || null)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const TbBtn = ({
  icon,
  title,
  onClick,
  active,
  danger,
}: {
  icon: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) => (
  <button
    className={`tiptap-table-btn${active ? ' is-active' : ''}${danger ? ' is-danger' : ''}`}
    title={title}
    onClick={onClick}
  >
    <Icon icon={icon} width={16} height={16} />
  </button>
);
