import { useCallback, useEffect, useState, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { CellSelection } from '@tiptap/pm/tables';
import { NodeSelection } from '@tiptap/pm/state';
import { Tooltip } from '@heroui/react';
import { TableToolbarIcon } from './TableToolbarIcon';
import { useTranslation } from 'react-i18next';
import { clearCellFormat, findTableDom, getSelectedCellsRect, setCellAttrs } from './tableUtils';

const CELL_COLORS = [
  { value: '', label: 'table-color-default' },
  { value: '#fef3c7', label: 'table-color-amber' },
  { value: '#dcfce7', label: 'table-color-green' },
  { value: '#dbeafe', label: 'table-color-blue' },
  { value: '#f3e8ff', label: 'table-color-purple' },
  { value: '#ffe4e6', label: 'table-color-red' },
  { value: '#e2e8f0', label: 'table-color-gray' },
];

const TOOLBAR_WIDTH = 440;
const TOOLBAR_HEIGHT = 46;

/** Compact Feishu-like toolbar, visible only for a row/column/table selection. */
export const TableToolbar = ({ editor }: { editor: Editor | null | undefined }) => {
  const { t } = useTranslation();
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null);
  const [showColors, setShowColors] = useState(false);
  const [showAlign, setShowAlign] = useState(false);
  const [selectionScope, setSelectionScope] = useState<'row' | 'col' | 'table' | 'cells' | null>(null);

  const update = useCallback(() => {
    if (!editor?.isEditable || (!editor.isFocused && !toolbarRef.current?.contains(document.activeElement))) { setRect(null); setShowColors(false); setShowAlign(false); setSelectionScope(null); return; }
    const selection = editor.state.selection;
    const cellSelection = selection instanceof CellSelection;
    const tableSelection = selection instanceof NodeSelection && selection.node?.type?.name === 'table';
    if (!cellSelection && !tableSelection) {
      setRect(null);
      setShowColors(false);
      setShowAlign(false);
      setSelectionScope(null);
      return;
    }
    const table = findTableDom(editor);
    if (!table) { setRect(null); return; }
    const box = getSelectedCellsRect(editor, table) ?? table.getBoundingClientRect();
    const height = toolbarRef.current?.offsetHeight || TOOLBAR_HEIGHT;
    const width = toolbarRef.current?.offsetWidth || Math.min(TOOLBAR_WIDTH, window.innerWidth - 16);
    const above = box.top - height - 10;
    const top = above < 8 ? box.bottom + 10 : above;
    const center = box.left + box.width / 2;
    setRect({
      top: Math.max(8, Math.min(top, window.innerHeight - height - 8)),
      left: Math.min(Math.max(8, center - width / 2), Math.max(8, window.innerWidth - width - 8)),
    });
    setSelectionScope(tableSelection || ((selection as CellSelection).isRowSelection() && (selection as CellSelection).isColSelection()) ? 'table' : (selection as CellSelection).isRowSelection() ? 'row' : (selection as CellSelection).isColSelection() ? 'col' : 'cells');
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    update();
    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    editor.on('focus', update);
    const onBlur = () => requestAnimationFrame(update);
    editor.on('blur', onBlur);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
      editor.off('focus', update);
      editor.off('blur', onBlur);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [editor, update]);

  useEffect(() => { if (selectionScope) requestAnimationFrame(update); }, [selectionScope, update]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!toolbarRef.current?.contains(event.target as Node)) { setShowAlign(false); setShowColors(false); } };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setShowAlign(false); setShowColors(false); } };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, []);
  if (!editor || !rect || !selectionScope) return null;

  const run = (fn: (instance: Editor) => void) => () => {
    fn(editor);
    setShowColors(false);
    setShowAlign(false);
    requestAnimationFrame(update);
  };
  const chain = (name: string) => run(instance => (instance.chain().focus() as any)[name]().run());
  const setAlign = (textAlign: string | null) => run(instance => setCellAttrs(instance, { textAlign }));
  const setColor = (backgroundColor: string | null) => run(instance => setCellAttrs(instance, { backgroundColor }));

  return (
    <div ref={toolbarRef} role="toolbar" aria-label={t('table')} className="tiptap-table-toolbar is-compact feishu-format-toolbar" style={{ top: rect.top, left: rect.left }} onMouseDown={event => event.preventDefault()}>
      <TbBtn icon="bold" label={t('bold')} active={editor.isActive('bold')} onClick={chain('toggleBold')} />
      <TbBtn icon="strikethrough" label={t('strike')} active={editor.isActive('strike')} onClick={chain('toggleStrike')} />
      <TbBtn icon="italic" label={t('italic')} active={editor.isActive('italic')} onClick={chain('toggleItalic')} />
      <TbBtn icon="underline" label={t('underline')} active={editor.isActive('underline')} onClick={chain('toggleUnderline')} />
      <TbBtn icon="code" label={t('inline-code')} active={editor.isActive('code')} onClick={chain('toggleCode')} />
      <span className="tiptap-table-toolbar-divider" />
      <div className="relative">
        <TbBtn icon="align-left" label={t('table-align-left') + ' / ' + t('table-align-center') + ' / ' + t('table-align-right')} expanded={showAlign} dropdown onClick={() => { setShowAlign(v => !v); setShowColors(false); }} />
        {showAlign && <div className="table-toolbar-popover" style={rect.top + 170 > window.innerHeight ? { top: 'auto', bottom: 'calc(100% + 8px)' } : undefined} role="group" aria-label="对齐方式">
          {(['left','center','right'] as const).map(value => <button key={value} type="button" className="table-toolbar-menu-item" onClick={setAlign(value)}><TableToolbarIcon name={`align-${value}`} size={18} /><span>{t(`table-align-${value}`)}</span></button>)}
        </div>}
      </div>
      <span className="tiptap-table-toolbar-divider" />
      <div className="relative">
        <TbBtn icon="color-swatch" label={t('table-cell-color')} expanded={showColors} dropdown onClick={() => { setShowColors(value => !value); setShowAlign(false); }} />
        {showColors && (
          <div className="tiptap-table-colors table-toolbar-popover" style={rect.top + 310 > window.innerHeight ? { top: 'auto', bottom: 'calc(100% + 8px)' } : undefined} role="group" aria-label={t('table-cell-color')}>
            <span className="table-toolbar-popover-label">{t('table-cell-color')}</span>
            {CELL_COLORS.map(color => (
              <button
                key={color.label}
                type="button"
                className="table-toolbar-color-option"
                aria-label={t(color.label)}
                title={t(color.label)}
                onClick={setColor(color.value || null)}
              ><span className="tiptap-table-color-swatch" style={{ background: color.value || 'transparent' }} /><span>{t(color.label)}</span></button>
            ))}
          </div>
        )}
      </div>
      <TbBtn icon="clear-formatting" label={t('table-clear-format')} onClick={run(clearCellFormat)} />
      <span className="tiptap-table-toolbar-divider" />
      <TbBtn icon="trash" label={t(selectionScope === 'row' ? 'table-delete-row' : selectionScope === 'col' ? 'table-delete-column' : 'table-delete')} text={t(selectionScope === 'row' ? 'table-delete-row' : selectionScope === 'col' ? 'table-delete-column' : 'table-delete')} danger onClick={chain(selectionScope === 'row' ? 'deleteRow' : selectionScope === 'col' ? 'deleteColumn' : 'deleteTable')} />
    </div>
  );
};

const TbBtn = ({ icon, label, onClick, active, danger, text, dropdown, expanded }: {
  icon: string; label: string; onClick: () => void; active?: boolean; danger?: boolean;
  text?: string; dropdown?: boolean; expanded?: boolean;
}) => <Tooltip content={label} delay={250} closeDelay={0} placement="top">
  <button type="button" className={`tiptap-table-btn${active ? ' is-active' : ''}${danger ? ' is-danger' : ''}${text || dropdown ? ' has-label' : ''}`}
    aria-label={label} aria-pressed={active} aria-expanded={expanded} aria-haspopup={dropdown ? 'true' : undefined} onClick={onClick}>
    <TableToolbarIcon name={icon} />{text && <span>{text}</span>}{dropdown && <TableToolbarIcon name="chevron-down" size={14} />}
  </button>
</Tooltip>;
