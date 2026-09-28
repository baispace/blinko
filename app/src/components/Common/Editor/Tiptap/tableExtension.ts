import { Extension } from '@tiptap/core';
import { Table as BaseTable } from '@tiptap/extension-table';
import TableCellBase from '@tiptap/extension-table-cell';
import TableHeaderBase from '@tiptap/extension-table-header';
import { Plugin } from '@tiptap/pm/state';
import { DOMSerializer, Fragment } from '@tiptap/pm/model';

/**
 * Table support with a markdown-first storage format.
 *
 * A plain table serializes to GFM pipe syntax, which keeps the note readable
 * and diff-friendly. As soon as the table carries something markdown cannot
 * express -- merged cells, a manually dragged column width, cell alignment or
 * a background colour -- the whole table flips to HTML so those details
 * survive the round trip.
 *
 * The flip is driven by the `preserveHtml` attribute, which `TablePreserveHtml`
 * sets automatically whenever a styled cell is detected.
 */

type StyledCellAttrs = {
  textAlign?: string | null
  backgroundColor?: string | null
}

/** Everything markdown pipe syntax cannot express. */
const hasAdvancedFormatting = (tableNode: any): boolean => {
  let advanced = false;
  tableNode.descendants((child: any) => {
    if (advanced) return false;
    const name = child.type?.name;
    if (name !== 'tableCell' && name !== 'tableHeader') return true;
    const { colspan, rowspan, colwidth, textAlign, backgroundColor } = child.attrs ?? {};
    if (colspan > 1 || rowspan > 1) advanced = true;
    if (colwidth && colwidth.length) advanced = true;
    if (textAlign || backgroundColor) advanced = true;
    return false;
  });
  return advanced;
};

const writeHtmlTable = (editor: any, state: any, node: any) => {
  try {
    const serializer = DOMSerializer.fromSchema(editor.schema);
    const dom = serializer.serializeFragment(Fragment.from(node));
    const wrap = document.createElement('div');
    wrap.appendChild(dom);
    state.ensureNewLine();
    state.write(wrap.innerHTML);
    state.ensureNewLine();
    state.closeBlock(node);
  } catch {
    // Fall back to the plain pipe syntax rather than dropping the table.
    writeMarkdownTable(state, node);
  }
};

/** Mirrors tiptap-markdown's pipe-table output so plain tables stay identical. */
const writeMarkdownTable = (state: any, node: any) => {
  state.inTable = true;
  node.forEach((row: any, _p: unknown, i: number) => {
    state.write('| ');
    row.forEach((col: any, _p2: unknown, j: number) => {
      if (j) state.write(' | ');
      const cellContent = col.firstChild;
      if (cellContent?.textContent?.trim()) state.renderInline(cellContent);
    });
    state.write(' |');
    state.ensureNewLine();
    if (!i) {
      const delimiterRow = Array.from({ length: row.childCount })
        .map(() => '---')
        .join(' | ');
      state.write(`| ${delimiterRow} |`);
      state.ensureNewLine();
    }
  });
  state.closeBlock(node);
  state.inTable = false;
};

export const MarkdownTable = BaseTable.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      preserveHtml: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-preserve-html') === 'true',
        renderHTML: (attributes) =>
          attributes.preserveHtml ? { 'data-preserve-html': 'true' } : {},
      },
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(this: { editor: any }, state: any, node: any) {
          if (node.attrs?.preserveHtml || hasAdvancedFormatting(node)) {
            writeHtmlTable(this.editor, state, node);
            return;
          }
          writeMarkdownTable(state, node);
        },
      },
    };
  },
});

const cellStyleAttributes = {
  textAlign: {
    default: null as string | null,
    parseHTML: (element: HTMLElement) =>
      element.getAttribute('data-align') || element.style?.textAlign || null,
    renderHTML: (attributes: StyledCellAttrs) =>
      attributes.textAlign ? { 'data-align': attributes.textAlign } : {},
  },
  backgroundColor: {
    default: null as string | null,
    parseHTML: (element: HTMLElement) =>
      element.getAttribute('data-bg') || element.style?.backgroundColor || null,
    renderHTML: (attributes: StyledCellAttrs) =>
      attributes.backgroundColor ? { 'data-bg': attributes.backgroundColor } : {},
  },
};

/**
 * Alignment and background are emitted from `renderHTML` (not per-attribute)
 * so both end up in a single inline style instead of overwriting each other.
 */
const withCellStyle = (base: any, tag: 'td' | 'th') =>
  base.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        ...cellStyleAttributes,
      };
    },
    renderHTML({ node, HTMLAttributes }: { node: any; HTMLAttributes: Record<string, any> }) {
      const style: string[] = [];
      if (node.attrs?.textAlign) style.push(`text-align:${node.attrs.textAlign}`);
      if (node.attrs?.backgroundColor) style.push(`background-color:${node.attrs.backgroundColor}`);
      return [
        tag,
        mergeAttributesSafely(HTMLAttributes, style.length ? { style: style.join(';') } : {}),
        0,
      ];
    },
  });

/** Thin wrapper: avoids importing mergeAttributes for a single call site. */
const mergeAttributesSafely = (base: Record<string, any>, extra: Record<string, any>) => {
  const merged: Record<string, any> = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    if (!value) continue;
    if (key === 'style' && merged.style) {
      merged.style = `${merged.style};${value}`;
    } else {
      merged[key] = value;
    }
  }
  return merged;
};

export const MarkdownTableCell = withCellStyle(TableCellBase, 'td');
export const MarkdownTableHeader = withCellStyle(TableHeaderBase, 'th');

/**
 * Flags a table for HTML persistence the moment it stops being expressible in
 * markdown: a dragged column, a merged cell, an alignment or a colour.
 */
export const TablePreserveHtml = Extension.create({
  name: 'tablePreserveHtml',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;

          const { doc, tr } = newState;
          let changed = false;

          doc.descendants((node, pos) => {
            if (node.type.name !== 'table') return true;
            if (node.attrs.preserveHtml) return false;
            if (hasAdvancedFormatting(node)) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, preserveHtml: true });
              changed = true;
            }
            return false;
          });

          return changed ? tr : null;
        },
      }),
    ];
  },
});
