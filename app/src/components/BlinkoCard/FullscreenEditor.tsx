import { observer } from "mobx-react-lite";
import { when } from "mobx";
import { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from "react-dom";
import { Button, Tooltip } from "@heroui/react";
import { Icon } from "@/components/Common/Iconify/icons";
import { BlinkoEditor } from "@/components/BlinkoEditor";
import { BlinkoStore } from "@/store/blinkoStore";
import { RootStore } from "@/store";
import { eventBus } from "@/lib/event";
import { useMediaQuery } from "usehooks-ts";
import { _ } from "@/lib/lodash";
import { BlinkoItem } from "./index";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/core";
import { PageWidthStore, PAGE_WIDTH_PAD_CLASS } from "@/store/pageWidthStore";
import { CardActionMenu } from './cardActionMenu';
import { extractHeadingsFromMarkdown, TableOfContents } from '@/components/Common/TableOfContents';
import { ShareButton } from './cardHeader';
import { useLocation, useNavigate } from "react-router-dom";

interface FullscreenEditorProps {
  blinkoItem: BlinkoItem;
  isOpen: boolean;
  onClose: () => void;
  /** Detail-page context: hide 编辑/复制内容/多选/全部选择 等 list-only actions */
  isDetailPage?: boolean;
}

export const FullscreenEditor = observer(({ blinkoItem, isOpen, onClose, isDetailPage = false }: FullscreenEditorProps) => {
  const isPc = useMediaQuery('(min-width: 768px)');
  const blinko = RootStore.Get(BlinkoStore);
  const pageWidth = RootStore.Get(PageWidthStore);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [viewMode, setViewMode] = useState<string>('wysiwyg');
  /** 已存在的笔记（有 id、已落库）默认直接进编辑态；未落库的临时内容仍先给阅读态 */
  const isExistingNote = !!blinkoItem.id;
  const defaultEditorMode: 'preview' | 'edit' = isExistingNote ? 'edit' : 'preview';
  const [editorMode, setEditorMode] = useState<'preview' | 'edit'>(defaultEditorMode);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  /** 阅读/编辑共用同一棵 Tiptap 树，这里持有它的实例 */
  const tiptapRef = useRef<Editor | null>(null);
  /** 远端笔记内容就绪后才挂载编辑器，避免先闪一屏旧内容 */
  const [dataReady, setDataReady] = useState(false);
  /** 大纲浮层开关（PC 顶栏 ☰） */
  const [isTocOpen, setIsTocOpen] = useState(false);

  const handleEditorReady = (editor: Editor) => { tiptapRef.current = editor; };

  // Clean up fullscreen editor state when closing
  const handleClose = () => {
    // 用户从 list / 详情 / 其他页进来时，希望 ← 是「返回上一页」——
    // 老逻辑只关 FullscreenEditor，保留在 /detail 路由上，相当于卡在中间。
    // 现在：
    //   - 如果是 push 进来的（location.key !== 'default'，history 里还有上一页）
    //     就 back() 回 list / 上一个来源
    //   - 如果是直访 detail 页（location.key === 'default'，没有上一页），
    //     back() 会跳出站点，回 / 走 HomeRedirect 兜底
    const hasHistory = typeof window !== 'undefined' && window.history.length > 1;
    if (hasHistory && location.key !== 'default') {
      navigate(-1);
    } else {
      navigate('/');
    }
    blinko.fullscreenEditorNoteId = null;
    // 回到「打开即编辑」的默认态，而不是写死 preview，否则下一条笔记会继承上一条的阅读态
    setEditorMode(defaultEditorMode);
    setDataReady(false);
    onClose();
  };

  const handleHome = () => {
    navigate('/');
    blinko.fullscreenEditorNoteId = null;
    setEditorMode(defaultEditorMode);
    setDataReady(false);
    onClose();
  };

  // 这个组件常驻在 BlinkoCard 里（isOpen 只是开关），所以每次打开都要按默认态复位
  useEffect(() => {
    if (isOpen) {
      setEditorMode(defaultEditorMode);
    }
  }, [isOpen]);

  /**
   * 进入编辑态并把光标放到用户点的位置 —— 飞书式的「点哪儿就从哪儿写」。
   * 不重新挂载编辑器，只是把同一棵树 setEditable(true)。
   */
  const enterEdit = (x?: number, y?: number) => {
    const editor = tiptapRef.current;
    // 立刻置为可编辑，不等 React 状态回流，否则这一帧光标落不下去
    editor?.setEditable?.(true);
    setEditorMode('edit');
    requestAnimationFrame(() => {
      if (!editor) return;
      const pos = (x != null && y != null)
        ? editor.view?.posAtCoords?.({ left: x, top: y })
        : null;
      editor.commands.focus(pos ? pos.pos : 'end');
    });
  };

  // 阅读态点击正文 = 进入编辑；链接 / 图片 / 勾选框 / 附件保留各自的阅读交互
  const handleSurfaceClick = (e: React.MouseEvent) => {
    if (editorMode === 'edit') return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('a')) return;
    if (['IMG', 'VIDEO', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'SVG', 'PATH'].includes(target.tagName)) return;
    enterEdit(e.clientX, e.clientY);
  };

  // Switch to edit mode
  const handleSwitchToEdit = () => {
    enterEdit();
  };

  // Switch back to preview mode
  const handleSwitchToPreview = () => {
    // 同步 setEditable 会让 view reconfigure 跟 BubbleMenu tippy 同帧跑，
    // 触发 insertBefore / removeChild 崩溃 —— 推到 microtask 让 React commit
    // 先落地，浮层先消化 prop 变化，下个 microtask 再切 editor.isEditable。
    const ed = tiptapRef.current
    if (ed && ed.isEditable) {
      queueMicrotask(() => ed.setEditable?.(false))
    }
    setEditorMode('preview');
  };
  

  // Set default view mode to wysiwyg when opening editor in edit mode
  useEffect(() => {
    if (isOpen && editorMode === 'edit') {
      const originalMode = localStorage.getItem('blinko-editor-view-mode');
      localStorage.setItem('blinko-editor-view-mode', 'wysiwyg');
      setViewMode('wysiwyg');
      
      // Listen for view mode changes
      const handleViewModeChange = (mode: string) => {
        setViewMode(mode);
      };
      eventBus.on('editor:setViewMode', handleViewModeChange);
      
      return () => {
        if (originalMode) {
          localStorage.setItem('blinko-editor-view-mode', originalMode);
        } else {
          localStorage.removeItem('blinko-editor-view-mode');
        }
        eventBus.off('editor:setViewMode', handleViewModeChange);
      };
    }
  }, [isOpen, editorMode]);

  // Set curSelectedNote when opening editor
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setDataReady(false);
    const load = async () => {
      // Load fresh note data from server
      if (blinkoItem.id) {
        // `noteDetail` 是带 loadingLock 的 PromiseState：如果在它 loading 期间
        // 再 call 一次会被静默丢弃（返回 undefined），于是编辑器会拿上一条笔记
        // 的内容挂载 —— 表现就是从列表点进来先闪一篇别的笔记。
        // 先等当前请求落地，再判断数据是不是本条笔记的，是就直接复用。
        if (blinko.noteDetail.loading.value) {
          await when(() => !blinko.noteDetail.loading.value);
        }
        if (blinko.noteDetail.value?.id !== blinkoItem.id) {
          await blinko.noteDetail.call({ id: blinkoItem.id });
        }
        if (blinko.noteDetail.value) {
          blinko.curSelectedNote = _.cloneDeep(blinko.noteDetail.value);
        }
      } else {
        // Fallback to prop data if no id
        blinko.curSelectedNote = _.cloneDeep(blinkoItem);
        blinko.noteDetail.value = _.cloneDeep(blinkoItem);
      }
      if (!cancelled) setDataReady(true);
    };
    load();
    return () => { cancelled = true; };
  }, [isOpen, blinkoItem.id]);

  // Handle ESC key to close editor
  useEffect(() => {
    if (!isOpen) return;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Check if PhotoView (image preview) is open
        // PhotoView creates a portal with class 'PhotoView-Portal' when open
        const photoViewPortal = document.querySelector('.PhotoView-Portal');
        if (photoViewPortal) {
          // Check if PhotoView overlay is visible
          const photoViewOverlay = photoViewPortal.querySelector('[class*="PhotoView__"]') as HTMLElement;
          if (photoViewOverlay) {
            const style = window.getComputedStyle(photoViewOverlay);
            // If PhotoView is visible, let it handle ESC to close image preview
            if (style.display !== 'none' && style.opacity !== '0') {
              return; // Let PhotoView handle ESC
            }
          }
        }
        
        // In edit mode, ESC goes back to preview mode first
        if (editorMode === 'edit') {
          setEditorMode('preview');
          return;
        }
        // In preview mode, ESC closes the fullscreen view
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape, true); // Use capture phase to check before PhotoView
    // Hide mobile navigation bars
    const mobileHeader = document.querySelector('.blinko-mobile-header') as HTMLElement;
    const bottomBar = document.querySelector('.blinko-bottom-bar') as HTMLElement;
    if (mobileHeader) mobileHeader.style.display = 'none';
    if (bottomBar) bottomBar.style.display = 'none';

    return () => {
      document.removeEventListener('keydown', handleEscape, true);
      // Restore navigation bars
      if (mobileHeader) mobileHeader.style.display = '';
      if (bottomBar) bottomBar.style.display = '';
    };
  }, [isOpen, onClose, editorMode]);

  const handleEditorSended = async () => {
    // Refresh the note data after saving
    if (blinkoItem.id) {
      // Trigger list refresh
      blinko.updateTicker++;
      
      // Re-fetch the note detail to get latest data
      await blinko.noteDetail.call({ id: blinkoItem.id });
      if (blinko.noteDetail.value) {
        blinko.curSelectedNote = _.cloneDeep(blinko.noteDetail.value);
      }
    }
    
    handleClose();
  };

  const documentNote: BlinkoItem = blinko.curSelectedNote?.id != null && blinko.curSelectedNote.id === blinkoItem.id
    ? blinko.curSelectedNote
    : blinkoItem;
  const documentContent = documentNote?.content ?? blinkoItem.content ?? '';
  const documentTitle = documentNote?.metadata?.title?.trim() || blinkoItem.title || t('note');
  const hasOutline = useMemo(() => extractHeadingsFromMarkdown(documentContent).length > 0, [documentContent]);
  const outlineColumnWidth = isPc && hasOutline ? (isTocOpen ? 280 : 40) : 0;
  const outlineLayoutWidth = outlineColumnWidth > 0 ? outlineColumnWidth + 12 : 0;
  const baseDocumentWidth = pageWidth.maxWidth ? Number.parseInt(pageWidth.maxWidth, 10) : null;
  const documentMaxWidth = baseDocumentWidth ? `${baseDocumentWidth + outlineLayoutWidth}px` : undefined;

  const handleTogglePin = () => {
    if (!documentNote?.id) return;
    const next = !documentNote.isTop;
    if (blinko.curSelectedNote?.id === documentNote.id) blinko.curSelectedNote.isTop = next;
    void blinko.silentUpsertNote({ id: documentNote.id, isTop: next }).then(() => {
      blinko.updateTicker++;
    });
  };

  const isLongText = (blinkoItem?.content?.length ?? 0) > 1000;

  if (!isOpen) return null;

  const editorContent = (
    <div
      className={`fixed inset-0 z-[9999] bg-card expanded-container document-heading-guides ${isPc ? 'overflow-y-auto' : 'overflow-hidden'}`}
      /**
       * 注意：这里曾经用 onPointerDownCapture / onTouchStartCapture 对
       * "不在 editorContainerRef 内"的事件 stopPropagation()，本意是防止拖到
       * 背景上触发卡片拖拽。但 portal 的事件是沿 React 树传播的，而 Dropdown /
       * Dialog 的浮层虽然是挂到 body 上的 DOM 兄弟节点，在 React 树里却是这个
       * div 的后代 —— 于是菜单、弹窗里的每一次 pointerdown 都被判成"点在背景
       * 上"而掐断，react-aria 的 usePress 收不到事件，菜单项的 onClick 永远不
       * 触发（表现就是菜单能开、点了没反应，还会因为"点到外面"自动关闭）。
       * 卡片拖拽已经由 useDragCard 关掉，这里不再需要拦事件。
       */
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0
      }}
    >
      {isPc && (
        <div data-testid="document-fixed-header" className="fixed inset-x-0 top-0 z-[10005] flex flex-col border-b border-border bg-card/95 shadow-sm backdrop-blur-xl">
          <div className="flex h-12 w-full items-center gap-1.5 px-3 md:px-5">
            <Button
              isIconOnly
              variant="light"
              size="sm"
              onPress={handleClose}
              aria-label={t('back')}
              className="shrink-0 text-default-600 hover:bg-default-100 hover:text-foreground"
            >
              <Icon icon="tabler:arrow-left" width={20} height={20} />
            </Button>
            <Button
              isIconOnly
              variant="light"
              size="sm"
              onPress={handleHome}
              aria-label={t('go-home')}
              className="shrink-0 text-default-600 hover:bg-default-100 hover:text-foreground"
            >
              <Icon icon="tabler:home" width={19} height={19} />
            </Button>
            <div id={`editor-save-status-${blinkoItem.id}`} className="shrink-0" />
            <span className="mx-1 h-5 w-px shrink-0 bg-default-200" aria-hidden />
            <div className="min-w-0 flex-1 truncate text-[13.5px] text-default-600" title={documentTitle}>
              {documentTitle}
            </div>
            <div id={`editor-top-toolbar-${blinkoItem.id}`} className={`${editorMode === 'edit' ? 'flex' : 'hidden'} shrink-0 items-center`} />

            {!documentNote?.isRecycle && (
              <Tooltip content={t(documentNote?.isTop ? 'cancel-top' : 'top')}>
                <Button
                  isIconOnly
                  variant="light"
                  size="sm"
                  onPress={handleTogglePin}
                  aria-label={t(documentNote?.isTop ? 'cancel-top' : 'top')}
                  className={documentNote?.isTop ? 'shrink-0 bg-amber-500/10 text-amber-500' : 'shrink-0 text-default-500'}
                >
                  <Icon icon="solar:bookmark-bold" width={18} height={18} />
                </Button>
              </Tooltip>
            )}
            {!documentNote?.isRecycle && (
              <div className="grid size-8 shrink-0 place-items-center rounded-lg text-default-500 transition-colors hover:bg-default-100 hover:text-foreground">
                <ShareButton blinkoItem={documentNote} isIOSDevice={false} alwaysShow compact />
              </div>
            )}
            <div className="grid size-8 shrink-0 place-items-center rounded-lg hover:bg-default-100">
              <CardActionMenu
                blinkoItem={documentNote}
                showPageWidth
                editorMode={editorMode}
                onToggleEditorMode={() => {
                  if (editorMode === 'preview') handleSwitchToEdit();
                  else handleSwitchToPreview();
                }}
                isDetailPage={isDetailPage}
                hideShare
                hidePin
              />
            </div>
          </div>
        </div>
      )}

      {/* PC: window-level scrolling — cover, title and body scroll away together
          (Feishu behaviour), scrollbar sits at the viewport's right edge.
          Mobile keeps the previous internal-scroll layout. */}
      <div className={`${isPc ? `min-h-full pt-12` : 'h-full'} flex justify-center`}>
        <div
          ref={editorContainerRef}
          className={`w-full mx-auto ${isPc ? 'min-h-full' : 'h-full'} flex ${isPc ? 'flex-col ' + PAGE_WIDTH_PAD_CLASS[pageWidth.mode] : 'flex-col p-2'}`}
          style={{ maxWidth: documentMaxWidth }}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          {/*
            阅读态与编辑态是同一棵 Tiptap 树，只切 setEditable：
            打开即可直接写，切回阅读再点正文任意处也能接着写，
            两种模式来回切不重新 mount、不丢光标。
          */}
          <div
            className={`${isPc ? 'flex flex-col' : 'flex-1 flex flex-col min-h-0'} ${!isPc && isLongText ? 'editor-long-text' : ''}`}
            style={{ height: isPc ? undefined : 'calc(100vh - 80px)', paddingBottom: isPc ? '20px' : '0' }}
            onClick={handleSurfaceClick}
          >
            {dataReady ? (
              <BlinkoEditor
                key={`editor-${blinkoItem.id}`}
                mode="edit"
                hideDoneButton
                editable={editorMode === 'edit'}
                onEditorReady={handleEditorReady}
                onSended={handleEditorSended}
                withoutOutline={true}
                showTopToolbar={true}
                documentToolbar={true}
                documentSidebar={isPc && hasOutline ? (
                  <aside
                    data-testid="document-outline-column"
                    style={{ width: outlineColumnWidth, flexBasis: outlineColumnWidth }}
                    className={`sticky top-[102px] mr-3 h-[calc(100vh-118px)] shrink-0 overflow-hidden transition-[width,flex-basis] duration-200 ${
                      isTocOpen ? 'bg-default-50/30 pr-2' : 'bg-transparent'
                    }`}
                  >
                    {isTocOpen ? (
                      <TableOfContents
                        content={documentContent}
                        embedded
                        rootElement={editorContainerRef.current}
                        onClose={() => setIsTocOpen(false)}
                      />
                    ) : (
                      <button
                        type="button"
                        data-testid="document-outline-trigger"
                        aria-label={t('table-of-contents')}
                        title={t('table-of-contents')}
                        aria-expanded={false}
                        onClick={() => setIsTocOpen(true)}
                        className="mx-auto grid size-8 place-items-center rounded-lg text-default-500 transition-colors hover:bg-default-100 hover:text-foreground"
                      >
                        <Icon icon="mdi:format-list-bulleted" width={17} height={17} />
                      </button>
                    )}
                  </aside>
                ) : undefined}
                documentSidebarInset={outlineLayoutWidth}
                pageScroll={isPc}
                focusOnMount={false}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-desc text-sm">{t('loading')}</div>
            )}
          </div>

          {/* Mobile: scrollable document tools plus a stable navigation/action row. */}
          {!isPc && (
            <div
              className="sticky bottom-0 z-[10005] flex shrink-0 flex-col border-t border-border bg-card/95 px-2 pt-1.5 backdrop-blur-xl"
              style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
              <div className={`${editorMode === 'edit' ? 'flex' : 'hidden'} w-full overflow-x-auto border-b border-default-100 pb-1 hide-scrollbar`}>
                <div id={`editor-top-toolbar-${blinkoItem.id}`} className="flex min-w-max flex-1 items-center" />
              </div>
              <div className="flex h-11 items-center justify-between">
                <Button
                  isIconOnly
                  variant="light"
                  size="sm"
                  onPress={handleClose}
                  aria-label={t('back')}
                  className="text-foreground hover:bg-default-100"
                >
                  <Icon icon="tabler:arrow-left" width={20} height={20} />
                </Button>
                <div className="flex items-center gap-1.5">
                  {!documentNote?.isRecycle && (
                    <Button
                      isIconOnly
                      variant="light"
                      size="sm"
                      onPress={handleTogglePin}
                      aria-label={t(documentNote?.isTop ? 'cancel-top' : 'top')}
                      className={documentNote?.isTop ? 'text-amber-500' : 'text-default-500'}
                    >
                      <Icon icon="solar:bookmark-bold" width={18} height={18} />
                    </Button>
                  )}
                  {!documentNote?.isRecycle && (
                    <div className="grid size-8 place-items-center rounded-lg hover:bg-default-100">
                      <ShareButton blinkoItem={documentNote} isIOSDevice alwaysShow compact />
                    </div>
                  )}
                  <div className="grid size-8 place-items-center rounded-lg hover:bg-default-100">
                    <CardActionMenu
                      blinkoItem={documentNote}
                      editorMode={editorMode}
                      onToggleEditorMode={() => {
                        if (editorMode === 'preview') handleSwitchToEdit();
                        else handleSwitchToPreview();
                      }}
                      isDetailPage={isDetailPage}
                      hideShare
                      hidePin
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {!isPc && hasOutline && (
        <>
          <button
            type="button"
            data-testid="document-outline-trigger"
            aria-label={t('table-of-contents')}
            title={t('table-of-contents')}
            aria-expanded={isTocOpen}
            onClick={() => setIsTocOpen((value) => !value)}
            style={{ left: '8px' }}
            className={`fixed top-24 z-[10010] grid size-8 place-items-center rounded-r-lg border border-default-200 bg-card/90 shadow-sm backdrop-blur-md transition-colors max-md:top-16 ${
              isTocOpen ? 'text-primary' : 'text-default-500 hover:bg-default-100 hover:text-foreground'
            }`}
          >
            <Icon icon="mdi:format-list-bulleted" width={17} height={17} />
          </button>
          {isTocOpen && (
            <TableOfContents
              content={documentContent}
              sidePanel
              rootElement={editorContainerRef.current}
              onClose={() => setIsTocOpen(false)}
            />
          )}
        </>
      )}

    </div>
  );

  // Use Portal to render outside of any parent container constraints
  return createPortal(editorContent, document.body);
});
