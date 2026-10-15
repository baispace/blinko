import { Mark, mergeAttributes } from '@tiptap/core';

// Inline HTML survives the existing Markdown save/load pipeline.
export const InlineColor = Mark.create({
  name: 'inlineColor',
  addAttributes() {
    return Object.fromEntries(['color', 'backgroundColor'].map(name => [name, {
      default: null,
      parseHTML: (element: HTMLElement) => element.style[name as 'color' | 'backgroundColor'] || null,
      renderHTML: () => ({}),
    }]));
  },
  parseHTML() {
    return [{ tag: 'span', getAttrs: (element: HTMLElement) =>
      element.style.color || element.style.backgroundColor ? {} : false }];
  },
  renderHTML({ HTMLAttributes, mark }) {
    const style = [mark.attrs.color && `color: ${mark.attrs.color}`, mark.attrs.backgroundColor && `background-color: ${mark.attrs.backgroundColor}`].filter(Boolean).join('; ');
    return ['span', mergeAttributes(HTMLAttributes, { style }), 0];
  },
});
