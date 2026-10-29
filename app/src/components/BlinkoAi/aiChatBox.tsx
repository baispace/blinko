import { Icon } from '@/components/Common/Iconify/icons';
import { observer } from "mobx-react-lite";
import { Button, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Popover, PopoverTrigger, PopoverContent } from "@heroui/react";
import { ScrollArea } from "../Common/ScrollArea";
import { AnimatePresence } from "framer-motion";
import { MarkdownRender } from "../Common/MarkdownRender";
import { AiStore, AssisantMessageMetadata } from "@/store/aiStore";
import { RootStore } from "@/store";
import { useEffect, useRef, useCallback, memo, useState } from "react";
import copy from "copy-to-clipboard";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import i18n from "@/lib/i18n";
import { BlinkoStore } from "@/store/blinkoStore";
import { NoteType } from "@shared/lib/types";
import { AiProcessDetails } from "./AiProcessDetails";
import { AiTurnRail, type AiTurnMarker } from "./AiTurnRail";
import { splitAssistantContent } from "./messagePresentation";
import { useMediaQuery } from "usehooks-ts";
import { Textarea } from "@heroui/react";
import { api } from '@/lib/trpc';
import { getBlinkoEndpoint } from '@/lib/blinkoEndpoint';

import { AiDraftResult, parseDraft } from './AiDraftResult';
import { AiDailyResult } from './AiDailyResult';
import { parseDailyDraft } from '@shared/lib/aiWorkflows';
import { ViewportItem } from '../Common/ViewportItem';
import './aiChat.css';

