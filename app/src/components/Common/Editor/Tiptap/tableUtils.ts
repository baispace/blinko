import type { Editor } from '@tiptap/core';
import { CellSelection } from '@tiptap/pm/tables';
import { NodeSelection } from '@tiptap/pm/state';

/** DOM table element the current selection lives in, if any. */
export const findTableDom = (editor: Editor): HTMLElement | null => {
  try {
    // Whole-table node selection: resolve the node's own DOM.
    const selection = editor.state.selection as any;
    if (selection instanceof NodeSelection && selection.node?.type?.name === 'table') {
      const dom = editor.view.nodeDOM(selection.from);
      if (dom instanceof HTMLElement) return dom;
    }
    const { node } = editor.view.domAtPos(editor.state.selection.from);
    const element = node instanceof HTMLElement ? node : node.parentElement;
    return element?.closest('table') ?? null;
  } catch {
    return null;
  }
};

/** Depth of the closest ancestor whose type is in `types`. */
export const findDepth = (editor: Editor, types: string[]) => {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if (types.includes($from.node(depth).type.name)) return depth;
  }
  return -1;
};

export const findSingleDepth = (editor: Editor, type: string) => findDepth(editor, [type]);

type CellGeometry = {
  tablePos: number;
  tableNode: any;
  rowIndex: number;
  colIndex: number;
};

/** Table position + the row/column index of the cursor. */
const currentCellGeometry = (editor: Editor): CellGeometry | null => {
  const cellDepth = findDepth(editor, ['tableCell', 'tableHeader']);
  const rowDepth = findSingleDepth(editor, 'tableRow');
  if (cellDepth < 0 || rowDepth < 0) return null;
  const { $from } = editor.state.selection;
  const tableDepth = rowDepth - 1;
  if (tableDepth < 0) return null;
  return {
    tablePos: $from.before(tableDepth),
    tableNode: $from.node(tableDepth),
    rowIndex: $from.index(tableDepth),
    colIndex: $from.index(rowDepth),
  };
};

/** Position inside the cell at (rowIndex, colIndex). */
const cellInnerPos = (table: CellGeometry, rowIndex: number, colIndex: number) => {
  let rowPos = table.tablePos + 1;
  for (let i = 0; i < rowIndex; i++) rowPos += table.tableNode.child(i).nodeSize;
  const row = table.tableNode.child(rowIndex);
  let cellPos = rowPos + 1;
  for (let j = 0; j < colIndex; j++) cellPos += row.child(j).nodeSize;
  return cellPos;
};

/** Selects every cell of one row (or column), the way a spreadsheet does. */
export const selectRowOrColumn = (editor: Editor, scope: 'row' | 'col', index: number) => {
  const table = currentCellGeometry(editor);
  if (!table) return;
  const { state, view } = editor;

  try {
    if (scope === 'row') {
      const row = table.tableNode.child(index);
      if (!row) return;
      const from = cellInnerPos(table, index, 0);
      const to = cellInnerPos(table, index, row.childCount - 1);
      view.dispatch(state.tr.setSelection(CellSelection.create(state.doc, from, to)));
    } else {
      const rowCount = table.tableNode.childCount;
      const from = cellInnerPos(table, 0, index);
      const to = cellInnerPos(table, rowCount - 1, index);
      view.dispatch(state.tr.setSelection(CellSelection.create(state.doc, from, to)));
    }
    view.focus();
  } catch {
    /* geometry drifted (nested table, stale index) -- ignore the click */
  }
};

/** Bounding rect of the currently selected cell(s). Falls back to the first cell the cursor is in. */
export const getSelectedCellsRect = (editor: Editor, tableEl?: HTMLElement | null): DOMRect | null => {
  try {
    const table = tableEl ?? findTableDom(editor);
    if (!table) return null;
    const cells = Array.from(table.querySelectorAll<HTMLElement>('td.selectedCell, th.selectedCell'));
    if (cells.length) {
      const rects = cells.map((c) => c.getBoundingClientRect());
      const top = Math.min(...rects.map((r) => r.top));
      const left = Math.min(...rects.map((r) => r.left));
      const right = Math.max(...rects.map((r) => r.right));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      return new DOMRect(left, top, right - left, bottom - top);
    }
    // Single cursor: return the cell the cursor is in.
    const { node } = editor.view.domAtPos(editor.state.selection.from);
    const el = node instanceof HTMLElement ? node : node.parentElement;
    return el?.closest('td, th')?.getBoundingClientRect() ?? null;
  } catch {
    return null;
  }
};

/** Clear alignment and background for selected cells. */
export const clearCellFormat = (editor: Editor) => {
  setCellAttrs(editor, { textAlign: null, backgroundColor: null });
};

/**
 * Sets attributes on every cell in the selection (or the cell holding the cursor).
 * `updateAttributes` aborts the chain when the selection only contains headers
 * (or only body cells), so we patch the nodes directly instead.
 */
export const setCellAttrs = (editor: Editor, attrs: Record<string, unknown>) => {
  const { state, view } = editor;
  const selection = state.selection as any;
  const tr = state.tr;

  const apply = (pos: number, node: any) => {
    if (node.type.name !== 'tableCell' && node.type.name !== 'tableHeader') return;
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
  };

  if (typeof selection.forEachCell === 'function') {
    selection.forEachCell((node: any, pos: number) => apply(pos, node));
  } else {
    const cellDepth = findDepth(editor, ['tableCell', 'tableHeader']);
    if (cellDepth > 0) apply(state.selection.$from.before(cellDepth), state.selection.$from.node(cellDepth));
  }

  if (tr.steps.length) {
    view.dispatch(tr);
    view.focus();
  }
};
