import { workflows, hasSavedWorkflowResult } from '@shared/lib/aiWorkflows';
import type { WorkflowKey } from '@shared/lib/aiWorkflows';
import { cleanConversationTitle } from '@shared/lib/conversationTitle';
import { _ } from '@/lib/lodash';
import { Store } from './standard/base';
import { ToastPlugin } from './module/Toast/Toast';
import { RootStore } from './root';
import { api, streamApi } from '@/lib/trpc';
import { StorageListState } from './standard/StorageListState';
import { GlobalConfig, Note } from '@shared/lib/types';
import { makeAutoObservable } from 'mobx';
import { BlinkoStore } from './blinkoStore';
import { eventBus } from '@/lib/event';
import { PromiseCall, PromisePageState, PromiseState } from './standard/PromiseState';
import { DialogStore } from './module/Dialog';
import { Image } from '@heroui/react';
import { AiTag } from '@/components/BlinkoAi/aiTag';
import i18n from '@/lib/i18n';
import { AiEmoji } from '@/components/BlinkoAi/aiEmoji';
import { StorageState } from './standard/StorageState';
import { BlinkoItem } from '@/components/BlinkoCard';
import { AiSettingStore, ModelCapabilities, AiProvider, AiModel, ProviderModel } from './aiSettingStore';


type Chat = {
  content: string;
  role: 'user' | 'system' | 'assistant';
  createAt: number;
  relationNotes?: Note[];
};

type WriteType = 'expand' | 'polish' | 'custom';
export type AssisantMessageMetadata = {
  resultKind?: 'note' | 'tasks' | 'daily';
  responseStatus?: 'completed' | 'stopped' | 'error';
  notes?: BlinkoItem[];
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  fristCharDelay?: number;
};
export type ToolCall = {
  toolCallId: string;
  toolName: string;
  args: any;
};

export type ToolResult = {
  toolCallId: string;
  toolName: string;
  args: any;
  result: any;
};

export type currentMessageResult = AssisantMessageMetadata & {
  toolcall: string[];
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  content: string;
  id?: number;
};

export class AiStore implements Store {
  sid = 'AiStore';
  constructor() {
    makeAutoObservable(this);
    eventBus.on('user:signout', () => {
      this.clear();
    });
  }

  selectedProviderId = 0;
  chatModelId = 0;
  selectedSkill: { title: string; prompt: string; key: WorkflowKey; scope?: { from?: string; to?: string; includeNotes?: boolean; read?: boolean; limited?: boolean; sourceCount?: number } } | null = null;
  isChatting = false;
  isAnswering = false;
  isPreparing = false;
  chatStatus: 'idle' | 'preparing' | 'generating' | 'stopping' | 'stopped' | 'error' | 'completed' = 'idle';
  chatError = '';
  private chatStopRequested = false;
  input = '';
  withRAG = new StorageState({ key: 'withRAG', value: true, default: true });
  withTools = new StorageState({ key: 'withTools', value: false, default: false });
  withOnline = new StorageState({ key: 'withOnline', value: false, default: false });
  referencesNotes: BlinkoItem[] = [];
  currentMessageResult: currentMessageResult = {
    id: 0,
    notes: [],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    fristCharDelay: 0,
    toolcall: [],
    toolCalls: [],
    toolResults: [],
    content: '',
  };

  chatCapabilities = new PromiseState({
    function: async () => api.ai.chatCapabilities.query({ modelId: this.chatModelId || undefined }),
  });

  currentConversationId = 0;
  currentConversation = new PromiseState({
    function: async () => {
      if (!this.currentConversationId) return null;
      const res = await api.conversation.detail.query({ id: this.currentConversationId });
      return res;
    },
  });

  conversactionList = new PromisePageState({
    function: async ({ page, size }) => {
      const res = await api.conversation.list.query({
        page,
        size,
      });
      return res;
    },
  });

