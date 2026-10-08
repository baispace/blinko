import { observer } from "mobx-react-lite";
import { when } from "mobx";
import { useEffect, useState, useRef } from "react";
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
import { TableOfContents } from '@/components/Common/TableOfContents';
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
  /**
   * 「演示模式」：飞书式的阅读演示 —— 隐藏所有 chrome（顶栏、底栏、编辑器工具栏、
   * BubbleMenu 等），只留可滚动正文 + 右上角"退出演示"按钮。与 `editorMode` 是
   * 正交的两条轴：演示模式只看正文，editorMode 控制 Tiptap editable。
   */
  const [presentationMode, setPresentationMode] = useState(false);
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
    setPresentationMode(false);
    setDataReady(false);
    onClose();
  };

  // 这个组件常驻在 BlinkoCard 里（isOpen 只是开关），所以每次打开都要按默认态复位
  useEffect(() => {
    if (isOpen) {
      setEditorMode(defaultEditorMode);
      setPresentationMode(false);
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
        
        // 演示模式优先退出 —— 飞书也是这个节奏（演示 → 阅读 → 关闭）
        if (presentationMode) {
          setPresentationMode(false);
          return;
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
  }, [isOpen, onClose, editorMode, presentationMode]);

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

  const isLongText = (blinkoItem?.content?.length ?? 0) > 1000;

  if (!isOpen) return null;

  const editorContent = (
    <div
      className={`fixed inset-0 z-[9999] bg-background ${isPc ? 'overflow-y-auto' : 'overflow-hidden'}`}
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
      {/* PC: window-level scrolling — cover, title and body scroll away together
          (Feishu behaviour), scrollbar sits at the viewport's right edge.
          Mobile keeps the previous internal-scroll layout. */}
      <div className={`${isPc ? 'min-h-full' : 'h-full'} flex justify-center`}>
        <div
          ref={editorContainerRef}
          className={`w-full mx-auto ${isPc ? 'min-h-full' : 'h-full'} flex ${isPc ? 'flex-col ' + PAGE_WIDTH_PAD_CLASS[pageWidth.mode] : 'flex-col p-2'}`}
          style={{ maxWidth: pageWidth.maxWidth }}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          {/* Top header with back button and toolbar (PC only, sticky while scrolling).
              收纳后的形态：← 大纲 │ 标题 ……… [编辑器工具栏] │ ⋯
              分享 / 页宽 / 预览切换 全部收进右侧 ⋯ 菜单，顶栏只留一个操作入口。
              演示模式下整条顶栏消失 —— 演示模式不留任何 chrome。 */}
          {!presentationMode && isPc && (
            <div className="sticky top-0 z-10 flex items-center gap-3 py-3 flex-shrink-0 border-b border-border bg-background/95 backdrop-blur-md">
              <Button
                isIconOnly
                variant="light"
                size="sm"
                onPress={handleClose}
                className="text-foreground hover:bg-default-100 shrink-0"
              >
                <Icon icon="tabler:arrow-left" width={20} height={20} />
              </Button>

              {/* 大纲入口：阅读态、编辑态都给。以前只在阅读态给（因为靠
                  `.markdown-body` 抓 DOM，编辑态抓不到），现在 TableOfContents
                  直接从 markdown 源文本解析标题，两种模式都能用。 */}
              {!!blinkoItem.content && (
                <Tooltip content={t('table-of-contents')}>
                  <Button
                    isIconOnly
                    variant="light"
                    size="sm"
                    onPress={() => setIsTocOpen((v) => !v)}
                    className={`shrink-0 ${isTocOpen ? 'text-primary bg-primary/10' : 'text-foreground hover:bg-default-100'}`}
                  >
                    <Icon icon="mdi:format-list-bulleted" width={20} height={20} />
                  </Button>
                </Tooltip>
              )}

              {/* 标题面包屑：飞书式顶栏左侧，让用户始终知道自己在哪一篇 */}
              <div className="text-[13.5px] text-default-600 truncate min-w-0 mr-auto">
                {blinkoItem.title || t('note')}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* 工具栏宿主始终在 DOM 里（阅读态由 Editor 决定不往里注入内容），
                    否则从阅读切到编辑时 Editor 找不到挂载点，工具栏不会出现 */}
                <div id={`editor-top-toolbar-${blinkoItem.id}`} className="flex justify-end"></div>

                <span className="w-px h-5 bg-default-200 mx-0.5" />

                {/* 唯一的笔记级操作入口：分享 / 页宽 / 编辑↔预览 + 全部分组操作 */}
                <CardActionMenu
                  blinkoItem={blinkoItem}
                  showPageWidth
                  editorMode={editorMode}
                  onToggleEditorMode={() => {
                    if (editorMode === 'preview') handleSwitchToEdit();
                    else handleSwitchToPreview();
                  }}
                  presentationMode={presentationMode}
                  onTogglePresentation={() => setPresentationMode((v) => !v)}
                  isDetailPage={isDetailPage}
                />
              </div>

              {/* 挂在 sticky 栏内，跟着栏一起吸顶；浮层自管遮罩与关闭 */}
              {isTocOpen && (
                <TableOfContents
                  content={blinkoItem.content ?? ''}
                  floating
                  onClose={() => setIsTocOpen(false)}
                  className="top-full left-1 mt-2"
                />
              )}
            </div>
          )}

          {/*
            阅读态与编辑态是同一棵 Tiptap 树，只切 setEditable：
            打开即可直接写，切回阅读再点正文任意处也能接着写，
            两种模式来回切不重新 mount、不丢光标。
            演示模式强制 readOnly（无论 editorMode 是什么）。
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
                editable={!presentationMode && editorMode === 'edit'}
                onEditorReady={handleEditorReady}
                onSended={handleEditorSended}
                withoutOutline={true}
                showTopToolbar={true}
                pageScroll={isPc}
                focusOnMount={false}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-desc text-sm">{t('loading')}</div>
            )}
          </div>

          {/* Bottom toolbar with back button (Mobile only, sticky above the keyboard area).
              演示模式下整条底栏消失 —— 演示模式不留任何 chrome。 */}
          {!presentationMode && !isPc && (
            <div className="sticky bottom-0 flex items-center justify-between py-3 px-2 flex-shrink-0 border-t border-border bg-background" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
              <Button
                isIconOnly
                variant="light"
                size="sm"
                onPress={handleClose}
                className="text-foreground hover:bg-default-100"
              >
                <Icon icon="tabler:arrow-left" width={20} height={20} />
              </Button>
              <div className="flex-1 flex justify-end items-center ml-2 gap-2">
                {/* 与 PC 顶栏一致：只留一个 ⋯，预览切换 / 演示模式 收进菜单。
                    移动端不传 showPageWidth —— 窄屏上页宽没有意义。 */}
                <CardActionMenu
                  blinkoItem={blinkoItem}
                  editorMode={editorMode}
                  onToggleEditorMode={() => {
                    if (editorMode === 'preview') handleSwitchToEdit();
                    else handleSwitchToPreview();
                  }}
                  presentationMode={presentationMode}
                  onTogglePresentation={() => setPresentationMode((v) => !v)}
                  isDetailPage={isDetailPage}
                />
                {/* 工具栏宿主始终在 DOM 里（阅读态由 Editor 决定不往里注入内容），
                    否则从阅读切到编辑时 Editor 找不到挂载点，工具栏不会出现 */}
                <div id={`editor-top-toolbar-${blinkoItem.id}`} className="flex justify-end"></div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 演示模式浮动退出口：右上角，半透浮于正文之上，点 ESC 也退出。 */}
      {presentationMode && (
        <Button
          isIconOnly
          variant="flat"
          size="sm"
          onPress={() => setPresentationMode(false)}
          aria-label={t('exit-presentation')}
          className="fixed top-4 right-4 z-[10000] bg-background/80 backdrop-blur-md text-foreground shadow-md hover:bg-background"
        >
          <Icon icon="mdi:arrow-collapse" width={20} height={20} />
        </Button>
      )}
    </div>
  );

  // Use Portal to render outside of any parent container constraints
  return createPortal(editorContent, document.body);
});
