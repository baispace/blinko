import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { Editor } from '@tiptap/core';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Common/Iconify/icons';
import { downloadFromLink } from '@/lib/tauriHelper';
import { getBlinkoEndpoint } from '@/lib/blinkoEndpoint';
import type { EditorStore } from '../editorStore';
import { isImageAlign, normalizeWidth, type ImageAlign } from './contentImage';

const MIN_WIDTH = 48;
/** 手柄直径的一半，用于把 10px 的手柄压在图片边缘上 */
const HANDLE_OFFSET = 5;

const SIZE_PRESETS: { key: string; ratio: number; label: string }[] = [
  { key: 'small', ratio: 0.25, label: '25%' },
  { key: 'medium', ratio: 0.5, label: '50%' },
  { key: 'large', ratio: 0.75, label: '75%' },
  { key: 'full', ratio: 1, label: '100%' },
];

const ALIGN_PRESETS: { value: ImageAlign; icon: string; label: string }[] = [
  { value: 'left', icon: 'mdi:format-align-left', label: 'image-align-left' },
  { value: 'center', icon: 'mdi:format-align-center', label: 'image-align-center' },
  { value: 'right', icon: 'mdi:format-align-right', label: 'image-align-right' },
];

type Box = { top: number; left: number; width: number; height: number };

type Target = {
  pos: number;
  src: string;
  width: number | null;
  align: ImageAlign | null;
  box: Box;
  container: number;
};

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/** 宽度预设按钮：用横条长度表示占比，比 S/M/L 更直观，也避免引入打包集里没有的图标 */
const WidthIcon = ({ ratio }: { ratio: number }) => {
  const w = 6 + ratio * 12;
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <rect x={12 - w / 2} y="9" width={w} height="6" rx="1.5" fill="currentColor" />
    </svg>
  );
};

/**
 * Feishu / Notion 式图片操作：
 *  - 选中图片后在其上方浮出工具栏：对齐（左/中/右）、尺寸预设、替换、下载、删除
 *  - 图片左右两侧各一个拖拽手柄，按住即可调宽（居中时对称缩放）
 *
 * 与 TableHandles 同一套做法：浮层用视口坐标 + position:fixed，跟随
 * selectionUpdate / transaction / scroll / resize 重新测量。
 */
