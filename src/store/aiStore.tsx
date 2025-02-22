import { _ } from '@/lib/lodash';
import { Store } from './standard/base';
import { ToastPlugin } from './module/Toast/Toast';
import { RootStore } from './root';
import { api, streamApi } from '@/lib/trpc';
import { StorageListState } from './standard/StorageListState';
import { GlobalConfig, Note } from '@/server/types';
import { makeAutoObservable } from 'mobx';
import { BlinkoStore } from './blinkoStore';
import { eventBus } from '@/lib/event';
import { showAiWriteSuggestions } from '@/components/Common/PopoverFloat/aiWritePop';
import { PromiseCall, PromisePageState, PromiseState } from './standard/PromiseState';
import { DialogStore } from './module/Dialog';
import { CheckboxGroup } from '@nextui-org/react';
import { AiTag } from '@/components/BlinkoAi/aiTag';
import i18n from '@/lib/i18n';
import { Icon } from '@iconify/react';
import { AiEmoji } from '@/components/BlinkoAi/aiEmoji';

type Chat = {
  content: string
  role: 'user' | 'system' | 'assistant',
  createAt: number
  relationNotes?: Note[]
}

type WriteType = 'expand' | 'polish' | 'custom'

export class AiStore implements Store {
  sid = 'AiStore';
  constructor() {
    makeAutoObservable(this)
    eventBus.on('user:signout', () => {
      this.clear()
    })
  }
  isChatting = false
  isAnswering = false
  input = '';
  currentMessageResult: {
    notes: Note[],
    content: string
  } = {
      notes: [],
      content: ''
    }

  currentConversationId = 0
  currentConversation = new PromiseState({
    function: async () => {
      const res = await api.conversation.detail.query({ id: this.currentConversationId })
      return res
    }
  })

  conversactionList = new PromisePageState({
    function: async ({ page, size }: { page: number, size: number }) => {
      const res = await api.conversation.list.query({
        page,
        size
      })
      return res
    }
  })

  onInputSubmit = async () => {
    try {
      this.isChatting = true
      if (this.currentConversationId == 0) {
        const conversation = await api.conversation.create.mutate({ title: '' });
        this.currentConversationId = conversation.id
      }

      if (this.currentConversationId != 0) {
        await api.message.create.mutate({
          conversationId: this.currentConversationId,
          content: this.input,
          role: 'user',
        });
        //update conversation message list
        await this.currentConversation.call()

        const filteredChatConversation = [
          ...(this.currentConversation.value?.messages?.slice(0, -1) || [])
        ];

        this.isAnswering = true
        const res = await streamApi.ai.completions.mutate({ question: this.input, conversations: filteredChatConversation }, { signal: this.aiChatabortController.signal })

        for await (const item of res) {
          console.log(item)
          if (item.notes) {
            this.currentMessageResult.notes = item.notes
          } else {
            if (item.chunk.type == 'text-delta') {
              this.currentMessageResult.content += item.chunk.textDelta
            }
          }
        }
        await api.message.create.mutate({
          conversationId: this.currentConversationId,
          content: this.currentMessageResult.content,
          role: 'assistant',
          metadata: this.currentMessageResult.notes
        })
        if (this.currentConversation.value?.messages?.length && this.currentConversation.value?.messages?.length < 4) {
          await api.ai.summarizeConversationTitle.mutate({
            conversations: this.currentConversation.value?.messages ?? [],
            conversationId: this.currentConversationId
          })
        }
        await this.currentConversation.call()
        this.isAnswering = false
        this.currentMessageResult = {
          notes: [],
          content: ''
        }
      }
    } catch (error) {
      if (!error.message.includes('interrupted')) {
        RootStore.Get(ToastPlugin).error(error.message)
      }
      this.isAnswering = false
    }
  }

  newChat = () => {
    this.currentConversationId = 0
    this.input = ''
    this.currentMessageResult = {
      notes: [],
      content: ''
    }
    this.isChatting = false
  }


