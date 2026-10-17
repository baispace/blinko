import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { flushSync } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { observer } from 'mobx-react-lite';
import { api } from '@/lib/trpc';
import { NoteType } from '@shared/lib/types';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { RootStore } from '@/store';
import { Icon } from '@/components/Common/Iconify/icons';
import './desktop-note.css';

/** 自动落库间隔：上次输入静止多久后写回服务端 */
const AUTOSAVE_DELAY = 800;
/** Tab 一次缩进的宽度 */
const INDENT = '  ';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type PaperKey =
  | 'yellow' | 'peach' | 'pink' | 'rose' | 'blue'
  | 'cyan' | 'purple' | 'green' | 'cream' | 'white' | 'graphite';

/** 便签纸色。swatch 的底色跟 CSS 里 data-paper 的取值保持一致 */
const PAPERS: { key: PaperKey; label: string; color: string }[] = [
  { key: 'yellow', label: '柠檬黄', color: '#fff29a' },
  { key: 'peach', label: '蜜桃橙', color: '#ffd9b8' },
  { key: 'pink', label: '樱花粉', color: '#ffd6dd' },
  { key: 'rose', label: '玫瑰红', color: '#f6bfd2' },
  { key: 'blue', label: '晴空蓝', color: '#cfe6ff' },
  { key: 'cyan', label: '湖水青', color: '#c9f0f0' },
  { key: 'purple', label: '薰衣紫', color: '#ecd7ff' },
  { key: 'green', label: '嫩芽绿', color: '#d5f0cd' },
  { key: 'cream', label: '米杏色', color: '#f7eedb' },
  { key: 'white', label: '纯白', color: '#ffffff' },
  { key: 'graphite', label: '石墨黑', color: '#2b2b2e' },
];

const PAPER_KEY = 'ink.note-paper';
/** 更早版本用过的纸色名，迁移到现在的色板上 */
const LEGACY_PAPER: Record<string, PaperKey> = { sage: 'green' };

function readStoredPaper(): PaperKey {
  try {
    const saved = localStorage.getItem(PAPER_KEY);
    if (!saved) return 'yellow';
    if (saved in LEGACY_PAPER) return LEGACY_PAPER[saved];
    return PAPERS.some((item) => item.key === saved) ? (saved as PaperKey) : 'yellow';
  } catch {
    return 'yellow';
  }
}

type Draft = { c: string; t: number };
/** 一次编辑的结果：新文本 + 编辑后光标应该落在哪 */
type EditResult = { value: string; start: number; end: number };

/**
 * 桌面便签浮窗内容
 *
 * 极简实现：
 *  - 不挂任何全局 store，不写 `blinko.curSelectedNote` / `blinko.isCreateMode`，
 *    也不会触发 `eventBus`。详情页用的是另一份 BlinkoEditor 实例、另一份
 *    `curSelectedNote` 引用，便签浮窗不会污染它。
 *  - 输入内容是本地 state，自动保存走 `api.notes.upsert`，关窗时先等一次
 *    flush 再销毁窗口。
 *  - 每次输入都同步写一份 localStorage 快照。系统（Space 切换 / 内存压力）
 *    把 webview 重建时，首帧就有内容可渲染，看不到"重新加载"。
 *  - 编辑器是裸 textarea + 一组键盘动作，不引入 Tiptap：没有 / 命令面板，
 *    但常用的 markdown 输入全在键盘流里完成。
 */
