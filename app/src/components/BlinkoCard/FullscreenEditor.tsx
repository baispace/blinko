import { observer } from "mobx-react-lite";
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
import { PageWidthButton } from "@/components/Common/PageWidthButton";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/core";
import { PageWidthStore, PAGE_WIDTH_PAD_CLASS } from "@/store/pageWidthStore";

interface FullscreenEditorProps {
  blinkoItem: BlinkoItem;
  isOpen: boolean;
  onClose: () => void;
}

export const FullscreenEditor = observer(({ blinkoItem, isOpen, onClose }: FullscreenEditorProps) => {
  const isPc = useMediaQuery('(min-width: 768px)');
  const blinko = RootStore.Get(BlinkoStore);
  const pageWidth = RootStore.Get(PageWidthStore);
  const { t } = useTranslation();
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

  const handleEditorReady = (editor: Editor) => { tiptapRef.current = editor; };

  // Clean up fullscreen editor state when closing
  const handleClose = () => {
    blinko.fullscreenEditorNoteId = null;
    // 回到「打开即编辑」的默认态，而不是写死 preview，否则下一条笔记会继承上一条的阅读态
    setEditorMode(defaultEditorMode);
    setDataReady(false);
    onClose();
  };

  // 这个组件常驻在 BlinkoCard 里（isOpen 只是开关），所以每次打开都要按默认态复位
  useEffect(() => {
    if (isOpen) setEditorMode(defaultEditorMode);
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
        await blinko.noteDetail.call({ id: blinkoItem.id });
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

  const isLongText = (blinkoItem?.content?.length ?? 0) > 1000;

  if (!isOpen) return null;

  const editorContent = (
    <div
      className={`fixed inset-0 z-[9999] bg-background ${isPc ? 'overflow-y-auto' : 'overflow-hidden'}`}
      onPointerDownCapture={(e) => {
        // Only stop propagation if event is not from editor container (to prevent drag on background)
        // Allow events from editor container to work normally
        if (editorContainerRef.current && !editorContainerRef.current.contains(e.target as Node)) {
          e.stopPropagation();
        }
      }}
      onTouchStartCapture={(e) => {
        if (editorContainerRef.current && !editorContainerRef.current.contains(e.target as Node)) {
          e.stopPropagation();
        }
      }}
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
          {/* Top header with back button and toolbar (PC only, sticky while scrolling) */}
          {isPc && (
            <div className="sticky top-0 z-10 flex items-center justify-between py-4 flex-shrink-0 border-b border-border bg-background">
              <Button
                isIconOnly
                variant="light"
                size="sm"
                onPress={handleClose}
                className="text-foreground hover:bg-default-100"
              >
                <Icon icon="tabler:arrow-left" width={20} height={20} />
              </Button>
              <div className="flex-1 flex justify-end ml-2 gap-2">
                {editorMode === 'preview' ? (
                  <Tooltip content={t('edit')}>
                    <Button
                      isIconOnly
                      variant="light"
                      size="sm"
                      onPress={handleSwitchToEdit}
                      className="text-foreground hover:bg-default-100"
                    >
                      <Icon icon="tabler:edit" width={20} height={20} />
                    </Button>
                  </Tooltip>
                ) : (
                  <Tooltip content={t('preview')}>
                    <Button
                      isIconOnly
                      variant="light"
                      size="sm"
                      onPress={handleSwitchToPreview}
                      className="text-foreground hover:bg-default-100"
                    >
                      <Icon icon="tabler:eye" width={20} height={20} />
                    </Button>
                  </Tooltip>
                )}
                {/* 工具栏宿主始终在 DOM 里（阅读态由 Editor 决定不往里注入内容），
                    否则从阅读切到编辑时 Editor 找不到挂载点，工具栏不会出现 */}
                <div id={`editor-top-toolbar-${blinkoItem.id}`} className="flex justify-end"></div>
                {/* 页宽：默认 / 较宽 / 全宽 —— 飞书一样放在最右侧 */}
                <PageWidthButton />
              </div>
            </div>
          )}

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
                editable={editorMode === 'edit'}
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

          {/* Bottom toolbar with back button (Mobile only, sticky above the keyboard area) */}
          {!isPc && (
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
              <div className="flex-1 flex justify-end ml-2 gap-2">
                {editorMode === 'preview' ? (
                  <Tooltip content={t('edit')}>
                    <Button
                      isIconOnly
                      variant="light"
                      size="sm"
                      onPress={handleSwitchToEdit}
                      className="text-foreground hover:bg-default-100"
                    >
                      <Icon icon="tabler:edit" width={20} height={20} />
                    </Button>
                  </Tooltip>
                ) : (
                  <Tooltip content={t('preview')}>
                    <Button
                      isIconOnly
                      variant="light"
                      size="sm"
                      onPress={handleSwitchToPreview}
                      className="text-foreground hover:bg-default-100"
                    >
                      <Icon icon="tabler:eye" width={20} height={20} />
                    </Button>
                  </Tooltip>
                )}
                {/* 工具栏宿主始终在 DOM 里（阅读态由 Editor 决定不往里注入内容），
                    否则从阅读切到编辑时 Editor 找不到挂载点，工具栏不会出现 */}
                <div id={`editor-top-toolbar-${blinkoItem.id}`} className="flex justify-end"></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Use Portal to render outside of any parent container constraints
  return createPortal(editorContent, document.body);
});
