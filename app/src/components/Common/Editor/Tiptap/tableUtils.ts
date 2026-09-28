import type { Editor } from '@tiptap/core';
import { CellSelection } from '@tiptap/pm/tables';
import { TextSelection } from '@tiptap/pm/state';

/** DOM table element the current selection lives in, if any. */
export const findTableDom = (editor: Editor): HTMLElement | null => {
  try {
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
export const moveRow = (editor: Editor, direction: -1 | 1) => {
  const { state, view } = editor;
  const rowDepth = findSingleDepth(editor, 'tableRow');
  if (rowDepth < 0) return;
  const tableDepth = rowDepth - 1;
  const tableNode = state.selection.$from.node(tableDepth);
  const rowIndex = state.selection.$from.index(rowDepth);
  const target = rowIndex + direction;
  if (target < 0 || target >= tableNode.childCount) return;

  const rowPos = state.selection.$from.before(rowDepth);
  const rowNode = state.selection.$from.node(rowDepth);
  const sibling = tableNode.child(target);
  const insertAt = direction > 0 ? rowPos + sibling.nodeSize : rowPos - sibling.nodeSize;

  const tr = state.tr;
  tr.delete(rowPos, rowPos + rowNode.nodeSize);
  const mapped = tr.mapping.map(insertAt);
  tr.insert(mapped, state.schema.nodeFromJSON(rowNode.toJSON()));
  tr.setSelection(TextSelection.near(tr.doc.resolve(mapped + 2)));
  view.dispatch(tr.scrollIntoView());
};

/** Moves the column the cursor sits in by one slot (same technique, per row). */
export const moveColumn = (editor: Editor, direction: -1 | 1) => {
  const { state, view } = editor;
  const table = currentCellGeometry(editor);
  if (!table) return;
  const { tableNode, colIndex } = table;
  const colCount = tableNode.child(0)?.childCount ?? 0;
  const target = colIndex + direction;
  if (target < 0 || target >= colCount) return;

  const tr = state.tr;
  let rowPos = table.tablePos + 1;

  tableNode.forEach((row: any) => {
    const cells: any[] = [];
    row.forEach((cell: any) => cells.push(cell));
    const cell = cells[colIndex];
    if (cell) {
      const offset = cells.slice(0, colIndex).reduce((sum, c) => sum + c.nodeSize, 0);
      const cellPos = rowPos + 1 + offset;
      const sibling = cells[target];
      const insertAt = direction > 0 ? cellPos + sibling.nodeSize : cellPos - sibling.nodeSize;
      tr.delete(cellPos, cellPos + cell.nodeSize);
      tr.insert(tr.mapping.map(insertAt), state.schema.nodeFromJSON(cell.toJSON()));
    }
    rowPos += row.nodeSize;
  });

  view.dispatch(tr.scrollIntoView());
};
