import { BubbleMenu, EditorContent } from '@tiptap/react';
import type { ComponentProps } from 'react';
/**
 * Tiptap moves BubbleMenu's DOM into tippy, and EditorContent adds NodeView
 * portals after mounting. Give each a stable React-owned parent so a portal
 * insertion never uses the detached menu element as its next DOM sibling.
 */
export const EditorDocumentSurface = (props:ComponentProps<typeof EditorContent>) => <div className="tiptap-document-surface"><EditorContent {...props} /></div>;
export const EditorBubbleSurface = (props:ComponentProps<typeof BubbleMenu>) => <div className="tiptap-bubble-surface"><BubbleMenu {...props} /></div>;