  onInputSubmit = async (isRegenerate = false) => {
    if (this.isAnswering || this.isPreparing) return;
    this.isPreparing = true;
    this.chatStatus = 'preparing';
    this.chatError = '';
    this.chatStopRequested = false;
    this.aiChatabortController = new AbortController();
    try {
      const available = await api.ai.chatCapabilities.query({ modelId: this.chatModelId || undefined });
      this.chatCapabilities.setValue(available);
      if (!available.canChat) {
        RootStore.Get(ToastPlugin).error('请先配置对话模型，或选择一个已配置的模型。');
        return;
      }
      if (this.selectedSkill && !this.referencesNotes.length && !this.input.trim()) {
        RootStore.Get(ToastPlugin).error('请先选择要整理的内容，或输入一段内容。');
        return;
      }
      if (!this.selectedSkill && !this.input.trim() && !this.referencesNotes.length) return;
      if (this.selectedSkill?.key === 'practice' && !this.referencesNotes.length) { RootStore.Get(ToastPlugin).error('请先引用要练习或复盘的文章'); return; }
      if (this.selectedSkill?.key === 'daily' && !this.input.trim()) { RootStore.Get(ToastPlugin).error('请补充昨日进展、今日计划或遇到的问题'); return; }
      if (['daily','weekly'].includes(this.selectedSkill?.key || '') && !this.selectedSkill?.scope?.read) { RootStore.Get(ToastPlugin).error('请先读取待办来源，确认时间范围'); return; }
      const displayContent = this.input.trim() || this.selectedSkill?.title || '整理引用内容';
      const sourceContext = {
        displayContent,
        workflow: this.selectedSkill ? { key: this.selectedSkill.key, title: this.selectedSkill.title, ...this.selectedSkill.scope } : undefined,
        sources: this.referencesNotes.map(note => ({ id: note.id, type: note.type, content: note.content, metadata: note.metadata, isArchived: note.isArchived, updatedAt: note.updatedAt ? new Date(note.updatedAt).toISOString() : null })),
      };
      const scopeText = this.selectedSkill?.scope ? `统计范围：${JSON.stringify(this.selectedSkill.scope)}；当前日期：${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date())}。时区 Asia/Shanghai。` : '';
      const conversationTitle = cleanConversationTitle(this.selectedSkill?.title || this.input, '新对话');
      const userQuestion = [this.selectedSkill?.prompt, scopeText, this.input.trim(),
        ...this.referencesNotes.map(note => `用户确认的来源 #${note.id}（类型 ${note.type}，创建 ${note.createdAt}，更新 ${note.updatedAt}，状态 ${note.type === 2 ? note.isArchived ? '已完成' : '未完成' : note.isArchived ? '已归档' : '正常'}）：\n${note.content}\n任务信息：${JSON.stringify(note.metadata ?? {})}`)
      ].filter(Boolean).join('\n\n');
      const resultKind = this.selectedSkill?.key === 'daily' ? 'daily' : this.selectedSkill?.key === 'note' || this.selectedSkill?.key === 'weekly' ? 'note' : this.selectedSkill?.key === 'tasks' ? 'tasks' : undefined;
      this.referencesNotes = [];
      this.selectedSkill = null;
      this.clearCurrentMessageResult();
      this.currentMessageResult.resultKind = resultKind;
      this.input = '';
      this.isChatting = true;
      this.isAnswering = true;
      this.chatStatus = 'generating';
      if (this.currentConversationId == 0) {
        const conversation = await api.conversation.create.mutate({ title: conversationTitle });
        void this.conversactionList.resetAndCall({});
        this.currentConversationId = conversation.id;
      }

      if (this.currentConversationId != 0) {
        if (!isRegenerate) {
          await api.message.create.mutate({
            conversationId: this.currentConversationId,
            content: userQuestion,
            role: 'user',
            metadata: sourceContext
          });
        }

        //update conversation message list
        await this.currentConversation.call();

        const filteredChatConversation = [...(this.currentConversation.value?.messages?.slice(0, -1) || [])];
        const startTime = Date.now();
        let isFristChunk = true;
        this.currentMessageResult.fristCharDelay = 0;
        const res = await streamApi.ai.completions.mutate(
          {
            question: userQuestion,
            modelId: this.chatModelId || undefined,
            conversations: filteredChatConversation,
            withRAG: available.rag && !!this.withRAG.value,
            withTools: available.tools && !!this.withTools.value,
            withOnline: available.online && !!this.withOnline.value,
          },
          { signal: this.aiChatabortController.signal },
        );

        for await (const item of res) {
          if (this.chatStopRequested) break;
          if (item.chunk?.type == 'error') {
            //@ts-ignore
            const errorMessage = item.chunk?.error?.message || item.chunk?.error?.name || 'AI 服务调用失败';
            throw new Error(errorMessage);
          }
          if (item.chunk?.type == 'tool-call') {
            this.currentMessageResult.toolcall.push(`${item.chunk.toolName}`);
            // Add to new tool calls array for detailed display
            this.currentMessageResult.toolCalls.push({
              toolCallId: item.chunk.toolCallId,
              toolName: item.chunk.toolName,
              args: item.chunk.args
            });
          }
          if (item.chunk?.type == 'tool-result') {
            // Add tool result for detailed display
            this.currentMessageResult.toolResults.push({
              toolCallId: item.chunk.toolCallId,
              toolName: item.chunk.toolName,
              args: item.chunk.args,
              result: item.chunk.result
            });
          }
          if (item.chunk?.type == 'finish') {
            this.currentMessageResult.usage = item?.chunk?.usage;
          }
          if (item.notes) {
            this.currentMessageResult.notes = item.notes;
          } else {
            if (item.chunk.type == 'text-delta') {
              if (isFristChunk) {
                this.currentMessageResult.fristCharDelay = Date.now() - startTime;
                isFristChunk = false;
              }
              this.currentMessageResult.content += item.chunk.textDelta;
            }
          }
        }
        this.isAnswering = false;
        const newAssisantMessage = await this.persistChatResponse(this.chatStopRequested ? 'stopped' : 'completed');

        if (this.currentConversation.value?.messages?.length && this.currentConversation.value?.messages?.length < 3) {
          void api.ai.summarizeConversationTitle.mutate({
            conversations: this.currentConversation.value?.messages ?? [],
            conversationId: this.currentConversationId,
          }).then(() => this.conversactionList.resetAndCall({})).catch(() => {});
        }
        this.currentMessageResult.id = newAssisantMessage.id;
        this.chatStatus = this.chatStopRequested ? 'stopped' : 'completed';
        // await this.currentConversation.call()
        this.isAnswering = false;
        // this.clearCurrentMessageResult()
      }
    } catch (error) {
      const stopped = this.chatStopRequested;
      this.chatStatus = stopped ? 'stopped' : 'error';
      this.chatError = stopped ? '' : (error instanceof Error ? error.message : '生成失败，请重试');
      this.currentMessageResult.responseStatus = stopped ? 'stopped' : 'error';
      if (!this.currentMessageResult.id && this.currentConversationId &&
          (this.currentMessageResult.content || this.currentMessageResult.toolCalls.length || stopped)) {
        try { await this.persistChatResponse(stopped ? 'stopped' : 'error'); }
        catch { this.chatError = '回复暂未保存，请先复制保留当前内容。'; }
      }
    } finally {
      this.isAnswering = false;
      this.isPreparing = false;
      if (this.chatStatus === 'preparing') this.chatStatus = 'idle';
    }
  };

