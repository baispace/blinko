import { Node, mergeAttributes, getHTMLFromFragment, Extension } from '@tiptap/core';
import { Fragment } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';

export type CalloutType = 'info' | 'warning' | 'success' | 'danger';

export interface CalloutOptions {
  HTMLAttributes: Record<string, any>;
}

/** Default emoji per type, used when no explicit icon is set. */
export const CALLOUT_DEFAULT_ICONS: Record<CalloutType, string> = {
  info: '💡',
  warning: '⚠️',
  success: '✅',
  danger: '🚨',
};

/**
 * Notion-style callout / highlight block.
 *
 * A tinted box with an accent left border. The first paragraph typed by the
 * user acts as the title; `type` controls the accent color + emoji badge.
 *
 * Serialized to markdown as an HTML block so it round-trips losslessly through
 * the tiptap-markdown storage layer (markdown-it runs with `html: true`, and
 * tiptap's parseDOM restores the node via `div[data-type="callout"]`).
 */
export const Callout = Node.create<CalloutOptions>({
  name: 'callout',

  group: 'block',

  content: 'block+',

  defining: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      type: {
        default: 'info',
        parseHTML: (element) => element.getAttribute('data-callout-type') || 'info',
        renderHTML: (attributes) => ({ 'data-callout-type': attributes.type }),
      },
      icon: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-callout-icon'),
        // Fall back to the per-type default when no explicit icon is chosen.
        renderHTML: (attributes) => {
          const icon = attributes.icon || CALLOUT_DEFAULT_ICONS[attributes.type as CalloutType] || '💡';
          return { 'data-callout-icon': icon };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="callout"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 'data-type': 'callout' }),
      0,
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          // Serialize the whole callout (including block children) as HTML so
          // inner markdown syntax isn't left bare. Mirrors tiptap-markdown's
          // HTMLNode strategy.
          const schema = node.type.schema;
          const html = getHTMLFromFragment(Fragment.from(node), schema);
          state.write(html);
          if (node.isBlock) {
            state.closeBlock(node);
          }
        },
        parse: {
          // markdown-it keeps `<div data-type="callout">` as an HTML block.
        },
      },
    };
  },

  addCommands() {
    return {
      toggleCallout:
        (attributes: { type?: CalloutType; icon?: string } = {}) =>
        ({ editor, chain }) => {
          // Already inside a callout → lift it back to plain blocks.
          if (editor.isActive('callout')) {
            return chain().focus().lift('callout').run();
          }
          // Otherwise wrap the current block(s) into a callout.
          return chain().focus().wrapIn('callout', attributes).run();
        },
      setCalloutIcon:
        (icon: string) =>
        ({ chain }) => {
          return chain().focus().updateAttributes('callout', { icon }).run();
        },
      setCalloutType:
        (type: CalloutType) =>
        ({ chain }) => {
          return chain().focus().updateAttributes('callout', { type }).run();
        },
    } as any;
  },

  addKeyboardShortcuts() {
    return {
      // Enter on the last empty block inside a callout → lift that empty block
      // out of the callout (Notion behaviour): the cursor ends up below with no
      // stray empty paragraph left inside.
      Enter: ({ editor }) => {
        const { selection } = editor.state;
        const callout = selection.$from.node(-1);
        if (!callout || callout.type.name !== this.name) return false;

        const isLastChild = selection.$from.index(-1) === callout.childCount - 1;
        const currentBlock = selection.$from.parent;
        const blockEmpty = currentBlock.textContent.trim() === '';
        if (!isLastChild || !blockEmpty) return false;

        return editor.chain().focus().lift(this.name).run();
      },
      // Backspace at the very start of the first block in a callout → lift the
      // whole callout back to plain blocks.
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        const callout = selection.$from.node(-1);
        if (!callout || callout.type.name !== this.name) return false;
        const isFirstChild = selection.$from.index(-1) === 0;
        const atStart = selection.$from.parentOffset === 0;
        if (!isFirstChild || !atStart) return false;
        return editor.chain().focus().lift('callout').run();
      },
    };
  },
});

/**
 * Click interactions on callout blocks:
 * 1. Clicking the whitespace below a callout that is the LAST block of the doc
 *    appends a fresh paragraph (otherwise the caret snaps back inside the
 *    callout and it's impossible to place it outside).
 * 2. Clicking the emoji badge area (left gutter) emits a DOM event the React
 *    layer listens to, to open the color/icon picker on that callout.
 */
export const CalloutClickOutside = Extension.create({
  name: 'calloutClickOutside',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('calloutClickOutside'),
        props: {
          handleDOMEvents: {
            mousedown: (view, event) => {
              const target = event.target as HTMLElement;
              const calloutEl = target.closest?.('div[data-type="callout"]') as HTMLElement | null;
              if (!calloutEl || !view.dom.contains(calloutEl)) return false;
              // The icon badge sits in the left gutter (padding-left: 44px zone).
              const rect = calloutEl.getBoundingClientRect();
              const inIconZone =
                event.clientX >= rect.left + 4 &&
                event.clientX <= rect.left + 38 &&
                event.clientY >= rect.top + 2 &&
                event.clientY <= rect.top + 34;
              if (!inIconZone) return false;
              const custom = new CustomEvent('callout-icon-click', {
                bubbles: true,
                detail: { x: event.clientX, y: event.clientY },
              });
              calloutEl.dispatchEvent(custom);
              // Prevent the editor from moving the caret into the block.
              event.preventDefault();
              return true;
            },
          },
          handleClick(view, pos, event) {
            const { state, dispatch } = view;
            const doc = state.doc;
            const lastChild = doc.lastChild;
            if (!lastChild || lastChild.type.name !== 'callout') return false;

            // Locate the callout's DOM element and check the click happened
            // below it (i.e. on the editor's trailing whitespace).
            const calloutStart = doc.content.size - lastChild.nodeSize;
            const domAt = view.domAtPos(calloutStart + 1);
            let el = domAt.node as HTMLElement | null;
            if (el && el.nodeType !== 1) el = el.parentElement;
            if (!el) return false;
            const rect = el.getBoundingClientRect();
            if (event.clientY <= rect.bottom) return false;

            const paragraphType = state.schema.nodes.paragraph;
            if (!paragraphType) return false;
            const tr = state.tr.insert(doc.content.size, paragraphType.create());
            tr.setSelection(TextSelection.near(tr.doc.resolve(tr.doc.content.size), -1));
            dispatch(tr);
            return true;
          },
        },
      }),
    ];
  },
});
