import type { Editor } from '@tiptap/core';
import { CellSelection } from '@tiptap/pm/tables';
import { Node as PMNode } from '@tiptap/pm/model';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';

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

/** True when the cursor, a cell range or the table node itself is selected. */
export const isTableActive = (editor: Editor) => {
  const selection = editor.state.selection as any;
  if (selection instanceof NodeSelection) return selection.node?.type?.name === 'table';
  return editor.isActive('table');
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
    rowIndex: $from.index(rowDepth),
    colIndex: $from.index(cellDepth),
  };
};

/** Position inside the cell at (rowIndex, colIndex). */
const cellInnerPos = (table: CellGeometry, rowIndex: number, colIndex: number) => {
  let rowPos = table.tablePos + 1;
  for (let i = 0; i < rowIndex; i++) rowPos += table.tableNode.child(i).nodeSize;
  const row = table.tableNode.child(rowIndex);
  let cellPos = rowPos + 1;
  for (let j = 0; j < colIndex; j++) cellPos += row.child(j).nodeSize;
  return cellPos + 1;
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

/**
 * Moves the row the cursor sits in by one slot.
 * Tiptap has no built-in command: the row is re-created from its JSON at the
 * target offset and the original removed. Net length change is 0, so the
 * surrounding positions stay valid.
 */
/**
 * Moves the row the cursor sits in by one slot.
 * Tiptap has no built-in command, so we rebuild the table JSON with the two
 * adjacent rows swapped and replace the whole table node in one step. Building
 * from JSON (instead of `node.copy`) sidesteps a ProseMirror quirk where
 * `copy` dropped the content when given an array, yielding a node with no size.
 */
export const moveRow = (editor: Editor, direction: -1 | 1) => {
  const { state, view } = editor;
  const table = currentCellGeometry(editor);
  if (!table) return;
  const { tableNode, rowIndex } = table;
  const target = rowIndex + direction;
  if (target < 0 || target >= tableNode.childCount) return;

  const json: any = tableNode.toJSON();
  const rows = json.content;
  const moved = rows[rowIndex];
  rows[rowIndex] = rows[target];
  rows[target] = moved;

  const tr = state.tr;
  tr.replaceWith(table.tablePos, table.tablePos + tableNode.nodeSize, PMNode.fromJSON(state.schema, json));
  view.dispatch(tr.scrollIntoView());
};

/**
 * Moves the column the cursor sits in by one slot. The table JSON is rebuilt
 * with the two adjacent columns swapped per row, then the whole table node is
 * replaced in a single step. Merged cells make column geometry ambiguous, so
 * we bail out rather than corrupt the table.
 */
export const moveColumn = (editor: Editor, direction: -1 | 1) => {
  const { state, view } = editor;
  const table = currentCellGeometry(editor);
  if (!table) return;
  const { tableNode, colIndex } = table;
  const colCount = tableNode.child(0)?.childCount ?? 0;
  const target = colIndex + direction;
  if (target < 0 || target >= colCount) return;

  // Bail out on merged cells (column geometry is ambiguous).
  for (let i = 0; i < tableNode.childCount; i++) {
    if (tableNode.child(i).childCount !== colCount) return;
  }

  const json: any = tableNode.toJSON();
  for (const row of json.content) {
    const cells = row.content;
    if (!Array.isArray(cells) || cells.length !== colCount) continue;
    const moved = cells[colIndex];
    cells[colIndex] = cells[target];
    cells[target] = moved;
  }

  const tr = state.tr;
  tr.replaceWith(table.tablePos, table.tablePos + tableNode.nodeSize, PMNode.fromJSON(state.schema, json));
  view.dispatch(tr.scrollIntoView());
};

/** Whether the current selection spans more than one cell. */
export const isCellSelection = (editor: Editor) =>
  editor.state.selection instanceof CellSelection;

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

/** Select the whole table (node selection). */
export const selectTable = (editor: Editor) => {
  const table = currentCellGeometry(editor);
  if (!table) return;
  editor.view.dispatch(
    editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, table.tablePos))
  );
  editor.view.focus();
};

/** Insert a copy of the current row directly below it. */
export const duplicateRow = (editor: Editor) => {
  const { state, view } = editor;
  const rowDepth = findSingleDepth(editor, 'tableRow');
  if (rowDepth < 0) return;
  const rowPos = state.selection.$from.before(rowDepth);
  const rowNode = state.selection.$from.node(rowDepth);
  const insertAt = rowPos + rowNode.nodeSize;
  view.dispatch(
    state.tr
      .insert(insertAt, state.schema.nodeFromJSON(rowNode.toJSON()))
      .setSelection(TextSelection.near(state.tr.doc.resolve(insertAt + 2)))
      .scrollIntoView()
  );
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
