import { RootStore } from '@/store';
import React, { ReactElement, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { observer, useLocalObservable } from 'mobx-react-lite';
import { reaction } from 'mobx';
import { createPortal } from 'react-dom';
import { FileType, OnSendContentType } from './type';
import { BlinkoStore } from '@/store/blinkoStore';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'usehooks-ts';
import { type Attachment, NoteType } from '@shared/lib/types';
import { Card, Popover, PopoverTrigger, PopoverContent } from '@heroui/react';
import { AttachmentsRender, ReferenceRender } from '../AttachmentRender';
import { ReferenceButton } from './Toolbar/ReferenceButton';
import { NoteTypeButton } from './Toolbar/NoteTypeButton';
import { HashtagButton } from './Toolbar/HashtagButton';
import { SendButton } from './Toolbar/SendButton';
import { DoneButton } from './Toolbar/DoneButton';
import {
  useEditorInit,
  useEditorEvents,
  useEditorFiles,
  useEditorHeight
} from './hooks/useEditor';
import { EditorStore } from "./editorStore";
import { Icon } from '@/components/Common/Iconify/icons';
import { eventBus } from "@/lib/event";
import { PluginApiStore } from "@/store/plugin/pluginApiStore";
import { PluginRender } from '@/store/plugin/pluginRender';
import { IconButton } from "./Toolbar/IconButton";
import { TiptapEditorContent } from './Tiptap/TiptapEditorContent';
import { NoteCoverHeader } from './NoteCover';
import { ToolbarDivider, FormatMenuButton, ListToggleButton, TaskListButton, CalloutButton, UploadImageButton } from './Tiptap/ToolbarButtons';

//https://ld246.com/guide/markdown
type IProps = {
  mode: 'create' | 'edit' | 'comment',
  content: string,
  onChange?: (content: string) => void,
  onHeightChange?: () => void,
  onSend: (args: OnSendContentType) => Promise<any>,
  isSendLoading?: boolean,
  bottomSlot?: ReactElement<any, any>,
  originFiles?: Attachment[],
  originReference?: number[],
  hiddenToolbar?: boolean,
  withoutOutline?: boolean,
  initialData?: { file?: File, text?: string },
  showTopToolbar?: boolean,
  /** 锁定笔记类型（如待办场景固定 TODO），覆盖 useEditorInit 里基于 searchParams 的推断 */
  fixedNoteType?: NoteType,
  /** 隐藏「闪念/笔记/待办」类型切换按钮（待办场景下避免误切类型） */
  hideNoteTypeButton?: boolean,
  /** 隐藏右上角全屏按钮（弹窗内不需要） */
  hideFullscreenButton?: boolean,
  /** 自动保存状态，由外层持有 noteId 的容器传入；不传则沿用「已编辑」提示 */
  autosaveStatus?: 'idle' | 'saving' | 'saved' | 'error',
  /**
   * 阅读态 / 编辑态。两者共用同一棵 Tiptap 树，只切 setEditable：
   * 不重新 mount、不丢光标、不闪，是「打开即阅读、点一下即编辑」的基础。
   */
  editable?: boolean,
  /** Tiptap 实例就绪后回调，外层可据此把光标定位到具体位置 */
  onEditorReady?: (editor: any) => void,
  /**
   * 编辑态的「完成」回调。传了它，右上角就从「发布」变成「完成」：
   * 正文已经自动保存，附件/引用/类型也各自即时落库，按钮只负责收尾关闭。
   * 新建态不传（笔记还不存在，必须走 onSend 创建）。
   */
  onDone?: () => Promise<any>,
  /**
   * 编辑态下附件 / @引用 / 类型切换的即时落库回调。不传则沿用旧行为：
   * 这三样仍然只在点「发布」时才写回服务端。
   */
  onSidePatch?: (patch: { attachments?: { name: string, path: string, size: number, type: string }[], references?: number[], type?: NoteType }) => void,
  /**
   * 页面级滚动（全屏阅读/编辑页）：封面 + 标题 + 正文一起随窗口滚动，
   * 滚动条贴视口最右（飞书行为）。不传则编辑器内部滚动、封面固定。
   */
  pageScroll?: boolean
}

const Editor = observer(({ content, onChange, onSend, isSendLoading, originFiles, originReference = [], mode, onHeightChange, hiddenToolbar = false, withoutOutline = false, initialData, showTopToolbar = false, bottomSlot, fixedNoteType, hideNoteTypeButton = false, hideFullscreenButton = false, autosaveStatus, editable = true, onEditorReady, onDone, onSidePatch, pageScroll = false }: IProps) => {
  const cardRef = React.useRef(null)
  const isPc = useMediaQuery('(min-width: 768px)')
  const store = useLocalObservable(() => new EditorStore())
  const pluginApi = RootStore.Get(PluginApiStore)
  const blinko = RootStore.Get(BlinkoStore)
  const { t } = useTranslation()
  const [openPopover, setOpenPopover] = useState<string | null>(null);

  useEffect(() => {
    const handleClosePopover = (name: string) => {
      if (openPopover === name) {
        setOpenPopover(null);
      }
    };
    eventBus.on('plugin:closeToolBarContent', handleClosePopover);
    return () => {
      eventBus.off('plugin:closeToolBarContent', handleClosePopover);
    };
  }, [openPopover]);

  // High-frequency toolbar: NoteType / #tag / image | Aa / lists | @reference
  const renderToolbar = () => {
    if (!hiddenToolbar) {
      return (
        <>
          {!hideNoteTypeButton && (
            <NoteTypeButton
              noteType={store.noteType}
              setNoteType={(noteType) => {
                store.noteType = noteType
              }}
            />
          )}
          <HashtagButton store={store} content={content} />
          <UploadImageButton
            getInputProps={getInputProps}
            open={open}
            store={store}
          />
          <ToolbarDivider />
          <FormatMenuButton editor={store.vditor?.editor ?? null} />
          <ListToggleButton editor={store.vditor?.editor ?? null} type="bullet" />
          <ListToggleButton editor={store.vditor?.editor ?? null} type="ordered" />
          <TaskListButton editor={store.vditor?.editor ?? null} />
          <CalloutButton editor={store.vditor?.editor ?? null} />
          <ToolbarDivider />
          <ReferenceButton store={store} iconButton={<IconButton tooltip="reference" icon="mdi:at" />} />
          {pluginApi.customToolbarIcons
            .map((item) => (
              item.content ? (
                <Popover
                  key={item.name}
                  placement={item.placement}
                  isOpen={openPopover === item.name}
                  onOpenChange={(open) => {
                    setOpenPopover(open ? item.name : null);
                  }}
                >
                  <PopoverTrigger>
                    <div className="hover:bg-default-100 rounded-md">
                      <IconButton icon={item.icon} tooltip={item.tooltip} onClick={item.onClick} />
                    </div>
                  </PopoverTrigger>
                  <PopoverContent>
                    <PluginRender content={item.content} data={mode} />
                  </PopoverContent>
                </Popover>
              ) : (
                <div key={item.name} className="hover:bg-default-100 rounded-md">
                  <IconButton icon={item.icon} tooltip={item.tooltip} onClick={item.onClick} />
                </div>
              )
            ))}
        </>
      );
    }
    return null;
  };

  /** 自动保存开启时用它替代「已编辑」，让用户知道改动已经落库 */
  const renderStatusText = () => {
    if (autosaveStatus && autosaveStatus !== 'idle') {
      if (autosaveStatus === 'saving') return <div className="text-default-400 text-xs mr-2">{t('saving')}</div>
      if (autosaveStatus === 'saved') return <div className="text-default-400 text-xs mr-2">{t('saved')}</div>
      return <div className="text-red-500 text-xs mr-2">{t('save-failed')}</div>
    }
    if (store.showIsEditText) return <div className="text-red-500 text-xs mr-2">{t('edited')}</div>
    return null
  }

  const renderRightToolbar = () => (
    <div className='flex items-center gap-1 ml-auto'>
      {renderStatusText()}
      {editable && (onDone
        ? <DoneButton store={store} isSendLoading={isSendLoading} />
        : <SendButton store={store} isSendLoading={isSendLoading} />)}
    </div>
  );

  const [topToolbarElement, setTopToolbarElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (showTopToolbar) {
      // Try to find toolbar container with note-specific id first, then fallback to default
      const noteSpecificId = `editor-top-toolbar-${blinko.curSelectedNote?.id}`;
      let element = document.getElementById(noteSpecificId);
      if (!element) {
        element = document.getElementById('editor-top-toolbar');
      }
      setTopToolbarElement(element);
    } else {
      setTopToolbarElement(null);
    }
  }, [showTopToolbar, blinko.curSelectedNote?.id]);

  let initalContent = content
  if (initialData && mode === 'create' && initialData.text) {
    initalContent = initialData.text
  }

  /**
   * 撑满外层容器的高度布局（全屏阅读 / 顶部工具栏场景）。
   * 与 isFullscreen 的区别：后者额外把卡片变成 fixed 全屏浮层，这里只要布局。
   */
  const fillHeight = showTopToolbar || store.isFullscreen

  useEditorInit(store, onChange, onSend, mode, originReference, initalContent, fixedNoteType, editable);
  useEditorEvents(store);
  useEditorFiles(store, blinko, originFiles);
  useEditorHeight(onHeightChange, blinko, content, store);

  // 编辑态：点发送 / ⌘+Enter 走「完成」，不再整套重存
  useEffect(() => {
    store.onDone = onDone
  }, [store, onDone]);

  /**
   * 编辑态下把「附件上传完成 / @引用变化 / 类型切换」变成各自即时落库。
   *
   * 自动保存只写 content，这三样以前全压在手动「发布」按钮上——按钮一旦
   * 换成「完成」（不再保存），它们就会悄悄丢。这里用 reaction 在它们变化时
   * 通知外层，由外层带上 content 一起静默写回。
   *
   * 依赖里不含 store.references/noteType/files，否则每次输入都会重建监听；
   * reaction 负责追踪这些 observable。
   */
  useEffect(() => {
    if (!onSidePatch || mode !== 'edit') return
    const disposers = [
      reaction(
        () => (store.references ?? []).slice().sort((a, b) => a - b).join(','),
        () => onSidePatch({ references: store.references?.slice() ?? [] }),
      ),
      reaction(
        () => store.noteType,
        (type) => onSidePatch({ type }),
      ),
      reaction(
        () => (store.files ?? []).map(i => i.uploadPromise?.value ?? i.preview ?? i.name).join('|'),
        () => onSidePatch({
          attachments: (store.files ?? []).map(i => ({
            name: i.name,
            path: i.uploadPromise?.value ?? i.preview ?? '',
            size: i.size,
            type: i.type
          }))
        }),
      ),
    ]
    return () => disposers.forEach(d => d())
  }, [store, mode, onSidePatch]);

  // Tiptap 实例在首个 effect 里创建，这里把实例交给外层（用于定位光标等）
  useEffect(() => {
    const ed = store.vditor?.editor
    if (ed) onEditorReady?.(ed)
  }, [store.vditor, onEditorReady]);

  // Handle initial data from sharing
  useEffect(() => {
    if (initialData && mode === 'create') {
      if (initialData.text) {
        onChange?.(initialData.text)
      }
      if (initialData.file) {
        store.uploadFiles([initialData.file]);
      }
    }
  }, [initialData, mode]);

  const {
    getRootProps,
    isDragAccept,
    getInputProps,
    open
  } = useDropzone({
    multiple: true,
    noClick: true,
    onDrop: acceptedFiles => {
      store.uploadFiles(acceptedFiles)
    },
    onDragOver: (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onDragEnter: (e) => {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  const { onDrop, ...rootProps } = getRootProps();

  const handleFileReorder = (newFiles: FileType[]) => {
    store.updateFileOrder(newFiles);
  };

  const handleFullScreenToggle = () => {
    eventBus.emit('editor:setFullScreen', !store.isFullscreen);
  };

  /** 阅读态下的链接应该像渲染结果一样新窗口打开，而不是把编辑器顶掉 */
  const handleReadOnlyLinkClick = (e: React.MouseEvent) => {
    const anchor = (e.target as HTMLElement)?.closest?.('a');
    const href = anchor?.getAttribute('href');
    if (!href) return;
    e.preventDefault();
    e.stopPropagation();
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      {/* Top toolbar portal（阅读态不需要工具栏，等进入编辑再注入） */}
      {showTopToolbar && editable && topToolbarElement && createPortal(
        <div className='flex w-full items-center gap-1'>
          {renderToolbar()}
          {renderRightToolbar()}
        </div>,
        topToolbarElement
      )}

      <div {...getRootProps()} className={`${isDragAccept ? 'border-2 border-green-500 border-dashed' : ''} ${showTopToolbar ? 'h-full flex flex-col' : ''}`}>
      <Card
        shadow='none'
        className={`${showTopToolbar ? (pageScroll ? 'min-h-full flex flex-col' : 'h-full flex flex-col flex-1 min-h-0') : 'p-2'} relative ${withoutOutline ? '' : 'border-2 border-border'} !transition-all ${showTopToolbar ? (pageScroll ? 'overflow-visible' : 'overflow-hidden') : 'overflow-visible'}
        ${store.isFullscreen ? 'fixed inset-0 z-[9999] m-0 rounded-none border-none bg-background' : ''}`}
        ref={el => {
          if (el) {
            //@ts-ignore
            el.__storeInstance = store;
          }
        }}>

        <div ref={cardRef}
          className={`overflow-visible relative ${showTopToolbar ? 'flex-1 flex flex-col min-h-0' : ''}`}
          onKeyDown={e => {
            onHeightChange?.()
            if (isPc) return
            store.adjustMobileEditorHeight()
          }}>

            <div className={`relative ${fillHeight && !pageScroll ? 'flex-1 min-h-0 flex flex-col' : ''}`}>
              <div
                id={`vditor-${mode}`}
                className={`tiptap-editor-root ${fillHeight && !pageScroll ? 'flex-1 min-h-0 flex flex-col' : ''}`}
                onClick={!editable ? handleReadOnlyLinkClick : undefined}
              >
                {/* Cover & icon are a "note" feature; flashes (BLINKO) and todos stay clean. */}
                {mode !== 'comment' && store.noteType === NoteType.NOTE && <NoteCoverHeader store={store} readOnly={!editable} />}
                <TiptapEditorContent store={store} readOnly={!editable} fill={fillHeight} pageScroll={pageScroll} />
              </div>
              {isPc && !showTopToolbar && !hideFullscreenButton && (
                <div
                  onClick={handleFullScreenToggle}
                  title={store.isFullscreen ? t('exit-fullscreen') : t('fullscreen')}
                  className={`absolute top-2 right-2 z-10 flex items-center justify-center w-7 h-7 rounded-lg cursor-pointer !transition-all ${store.isFullscreen ? 'bg-primary text-white border border-primary hover:bg-primary/90 hover:border-primary/70 shadow-md' : 'bg-background text-default-500 border border-border shadow-md hover:text-primary hover:border-primary/50'}`}
                >
                  <Icon icon={store.isFullscreen ? 'lucide:minimize' : 'lucide:maximize'} width={16} height={16} className="!stroke-current" />
                </div>
              )}
            </div>
          {store.files.length > 0 && (
            <div className='w-full my-2 attachment-container'>
              <AttachmentsRender files={store.files} preview={!editable} onReorder={editable ? handleFileReorder : undefined} />
            </div>
          )}

          <div className='w-full mb-2 reference-container'>
            <ReferenceRender store={store} />
          </div>

          {/* Editor Footer Slots */}
          {pluginApi.customEditorFooterSlots
            .filter(slot => {
              if (slot.isHidden) return false;
              if (slot.showCondition && !slot.showCondition(mode)) return false;
              if (slot.hideCondition && slot.hideCondition(mode)) return false;
              return true;
            })
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((slot) => (
              <div
                key={slot.name}
                className={`mb-2 ${slot.className || ''}`}
                style={slot.style}
                onClick={slot.onClick}
                onMouseEnter={slot.onHover}
                onMouseLeave={slot.onLeave}
              >
                <div style={{ maxWidth: slot.maxWidth }}>
                  <PluginRender content={slot.content} data={mode} />
                </div>
              </div>
            ))}

          {!showTopToolbar && (
            <div className='flex w-full items-center gap-1 mt-auto'>
              {renderToolbar()}
              {renderRightToolbar()}
            </div>
          )}
          {bottomSlot && <div className='w-full mt-1'>{bottomSlot}</div>}
        </div>
      </Card>
    </div>
    </>
  );
});

export default Editor
