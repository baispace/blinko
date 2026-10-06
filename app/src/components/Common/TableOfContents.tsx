import { useEffect, useState, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Common/Iconify/icons';

export interface TocItem {
  level: number;
  text: string;
  element: HTMLElement | null;
}

/**
 * Generate slug ID from heading text (same as MarkdownRender).
 */
const generateSlugId = (text: string): string => {
  return text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '');
};

/**
 * Extract headings from DOM after markdown is rendered.
 */
export const extractHeadingsFromDom = (containerSelector: string): TocItem[] => {
  const container = document.querySelector(containerSelector);
  if (!container) return [];

  const headings: TocItem[] = [];
  const elements = container.querySelectorAll('h1, h2, h3, h4, h5, h6');

  elements.forEach((el) => {
    const htmlEl = el as HTMLElement;
    const level = parseInt(htmlEl.tagName.slice(1), 10);
    const text = htmlEl.textContent?.trim() || '';

    // Generate ID using the same method as MarkdownRender
    const slugId = generateSlugId(text);

    headings.push({
      level,
      text: text.slice(0, 50) + (text.length > 50 ? '...' : ''),
      element: htmlEl,
    });
  });

  return headings;
};

/**
 * The detail page scrolls inside a ScrollArea container, not on window, so a
 * window scroll listener never fires. Walk up from the rendered markdown to the
 * nearest scrollable ancestor instead.
 */
const findScrollParent = (el: HTMLElement | null): HTMLElement | Window => {
  let node = el;
  while (node && node !== document.body) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return node;
    }
    node = node.parentElement;
  }
  return window;
};

/**
 * Table of Contents panel.
 * Extracts headings from rendered DOM.
 *
 * Rendered as an on-demand flyout anchored beside the note title (Feishu
 * style) rather than a permanent right-hand rail, so the body keeps the full
 * page width. When `floating` is false it falls back to the old inline layout.
 */
export const TableOfContents = observer(({
  content,
  className = '',
  floating = false,
  onClose,
}: {
  content: string;
  className?: string;
  floating?: boolean;
  onClose?: () => void;
}) => {
  const { t } = useTranslation();
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Extract headings after content is rendered
  useEffect(() => {
    const extractHeadings = () => {
      // Wait for DOM to update
      setTimeout(() => {
        const extracted = extractHeadingsFromDom('.markdown-body');
        setHeadings(extracted);
        if (extracted.length > 0) {
          setActiveIndex(0);
        }
      }, 100);
    };

    extractHeadings();

    // Also set up scroll spy on whichever element actually scrolls.
    const handleScroll = () => {
      if (headings.length === 0) return;

      // Find the current visible heading
      for (let i = headings.length - 1; i >= 0; i--) {
        const el = headings[i].element;
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 100) {
            setActiveIndex(i);
            break;
          }
        }
      }
    };

    const scrollParent = findScrollParent(document.querySelector('.markdown-body'));
    scrollParent.addEventListener('scroll', handleScroll);
    return () => scrollParent.removeEventListener('scroll', handleScroll);
  }, [content, headings]);

  const scrollToHeading = (index: number) => {
    const heading = headings[index];
    if (heading?.element) {
      // Use the element's ID to scroll
      const id = heading.element.id;
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveIndex(index);
      }
    }
  };

  if (headings.length === 0) {
    return null;
  }

  const panel = (
    <div
      className={floating
        ? `absolute z-30 w-64 max-h-[70vh] overflow-hidden rounded-xl border border-default-200 bg-popover shadow-lg p-2 ${className}`
        : `toc-sidebar sticky top-20 ${className}`}
    >
      <div className="text-xs font-medium text-default-500 mb-2 px-1 flex items-center gap-1">
        <Icon icon="mdi:format-list-bulleted" width={14} height={14} />
        <span>{t('table-of-contents')}</span>
        {floating && onClose && (
          <button onClick={onClose} className="ml-auto text-default-400 hover:text-default-600" aria-label="close">
            <Icon icon="mingcute:close-circle-fill" width={14} height={14} />
          </button>
        )}
      </div>
      <nav className="space-y-0.5 max-h-[60vh] overflow-y-auto">
        {headings.map((heading, index) => (
          <button
            key={index}
            onClick={() => {
              scrollToHeading(index);
              if (floating) onClose?.();
            }}
            className={`w-full text-left text-sm px-2 py-1 rounded truncate transition-colors ${
              activeIndex === index
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-default-600 hover:bg-default-100'
            }`}
            style={{ paddingLeft: `${(heading.level - 1) * 12 + 8}px` }}
            title={heading.text}
          >
            {heading.text}
          </button>
        ))}
      </nav>
    </div>
  );

  // In floating mode the component owns its dismiss layer too, so a note with
  // no headings renders nothing at all instead of an invisible click blocker.
  if (!floating) return panel;

  return (
    <>
      <div className="fixed inset-0 z-20" onClick={() => onClose?.()} />
      {panel}
    </>
  );
});

/**
 * Inject IDs into heading elements for anchor navigation.
 * This should be called after markdown is rendered.
 */
export const injectHeadingIds = () => {
  const headings = document.querySelectorAll('.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6');
  headings.forEach((heading, index) => {
    if (!heading.id) {
      heading.id = `heading-${index}`;
    }
  });
};