const DesktopNotePage = observer(function DesktopNotePage() {
  const [params] = useSearchParams();
  const id = Number(
    params.get('id') || getCurrentWebviewWindow().label.replace('pinned-note-', '')
  );
  const draftKey = `ink.note-draft-${id}`;

  const readDraft = useCallback((): Draft | null => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return null;
      // 兼容早期直接存纯文本的格式
      if (!raw.startsWith('{')) return { c: raw, t: 0 };
      const parsed = JSON.parse(raw) as { c?: unknown; t?: unknown };
      return typeof parsed.c === 'string' ? { c: parsed.c, t: Number(parsed.t) || 0 } : null;
    } catch {
      return null;
    }
  }, [draftKey]);

  const writeDraft = useCallback(
    (text: string) => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({ c: text, t: Date.now() }));
      } catch {
        /* 配额满 / 无痕模式：丢快照不影响编辑本身 */
      }
    },
    [draftKey]
  );

  // 首次 render 读一次快照后固定下来，后续 writeDraft 不影响它
  const [initial] = useState<Draft | null>(() => readDraft());

  const [content, setContent] = useState(initial?.c ?? '');
  // 有快照就当作已加载：避免先渲染"加载中…"再换成正文的视觉跳动
  const [loaded, setLoaded] = useState(initial != null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [pinned, setPinned] = useState(true);
  const [closing, setClosing] = useState(false);
  const [paper, setPaper] = useState<PaperKey>(readStoredPaper);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const lastSavedRef = useRef(initial?.c ?? '');
  const savingRef = useRef(false);
  /** 待落库的快照；多次 onChange 只会留下最后一版 */
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingRef = useRef(false);
  /** 给 onCloseRequested 用，flush 完后才允许销毁窗口 */
  const allowCloseRef = useRef(false);

  /** 把当前 pending 推到服务端，无变化 / 正在保存则跳过 */
  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const text = pendingRef.current;
    pendingRef.current = null;
    if (text == null || text === lastSavedRef.current || savingRef.current) return;
    savingRef.current = true;
    setStatus('saving');
    try {
      await api.notes.upsert.mutate({ id, content: text });
      lastSavedRef.current = text;
      setStatus('saved');
      // 通知主窗口刷新列表（App.tsx 监听这个 key）
      try {
        localStorage.setItem('ink.desktop-note-saved', JSON.stringify({ id, at: Date.now() }));
      } catch {
        /* 无痕模式忽略 */
      }
    } catch {
      // 保留 pending 让下次 flush 再试
      pendingRef.current = text;
      setStatus('error');
    } finally {
      savingRef.current = false;
    }
  }, [id]);

  /** 落快照并排一次自动保存（普通输入和快捷键编辑共用） */
  const applyContent = useCallback(
    (next: string) => {
      writeDraft(next);
      if (next === lastSavedRef.current) return;
      pendingRef.current = next;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void flush();
      }, AUTOSAVE_DELAY);
    },
    [flush, writeDraft]
  );

  /**
   * 快捷键编辑要自己接管光标：React 受控 textarea 在 setState 之后 DOM 才更新，
   * 所以先 flushSync 把这一版刷进 DOM，再同步设置 selection。
   */
  const commitEdit = useCallback(
    (result: EditResult) => {
      applyContent(result.value);
      flushSync(() => setContent(result.value));
      const ta = taRef.current;
      if (ta) ta.setSelectionRange(result.start, result.end);
    },
    [applyContent]
  );

  // 拉取服务端内容。
  // 自动保存有 800ms 窗口，webview 在这期间被重建的话服务端还是旧值，
  // 直接用它会覆盖用户刚敲的字；所以本地快照更新时间更晚时以本地为准。
  useEffect(() => {
    let cancelled = false;
    if (!Number.isSafeInteger(id) || id <= 0) {
      setError('闪念地址无效');
      return;
    }
    void api.notes.detail
      .mutate({ id })
      .then((note) => {
        if (cancelled) return;
        if (!note || note.isRecycle || note.type !== NoteType.BLINKO) {
          throw new Error('闪念不存在、已移入回收站或类型已变更');
        }
        const remote = (note.content ?? '') as string;
        const remoteAt = Date.parse((note as any).updatedAt ?? '') || 0;
        // 拿不到远端时间戳就不敢靠本地覆盖，统一以服务端为准
        const useLocal =
          !!initial && initial.c !== remote && initial.t > remoteAt && remoteAt > 0;
        const text = useLocal && initial ? initial.c : remote;
        setContent(text);
        lastSavedRef.current = text;
        if (useLocal) pendingRef.current = text; // 下一个 tick 补写回服务端
        else writeDraft(text);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // 有快照就继续让用户输入，不要把已有内容抹成错误页
        if (initial) setLoaded(true);
        else setError(err instanceof Error ? err.message : '读取闪念失败');
      });
    return () => {
      cancelled = true;
    };
  }, [id, initial, writeDraft]);

  // 卸载前把 pending 推上去，避免编辑丢
  useEffect(() => () => { void flush(); }, [flush]);

  // 拦截 Tauri 关闭请求：先 flush 再真正销毁
  useEffect(() => {
    let disposed = false;
    let off: (() => void) | undefined;
    void getCurrentWebviewWindow()
      .onCloseRequested((event) => {
        if (allowCloseRef.current) return;
        event.preventDefault();
        void close();
      })
      .then((fn) => {
        if (disposed) fn();
        else off = fn;
      });
    return () => {
      disposed = true;
      off?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 同步置顶状态到原生窗口
  useEffect(() => {
    void invoke('set_pinned_note_top', { pinned }).catch(() => {
      RootStore.Get(ToastPlugin).error('置顶设置失败，请重试');
    });
  }, [pinned]);

  const onChange = useCallback(
    (next: string) => {
      setContent(next);
      // 每次输入都落一份快照：webview 被重建时连最后一个字都在
      applyContent(next);
    },
    [applyContent]
  );

  const close = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    try {
      await flush();
      allowCloseRef.current = true;
      await invoke('close_pinned_note');
    } catch {
      allowCloseRef.current = false;
      closingRef.current = false;
      setClosing(false);
      RootStore.Get(ToastPlugin).error('关闭失败，请重试');
    }
  }, [flush]);

  const togglePinned = useCallback(() => {
    setPinned((value) => !value);
  }, []);

  const pickPaper = useCallback((key: PaperKey) => {
    setPaper(key);
    setPaletteOpen(false);
    try {
      localStorage.setItem(PAPER_KEY, key);
    } catch {
      /* 无痕模式下不持久化，本次会话仍然生效 */
    }
  }, []);

  // 点在色板或调色按钮之外就收起
  useEffect(() => {
    if (!paletteOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.note-palette') || target?.closest('[data-palette-toggle]')) return;
      setPaletteOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [paletteOpen]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      const ta = event.currentTarget;
      const { selectionStart: start, selectionEnd: end, value } = ta;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (mod && !event.altKey) {
        switch (key) {
          case 'b':
            event.preventDefault();
            return commitEdit(toggleWrap(value, start, end, '**'));
          case 'i':
            event.preventDefault();
            return commitEdit(toggleWrap(value, start, end, '*'));
          case 'k':
            event.preventDefault();
            return commitEdit(insertLink(value, start, end));
          case 's':
            event.preventDefault();
            return void flush();
          case 'j':
            event.preventDefault();
            return commitEdit(toggleCheckbox(value, start, end));
          case '1': case '2': case '3': case '4': case '5': case '6':
            event.preventDefault();
            return commitEdit(toggleHeading(value, start, end, Number(key)));
          default:
            return;
        }
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        return commitEdit(shiftLines(value, start, end, event.shiftKey ? -1 : 1));
      }

      // Enter 续列表：只在光标未选中时接管，且当前行确实是列表项
      if (event.key === 'Enter' && !event.shiftKey && start === end) {
        const result = continueList(value, start);
        if (result) {
          event.preventDefault();
          commitEdit(result);
        }
      }
    },
    [commitEdit, flush]
  );

  if (error) {
    return (
      <div className="note-root" data-paper={paper} role="alert">
        <p className="note-error-text">{error}</p>
      </div>
    );
  }

  return (
    <div className="note-root" data-paper={paper}>
      <div className="note-bar" data-tauri-drag-region>
        <span className="note-title" data-tauri-drag-region>
          {!loaded ? '加载中…' : statusText(status)}
        </span>
        <button
          type="button"
          data-palette-toggle
          aria-label="选择便签颜色"
          title="选择便签颜色"
          aria-expanded={paletteOpen}
          onClick={() => setPaletteOpen((value) => !value)}
        >
          <Icon icon="tabler:palette" width={16} height={16} />
        </button>
        <button
          type="button"
          aria-label={pinned ? '取消窗口置顶' : '窗口置顶'}
          title={pinned ? '已置顶 · 点击取消' : '置顶窗口'}
          aria-pressed={pinned}
          onClick={togglePinned}
        >
          <Icon icon={pinned ? 'solar:pin-bold' : 'solar:pin-linear'} width={16} height={16} />
        </button>
        <button
          type="button"
          disabled={closing}
          aria-label="保存并关闭浮窗"
          title="保存并关闭（保留书签）"
          onClick={() => void close()}
        >
          <Icon icon={closing ? 'tabler:loader-2' : 'tabler:x'} width={16} height={16} />
        </button>
      </div>

      {paletteOpen && (
        <div className="note-palette" role="group" aria-label="便签颜色">
          {PAPERS.map((item) => (
            <button
              key={item.key}
              type="button"
              className="note-swatch"
              style={{ background: item.color }}
              aria-label={item.label}
              title={item.label}
              aria-pressed={paper === item.key}
              onClick={() => pickPaper(item.key)}
            >
              {paper === item.key && (
                <span className="note-swatch-check">
                  <Icon icon="tabler:check" width={11} height={11} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <textarea
        ref={taRef}
        className="note-input"
        value={content}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={loaded ? '写点什么…' : ''}
        spellCheck={false}
        // 重载场景不抢焦点，避免光标跳到文末把视图拽走
        autoFocus={!initial}
        readOnly={!loaded}
      />
    </div>
  );
});

/* ────────────────────────── 编辑器动作 ────────────────────────── */

/** 选中区（或光标处）加/去 marker。已包过一遍就脱掉，再按一次才重包 */
function toggleWrap(value: string, start: number, end: number, marker: string): EditResult {
  const inner = value.slice(start, end);
  const outerBefore = value.slice(Math.max(0, start - marker.length), start);
  const outerAfter = value.slice(end, end + marker.length);

  // marker 在选区外侧
  if (outerBefore === marker && outerAfter === marker) {
    return {
      value: value.slice(0, start - marker.length) + inner + value.slice(end + marker.length),
      start: start - marker.length,
      end: end - marker.length,
    };
  }
  // marker 被一起选中了
  if (
    inner.length >= marker.length * 2 &&
    inner.startsWith(marker) &&
    inner.endsWith(marker)
  ) {
    const stripped = inner.slice(marker.length, -marker.length);
    return {
      value: value.slice(0, start) + stripped + value.slice(end),
      start,
      end: start + stripped.length,
    };
  }
  const insert = marker + inner + marker;
  const next = value.slice(0, start) + insert + value.slice(end);
  // 无选中时把光标留在两个 marker 中间，方便接着打字
  if (start === end) {
    return { value: next, start: start + marker.length, end: start + marker.length };
  }
  return { value: next, start: start + marker.length, end: end + marker.length };
}

/** `[选中](url)`，并把 url 三个字符选上方便直接覆盖输入 */
function insertLink(value: string, start: number, end: number): EditResult {
  const text = value.slice(start, end) || '链接文字';
  const insert = `[${text}](url)`;
  const urlStart = start + text.length + 3;
  return {
    value: value.slice(0, start) + insert + value.slice(end),
    start: urlStart,
    end: urlStart + 3,
  };
}

/** 选中覆盖到的整段行的起止（含首行行首、末行行尾） */
function blockBounds(value: string, start: number, end: number) {
  const from = value.lastIndexOf('\n', start - 1) + 1;
  let to = value.indexOf('\n', end);
  if (to === -1) to = value.length;
  return { from, to };
}

/** 逐行改写选中覆盖的行，光标保持在改写后的整块上 */
function mapLines(
  value: string,
  start: number,
  end: number,
  fn: (line: string, index: number) => string
): EditResult {
  const { from, to } = blockBounds(value, start, end);
  const block = value.slice(from, to);
  const nextBlock = block.split('\n').map(fn).join('\n');
  return {
    value: value.slice(0, from) + nextBlock + value.slice(to),
    start: from,
    end: from + nextBlock.length,
  };
}

/** ⌘1~6：行首加 N 个 #，同级再按一次取消 */
function toggleHeading(value: string, start: number, end: number, level: number): EditResult {
  const hashes = '#'.repeat(level);
  return mapLines(value, start, end, (line) => {
    const current = line.match(/^(#{1,6})(\s+)/);
    const stripped = current ? line.slice(current[0].length) : line.replace(/^\s+/, '');
    if (current && current[1].length === level) return stripped;
    return `${hashes} ${stripped}`;
  });
}

/** ⌘J：把列表行转成待办项，再按一次还原成普通列表 */
function toggleCheckbox(value: string, start: number, end: number): EditResult {
  return mapLines(value, start, end, (line) => {
    const checked = line.match(/^(\s*)([-*+])\s+\[([ xX])\]\s+/);
    if (checked) return `${checked[1]}${checked[2]} `;
    const bullet = line.match(/^(\s*)([-*+])\s+/);
    if (bullet) return `${bullet[1]}${bullet[2]} [ ] `;
    // 不是列表就先变成列表项
    return `- [ ] ${line.trimStart()}`;
  });
}

/** Tab / ⇧Tab：整块缩进或反缩进两个空格 */
function shiftLines(value: string, start: number, end: number, dir: 1 | -1): EditResult {
  return mapLines(value, start, end, (line) => {
    if (dir === 1) return INDENT + line;
    if (line.startsWith(INDENT)) return line.slice(INDENT.length);
    if (line.startsWith(' ')) return line.slice(1);
    return line.replace(/^\s+/, '');
  });
}

const RE_CHECKBOX = /^(\s*)([-*+])\s+\[([ xX])\]\s+/;
const RE_BULLET = /^(\s*)([-*+])\s+/;
const RE_ORDERED = /^(\s*)(\d+)\.\s+/;

/**
 * Enter：列表换行时自动带上相同前缀；列表项本身是空的（还没写内容）时，
 * 回车表示退出列表 —— 把前缀抹掉留一个空行。
 */
function continueList(value: string, caret: number): EditResult | null {
  const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
  const line = value.slice(lineStart, caret);

  const checked = line.match(RE_CHECKBOX);
  const bullet = checked ? null : line.match(RE_BULLET);
  const ordered = checked || bullet ? null : line.match(RE_ORDERED);

  let prefix: string;
  let body: string;
  if (checked) {
    prefix = `${checked[1]}${checked[2]} [ ] `;
    body = line.slice(checked[0].length);
  } else if (bullet) {
    prefix = `${bullet[1]}${bullet[2]} `;
    body = line.slice(bullet[0].length);
  } else if (ordered) {
    prefix = `${ordered[1]}${Number(ordered[2]) + 1}. `;
    body = line.slice(ordered[0].length);
  } else {
    return null;
  }

  // 空的列表项：退出列表
  if (!body.trim()) {
    return {
      value: value.slice(0, lineStart) + value.slice(caret),
      start: lineStart,
      end: lineStart,
    };
  }

  const insert = `\n${prefix}`;
  const position = caret + insert.length;
  return {
    value: value.slice(0, caret) + insert + value.slice(caret),
    start: position,
    end: position,
  };
}

function statusText(status: SaveStatus): string {
  switch (status) {
    case 'saving': return '正在保存…';
    case 'saved': return '已自动保存';
    case 'error': return '保存失败，请重试';
    default: return ' ';
  }
}

export default DesktopNotePage;
