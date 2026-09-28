import { useCallback, useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { Icon } from '@/components/Common/Iconify/icons';
import { findTableDom, selectRowOrColumn } from './tableUtils';

type Box = { top: number; left: number; width: number; height: number };

type Geometry = {
  box: Box;
  rows: Box[];
  cols: Box[];
};

/**
 * Row/column gutters rendered around the table, spreadsheet style:
 * hover to highlight, click to select the whole row or column.
 * The trailing "+" buttons append a row / column at the end.
 */
export const TableHandles = ({ editor }: { editor: Editor | null | undefined }) => {
  const [geo, setGeo] = useState<Geometry | null>(null);
  const [hover, setHover] = useState<{ scope: 'row' | 'col'; index: number } | null>(null);

  const measure = useCallback(() => {
    if (!editor || !editor.isEditable || !editor.isActive('table')) {
      setGeo(null);
      return;
    }
    const table = findTableDom(editor);
    if (!table) {
      setGeo(null);
      return;
    }
    const box = table.getBoundingClientRect();
    if (box.bottom < 0 || box.top > window.innerHeight) {
      setGeo(null);
      return;
    }
    const rows = Array.from(table.querySelectorAll('tr')).map((tr) => {
      const r = tr.getBoundingClientRect();
      return { top: r.top, left: r.left, width: r.width, height: r.height };
    });
    const firstRow = table.querySelector('tr');
    const cols = firstRow
      ? Array.from(firstRow.children).map((cell) => {
          const c = cell.getBoundingClientRect();
          return { top: c.top, left: c.left, width: c.width, height: c.height };
        })
      : [];

    setGeo({
      box: { top: box.top, left: box.left, width: box.width, height: box.height },
      rows,
      cols,
    });
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    measure();
    editor.on('selectionUpdate', measure);
    editor.on('transaction', measure);
    editor.on('focus', measure);
    editor.on('blur', measure);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      editor.off('selectionUpdate', measure);
      editor.off('transaction', measure);
      editor.off('focus', measure);
      editor.off('blur', measure);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [editor, measure]);

  if (!editor || !geo) return null;

  const appendRow = () => {
    selectRowOrColumn(editor, 'row', geo.rows.length - 1);
    editor.chain().focus().addRowAfter().run();
  };

  const appendColumn = () => {
    selectRowOrColumn(editor, 'col', geo.cols.length - 1);
    editor.chain().focus().addColumnAfter().run();
  };

  const hoverBox =
    hover?.scope === 'row' ? geo.rows[hover.index] : hover?.scope === 'col' ? geo.cols[hover.index] : null;

  return (
    <div className="tiptap-table-handles">
      {hoverBox && (
        <div
          className="tiptap-table-highlight"
          style={{ top: hoverBox.top, left: hoverBox.left, width: hoverBox.width, height: hoverBox.height }}
        />
      )}

      {geo.cols.map((col, index) => (
        <button
          key={`col-${index}`}
          className={`tiptap-col-handle${hover?.scope === 'col' && hover.index === index ? ' is-hover' : ''}`}
          style={{ top: geo.box.top - 12, left: col.left, width: col.width, height: 8 }}
          onMouseEnter={() => setHover({ scope: 'col', index })}
          onMouseLeave={() => setHover(null)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => selectRowOrColumn(editor, 'col', index)}
        />
      ))}

      <button
        className="tiptap-table-add"
        style={{ top: geo.box.top - 16, left: geo.box.left + geo.box.width + 4 }}
        title="add-column"
        onMouseDown={(e) => e.preventDefault()}
        onClick={appendColumn}
      >
        <Icon icon="mdi:plus" width={12} height={12} />
      </button>

      {geo.rows.map((row, index) => (
        <button
          key={`row-${index}`}
          className={`tiptap-row-handle${hover?.scope === 'row' && hover.index === index ? ' is-hover' : ''}`}
          style={{ top: row.top, left: geo.box.left - 14, width: 8, height: row.height }}
          onMouseEnter={() => setHover({ scope: 'row', index })}
          onMouseLeave={() => setHover(null)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => selectRowOrColumn(editor, 'row', index)}
        />
      ))}

      <button
        className="tiptap-table-add"
        style={{ top: geo.box.top + geo.box.height + 4, left: geo.box.left - 16 }}
        title="add-row"
        onMouseDown={(e) => e.preventDefault()}
        onClick={appendRow}
      >
        <Icon icon="mdi:plus" width={12} height={12} />
      </button>
    </div>
  );
};