  private persistChatResponse = async (responseStatus: 'completed' | 'stopped' | 'error') => {
    this.currentMessageResult.responseStatus = responseStatus;
    const saved = await api.message.create.mutate({
      conversationId: this.currentConversationId,
      content: this.currentMessageResult.content,
      role: 'assistant',
      metadata: {
        responseStatus, resultKind: this.currentMessageResult.resultKind, notes: this.currentMessageResult.notes,
        toolCalls: this.currentMessageResult.toolCalls, toolResults: this.currentMessageResult.toolResults,
        usage: this.currentMessageResult.usage, fristCharDelay: this.currentMessageResult.fristCharDelay,
      },
    });
    this.currentMessageResult.id = saved.id;
    return saved;
  };

  regenerate = async (messageId: number) => {
    if (this.isAnswering || this.isPreparing) return;
    const messages = this.currentConversation.value?.messages ?? [];
    const latest = this.currentMessageResult.id || messages.at(-1)?.id;
    if (messageId !== latest) return;
    this.isPreparing = true;
    try {
      const available = await api.ai.chatCapabilities.query({ modelId: this.chatModelId || undefined });
      if (!available.canChat) { RootStore.Get(ToastPlugin).error('请先配置可用的对话模型'); return; }
      const fresh = await api.conversation.detail.query({ id: this.currentConversationId });
      const target = fresh?.messages.at(-1);
      if (target?.id !== messageId || target.role !== 'assistant') return;
      if (hasSavedWorkflowResult(target.metadata)) { RootStore.Get(ToastPlugin).error('此结果已保存。请重新读取当前待办后开始新的工作流，避免重复创建或覆盖。'); return; }
      await api.message.delete.mutate({ id: messageId });
      this.clearCurrentMessageResult();
      await this.currentConversation.call();
      const last = this.currentConversation.value?.messages.at(-1);
      if (last?.role !== 'user') return;
      this.input = last.content;
      this.isPreparing = false;
      await this.onInputSubmit(true);
    } catch { this.chatStatus = 'error'; this.chatError = '重新生成失败，请重试。'; }
    finally { this.isPreparing = false; }
  };

  retryLastResponse = async () => {
    if (this.isAnswering || this.isPreparing) return;
    const last = this.currentConversation.value?.messages.at(-1);
    const responseId = this.currentMessageResult.id || (last?.role === 'assistant' ? last.id : 0);
    if (responseId) { await this.regenerate(responseId); return; }
    if (last?.role === 'user') { this.input = last.content; await this.onInputSubmit(true); }
  };