/** 轮次导航 tooltip 用的一行摘要 */
const turnSummary = (raw: string) =>
  (raw || '').replace(/[#*`>_-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || '（空消息）';

const ChatAction = ({ label, icon, onClick, disabled = false }: { label: string; icon: string; onClick: () => void; disabled?: boolean }) => (
  <button type="button" className="ai-chat-action" onClick={onClick} disabled={disabled} aria-label={label} title={label}>
    <Icon icon={icon} width={15} /><span>{label}</span>
  </button>
);

const UserMessage = memo(({ content, time, id, onEdit, sources = [], workflowTitle, shareMode = false, busy = false }: {
  content: string; time: string; sources?: any[]; workflowTitle?: string; id?: number; onEdit?: (id: number, content: string) => Promise<boolean>; shareMode?: boolean; busy?: boolean;
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!id || !draft.trim() || saving || busy) return;
    setSaving(true);
    try { if (await onEdit?.(id, draft.trim())) setEditing(false); }
    finally { setSaving(false); }
  };
  return <article className="ai-user-turn group">
    <div className="ai-turn-heading justify-end">{workflowTitle && <span>{workflowTitle}</span>}<span>你</span><time title={time}>{time}</time></div>
    {editing ? <div className="ai-message-edit">
      <Textarea aria-label="修改消息内容" autoFocus minRows={4} maxRows={14} value={draft} onValueChange={setDraft} isDisabled={saving}
        onKeyDown={event => { if (event.key === 'Escape' && !saving) setEditing(false); if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void submit(); } }} />
      <p className="text-xs text-default-500 leading-5 mt-3">提交后将替换本条消息及其后的对话，重新生成回复。若后续结果已保存，请通过新消息修正，避免重复创建。</p>
      <div className="flex justify-end gap-2 mt-3"><Button size="sm" variant="light" isDisabled={saving} onPress={() => setEditing(false)}>取消</Button>
        <Button size="sm" color="primary" isLoading={saving} isDisabled={busy || !draft.trim() || draft.trim() === content.trim()} onPress={submit}>修改并重新生成</Button></div>
    </div> : <>
      <div className="ai-user-bubble">{content.length > 900 ? <details><summary>{content.slice(0, 220)}… <span className="text-default-400">展开完整消息</span></summary><div className="mt-3 max-h-80 overflow-auto">{content}</div></details> : content}</div>
      {!!sources.length && <details className="ai-user-sources"><summary>引用了 {sources.length} 条历史内容</summary><div className="flex flex-wrap gap-1.5 justify-end mt-2 max-h-40 overflow-auto">{sources.map(source => <a key={source.id} href={`/detail?id=${source.id}`} target="_blank" rel="noreferrer" className="text-xs text-default-500 rounded-md bg-default-100 px-2 py-1">{String(source.metadata?.title || source.content?.split('\n')[0] || `内容 #${source.id}`).replace(/^#+\s*/, '').slice(0,40)}</a>)}</div></details>}
      {!!id && !shareMode && <div className="ai-message-actions justify-end">
        <ChatAction label="修改" icon="tabler:pencil" disabled={busy} onClick={() => { setDraft(content); setEditing(true); }} />
        <ChatAction label="复制" icon="tabler:copy" onClick={() => { copy(content); RootStore.Get(ToastPlugin).success('已复制'); }} />
      </div>}
    </>}
  </article>;
});

const AiMessage = memo(({ content, id, metadata, shareMode = false, isStreaming = false, busy = false, canRegenerate = false }:
  { content: string; id?: number; metadata?: AssisantMessageMetadata; shareMode?: boolean; isStreaming?: boolean; busy?: boolean; canRegenerate?: boolean; withoutAnimation?: boolean; withStreamAnimation?: boolean }) => {
  const presented = splitAssistantContent(content);
  const answer = presented.answer;
  const daily = parseDailyDraft(answer);
  const draft = parseDraft(answer);
  const resultKind = metadata?.resultKind || daily?.kind || draft?.kind || answer.match(/^\s*(?:```json\s*)?\{\s*"kind"\s*:\s*"(note|tasks|daily)"/)?.[1];
  const [saving, setSaving] = useState(false);
  const malformedDaily = resultKind === 'daily' && !daily && /^\s*(?:```|\{)/.test(answer);
  const [savedType, setSavedType] = useState<string>('');
  const copyContent = daily ? `${daily.title}\n\n${daily.content}\n\n待办变更建议：\n${daily.actions.map(action => `- ${action.action === 'create' ? '新增' : `更新 #${action.taskId}`}：${action.title || ''}；${action.reason}`).join('\n')}` : draft?.kind === 'note' ? `${draft.title}\n\n${draft.content}` : draft?.kind === 'tasks' ? draft.tasks.map((task: any) => `- ${task.title}\n  ${task.description}`).join('\n') : answer;
  const status = metadata?.responseStatus;
  const save = async (type: NoteType) => {
    if (saving || !answer.trim()) return;
    setSaving(true);
    try { await api.notes.upsert.mutate({ content: answer, type }); RootStore.Get(BlinkoStore).refreshData(); setSavedType(type === NoteType.NOTE ? '笔记' : '闪念'); RootStore.Get(ToastPlugin).success('已保存'); }
    catch { RootStore.Get(ToastPlugin).error('保存失败，请重试'); }
    finally { setSaving(false); }
  };
  const share = async () => {
    const conversation = RootStore.Get(AiStore).currentConversation.value;
    if (!conversation) return;
    try {
      await api.conversation.toggleShare.mutate({ id: conversation.id, isShare: true });
      copy(getBlinkoEndpoint(`/ai-share/${btoa(`blinko-ai-share-${conversation.id}`)}`));
      RootStore.Get(ToastPlugin).success('分享链接已复制');
    } catch { RootStore.Get(ToastPlugin).error('分享失败，请重试'); }
  };
  if (!content && !metadata?.toolCalls?.length && !status && !isStreaming) return null;
  return <article className="ai-assistant-turn group">
    <div className="ai-turn-heading"><span className="ai-assistant-badge"><Icon icon="tabler:sparkles" width={14} /></span><span>AI 助手</span>
      {isStreaming && <span className="ai-generating-label" role="status">正在生成…</span>}
    </div>
    <AiProcessDetails process={presented.process} toolCalls={metadata?.toolCalls} toolResults={metadata?.toolResults} running={isStreaming} />
    {!!metadata?.notes?.length && <details className="ai-source-details"><summary>参考了 {metadata.notes.length} 条内容</summary><div className="mt-2 flex flex-wrap gap-2">
      {metadata.notes.map(note => <a className="text-primary text-xs rounded-md bg-primary/5 px-2 py-1" key={note.id} href={`/detail?id=${note.id}`} target="_blank" rel="noreferrer">{String((note.metadata as any)?.title || note.content?.split('\n')[0] || `内容 ${note.id}`).slice(0, 64)}</a>)}
    </div></details>}
    <div className="ai-answer-body">
      {resultKind && (isStreaming || (!id && busy)) ? <div className="ai-artifact-pending" role="status"><Icon icon="tabler:file-text" width={22} /><div><p className="text-sm font-medium">{resultKind === 'daily' ? '正在整理日报与待办变更…' : resultKind === 'note' ? '正在整理笔记草稿…' : '正在提取待办事项…'}</p><p className="text-xs text-default-500 mt-1">完成后可编辑、确认并保存</p></div></div> : daily && !shareMode && !isStreaming && !!id && status !== 'stopped' && status !== 'error' ? <AiDailyResult key={id} draft={daily} messageId={id} initialSaved={(metadata as any)?.dailySaved} /> : !shareMode && !isStreaming && !!id && draft && status !== 'stopped' && status !== 'error'
        ? <AiDraftResult key={id} draft={draft} messageId={id} initialSaved={(metadata as any)?.savedDrafts} />
        : malformedDaily ? <p role="alert" className="text-sm text-default-500">日报结构未生成完整或包含无效任务变更，暂不能同步。请重新生成；原始内容可复制保留。</p> : resultKind && !draft && !daily && (status === 'stopped' || status === 'error')
          ? <p className="text-sm text-default-500">草稿尚未生成完整，可以继续回答或重新生成。</p>
          : <MarkdownRender content={daily ? `## ${daily.title}\n\n${daily.content}` : draft ? (draft.kind === 'note' ? `## ${draft.title}\n\n${draft.content}` : draft.tasks.map((item: any) => `- ${item.title}\n  ${item.description}`).join('\n')) : answer} largeSpacing={false} variant="chat" />}
    </div>
    {(status === 'stopped' || status === 'error') && !isStreaming && <div className="ai-response-notice" role="status"><Icon icon={status === 'stopped' ? 'tabler:player-stop' : 'tabler:alert-circle'} width={14} />{status === 'stopped' ? (answer ? '已停止生成 · 已保留当前内容' : '已停止生成') : '回复未完成 · 当前内容已保留'}</div>}
    {!shareMode && !isStreaming && <div className="ai-message-actions">
      {!!answer.trim() && <ChatAction label="复制" icon="tabler:copy" onClick={() => { copy(copyContent); RootStore.Get(ToastPlugin).success('已复制'); }} />}
      {!draft && !daily && resultKind !== 'daily' && !!answer.trim() && <Dropdown placement="top-start"><DropdownTrigger><Button size="sm" variant="light" radius="sm" className="ai-chat-action" isLoading={saving} isDisabled={saving || !!savedType} aria-label="将回复保存为内容"><Icon icon="tabler:bookmark" width={15} />{saving ? '保存中…' : savedType ? `已存为${savedType}` : '保存为'}<Icon icon="tabler:chevron-down" width={12} /></Button></DropdownTrigger>
        <DropdownMenu aria-label="保存回复" onAction={key=>void save(key==='note'?NoteType.NOTE:NoteType.BLINKO)}><DropdownItem key="note" startContent={<Icon icon="tabler:notes" width={16}/>}>保存为笔记</DropdownItem><DropdownItem key="flash" startContent={<Icon icon="tabler:bolt" width={16}/>}>保存为闪念</DropdownItem></DropdownMenu></Dropdown>}
      {!!id && canRegenerate && <ChatAction label={status === 'error' ? '重试' : '重新生成'} icon="tabler:refresh" disabled={busy} onClick={() => void RootStore.Get(AiStore).regenerate(id)} />}
      {status === 'stopped' && canRegenerate && !!answer.trim() && <ChatAction label="继续回答" icon="tabler:player-play" disabled={busy} onClick={() => { const store = RootStore.Get(AiStore); store.input = '请接着上一条未完成的回复继续回答，避免重复已输出的内容。'; void store.onInputSubmit(); }} />}
      <Popover placement="top-start"><PopoverTrigger><button type="button" className="ai-chat-action" aria-label="更多回复操作"><Icon icon="tabler:dots" width={16} /></button></PopoverTrigger>
        <PopoverContent className="items-stretch p-2 gap-1"><ChatAction label="分享整个对话" icon="tabler:share" disabled={busy} onClick={() => void share()} />
          {!!metadata?.usage?.totalTokens && <p className="text-xs text-default-400 px-2 py-1">用量 {metadata.usage.totalTokens} tokens{metadata.fristCharDelay ? ` · 首字 ${metadata.fristCharDelay}ms` : ''}</p>}
        </PopoverContent></Popover>
    </div>}
  </article>;
});

// Streaming message component with throttled rendering to reduce MarkdownRender updates
const StreamingAiMessage = observer(({ shareMode = false }: { shareMode?: boolean }) => {
  const aiStore = RootStore.Get(AiStore);
  const content = aiStore.currentMessageResult.content;
  const metadata = aiStore.currentMessageResult;
  const id = aiStore.currentMessageResult.id;

  // Throttled content for markdown rendering
  const [throttledContent, setThrottledContent] = useState('');
  const lastUpdateRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const now = Date.now();
    // Update every 80ms to balance smoothness and performance
    if (now - lastUpdateRef.current >= 80) {
      setThrottledContent(content);
      lastUpdateRef.current = now;
    } else {
      // Ensure final content gets rendered
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        setThrottledContent(content);
        lastUpdateRef.current = Date.now();
      });
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [content]);

  // Ensure complete content is displayed when streaming ends
  useEffect(() => {
    if (!aiStore.isAnswering && content) {
      setThrottledContent(content);
    }
  }, [aiStore.isAnswering, content]);

  if (!throttledContent && !metadata.toolCalls.length && !metadata.responseStatus) return null;

  return (
    <AiMessage
      content={throttledContent}
      withStreamAnimation
      metadata={metadata}
      id={id}
      shareMode={shareMode}
      isStreaming={aiStore.isAnswering}
      busy={aiStore.isAnswering || aiStore.isPreparing}
      canRegenerate={!!id}
    />
  );
});

export const BlinkoChatBox = observer(({ shareMode = false }: { shareMode?: boolean } = {}) => {
  const aiStore = RootStore.Get(AiStore)
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomAnchorRef = useRef<HTMLDivElement>(null)
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [showJump, setShowJump] = useState(false);

  // 轮次导航轨：marker 位置随文档高度变化，active 随滚动变化
  const [markers, setMarkers] = useState<AiTurnMarker[]>([]);
  const [activeTurn, setActiveTurn] = useState(0);
  const turnNodesRef = useRef<HTMLElement[]>([]);
  const activeTurnRef = useRef(0);

  // Refs for tracking scroll state
  const shouldAutoScrollRef = useRef(true)
  const lastContentLengthRef = useRef(0)
  const lastScrollTopRef = useRef(0)
  const rafIdRef = useRef<number | null>(null)

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (containerRef.current && shouldAutoScrollRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [])

  // Use IntersectionObserver to detect if bottom anchor is visible
  useEffect(() => {
    const bottomAnchor = bottomAnchorRef.current
    const container = containerRef.current
    if (!bottomAnchor || !container) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry.isIntersecting) {
          // Bottom anchor visible, resume auto-scroll
          shouldAutoScrollRef.current = true
        }
      },
      {
        root: container,
        threshold: 0.1,
      }
    )

    observer.observe(bottomAnchor)
    return () => observer.disconnect()
  }, [])

  // 当前轮次 = 最后一个已经滚过顶部的用户轮次。
  // 滚动处理和重新测量都要用它：切换会话时 scroll 事件可能早于轮次测量触发，
  // 只挂在 scroll 上会让初始高亮停在第 1 轮。
  const syncActiveTurn = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const currentScrollTop = container.scrollTop;
    let active = 0;
    for (let index = 0; index < turnNodesRef.current.length; index++) {
      if (turnNodesRef.current[index].offsetTop - 120 <= currentScrollTop) active = index;
      else break;
    }
    if (active !== activeTurnRef.current) {
      activeTurnRef.current = active;
      setActiveTurn(active);
    }
  }, [])

  // Handle scroll event - detect upward scroll to stop auto-scrolling
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const currentScrollTop = container.scrollTop

    // User scrolled up more than 10px, stop auto-scroll
    if (currentScrollTop < lastScrollTopRef.current - 10) {
      shouldAutoScrollRef.current = false
    }

    syncActiveTurn();

    const nearBottom = container.scrollHeight - currentScrollTop - container.clientHeight < 90;
    setShowJump(!nearBottom);
    if (nearBottom) shouldAutoScrollRef.current = true;
    lastScrollTopRef.current = currentScrollTop
  }, [syncActiveTurn])


  // 重新测量每一轮在可滚动文档中的位置，驱动左侧导航轨
  const measureTurns = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const nodes = Array.from(container.querySelectorAll<HTMLElement>('[data-ai-turn]'));
    turnNodesRef.current = nodes;
    const total = Math.max(1, container.scrollHeight);
    setMarkers(nodes.map(node => ({
      index: Number(node.dataset.aiTurn ?? 0),
      ratio: Math.min(1, Math.max(0, node.offsetTop / total)),
      label: node.dataset.aiTurnLabel || '',
      time: node.dataset.aiTurnTime || '',
    })));
    syncActiveTurn();
  }, [syncActiveTurn]);

  // 跳到指定轮次：手动跳转时关掉自动滚动，否则会被流式输出立刻拽回底部
  const scrollToTurn = useCallback((index: number) => {
    const container = containerRef.current;
    const node = turnNodesRef.current[index];
    if (!container || !node) return;
    shouldAutoScrollRef.current = false;
    container.scrollTo({ top: Math.max(0, node.offsetTop - 12), behavior: 'smooth' });
  }, []);


  // Watch message list changes - scroll on new messages
  useEffect(() => {
    const messagesCount = aiStore.currentConversation.value?.messages?.length || 0
    if (messagesCount > 0) {
      scrollToBottom()
    }
  }, [aiStore.currentConversation.value?.messages?.length, scrollToBottom])

  // Watch streaming content changes - throttle scroll with RAF
  useEffect(() => {
    const currentLength = aiStore.currentMessageResult.content.length

    if (currentLength > lastContentLengthRef.current && shouldAutoScrollRef.current) {
      // Cancel previous RAF to avoid duplicate scrolls
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
      }
      rafIdRef.current = requestAnimationFrame(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight
        }
      })
    }

    lastContentLengthRef.current = currentLength

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [aiStore.currentMessageResult.content.length])

  useEffect(() => {
    if (aiStore.isAnswering && aiStore.currentConversation.value?.messages.at(-1)?.role === 'user') {
      shouldAutoScrollRef.current = true; scrollToBottom();
    }
  }, [aiStore.currentConversation.value?.messages.at(-1)?.id]);

  // Reset state when switching conversations
  useEffect(() => {
    shouldAutoScrollRef.current = true
    lastContentLengthRef.current = 0
    lastScrollTopRef.current = 0
    activeTurnRef.current = 0
    setActiveTurn(0)
    setTimeout(scrollToBottom, 50)
  }, [aiStore.currentConversationId, scrollToBottom])

  // 消息条数变化后重新量一次（新增轮次）
  useEffect(() => {
    const raf = requestAnimationFrame(measureTurns);
    return () => cancelAnimationFrame(raf);
  }, [aiStore.currentConversation.value?.messages?.length, measureTurns])

  // 正文高度变化（流式输出、Markdown 渲染、图片加载、字体切换）后重新量
  useEffect(() => {
    const transcript = containerRef.current?.querySelector('.ai-chat-transcript');
    if (!transcript || typeof ResizeObserver === 'undefined') return;
    let timer: number | undefined;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measureTurns, 300);
    });
    observer.observe(transcript);
    return () => { window.clearTimeout(timer); observer.disconnect(); };
  }, [measureTurns])

  useEffect(() => {
    window.addEventListener('resize', measureTurns);
    return () => window.removeEventListener('resize', measureTurns);
  }, [measureTurns]);

  const handleEditMessage = async (id: number, content: string) => {
    if (shareMode) return false;
    return await aiStore.editUserMessage(id, content);
  }

  const hasDailyResult = aiStore.currentMessageResult.resultKind === 'daily' || !!aiStore.currentConversation.value?.messages.some(message => message.role === 'assistant' && !!parseDailyDraft(message.content));

  // Get the first message time for header display
  const firstMessageTime = aiStore.currentConversation.value?.messages?.[0]?.createdAt?.toLocaleString() || '';

  return (
    <div className="relative h-full w-full">
    <div
      ref={containerRef}
      onScroll={handleScroll}
      data-scroll-viewport
      className="ai-chat-scroll h-full overflow-y-auto overflow-x-hidden"
    >

      {/* Mobile top spacing */}
      {isMobile && <div className="h-16"></div>}

      <div className={`ai-chat-transcript flex flex-col relative min-h-full mx-auto${hasDailyResult ? ' ai-chat-with-daily' : ''}`}>
        {/* Flex spacer */}
        <div className="flex-grow" />

        {!shareMode && aiStore.currentConversation.value?.nextMessageCursor && <button type="button" disabled={aiStore.olderMessagesLoading || aiStore.isAnswering || aiStore.isPreparing} className="mx-auto rounded-lg px-3 py-2 text-xs text-default-500 hover:bg-default-100 disabled:opacity-50" onClick={async () => {
          const container = containerRef.current; if (!container) return;
          shouldAutoScrollRef.current = false;
          const before = container.scrollHeight; const top = container.scrollTop;
          await aiStore.loadOlderMessages();
          requestAnimationFrame(() => { container.scrollTop = top + container.scrollHeight - before; });
        }}>{aiStore.olderMessagesLoading ? '正在加载…' : '加载更早的消息'}</button>}
        {/* Chat time header */}
        {firstMessageTime && (
          <div className="text-center text-desc mb-4 text-xs">
            {firstMessageTime}
          </div>
        )}

        <AnimatePresence>
          {
            (() => {
              const systemMessage = aiStore.currentConversation.value?.messages.find((item) => item.role == 'system');
              return systemMessage && systemMessage.content !== '[Request interrupted by user]' && (
                <div
                  key="system-message"
                  className="mx-auto text-desc text-xs text-center font-bold select-none line-clamp-1 p-3 border-2 border-ignore rounded-lg"
                >
                  {systemMessage.content}
                </div>
              );
            })()
          }
          {
            (() => {
              // 用户轮次编号：导航轨按"第 N 轮提问"计数，助手回复不占号
              let turn = -1;
              return aiStore.currentConversation.value?.messages.map((item, index) => {
                if (item.role == 'user') turn += 1;
                const turnIndex = turn;
                return item.role == 'user' ? (
                  <div key={`user-${item.id ?? index}`} data-ai-turn={turnIndex}
                    data-ai-turn-label={turnSummary((item.metadata as any)?.displayContent || item.content)}
                    data-ai-turn-time={item.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}>
                    <ViewportItem disabled initial={index >= (aiStore.currentConversation.value?.messages.length || 0) - 6} estimate={140}><UserMessage
                      content={(item.metadata as any)?.displayContent || item.content}
                      sources={(item.metadata as any)?.sources || []}
                      workflowTitle={(item.metadata as any)?.workflow?.title}
                      time={item.createdAt.toLocaleString()}
                      id={item.id}
                      onEdit={handleEditMessage}
                      busy={aiStore.isAnswering || aiStore.isPreparing}
                      shareMode={shareMode}
                    /></ViewportItem>
                  </div>
                ) : item.role == 'assistant' ? (
                  <ViewportItem disabled={!!parseDailyDraft(item.content) || !!parseDraft(item.content)} key={`assistant-${item.id ?? index}`} initial={index >= (aiStore.currentConversation.value?.messages.length || 0) - 6} estimate={320}><AiMessage
                    id={item.id}
                    metadata={item.metadata as AssisantMessageMetadata}
                    content={item.content}
                    busy={aiStore.isAnswering || aiStore.isPreparing}
                    canRegenerate={!aiStore.currentMessageResult.id && item.id === aiStore.currentConversation.value?.messages.at(-1)?.id}
                    shareMode={shareMode}
                  /></ViewportItem>
                ) : null;
              });
            })()
          }

          {/* Loading: Show only when last message is from user and AI is answering but has no content yet */}
          {
            aiStore.isAnswering &&
            !aiStore.currentMessageResult.content &&
            aiStore.currentConversation.value?.messages?.at(-1)?.role === 'user' && (
              <Icon key="answer-loading" className="text-desc" icon="eos-icons:three-dots-loading" width="40" height="40" />
            )
          }


          <StreamingAiMessage key="streaming-message" shareMode={shareMode} />
        </AnimatePresence>

        {!shareMode && aiStore.chatStatus === 'stopping' && <div className="ai-response-notice" role="status">正在停止，保留已生成内容…</div>}
        {!shareMode && aiStore.chatStatus === 'error' && <div className="ai-chat-error" role="alert"><span>{aiStore.chatError || '生成失败，请重试'}</span><button type="button" disabled={aiStore.isPreparing || aiStore.isAnswering} onClick={() => void aiStore.retryLastResponse()}>重试回复</button></div>}
        {/* Bottom anchor for scroll detection */}
        <div ref={bottomAnchorRef} className="h-4" />
      </div>
    </div>
    {!shareMode && <AiTurnRail markers={markers} activeIndex={activeTurn} onSelect={scrollToTurn} />}
    {showJump && <button type="button" className="ai-jump-latest" onClick={() => { shouldAutoScrollRef.current = true; scrollToBottom(); setShowJump(false); }}><Icon icon="tabler:arrow-down" width={15} />回到最新</button>}
    </div>
  )
})
