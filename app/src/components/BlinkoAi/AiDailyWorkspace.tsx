import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { observer } from 'mobx-react-lite';
import { useMediaQuery } from 'usehooks-ts';
import { Icon } from '@/components/Common/Iconify/icons';
import { RootStore } from '@/store';
import { AiStore } from '@/store/aiStore';
import { splitAssistantContent } from './messagePresentation';
import { parseDailyDraft } from '@shared/lib/aiWorkflows';
import { AiDailyResult } from './AiDailyResult';

const WIDTH_KEY = 'ai-daily-workspace-width';
const MIN_WIDTH = 360;
const MAX_WIDTH = 760;
const DEFAULT_WIDTH = 460;

const readWidth = () => {
  const saved = Number(localStorage.getItem(WIDTH_KEY));
  return Number.isFinite(saved) && saved >= MIN_WIDTH ? Math.min(saved, MAX_WIDTH) : DEFAULT_WIDTH;
};

/**
 * 日报工作区（结果区）。
 *
 * 对话区只负责「任务从哪来、过程怎么走」，日报正文与待办变更的确认落到这里，
 * 对话流因此不会被几十行表单撑开。宽度可拖拽并记忆，可一键放大成全屏，
 * 窄屏则始终是全屏浮层。
 */
export const AiDailyWorkspace = observer(({ messageId, onClose }: { messageId: number; onClose: () => void }) => {
  const ai = RootStore.Get(AiStore);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [width, setWidth] = useState(readWidth);
  const [maximized, setMaximized] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // 窄屏本来就是全屏，再给一个放大键只会让人以为还有下一层
  const overlay = isMobile || maximized;

  const message = (ai.currentConversation.value?.messages || []).find(item => item.id === messageId);
  const draft = message ? parseDailyDraft(splitAssistantContent(message.content).answer) : null;

  useEffect(() => { if (!isMobile) localStorage.setItem(WIDTH_KEY, String(width)); }, [width, isMobile]);

  // Esc 优先退出放大，再按一次才关闭工作区 —— 直接关掉会把刚展开的日报一起收走
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (maximized) setMaximized(false);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, maximized]);

  const onMouseMove = useCallback((event: MouseEvent) => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, rect.right - event.clientX)));
  }, []);
  const stopDragging = useCallback(() => {
    dragging.current = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', stopDragging);
  }, [onMouseMove]);
  const startDragging = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    dragging.current = true;
    // 拖拽期间锁住选中与光标，否则会一路选中文本、光标变成 I 型
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', stopDragging);
  }, [onMouseMove, stopDragging]);
  useEffect(() => stopDragging, [stopDragging]);

  const shell = overlay
    ? 'fixed inset-0 z-[10070] flex flex-col bg-background'
    : 'relative z-20 flex shrink-0 flex-col border-l border-default-200 bg-background';

  // 全屏态（窄屏 / 放大）必须 portal 到 body：聊天页的移动端头部是 position:fixed +
  // backdrop-filter，自带层叠上下文且压得住面板内部任意 z-index（实测提到 99999 也无效），
  // 不脱离当前树的话面板自带的关闭键会被完全遮住，窄屏时就再也关不掉了。
  const mount = (node: React.ReactElement) => (overlay ? createPortal(node, document.body) : node);

  // 头部两个键在放大态会并排出现在全屏浮层的右上角，对比度和尺寸要够撑住这个位置。
  // 还原用 tabler:minimize 而不是 tabler:restore —— 后者渲染出来是环形箭头，
  // 读起来像「刷新」，和旁边的关闭键分不清；minimize 与 maximize 正好互为反义。
  const headerActions = (
    <>
      {!isMobile && <button type="button" onClick={() => setMaximized(v => !v)} aria-label={maximized ? '还原工作区' : '放大工作区'}
        aria-pressed={maximized} title={maximized ? '还原工作区' : '放大工作区'}
        className="rounded-md p-1 text-default-500 transition-colors hover:bg-default-100 hover:text-foreground">
        <Icon icon={maximized ? 'tabler:minimize' : 'tabler:maximize'} width="18" height="18" />
      </button>}
      <button type="button" onClick={onClose} aria-label="关闭工作区" title="关闭工作区"
        className="rounded-md p-1 text-default-500 transition-colors hover:bg-danger/10 hover:text-danger">
        <Icon icon="tabler:x" width="18" height="18" />
      </button>
    </>
  );

  if (!draft) return mount(<div className={overlay ? 'fixed inset-0 z-[10070] bg-background' : 'shrink-0'} style={overlay ? undefined : { width }}>
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-default-200 px-4 py-3">
        <span className="text-sm font-medium">日报工作区</span>
        <div className="ml-auto flex items-center gap-1">{headerActions}</div>
      </header>
      <div className="px-4 py-3 text-sm text-default-500">找不到这条日报草稿，可能已不在当前会话中。</div>
    </div>
  </div>);

  return mount(<div
    ref={panelRef}
    role="complementary"
    aria-label="日报工作区"
    className={shell}
    style={overlay ? undefined : { width }}
  >
    {!overlay && <div
      role="separator"
      aria-label="拖拽调整工作区宽度"
      aria-orientation="vertical"
      onMouseDown={startDragging}
      className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize"
    ><div className="mx-auto h-full w-px transition-colors hover:bg-primary/40" /></div>}

    <header className="flex shrink-0 items-center gap-2 border-b border-default-200 px-4 py-3">
      <Icon icon="tabler:layout-columns" width="16" height="16" className="shrink-0 text-default-400" />
      <span className="text-sm font-medium">日报工作区</span>
      {draft.actions.length > 0 && <span className="text-xs text-default-400">{draft.actions.length} 项变更</span>}
      <div className="ml-auto flex items-center gap-1">{headerActions}</div>
    </header>

    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
      <AiDailyResult draft={draft} messageId={messageId} initialSaved={(message?.metadata as any)?.dailySaved} />
    </div>
  </div>);
});