  editUserMessage = async (messageId: number, newContent: string) => {
    if (this.isAnswering || this.isPreparing) return false;
    this.isPreparing = true;
    try {
      const available = await api.ai.chatCapabilities.query({ modelId: this.chatModelId || undefined });
      if (!available.canChat) { this.isPreparing = false; RootStore.Get(ToastPlugin).error('请先配置可用的对话模型'); return false; }
      const fresh = await api.conversation.detail.query({ id: this.currentConversationId });
      const editIndex = fresh?.messages.findIndex(message => message.id === messageId) ?? -1;
      if (editIndex < 0) { this.isPreparing = false; return false; }
      if (fresh!.messages.slice(editIndex + 1).some(message => hasSavedWorkflowResult(message.metadata))) {
        this.isPreparing = false; RootStore.Get(ToastPlugin).error('后续结果已保存，请通过新消息修正，并重新读取当前待办。'); return false;
      }
      const original = fresh!.messages[editIndex];
      const context: any = original?.metadata || {};
      const workflow = workflows.find(workflow => workflow.key === context.workflow?.key);
      const rebuilt = workflow ? [workflow.prompt, `统计范围：${JSON.stringify(context.workflow)}`, newContent, ...(context.sources || []).map((source: any) => `引用来源 #${source.id}（类型 ${source.type}，更新 ${source.updatedAt}，${source.isArchived ? '已完成/归档' : '未完成/正常'}）：${source.content}\n任务信息：${JSON.stringify(source.metadata || {})}`)].join('\n\n') : newContent;
      await api.message.update.mutate({ id: messageId, content: rebuilt, displayContent: newContent });
      await api.message.clearAfter.mutate({ id: messageId });
      this.clearCurrentMessageResult();
      await this.currentConversation.call();
      this.input = rebuilt;
      this.isPreparing = false;
      void this.onInputSubmit(true);
      return true;
    } catch (error) {
      this.isPreparing = false;
      RootStore.Get(ToastPlugin).error(error instanceof Error ? error.message : '修改失败，请重试');
      return false;
    }
  };

  newChat = () => {
    if (this.isAnswering || this.isPreparing || this.currentConversation.loading.value) return;
    this.chatStatus = 'idle';
    this.chatError = '';
    this.currentConversationId = 0;
    this.selectedSkill = null;
    this.referencesNotes = [];
    this.input = '';
    this.clearCurrentMessageResult();
    this.isChatting = false;
    this.currentConversation.setValue(null);
  };

  newChatWithSuggestion = async (prompt: string) => {
    this.isChatting = true;
    this.input = prompt;
    this.onInputSubmit();
  };

  newRoleChat = async (prompt: string) => {
    this.isChatting = true;

    if (this.currentConversationId == 0) {
      const conversation = await api.conversation.create.mutate({ title: prompt.trim().slice(0, 60) });
        void this.conversactionList.resetAndCall({});
      this.currentConversationId = conversation.id;
    }

    if (this.currentConversationId != 0) {
      await api.message.create.mutate({
        conversationId: this.currentConversationId,
        content: prompt,
        role: 'system',
        metadata: ""
      });
      await this.currentConversation.call();
    }
  };

  scrollTicker = 0;
  chatHistory = new StorageListState<Chat>({ key: 'chatHistory' });
  private aiChatabortController = new AbortController();
  private aiWriteAbortController = new AbortController();
  /** Set by abortAiWrite so the resulting AbortError is not reported as a failure. */
  private isAbortRequested = false;
  writingResponseText = '';
  isWriting = false;

  writeQuestion = '';
  currentWriteType: WriteType | undefined = undefined;
  isLoading = false;

  get blinko() {
    return RootStore.Get(BlinkoStore);
  }

