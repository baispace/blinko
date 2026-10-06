import { ScrollArea } from "@/components/Common/ScrollArea";
import { RootStore } from "@/store";
import { BlinkoStore } from "@/store/blinkoStore";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useLocation, useSearchParams } from 'react-router-dom';
import { BlinkoCard } from "@/components/BlinkoCard";
import { LoadingAndEmpty } from "@/components/Common/LoadingAndEmpty";
import { PageWidthButton } from "@/components/Common/PageWidthButton";
import { PageWidthStore, PAGE_WIDTH_PAD_CLASS } from "@/store/pageWidthStore";
import { TableOfContents } from "@/components/Common/TableOfContents";
import { Icon } from "@/components/Common/Iconify/icons";
import { useTranslation } from "react-i18next";

const Detail = observer(() => {
  const location = useLocation();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const blinko = RootStore.Get(BlinkoStore);
  const pageWidth = RootStore.Get(PageWidthStore);
  const [isTocOpen, setIsTocOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get('id')) {
      blinko.noteDetail.call({ id: Number(searchParams.get('id')) });
    }
  }, [location.pathname, searchParams.get('id'), blinko.updateTicker, blinko.forceQuery]);

  // Close the outline flyout whenever we navigate to another note.
  useEffect(() => {
    setIsTocOpen(false);
  }, [searchParams.get('id')]);

  /**
   * 直访 detail?id=X 时把 fullscreenEditorNoteId 设上，让 BlinkoCard 内的
   * FullscreenEditor 接手开起来 —— 否则 detail 页只渲染不可编辑的卡片预览，
   * 看着像"中间页"（用户从 list 点普通 NOTE 卡片也是同一路径：handleClick 设
   * 同样的 store 信号）。
   *
   * detail 页 unmount 时清回 null，避免影响后续从 list 点其他笔记的判断。
   */
  const noteId = searchParams.get('id');
  useEffect(() => {
    if (noteId) {
      const id = Number(noteId);
      if (Number.isFinite(id)) {
        blinko.fullscreenEditorNoteId = id;
      }
    }
    return () => {
      if (blinko.fullscreenEditorNoteId === Number(noteId)) {
        blinko.fullscreenEditorNoteId = null;
      }
    };
  }, [noteId]);

  const note = blinko.noteDetail.value;
  /**
   * 全屏编辑器是 z-[9999] 的 portal，打开时整块盖住这个页面。这里本来还渲染了
   * 浮动大纲按钮（z-20）和页宽按钮，全被压在下面点不到 —— 大纲入口由
   * FullscreenEditor 顶栏自己提供，所以打开时直接不渲染，避免死 UI。
   */
  const isFullscreenOpen = !!note && blinko.fullscreenEditorNoteId === note.id;

  return (
    <ScrollArea fixMobileTopBar>
      <div className={`mx-auto py-4 relative ${PAGE_WIDTH_PAD_CLASS[pageWidth.mode]}`} style={{ maxWidth: pageWidth.maxWidth }}>
        {note && !isFullscreenOpen && (
          <div className="flex justify-end mb-1">
            <PageWidthButton />
          </div>
        )}
        <LoadingAndEmpty
          isLoading={blinko.noteDetail.loading.value}
          isEmpty={!note}
        />

        {note && (
          <div className="flex gap-4">
            <div className="flex-1 min-w-0">
              <BlinkoCard
                blinkoItem={note}
                defaultExpanded={false}
                glassEffect={false}
                isDetailPage
              />
            </div>
          </div>
        )}

        {/* Outline trigger sits at the top-left of the body and opens a
            flyout on demand — the note keeps the full page width instead of
            permanently losing 192px to a right-hand rail. */}
        {note?.content && !isFullscreenOpen && (
          <button
            onClick={() => setIsTocOpen((v) => !v)}
            className={`absolute top-3 -left-1 z-20 flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
              isTocOpen ? 'bg-primary/10 text-primary' : 'text-desc hover:bg-default-100 hover:text-default-600'
            }`}
            title={t('table-of-contents')}
            aria-label={t('table-of-contents')}
          >
            <Icon icon="mdi:format-list-bulleted" width={16} height={16} />
          </button>
        )}

        {note?.content && isTocOpen && !isFullscreenOpen && (
          <TableOfContents
            content={note.content}
            floating
            onClose={() => setIsTocOpen(false)}
            className="top-10 left-0"
          />
        )}
      </div>
    </ScrollArea>
  );
});

export default Detail;