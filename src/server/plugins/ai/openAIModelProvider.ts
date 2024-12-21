import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { MarkdownTextSplitter, TokenTextSplitter } from "@langchain/textsplitters"
import { FaissStore } from "@langchain/community/vectorstores/faiss"
import path from "path"
import { FAISS_PATH } from "@/lib/constant"
import { BaseChatModel } from "@langchain/core/language_models/chat_models"
import { Embeddings } from "@langchain/core/embeddings"
import { GlobalConfig } from "@/server/types"
import { BufferLoader } from "langchain/document_loaders/fs/buffer";
import { OpenAIWhisperAudio } from "@langchain/community/document_loaders/fs/openai_whisper_audio"

export abstract class AiBaseModelPrivider {
  globalConfig: GlobalConfig

  constructor({ globalConfig }) {
    this.globalConfig = globalConfig
  }

  abstract LLM(): BaseChatModel;
  abstract Embeddings(): Embeddings

  public MarkdownSplitter(): MarkdownTextSplitter {
    return new MarkdownTextSplitter({
      chunkSize: 2000,
      chunkOverlap: 200,
    });
  }

  public TokenTextSplitter(): TokenTextSplitter {
    return new TokenTextSplitter({
      chunkSize: 2000,
      chunkOverlap: 200,
    });
  }


  public async VectorStore(): Promise<FaissStore> {
    const FaissStorePath = path.join(FAISS_PATH)
    try {
      return await FaissStore.load(
        FaissStorePath,
        this.Embeddings()
      );
    } catch (error) {
      try {
        console.log(this.globalConfig)
        const VectorStore = new FaissStore(this.Embeddings(), {});
        const documents = [{
          pageContent: "init faiss store",
          metadata: { id: '0' },
        }];
        console.log('init faiss store', documents)
        await VectorStore.addDocuments(documents, { ids: ["0"] });
        await VectorStore.save(FaissStorePath)
        return VectorStore
      } catch (error) {
        console.log('VectorStore error', error)
        throw error
      }
    }
  }

  public AudioLoader(audioPath): BufferLoader {
    //todo: loader from user config
    if (this.globalConfig.aiModelProvider == 'OpenAI') {
      return new OpenAIWhisperAudio(audioPath, {
        clientOptions: {
          apiKey: this.globalConfig.aiApiKey,
          baseURL: this.globalConfig.aiApiEndpoint || null
        }
      })
    }
    return null as unknown as BufferLoader
  }
}

export class OpenAIModelProvider extends AiBaseModelPrivider {
  LLM() {
    return new ChatOpenAI(
      {
        apiKey: this.globalConfig.aiApiKey,
        model: this.globalConfig.aiModel ?? 'gpt-3.5-turbo',
        temperature: 0,
        maxTokens: 3000
      }, {
      baseURL: this.globalConfig.aiApiEndpoint || null
    });
  }

  Embeddings() {
    return new OpenAIEmbeddings({
      apiKey: this.globalConfig.aiApiKey,
      model: this.globalConfig.embeddingModel ?? 'text-embedding-3-small',
    }, {
      baseURL: this.globalConfig.aiApiEndpoint || null
    })
  }
}