  modelProviderSelect: { label: string, value: GlobalConfig['aiModelProvider'], icon: React.ReactNode }[] = [
    {
      label: "OpenAI",
      value: "OpenAI",
      icon: <Icon icon="ri:openai-fill" width="20" height="20" />
    },
    {
      label: "AzureOpenAI",
      value: "AzureOpenAI",
      icon: <Icon icon="teenyicons:azure-outline" width="20" height="20" />
    },
    {
      label: "Ollama",
      value: "Ollama",
      icon: <Icon icon="simple-icons:ollama" width="20" height="20" />
    }
  ]

  modelSelect: Record<GlobalConfig['aiModelProvider'], Array<{ label: string, value: string }>> = {
    OpenAI: [
      {
        label: "gpt-3.5-turbo",
        value: "gpt-3.5-turbo"
      },
      {
        label: "gpt-4",
        value: "gpt-4"
      },
      {
        label: "gpt-4o",
        value: "gpt-4o"
      },
      {
        label: "gpt-4o-mini",
        value: "gpt-4o-mini"
      }
    ],
    AzureOpenAI: [],
    Ollama: [
      {
        label: "llama3.2",
        value: "llama3.2"
      }
    ],
  }

  embeddingSelect: Record<string, Array<{ label: string, value: string }>> = {
    OpenAI: [
      {
        label: "text-embedding-3-small",
        value: "text-embedding-3-small"
      },
      {
        label: "text-embedding-3-large",
        value: "text-embedding-3-large"
      },
      {
        label: "text-embedding-ada-002",
        value: "text-embedding-ada-002"
      }
    ],
    AzureOpenAI: [],
    Ollama: [
      {
        label: "mxbai-embed-large",
        value: "mxbai-embed-large"
      },
      {
        label: "nomic-embed-text",
        value: "nomic-embed-text"
      },
      {
        label: "bge-large-en",
        value: "bge-large-en"
      }
    ]
  }

  modelSelectUILabel = {
    OpenAI: {
      modelTitle: i18n.t('ai-model'),
      modelTooltip: i18n.t('ai-model-tooltip'),
      endpointTitle: i18n.t('api-endpoint'),
      endpointTooltip: i18n.t('must-start-with-http-s-or-use-api-openai-as-default')
    },
    AzureOpenAI: {
      modelTitle: i18n.t('user-custom-azureopenai-api-deployment'),
      modelTooltip: i18n.t('user-custom-azureopenai-api-deployment-tooltip'),
      endpointTitle: i18n.t('user-custom-azureopenai-api-instance'),
      endpointTooltip: i18n.t('your-azure-openai-instance-name') //Your Azure OpenAI instance name
    },
    Ollama: {
      modelTitle: i18n.t('ai-model'),
      modelTooltip: i18n.t('ollama-ai-model-tooltip'),
      endpointTitle: i18n.t('api-endpoint'),
      endpointTooltip: i18n.t('ollama-default-endpoint-is-http-localhost-11434')//Ollama default endpoint is http://localhost:11434
    }
  }

  scrollTicker = 0
  chatHistory = new StorageListState<Chat>({ key: 'chatHistory' })
  private aiChatabortController = new AbortController()
  private aiWriteAbortController = new AbortController()
  writingResponseText = ''
  isWriting = false

  writeQuestion = ''
  currentWriteType: WriteType | undefined = undefined
  isLoading = false

  // async completionsStream() {
  //   try {
  //     this.isAnswering = true
  //     this.chatHistory.push({
  //       content: this.aiSearchText,
  //       role: 'user',
  //       createAt: new Date().getTime()
  //     })
  //     this.scrollTicker++
  //     const conversations = this.chatHistory.list.map(i => { return { role: i.role, content: i.content } })
  //     this.chatHistory.push({
  //       content: '',
  //       role: 'assistant',
  //       createAt: new Date().getTime(),
  //       relationNotes: []
  //     })
  //     const res = await streamApi.ai.completions.mutate({ question: this.aiSearchText, conversations }, { signal: this.abortController.signal })
  //     for await (const item of res) {
  //       console.log(item)
  //       if (item.notes) {
  //         this.chatHistory.list[this.chatHistory.list.length - 1]!.relationNotes = item.notes
  //       } else {
  //         if (item.chunk.type == 'text-delta') {
  //           //@ts-ignore
  //           this.chatHistory.list[this.chatHistory.list.length - 1]!.content += item.chunk.textDelta
  //         }
  //         this.scrollTicker++
  //       }
  //     }
  //     this.chatHistory.save()
  //     this.isAnswering = false
  //   } catch (error) {
  //     this.isAnswering = false
  //     if (!error.message.includes('interrupted')) {
  //       RootStore.Get(ToastPlugin).error(error.message)
  //     }
  //   }
  // }

