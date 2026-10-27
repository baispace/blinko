import { useEffect, useState } from "react";
import { Icon } from "@/components/Common/Iconify/icons";
import { TopicDocSidebar, type DocDirectory } from "./TopicDocSidebar";

/**
 * 移动端的「专题目录」抽屉。
 *
 * 窄屏上双栏放不下，左栏收进抽屉：正文是主角，目录随时能叫出来。
 * 抽屉里的当前文章高亮、所属章节展开 —— 和桌面左栏是同一套组件，
 * 两边的状态不会打架。
 */
export function TopicDocDrawer({
  directory,
  currentPublishId,
}: {
  directory: DocDirectory;
  currentPublishId?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="ink-doc-drawer-button"
        onClick={() => setOpen(true)}
        aria-label="打开专题目录"
      >
        <Icon icon="tabler:list" width={16} />
        专题目录
      </button>

      {open && (
        <>
          <div
            className="ink-doc-drawer-backdrop"
            onClick={() => setOpen(false)}
          />
          <div className="ink-doc-drawer" role="dialog" aria-label="专题目录">
            <div className="ink-doc-drawer-head">
              <strong>专题目录</strong>
              <button
                type="button"
                className="ink-doc-drawer-close"
                onClick={() => setOpen(false)}
                aria-label="关闭专题目录"
              >
                <Icon icon="tabler:x" width={16} />
              </button>
            </div>
            <div className="ink-doc-drawer-body">
              <TopicDocSidebar
                directory={directory}
                currentPublishId={currentPublishId}
                onNavigate={() => setOpen(false)}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