  async writeStream(
    writeType: 'expand' | 'polish' | 'custom' | undefined,
    content: string | undefined,
    onComplete?: (text: string) => void,
    /**
     * Fires on *every* exit path -- success, stream error and thrown error.
     * Callers use it to tear down UI that `onComplete` cannot reach (onComplete
     * is skipped when a generation fails), otherwise a pending indicator would
     * stay on screen forever.
     */
    onSettled?: () => void,
  ) {
    try {
      this.isAbortRequested = false;
      this.currentWriteType = writeType;
      this.isLoading = true;
      this.scrollTicker++;
      this.isWriting = true;
      this.writingResponseText = '';
      const res = await streamApi.ai.writing.mutate(
        {
          question: this.writeQuestion,
          type: writeType,
          content,
        },
        { signal: this.aiWriteAbortController.signal },
      );
      for await (const item of res) {

        if (item.type == 'error') {
          // Stream-level error (provider failure during generation).
          // Prefer message (real cause like "Incorrect API key"); fall back to name then a generic label.
          const err = item.error as any;
          const errorMessage = err?.message || err?.name || 'ai error';
          console.error('[aiStore.writeStream] stream error:', err);
          RootStore.Get(ToastPlugin).error(errorMessage);
          this.isLoading = false;
          this.isWriting = false;
          onSettled?.();
          return;
        }
        if (item.type == 'text-delta') {
          //@ts-ignore
          this.writingResponseText += item.textDelta;
        } else {
          console.log(JSON.stringify(item))
        }
        this.scrollTicker++;
      }
      this.writeQuestion = '';
      eventBus.emit('editor:focus');
      this.isLoading = false;
      // Hand the finished text back to the caller (slash menu / quick actions).
      // Errors and aborts return earlier, so this only fires on a real completion.
      onComplete?.(this.writingResponseText);
      onSettled?.();
    } catch (error) {
      // The ✕ on the pending chip aborts the request; that is a cancellation,
      // not a failure. Report nothing and leave the store idle.
      if (this.isAbortRequested) {
        this.isAbortRequested = false;
        this.isLoading = false;
        this.isWriting = false;
        onSettled?.();
        return;
      }
      console.error('[aiStore.writeStream] caught error:', error);
      // tRPC errors carry .message; raw fetch / network errors may not.
      const msg =
        (error as any)?.data?.message ||
        (error as any)?.message ||
        i18n.t('ai-writing-service-connection-failed');
      RootStore.Get(ToastPlugin).error(msg);
      this.isLoading = false;
      this.isWriting = false;
      onSettled?.();
    }
  }

  autoTag = new PromiseState({
    function: async (id: number, content: string) => {
      try {
        RootStore.Get(ToastPlugin).loading(i18n.t('thinking'));
        const res = await api.ai.autoTag.mutate({ content });
        RootStore.Get(ToastPlugin).remove();
        RootStore.Get(DialogStore).setData({
          isOpen: true,
          size: '2xl',
          title: i18n.t('ai-tag'),
          content: (
            <AiTag
              tags={res}
              onSelect={async (e, isInsertBefore) => {
                let newContent;
                if (isInsertBefore) {
                  newContent = e.join(' ') + ' \n\n' + content;
                } else {
                  newContent = content + ' \n\n' + e.join(' ');
                }
                await PromiseCall(this.blinko.upsertNote.call({ id, content: newContent }));
                RootStore.Get(DialogStore).close();
              }}
            />
          ),
        });
        return res;
      } catch (error) {
        RootStore.Get(ToastPlugin).remove();
        RootStore.Get(ToastPlugin).error(error.message);
      }
    },
  });

  autoEmoji = new PromiseState({
    function: async (id: number, content: string) => {
      try {
        RootStore.Get(ToastPlugin).loading(i18n.t('thinking'));
        const res = await api.ai.autoEmoji.mutate({ content });
        RootStore.Get(ToastPlugin).remove();
        console.log(res);
        RootStore.Get(DialogStore).setData({
          isOpen: true,
          size: 'xl',
          title: i18n.t('ai-emoji'),
          content: (
            <AiEmoji
              emojis={res}
              onSelect={async (e) => {
                await PromiseCall(api.tags.updateTagIcon.mutate({ id, icon: e }));
                RootStore.Get(DialogStore).close();
              }}
            />
          ),
        });
        return res;
      } catch (error) {
        RootStore.Get(ToastPlugin).remove();
        RootStore.Get(ToastPlugin).error(error.message);
      }
    },
  });

  clearCurrentMessageResult = () => {
    this.currentMessageResult = {
      notes: [],
      content: '',
      toolcall: [],
      toolCalls: [],
      toolResults: [],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      fristCharDelay: 0,
      id: 0,
    };
  };

  abortAiWrite() {
    this.isAbortRequested = true;
    this.aiWriteAbortController.abort();
    this.aiWriteAbortController = new AbortController();
    // Clear the busy flag here rather than waiting for the aborted request to
    // reject: callers guard on isLoading, so leaving it raised would block
    // every later generation behind a run the user just cancelled.
    this.isLoading = false;
    this.isWriting = false;
    this.writeQuestion = '';
  }

  async abortAiChat() {
    if (!this.isAnswering || this.chatStopRequested) return;
    this.chatStopRequested = true;
    this.chatStatus = 'stopping';
    this.aiChatabortController.abort();
  }




  private clear() {
    this.chatHistory.clear();
    this.selectedProviderId = 0;
  }
}
