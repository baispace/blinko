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
  selectedSkill: { title: string; prompt: string; key: "tasks" | "note" | "today" | "overdue" | "ideas" } | null = null;
  isChatting = false;
  isAnswering = false;
  isPreparing = false;
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
      const conversationTitle = cleanConversationTitle(this.selectedSkill?.title || this.input, '新对话');
      const userQuestion = [this.selectedSkill?.prompt, this.input.trim(),
        ...this.referencesNotes.map(note => `用户确认的来源 #${note.id}（类型 ${note.type}，创建 ${note.createdAt}）：\n${note.content}\n任务信息：${JSON.stringify(note.metadata ?? {})}`)
      ].filter(Boolean).join('\n\n');
      this.referencesNotes = [];
      this.selectedSkill = null;
      this.clearCurrentMessageResult();
      this.input = '';
      this.isChatting = true;
      this.isAnswering = true;
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
            metadata: ""
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
          console.log(JSON.parse(JSON.stringify(item)));
          if (item.chunk?.type == 'error') {
            //@ts-ignore
            const errorMessage = item.chunk?.error?.message || item.chunk?.error?.name || 'AI 服务调用失败';
            RootStore.Get(ToastPlugin).error(errorMessage);
            this.isAnswering = false;
            return;
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
        const newAssisantMessage = await api.message.create.mutate({
          conversationId: this.currentConversationId,
          content: this.currentMessageResult.content,
          role: 'assistant',
          metadata: {
            notes: this.currentMessageResult.notes,
            toolCalls: this.currentMessageResult.toolCalls,
            toolResults: this.currentMessageResult.toolResults,
            usage: this.currentMessageResult.usage,
            fristCharDelay: this.currentMessageResult.fristCharDelay,
          },
        });

        if (this.currentConversation.value?.messages?.length && this.currentConversation.value?.messages?.length < 3) {
          void api.ai.summarizeConversationTitle.mutate({
            conversations: this.currentConversation.value?.messages ?? [],
            conversationId: this.currentConversationId,
          }).then(() => this.conversactionList.resetAndCall({})).catch(() => {});
        }
        this.currentMessageResult.id = newAssisantMessage.id;
        // await this.currentConversation.call()
        this.isAnswering = false;
        // this.clearCurrentMessageResult()
      }
    } catch (error) {
      if (!error.message.includes('interrupted') && !error.message.includes('aborted') && !error.message.includes('BodyStreamBuffer was aborted')) {
        RootStore.Get(ToastPlugin).error(error.message);
      }
      this.isAnswering = false;
    } finally {
      this.isPreparing = false;
    }
  };

  regenerate = async (messageId: number) => {
    await api.message.delete.mutate({ id: messageId });
    await this.currentConversation.call();
    const lastMessage = this.currentConversation.value?.messages[this.currentConversation.value?.messages?.length - 1];
    this.input = lastMessage?.content ?? '';
    await this.onInputSubmit(true);
  };

  editUserMessage = async (messageId: number, newContent: string) => {
    try {
      // Update the message content
      await api.message.update.mutate({
        id: messageId,
        content: newContent
      });

      // Clear all messages after this message
      await api.message.clearAfter.mutate({ id: messageId });

      // Refresh conversation
      await this.currentConversation.call();

      // Set input to the new content and regenerate AI response
      this.input = newContent;
      await this.onInputSubmit(true);
    } catch (error) {
      RootStore.Get(ToastPlugin).error(error.message);
    }
  };

  newChat = () => {
    if (this.isAnswering || this.isPreparing || this.currentConversation.loading.value) return;
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
    this.aiChatabortController.abort();
    this.aiChatabortController = new AbortController();
    this.isLoading = false;
    this.isAnswering = false;
    if (this.currentMessageResult.content.trim() != '') {
      await api.message.create.mutate({
        conversationId: this.currentConversationId,
        content: this.currentMessageResult.content,
        role: 'assistant',
        metadata: this.currentMessageResult.notes,
      });
    }
    // Add interruption notification message
    await api.message.create.mutate({
      conversationId: this.currentConversationId,
      content: '[Request interrupted by user]',
      role: 'system',
      metadata: {},
    });
    this.clearCurrentMessageResult();
    await this.currentConversation.call();
  }



  private clear() {
    this.chatHistory.clear();
    this.selectedProviderId = 0;
  }
}