  get blinko() {
    return RootStore.Get(BlinkoStore)
  }

  async writeStream(writeType: "expand" | "polish" | "custom" | undefined, content: string | undefined) {
    try {
      this.currentWriteType = writeType
      this.isLoading = true
      this.scrollTicker++
      this.isWriting = true
      this.writingResponseText = ''
      const res = await streamApi.ai.writing.mutate({
        question: this.writeQuestion,
        type: writeType,
        content
      }, { signal: this.aiWriteAbortController.signal })
      for await (const item of res) {
        // console.log(item)
        if (item.type == 'text-delta') {
          //@ts-ignore
          this.writingResponseText += item.textDelta
        }
        this.scrollTicker++
      }
      this.writeQuestion = ''
      eventBus.emit('editor:focus')
      this.isLoading = false
    } catch (error) {
      console.log('writeStream error', error)
      this.isLoading = false
    }
  }

  autoTag = new PromiseState({
    function: async (id: number, content: string) => {
      try {
        RootStore.Get(ToastPlugin).loading(i18n.t('thinking'))
        const res = await api.ai.autoTag.mutate({ content, tags: this.blinko.tagList?.value?.pathTags ?? [] })
        RootStore.Get(ToastPlugin).remove()
        RootStore.Get(DialogStore).setData({
          isOpen: true,
          size: '2xl',
          title: i18n.t('ai-tag'),
          content: <AiTag tags={res} onSelect={async (e, isInsertBefore) => {
            let newContent
            if (isInsertBefore) {
              newContent = e.join(' ') + ' \n\n' + content
            } else {
              newContent = content + ' \n\n' + e.join(' ')
            }
            await PromiseCall(this.blinko.upsertNote.call({ id, content: newContent }))
            RootStore.Get(DialogStore).close()
          }} />
        })
        return res
      } catch (error) {
        RootStore.Get(ToastPlugin).remove()
        RootStore.Get(ToastPlugin).error(error.message)
      }
    }
  })

  autoEmoji = new PromiseState({
    function: async (id: number, content: string) => {
      try {
        RootStore.Get(ToastPlugin).loading(i18n.t('thinking'))
        const res = await api.ai.autoEmoji.mutate({ content })
        RootStore.Get(ToastPlugin).remove()
        console.log(res)
        RootStore.Get(DialogStore).setData({
          isOpen: true,
          size: 'xl',
          title: i18n.t('ai-emoji'),
          content: <AiEmoji emojis={res} onSelect={async (e) => {
            await PromiseCall(api.tags.updateTagIcon.mutate({ id, icon: e }))
            RootStore.Get(DialogStore).close()
          }} />
        })
        return res
      } catch (error) {
        RootStore.Get(ToastPlugin).remove()
        RootStore.Get(ToastPlugin).error(error.message)
      }
    }
  })

  abortAiWrite() {
    this.aiWriteAbortController.abort()
    this.aiWriteAbortController = new AbortController()
    this.isWriting = false
  }

  async abortAiChat() {
    this.aiChatabortController.abort()
    this.aiChatabortController = new AbortController()
    this.isLoading = false
    this.isAnswering = false
    if (this.currentMessageResult.content.trim() != '') {
      await api.message.create.mutate({
        conversationId: this.currentConversationId,
        content: this.currentMessageResult.content,
        role: 'assistant',
        metadata: this.currentMessageResult.notes
      })
    }
    this.currentMessageResult = {
      notes: [],
      content: ''
    }
  }

  private clear() {
    this.chatHistory.clear()
  }
}