export const ImageToolbar = ({ editor, store }: { editor: Editor | null | undefined; store: EditorStore }) => {
  const { t } = useTranslation();
  const [target, setTarget] = useState<Target | null>(null);
  const [resizing, setResizing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const measure = useCallback(() => {
    if (!editor || !editor.isEditable) {
      setTarget(null);
      return;
    }
    // NodeSelection 才带 node；普通光标落在文字里时为 undefined
    const node = (editor.state.selection as any)?.node;
    if (!node || node.type.name !== 'image') {
      setTarget(null);
      return;
    }
    const pos = editor.state.selection.from;
    const dom = editor.view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) {
      setTarget(null);
      return;
    }
    const r = dom.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight || r.width === 0) {
      setTarget(null);
      return;
    }
    setTarget({
      pos,
      src: String(node.attrs?.src ?? ''),
      width: normalizeWidth(node.attrs?.width),
      align: isImageAlign(node.attrs?.align) ? node.attrs.align : null,
      box: { top: r.top, left: r.left, width: r.width, height: r.height },
      container: dom.parentElement?.clientWidth || editor.view.dom.clientWidth || 800,
    });
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    measure();
    editor.on('selectionUpdate', measure);
    editor.on('transaction', measure);
    editor.on('focus', measure);
    editor.on('blur', measure);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      editor.off('selectionUpdate', measure);
      editor.off('transaction', measure);
      editor.off('focus', measure);
      editor.off('blur', measure);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [editor, measure]);

  const updateAttrs = useCallback(
    (patch: Record<string, any>) => {
      if (!editor || !target) return;
      const node = editor.state.doc.nodeAt(target.pos);
      if (!node) return;
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(target.pos, undefined, { ...node.attrs, ...patch })
      );
    },
    [editor, target]
  );

  const startResize = (side: 'left' | 'right') => (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editor || !target) return;
    const startX = e.clientX;
    const startWidth = target.box.width;
    // 居中（含未设置）时两侧手柄对称缩放，拖一边即整体变宽/变窄
    const symmetric = !target.align || target.align === 'center';
    const max = target.container || 2000;
    setResizing(true);

    const onMove = (ev: MouseEvent) => {
      const delta = (ev.clientX - startX) * (symmetric ? 2 : 1) * (side === 'right' ? 1 : -1);
      updateAttrs({ width: Math.round(clamp(startWidth + delta, MIN_WIDTH, max)) });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setResizing(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onReplace = async (file: File | undefined) => {
    if (!file) return;
    const path = await store.uploadCoverFile(file);
    if (path) updateAttrs({ src: path });
  };

  if (!editor || !target) {
    return <input ref={inputRef} type="file" accept="image/*" className="hidden" />;
  }

  const { box, container, width, align } = target;
  const toolbarTop = box.top > 48 ? box.top - 40 : box.top + box.height + 8;
  const toolbarLeft = clamp(box.left + box.width / 2, 90, Math.max(90, window.innerWidth - 90));
  const handleTop = box.top + box.height / 2 - HANDLE_OFFSET;
  const percent = container ? Math.round((box.width / container) * 100) : null;

  return (
    <div className={`tiptap-image-tools${resizing ? ' is-resizing' : ''}`}>
      <div
        className="tiptap-bubble tiptap-image-toolbar"
        style={{ top: toolbarTop, left: toolbarLeft }}
        onMouseDown={(e) => e.preventDefault()}
      >
        {ALIGN_PRESETS.map((preset) => (
          <button
            key={preset.value}
            className={align === preset.value ? 'is-active' : ''}
            title={t(preset.label)}
            onClick={() => updateAttrs({ align: preset.value })}
          >
            <Icon icon={preset.icon} width={15} height={15} />
          </button>
        ))}
        <div className="bubble-divider" />

        {SIZE_PRESETS.map((preset) => (
          <button
            key={preset.key}
            className={
              width && container && Math.abs(width / container - preset.ratio) < 0.02 ? 'is-active' : ''
            }
            title={`${t('image-size')} ${preset.label}`}
            onClick={() => updateAttrs({ width: Math.round(container * preset.ratio) })}
          >
            <WidthIcon ratio={preset.ratio} />
          </button>
        ))}
        <div className="bubble-divider" />

        <button title={t('image-replace')} onClick={() => inputRef.current?.click()}>
          <Icon icon="solar:refresh-outline" width={15} height={15} />
        </button>
        <button title={t('image-download')} onClick={() => downloadFromLink(getBlinkoEndpoint(target.src))}>
          <Icon icon="tabler:download" width={15} height={15} />
        </button>
        <button
          className="is-danger"
          title={t('image-delete')}
          onClick={() => editor.chain().focus().deleteSelection().run()}
        >
          <Icon icon="tabler:trash" width={15} height={15} />
        </button>
      </div>

      {/* 左右手柄：按住拖动改宽度 */}
      <div
        className="tiptap-image-handle"
        style={{ top: handleTop, left: box.left - HANDLE_OFFSET }}
        title={t('image-resize')}
        onMouseDown={startResize('left')}
      />
      <div
        className="tiptap-image-handle"
        style={{ top: handleTop, left: box.left + box.width - HANDLE_OFFSET }}
        title={t('image-resize')}
        onMouseDown={startResize('right')}
      />

      {resizing && percent !== null && (
        <div className="tiptap-image-size-tag" style={{ top: box.top - 8, left: box.left }}>
          {percent}%
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          onReplace(file);
        }}
      />
    </div>
  );
};
