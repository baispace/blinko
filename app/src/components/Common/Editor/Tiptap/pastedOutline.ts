import { DOMParser, Fragment, Slice, type Node as PMNode, type ResolvedPos } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/core';

/** Clipboard-only Markdown parsing: never reformat existing documents. */
export function parseOutlineClipboard(editor: Editor | null, text: string, context: ResolvedPos, plainText: boolean): Slice | null {
  if (plainText || context.parent.type.spec.code) return null;
  const parser = editor?.storage.markdown?.parser;
  if (!parser || !editor) return null;
  const element = document.createElement('div');
  element.innerHTML = parser.parse(text, { inline: true });
  return pastedOutline(DOMParser.fromSchema(editor.schema).parseSlice(element, { preserveWhitespace: true, context }), true);
}

/** Convert only clipboard unordered lists, preserving marks, media and slices.
 * Ordered/task lists keep their own item types, including when mixed into an outline.
 */
export function pastedOutline(slice: Slice, automatic = false): Slice {
  const schema = slice.content.firstChild?.type.schema;
  if (!schema?.nodes.outlineList || !schema.nodes.outlineItem) return slice;
  const visit = (node: PMNode, outlineItem = false, inOutline = false): PMNode => {
    if (node.isLeaf || node.type.spec.code) return node;
    const unordered = node.type.name === 'bulletList' && (!automatic || inOutline || (() => {
      let nested = false;
      node.descendants(child => { if (child.type.name === 'bulletList') nested = true; });
      return nested;
    })());
    const children: PMNode[] = [];
    let changed = false;
    node.forEach(child => {
      const next = visit(child, unordered && child.type.name === 'listItem', inOutline || unordered || node.type.name === 'outlineList');
      children.push(next);
      changed ||= next !== child;
    });
    if (unordered) return schema.nodes.outlineList.create(null, children, node.marks);
    if (outlineItem) return schema.nodes.outlineItem.create({ collapsed: false }, children, node.marks);
    return changed ? node.copy(Fragment.fromArray(children)) : node;
  };
  const children: PMNode[] = [];
  let changed = false;
  slice.content.forEach(node => {
    const next = visit(node);
    children.push(next);
    changed ||= next !== node;
  });
  return changed ? new Slice(Fragment.fromArray(children), slice.openStart, slice.openEnd) : slice;
}
