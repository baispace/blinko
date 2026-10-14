import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { useTranslation } from 'react-i18next';
import { findTableDom, selectRowOrColumn } from './tableUtils';

const RAIL = 8;

type Box = { top: number; left: number; width: number; height: number };
type Geometry = { table: HTMLTableElement; box: Box; rows: Box[]; cols: Box[] };

/**
 * Feishu-style edge controls.
 * - A quiet segmented rail above the table selects columns.
 * - A quiet rail on the left selects rows.
 * - Plus buttons are hit zones on row/column boundaries; only the hovered plus is visible.
 * No dot matrices or context menus are rendered.
 */
export const TableHandles = ({ editor }: { editor: Editor | null | undefined }) => {
  const { t } = useTranslation();
  const [geo, setGeo] = useState<Geometry | null>(null);
  const [visible, setVisible] = useState(false);
  const [hover, setHover] = useState<{ scope: 'row' | 'col'; index: number } | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);

  const measureTable = useCallback((table?: HTMLTableElement | null) => {
    if (!editor?.isEditable) { setGeo(null); return; }
    const current = table ?? tableRef.current ?? (findTableDom(editor) as HTMLTableElement | null);
    if (!current || !current.isConnected || !editor.view.dom.contains(current)) { setGeo(null); return; }
    const rect = current.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) { setGeo(null); return; }
    const rows = Array.from(current.rows).map(row => {
      const box = row.getBoundingClientRect();
      return { top: box.top, left: box.left, width: box.width, height: box.height };
    });
    const cols = current.rows[0]
      ? Array.from(current.rows[0].cells).map(cell => {
          const box = cell.getBoundingClientRect();
          return { top: box.top, left: box.left, width: box.width, height: box.height };
        })
      : [];
    tableRef.current = current;
    setGeo({ table: current, box: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }, rows, cols });
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const move = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const table = target?.closest('table') as HTMLTableElement | null;
      const controls = target?.closest('.tiptap-table-handles');
      if (table && editor.isEditable && editor.view.dom.contains(table)) {
        setVisible(true);
        if (table !== tableRef.current) measureTable(table);
      } else if (controls !== controlsRef.current) {
        setVisible(false);
        setHover(null);
      }
    };
    const refresh = () => measureTable();
    document.addEventListener('mousemove', move, true);
    editor.on('selectionUpdate', refresh);
    editor.on('transaction', refresh);
    window.addEventListener('scroll', refresh, true);
    window.addEventListener('resize', refresh);
    return () => {
      document.removeEventListener('mousemove', move, true);
      editor.off('selectionUpdate', refresh);
      editor.off('transaction', refresh);
      window.removeEventListener('scroll', refresh, true);
      window.removeEventListener('resize', refresh);
    };
  }, [editor, measureTable]);

  if (!editor || !geo) return null;

  const activateCell = (rowIndex: number, colIndex: number) => {
    const row = geo.table.rows[Math.max(0, Math.min(rowIndex, geo.table.rows.length - 1))];
    const cell = row?.cells[Math.max(0, Math.min(colIndex, row.cells.length - 1))];
    if (!cell) return false;
    try {
      const domPos = editor.view.posAtDOM(cell, 0);
      const pos = Math.min(editor.state.doc.content.size, Math.max(0, domPos + 1));
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(pos))));
      return true;
    } catch { return false; }
  };

  const select = (scope: 'row' | 'col', index: number) => {
    if (!activateCell(scope === 'row' ? index : 0, scope === 'col' ? index : 0)) return;
    selectRowOrColumn(editor, scope, index);
  };

  const insertColumnAfter = (index: number) => {
    select('col', index);
    editor.chain().focus().addColumnAfter().run();
  };

  const insertRowAtBoundary = (boundary: number) => {
    if (boundary === 0) {
      select('row', 0);
      editor.chain().focus().addRowBefore().run();
      return;
    }
    select('row', Math.min(boundary - 1, geo.rows.length - 1));
    editor.chain().focus().addRowAfter().run();
  };

  const highlighted = hover?.scope === 'row' ? geo.rows[hover.index] : hover?.scope === 'col' ? geo.cols[hover.index] : null;
  const rowBoundaries = [geo.box.top, ...geo.rows.slice(1).map(row => row.top), geo.box.top + geo.box.height];

  return (
    <div ref={controlsRef} className={`tiptap-table-handles feishu-table-edges${visible ? ' is-visible' : ''}`}>
      {highlighted && (
        <div className="tiptap-table-highlight" style={{ top: highlighted.top, left: highlighted.left, width: highlighted.width, height: highlighted.height }} />
      )}

      {/* One continuous-looking gray rail, segmented only for column selection. */}
      {geo.cols.map((col, index) => (
        <button
          key={`col-rail-${index}`}
          type="button"
          className="feishu-table-col-rail"
          style={{ top: Math.max(2, geo.box.top - RAIL - 3), left: col.left, width: col.width, height: RAIL }}
          title={t('table-select-column')}
          aria-label={`${t('table-select-column')} ${index + 1}`}
          onMouseEnter={() => setHover({ scope: 'col', index })}
          onMouseLeave={() => setHover(null)}
          onMouseDown={event => event.preventDefault()}
          onClick={() => select('col', index)}
        />
      ))}

      {geo.rows.map((row, index) => (
        <button
          key={`row-rail-${index}`}
          type="button"
          className="feishu-table-row-rail"
          style={{ top: row.top, left: geo.box.left - RAIL - 3, width: RAIL, height: row.height }}
          title={t('table-select-row')}
          aria-label={`${t('table-select-row')} ${index + 1}`}
          onMouseEnter={() => setHover({ scope: 'row', index })}
          onMouseLeave={() => setHover(null)}
          onMouseDown={event => event.preventDefault()}
          onClick={() => select('row', index)}
        />
      ))}

      {/* Vertical borders: hover a line to reveal one plus, inserting to its right. */}
      {geo.cols.map((col, index) => (
        <button
          key={`col-add-${index}`}
          type="button"
          className="feishu-table-col-insert"
          style={{ top: geo.box.top, left: col.left + col.width - 7, width: 14, height: geo.box.height }}
          title={t('table-column-right')}
          aria-label={`${t('table-column-right')} ${index + 1}`}
          onMouseDown={event => event.preventDefault()}
          onClick={() => insertColumnAfter(index)}
        >
          <PlusIcon />
        </button>
      ))}

      {/* Horizontal borders on the left: the first adds above, every other line adds below. */}
      {rowBoundaries.map((top, boundary) => (
        <button
          key={`row-add-${boundary}`}
          type="button"
          className="feishu-table-row-insert"
          style={{ top: top - 7, left: geo.box.left - 18, width: 18, height: 14 }}
          title={boundary === 0 ? t('table-row-above') : t('table-row-below')}
          aria-label={boundary === 0 ? t('table-row-above') : t('table-row-below')}
          onMouseDown={event => event.preventDefault()}
          onClick={() => insertRowAtBoundary(boundary)}
        >
          <PlusIcon />
        </button>
      ))}
    </div>
  );
};

const PlusIcon = () => (
  <span className="feishu-table-plus" aria-hidden>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  </span>
);
