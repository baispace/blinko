import { ScrollArea } from "@/components/Common/ScrollArea";
import { RootStore } from "@/store";
import { BlinkoStore } from "@/store/blinkoStore";
import { observer } from "mobx-react-lite";
import { useEffect, useLayoutEffect } from "react";
import { useLocation, useSearchParams } from 'react-router-dom';
import { LoadingAndEmpty } from "@/components/Common/LoadingAndEmpty";
import { FullscreenEditor } from "@/components/BlinkoCard/FullscreenEditor";

const Detail = observer(() => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const blinko = RootStore.Get(BlinkoStore);
  const requestedId = Number(searchParams.get('id'));
  const hasValidId = Number.isFinite(requestedId) && requestedId > 0;
  const note = blinko.noteDetail.value;
  // 只认 URL 里那条笔记：noteDetail 可能还是上一条的缓存，
  // 拿去渲染会先闪一张错的卡片/编辑器。
  const readyNote = hasValidId && note?.id === requestedId ? note : null;

  useEffect(() => {
    if (hasValidId) {
      blinko.noteDetail.call({ id: requestedId });
    }
  }, [location.pathname, requestedId, hasValidId, blinko.updateTicker, blinko.forceQuery]);

  /**
   * 打开信号在绘制前写好，供拖拽禁用等逻辑使用。
   * 全屏编辑器是否打开不再依赖这个信号：/detail?id=X 加载到对应笔记后
   * 直接挂 FullscreenEditor，避免 effect 时序导致偶发落到卡片预览「中间页」。
   */
  useLayoutEffect(() => {
    if (!hasValidId) return;
    if (blinko.fullscreenEditorNoteId !== requestedId) {
      blinko.fullscreenEditorNoteId = requestedId;
    }
    return () => {
      if (blinko.fullscreenEditorNoteId === requestedId) {
        blinko.fullscreenEditorNoteId = null;
      }
    };
  }, [requestedId, hasValidId]);

  if (!readyNote) {
    return (
      <ScrollArea fixMobileTopBar>
        <div className="mx-auto py-4">
          <LoadingAndEmpty
            isLoading={hasValidId}
            isEmpty={!hasValidId}
          />
        </div>
      </ScrollArea>
    );
  }

  return (
    <FullscreenEditor
      blinkoItem={readyNote}
      isOpen
      onClose={() => {
        if (blinko.fullscreenEditorNoteId === requestedId) {
          blinko.fullscreenEditorNoteId = null;
        }
      }}
      isDetailPage
    />
  );
});

export default Detail;
