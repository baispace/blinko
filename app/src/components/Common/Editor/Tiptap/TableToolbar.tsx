import { useCallback, useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';
import { clearCellFormat, findTableDom, getSelectedCellsRect, isTableActive, setCellAttrs } from './tableUtils';

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

const TOOLBAR_HEIGHT = 42;

/**
 * Feishu-style floating toolbar shown above the selected table cells.
 * Buttons are icon + text so users don't have to guess the meaning of icons.
 */
export const TableToolbar = ({ editor }: { editor: Editor | null | undefined }) => {
  const { t } = useTranslation();
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [showColors, setShowColors] = useState(false);

  const update = useCallback(() => {
    if (!editor || !editor.isEditable || !isTableActive(editor)) {
      setRect(null);
      setShowColors(false);
      return;
    }
    const table = findTableDom(editor);
    if (!table) {
      setRect(null);
      return;
    }
    const tableBox = table.getBoundingClientRect();
    if (tableBox.bottom < 0 || tableBox.top > window.innerHeight) {
      setRect(null);
      return;
    }

    const selected = getSelectedCellsRect(editor, table);
    const box = selected ?? tableBox;
    const above = box.top - TOOLBAR_HEIGHT - 32;
    const top = above < 8 ? box.bottom + 32 : above;
    setRect({
      top: Math.max(8, top),
      left: Math.min(Math.max(8, box.left), Math.max(8, window.innerWidth - 120)),
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

  const setAlign = (align: string | null) => run((e) => setCellAttrs(e, { textAlign: align }));

  const setColor = (color: string | null) => run((e) => setCellAttrs(e, { backgroundColor: color }));

  const canMerge = (editor.can()?.mergeCells ? editor.can().mergeCells() : false) as boolean;
  const canSplit = (editor.can()?.splitCell ? editor.can().splitCell() : false) as boolean;

  return (
    <div
      className="tiptap-table-toolbar"
      style={{ top: rect.top, left: rect.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <TbBtn
        icon="mdi:table-merge-cells"
        label={t('table-merge-cells')}
        disabled={!canMerge}
        title={t('table-merge-cells')}
        onClick={chain('mergeCells')}
      />
      <TbBtn
        icon="mdi:table-split-cell"
        label={t('table-split-cell')}
        disabled={!canSplit}
        title={t('table-split-cell')}
        onClick={chain('splitCell')}
      />

      <span className="tiptap-table-toolbar-divider" />

      <TbBtn
        icon="mdi:format-align-left"
        label={t('table-align-left')}
        title={t('table-align-left')}
        onClick={() => setAlign('left')}
      />
      <TbBtn
        icon="mdi:format-align-center"
        label={t('table-align-center')}
        title={t('table-align-center')}
        onClick={() => setAlign('center')}
      />
      <TbBtn
        icon="mdi:format-align-right"
        label={t('table-align-right')}
        title={t('table-align-right')}
        onClick={() => setAlign('right')}
      />

      <span className="tiptap-table-toolbar-divider" />

      <div className="relative">
        <TbBtn
          icon="mdi:format-color-fill"
          label={t('table-cell-color')}
          active={showColors}
          title={t('table-cell-color')}
          onClick={() => setShowColors((v) => !v)}
        />
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

      <TbBtn
        icon="mdi:format-clear"
        label={t('table-clear-format')}
        title={t('table-clear-format')}
        onClick={run(clearCellFormat)}
      />

      <span className="tiptap-table-toolbar-divider" />

      <TbBtn
        icon="mdi:table-row-remove"
        label={t('table-delete-row')}
        title={t('table-delete-row')}
        onClick={chain('deleteRow')}
      />
      <TbBtn
        icon="mdi:table-column-remove"
        label={t('table-delete-column')}
        title={t('table-delete-column')}
        onClick={chain('deleteColumn')}
      />

      <span className="tiptap-table-toolbar-divider" />

      <TbBtn
        icon="mdi:table-remove"
        label={t('table-delete')}
        title={t('table-delete')}
        danger
        onClick={chain('deleteTable')}
      />
    </div>
  );
};

const TbBtn = ({
  icon,
  label,
  title,
  onClick,
  active,
  danger,
  disabled,
}: {
  icon: string;
  label: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) => (
  <button
    className={`tiptap-table-btn has-label${active ? ' is-active' : ''}${danger ? ' is-danger' : ''}`}
    title={title}
    disabled={disabled}
    onClick={onClick}
  >
    <Icon icon={icon} width={14} height={14} />
    <span>{label}</span>
  </button>
);
