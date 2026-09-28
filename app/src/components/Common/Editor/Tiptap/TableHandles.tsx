import { useCallback, useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { useTranslation } from 'react-i18next';
import { duplicateRow, findTableDom, isTableActive, moveColumn, moveRow, selectRowOrColumn, selectTable } from './tableUtils';
import { TableMenu, type TableMenuItem } from './TableMenu';

const HANDLE_SIZE = 20;
const HANDLE_GAP = 4;

type Box = { top: number; left: number; width: number; height: number };

type Geometry = {
  box: Box;
  rows: Box[];
  cols: Box[];
};

type MenuState =
  | { scope: 'row'; index: number; x: number; y: number }
  | { scope: 'col'; index: number; x: number; y: number }
  | { scope: 'table'; x: number; y: number };

/**
 * Feishu-style table handles:
 * - Hovering a row shows a visible drag handle on its left; clicking selects the row
 *   and opens a text menu (insert / move / delete).
 * - Hovering a column shows a handle above it; clicking selects the column and opens
 *   its own text menu.
 * - A corner handle above the table selects the whole table and opens the table menu.
 * - Trailing "+" buttons append a row/column at the end.
 */
export const TableHandles = ({ editor }: { editor: Editor | null | undefined }) => {
  const { t } = useTranslation();
  const [geo, setGeo] = useState<Geometry | null>(null);
  const [hover, setHover] = useState<{ scope: 'row' | 'col'; index: number } | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  // Feishu shows the handles only while the pointer is over the table, so the
  // editor stays clean but the entry point is always one hover away.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const overTable = !!target?.closest?.('table') || !!target?.closest?.('.tiptap-table-handles');
      setVisible(overTable);
    };
    document.addEventListener('mousemove', onMove, true);
    return () => document.removeEventListener('mousemove', onMove, true);
  }, []);

  const measure = useCallback(() => {
    if (!editor || !editor.isEditable || !isTableActive(editor)) {
      setGeo(null);
      setMenu(null);
      setHover(null);
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
    setMenu(null);
  };

  const appendColumn = () => {
    selectRowOrColumn(editor, 'col', geo.cols.length - 1);
    editor.chain().focus().addColumnAfter().run();
    setMenu(null);
  };

  const chain = (name: string) => () => {
    (editor.chain().focus() as any)[name]().run();
    setMenu(null);
  };

  const rowMenuItems = (index: number): TableMenuItem[] => [
    {
      key: 'row-above',
      label: t('table-row-above'),
      icon: 'mdi:table-row-plus-before',
      onClick: () => {
        selectRowOrColumn(editor, 'row', index);
        editor.chain().focus().addRowBefore().run();
      },
    },
    {
      key: 'row-below',
      label: t('table-row-below'),
      icon: 'mdi:table-row-plus-after',
      onClick: () => {
        selectRowOrColumn(editor, 'row', index);
        editor.chain().focus().addRowAfter().run();
      },
    },
    { divider: true },
    {
      key: 'row-move-up',
      label: t('table-move-row-up'),
      icon: 'mdi:arrow-up',
      disabled: index === 0,
      onClick: () => {
        selectRowOrColumn(editor, 'row', index);
        moveRow(editor, -1);
      },
    },
    {
      key: 'row-move-down',
      label: t('table-move-row-down'),
      icon: 'mdi:arrow-down',
      disabled: index === geo.rows.length - 1,
      onClick: () => {
        selectRowOrColumn(editor, 'row', index);
        moveRow(editor, 1);
      },
    },
    {
      key: 'row-duplicate',
      label: t('table-duplicate-row'),
      icon: 'mdi:content-copy',
      onClick: () => {
        selectRowOrColumn(editor, 'row', index);
        duplicateRow(editor);
      },
    },
    { divider: true },
    {
      key: 'row-delete',
      label: t('table-delete-row'),
      icon: 'mdi:table-row-remove',
      danger: true,
      onClick: () => {
        selectRowOrColumn(editor, 'row', index);
        editor.chain().focus().deleteRow().run();
      },
    },
  ];

  const colMenuItems = (index: number): TableMenuItem[] => [
    {
      key: 'col-left',
      label: t('table-column-left'),
      icon: 'mdi:table-column-plus-before',
      onClick: () => {
        selectRowOrColumn(editor, 'col', index);
        editor.chain().focus().addColumnBefore().run();
      },
    },
    {
      key: 'col-right',
      label: t('table-column-right'),
      icon: 'mdi:table-column-plus-after',
      onClick: () => {
        selectRowOrColumn(editor, 'col', index);
        editor.chain().focus().addColumnAfter().run();
      },
    },
    {
      key: 'col-move-left',
      label: t('table-move-column-left'),
      icon: 'mdi:arrow-left',
      disabled: index === 0,
      onClick: () => {
        selectRowOrColumn(editor, 'col', index);
        moveColumn(editor, -1);
      },
    },
    {
      key: 'col-move-right',
      label: t('table-move-column-right'),
      icon: 'mdi:arrow-right',
      disabled: index === geo.cols.length - 1,
      onClick: () => {
        selectRowOrColumn(editor, 'col', index);
        moveColumn(editor, 1);
      },
    },
    { divider: true },
    {
      key: 'col-delete',
      label: t('table-delete-column'),
      icon: 'mdi:table-column-remove',
      danger: true,
      onClick: () => {
        selectRowOrColumn(editor, 'col', index);
        editor.chain().focus().deleteColumn().run();
      },
    },
  ];

  const tableMenuItems = (): TableMenuItem[] => [
    {
      key: 'table-row-above',
      label: t('table-row-above'),
      icon: 'mdi:table-row-plus-before',
      onClick: chain('addRowBefore'),
    },
    {
      key: 'table-row-below',
      label: t('table-row-below'),
      icon: 'mdi:table-row-plus-after',
      onClick: chain('addRowAfter'),
    },
    { divider: true },
    {
      key: 'table-col-left',
      label: t('table-column-left'),
      icon: 'mdi:table-column-plus-before',
      onClick: chain('addColumnBefore'),
    },
    {
      key: 'table-col-right',
      label: t('table-column-right'),
      icon: 'mdi:table-column-plus-after',
      onClick: chain('addColumnAfter'),
    },
    { divider: true },
    {
      key: 'table-header',
      label: t('table-toggle-header'),
      icon: 'mdi:table-headings',
      onClick: chain('toggleHeaderRow'),
    },
    {
      key: 'table-delete',
      label: t('table-delete'),
      icon: 'mdi:table-remove',
      danger: true,
      onClick: chain('deleteTable'),
    },
  ];

  const hoverBox =
    hover?.scope === 'row' ? geo.rows[hover.index] : hover?.scope === 'col' ? geo.cols[hover.index] : null;

  const gutterLeft = Math.max(2, geo.box.left - HANDLE_SIZE - HANDLE_GAP);
  const gutterTop = geo.box.top - HANDLE_SIZE - HANDLE_GAP;
  const addColumnLeft = Math.min(geo.box.left + geo.box.width + HANDLE_GAP, window.innerWidth - 24);

  return (
    <div className={`tiptap-table-handles${visible || menu ? ' is-visible' : ''}`}>
      {hoverBox && (
        <div
          className="tiptap-table-highlight"
          style={{ top: hoverBox.top, left: hoverBox.left, width: hoverBox.width, height: hoverBox.height }}
        />
      )}

      {/* Corner handle — selects the whole table. */}
      <button
        className="tiptap-table-corner"
        style={{ top: Math.max(2, gutterTop), left: gutterLeft }}
        title={t('table-select-table')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
          selectTable(editor);
          setMenu({ scope: 'table', x: rect.right + 4, y: rect.top });
        }}
      >
        <CornerIcon />
      </button>

      {/* Column handles. */}
      {geo.cols.map((col, index) => (
        <button
          key={`col-${index}`}
          className={`tiptap-col-handle${hover?.scope === 'col' && hover.index === index ? ' is-hover' : ''}`}
        style={{
          top: Math.max(2, gutterTop),
          left: col.left + (col.width - HANDLE_SIZE) / 2,
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
        }}
          title={t('table-select-column')}
          onMouseEnter={() => setHover({ scope: 'col', index })}
          onMouseLeave={() => setHover(null)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
            selectRowOrColumn(editor, 'col', index);
            setMenu({ scope: 'col', index, x: rect.left, y: rect.bottom + 4 });
          }}
        >
          <HDragIcon />
        </button>
      ))}

      {/* Trailing column add button. */}
      <button
        className="tiptap-table-add"
        style={{ top: Math.max(2, gutterTop), left: addColumnLeft }}
        title={t('table-add-column-end')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={appendColumn}
      >
        <PlusIcon />
      </button>

      {/* Row handles. */}
      {geo.rows.map((row, index) => (
        <button
          key={`row-${index}`}
          className={`tiptap-row-handle${hover?.scope === 'row' && hover.index === index ? ' is-hover' : ''}`}
          style={{
            top: row.top + (row.height - HANDLE_SIZE) / 2,
            left: gutterLeft,
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
          }}
          title={t('table-select-row')}
          onMouseEnter={() => setHover({ scope: 'row', index })}
          onMouseLeave={() => setHover(null)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
            selectRowOrColumn(editor, 'row', index);
            setMenu({ scope: 'row', index, x: rect.right + 4, y: rect.top });
          }}
        >
          <VDragIcon />
        </button>
      ))}

      {/* Trailing row add button. */}
      <button
        className="tiptap-table-add"
        style={{ top: geo.box.top + geo.box.height + HANDLE_GAP, left: gutterLeft }}
        title={t('table-add-row-end')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={appendRow}
      >
        <PlusIcon />
      </button>

      {menu && (
        <TableMenu
          x={menu.x}
          y={menu.y}
          items={
            menu.scope === 'row'
              ? rowMenuItems(menu.index)
              : menu.scope === 'col'
                ? colMenuItems(menu.index)
                : tableMenuItems()
          }
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
};

const VDragIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
    <circle cx="2" cy="2" r="1" />
    <circle cx="5" cy="2" r="1" />
    <circle cx="8" cy="2" r="1" />
    <circle cx="2" cy="5" r="1" />
    <circle cx="5" cy="5" r="1" />
    <circle cx="8" cy="5" r="1" />
    <circle cx="2" cy="8" r="1" />
    <circle cx="5" cy="8" r="1" />
    <circle cx="8" cy="8" r="1" />
  </svg>
);

const HDragIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
    <circle cx="2" cy="2" r="1" />
    <circle cx="5" cy="2" r="1" />
    <circle cx="8" cy="2" r="1" />
    <circle cx="2" cy="5" r="1" />
    <circle cx="5" cy="5" r="1" />
    <circle cx="8" cy="5" r="1" />
    <circle cx="2" cy="8" r="1" />
    <circle cx="5" cy="8" r="1" />
    <circle cx="8" cy="8" r="1" />
  </svg>
);

const CornerIcon = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
    <rect x="1" y="1" width="3.5" height="3.5" rx="0.8" />
    <rect x="5.5" y="1" width="3.5" height="3.5" rx="0.8" />
    <rect x="1" y="5.5" width="3.5" height="3.5" rx="0.8" />
    <rect x="5.5" y="5.5" width="3.5" height="3.5" rx="0.8" />
  </svg>
);

const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
