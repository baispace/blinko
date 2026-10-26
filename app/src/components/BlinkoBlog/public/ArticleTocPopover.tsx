import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/Common/Iconify/icons";
import { headingNumbers, type ArticleHeading } from "./articleHeadings";

/**
 * 「本文目录」浮层。
 *
 * 不做成永久第三栏 —— 文档模式的版面已经有一列专题目录了，
 * 再固定一列会把正文挤窄。浮层按需出现，看完就消失。
 */
export function ArticleTocPopover({
  headings,
  active,
  onJump,
}: {
  headings: ArticleHeading[];
  /** 当前阅读位置对应的小节 id。 */
  active: string;
  onJump: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null,
  );

  const items = headingNumbers(headings);

  const close = useCallback(() => {
    setOpen(false);
    // 焦点回到触发按钮，键盘用户不会「掉」在页面中间。
    buttonRef.current?.focus();
  }, []);

  // 浮层贴着按钮放，但不许超出视口 —— 右上角的按钮在窄屏上很容易顶出去。
  useLayoutEffect(() => {
    if (!open) return;
    const button = buttonRef.current;
    const panel = panelRef.current;
    if (!button || !panel) return;
    const rect = button.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const margin = 12;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let left = rect.right - panelRect.width;
    left = Math.max(margin, Math.min(left, viewportWidth - panelRect.width - margin));
    let top = rect.bottom + 8;
    if (top + panelRect.height > viewportHeight - margin)
      top = Math.max(margin, rect.top - panelRect.height - 8);
    setPosition({ top, left });
  }, [open, items.length]);

  // 点外部关闭。
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Esc 关闭。
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  // 打开时把焦点移进浮层，键盘用户能直接 Tab 到条目。
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
  }, [open]);

  // 标题会在正文渲染后才出现；所有 Hooks 必须先执行，避免异步加载时白屏。
  if (!headings.length) return null;

  return (
    <div className="ink-doc-toc-anchor">
      <button
        type="button"
        ref={buttonRef}
        className="ink-doc-toc-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon icon="tabler:list-details" width={17} />
        本文目录
        <Icon icon="tabler:chevron-down" width={14} />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="ink-doc-toc"
          role="dialog"
          aria-label="本文目录"
          tabIndex={-1}
          style={{
            top: position?.top ?? 0,
            left: position?.left ?? 0,
            visibility: position ? "visible" : "hidden",
          }}
        >
          <div className="ink-doc-toc-head">
            <strong>本文目录</strong>
            <span>{headings.length} 个小节</span>
          </div>
          <nav className="ink-doc-toc-nav">
            {items.map((item) => (
              <a
                key={item.id}
                href={"#" + item.id}
                className="ink-doc-toc-link"
                data-active={active === item.id || undefined}
                aria-current={active === item.id ? "true" : undefined}
                style={{ paddingLeft: 12 + item.depth * 14 }}
                onClick={(event) => {
                  event.preventDefault();
                  onJump(item.id);
                  close();
                }}
              >
                {item.depth === 0 && (
                  <span className="ink-doc-toc-num">{item.number}</span>
                )}
                <span className="ink-doc-toc-text">{item.text}</span>
              </a>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
