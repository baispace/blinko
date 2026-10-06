import { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Common/Iconify/icons';

export interface TocItem {
  level: number;
  text: string;
  element: HTMLElement | null;
}

/** 归一化标题文本，用于把 markdown 源文本和渲染后的 DOM 节点对上。 */
const normalize = (s: string) => (s ?? '').replace(/[#*`~_>\-\[\]()]/g, '').replace(/\s+/g, '');

/**
 * 从 markdown 源文本解析标题。
 *
 * 以前是从渲染后的 `.markdown-body` DOM 里抓 `h1..h6`，但全屏编辑器用的是
 * Tiptap（`#global-editor`），根本没有 `.markdown-body` —— 大纲要么抽不到
 * 标题直接不渲染，要么抓到的是被全屏遮罩盖住的那张卡片，点了滚的是一个
 * 看不见的元素，表现就是"点了没反应"。直接从源文本解析两种模式都能用。
 */
export const extractHeadingsFromMarkdown = (content: string): TocItem[] => {
  if (!content) return [];
  const items: TocItem[] = [];
  let inFence = false;

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    // 代码块里的 # 是注释/代码，不是标题
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!m) continue;
    const text = m[2].trim();
    if (!text) continue;

    items.push({ level: m[1].length, text, element: null });
  }
  return items;
};

/**
 * 把解析出来的标题和页面上真实渲染的 heading 节点按顺序对齐。
 * 只认当前可见的节点，避免匹配到被遮罩盖住 / 隐藏的那一份渲染。
 */
const resolveHeadingElements = (items: TocItem[]): TocItem[] => {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'))
    .filter((n) => n.offsetParent !== null || n.getClientRects().length > 0);

  let cursor = 0;
  return items.map((item) => {
    const wanted = normalize(item.text);
    for (let i = cursor; i < nodes.length; i++) {
      const nodeText = normalize(nodes[i].textContent ?? '');
      if (nodeText === wanted || nodeText.startsWith(wanted)) {
        cursor = i + 1;
        return { ...item, element: nodes[i] };
      }
    }
    return { ...item, element: null };
  });
};

/**
 * 页面滚动可能发生在 ScrollArea 容器里而不是 window 上，所以从标题节点往上
 * 找最近的可滚动祖先。
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
 *
 * Headings come from the markdown source and are matched against the rendered
 * DOM afterwards, so the outline works both in Tiptap edit mode and in the
 * read-only markdown view.
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

  const parsed = useMemo(() => extractHeadingsFromMarkdown(content), [content]);

  // DOM 渲染完成后再把标题和真实节点对上
  useEffect(() => {
    let disposed = false;
    const timer = setTimeout(() => {
      if (disposed) return;
      setHeadings(resolveHeadingElements(parsed));
    }, 100);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [parsed]);

  // 滚动高亮：监听真正滚动的那个容器
  useEffect(() => {
    if (headings.length === 0) return;

    const handleScroll = () => {
      for (let i = headings.length - 1; i >= 0; i--) {
        const el = headings[i].element;
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= 100) {
          setActiveIndex(i);
          return;
        }
      }
    };

    const scrollParent = findScrollParent(headings.find((h) => h.element)?.element ?? null);
    scrollParent.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => scrollParent.removeEventListener('scroll', handleScroll);
  }, [headings]);

  const scrollToHeading = (index: number) => {
    const el = headings[index]?.element;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveIndex(index);
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
            key={`${heading.level}-${heading.text}-${index}`}
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
