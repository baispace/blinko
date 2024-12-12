import { AzureChatOpenAI, AzureOpenAIEmbeddings } from '@langchain/openai'
import { MarkdownTextSplitter, TokenTextSplitter } from '@langchain/textsplitters'
import { FaissStore } from '@langchain/community/vectorstores/faiss'
import path from 'path'
import { FAISS_PATH } from '@/lib/constant'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { Embeddings } from '@langchain/core/embeddings'
import { GlobalConfig } from '@/server/types'
import { BufferLoader } from 'langchain/document_loaders/fs/buffer'

export abstract class AiBaseModelPrivider {
  globalConfig: GlobalConfig

  constructor({ globalConfig }) {
    this.globalConfig = globalConfig
  }

  abstract LLM(): BaseChatModel
  abstract Embeddings(): Embeddings

  public MarkdownSplitter(): MarkdownTextSplitter {
    return new MarkdownTextSplitter({
      chunkSize: 2000,
      chunkOverlap: 200,
    })
  }

  public TokenTextSplitter(): TokenTextSplitter {
    return new TokenTextSplitter({
      chunkSize: 2000,
      chunkOverlap: 200,
    })
  }

  public async VectorStore(): Promise<FaissStore> {
    const FaissStorePath = path.join(process.cwd(), FAISS_PATH)
    try {
      return await FaissStore.load(FaissStorePath, this.Embeddings())
    } catch (error) {
      try {
        console.log(this.globalConfig)
        const VectorStore = new FaissStore(this.Embeddings(), {})
        const documents = [
          {
            pageContent: 'init faiss store',
            metadata: { id: '0' },
          },
        ]
        console.log('init faiss store', documents)
        await VectorStore.addDocuments(documents, { ids: ['0'] })
        await VectorStore.save(FaissStorePath)
        return VectorStore
      } catch (error) {
        console.log('VectorStore error', error)
        throw error
      }
    }
  }

  public AudioLoader(audioPath): BufferLoader {
    return null as unknown as BufferLoader
  }
}

export class AzureOpenAIModelProvider extends AiBaseModelPrivider {
  LLM() {
    return new AzureChatOpenAI({
      azureOpenAIApiInstanceName: this.globalConfig.aiApiEndpoint,
      deploymentName: this.globalConfig.aiModel,
      openAIApiKey: this.globalConfig.aiApiKey,
      openAIApiVersion: this.globalConfig.aiApiVersion,
      temperature: 0
    })
  }

  Embeddings() {
    return new AzureOpenAIEmbeddings({
      azureOpenAIApiInstanceName: this.globalConfig.aiApiEndpoint,
      apiKey: this.globalConfig.aiApiKey,
      deploymentName: this.globalConfig.embeddingModel,      
      openAIApiVersion: this.globalConfig.aiApiVersion
    })
  }
}
