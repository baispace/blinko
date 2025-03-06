import { MarkdownTextSplitter, TokenTextSplitter } from "@langchain/textsplitters";
import { GlobalConfig } from "@/server/types";
import { BufferLoader } from "langchain/document_loaders/fs/buffer";
import { OpenAIWhisperAudio } from "@langchain/community/document_loaders/fs/openai_whisper_audio";
import { ProviderV1, LanguageModelV1 } from '@ai-sdk/provider';
import { VECTOR_DB_FILE_PATH } from "@/lib/constant";
import { AiModelFactory } from "../aiModelFactory";
import { createOpenAI } from "@ai-sdk/openai";
import { createVoyage } from 'voyage-ai-provider';
import { LibSQLVector } from "@mastra/core/vector/libsql"

let vectorStore: LibSQLVector

export abstract class AiBaseModelPrivider {
  globalConfig: GlobalConfig
  provider: ProviderV1

  constructor({ globalConfig }) {
    this.globalConfig = globalConfig
  }

  abstract LLM(): LanguageModelV1;
  // abstract Embeddings(): EmbeddingModelV1<string>
  Embeddings() {
    try {
      if (this.globalConfig.embeddingApiKey) {
        const config = {
          apiKey: this.globalConfig.embeddingApiKey,
          baseURL: this.globalConfig.embeddingApiEndpoint || undefined,
        }
        console.log(this.globalConfig.embeddingModel,'this.globalConfig.embeddingModel')
        if (this.globalConfig.embeddingModel?.includes('voyage')) {
          return createVoyage(config).textEmbeddingModel(this.globalConfig.embeddingModel );
        } else {
          return createOpenAI(config).textEmbeddingModel(this.globalConfig.embeddingModel ?? 'text-embedding-3-small')
        }
      }
      return this.provider.textEmbeddingModel(this.globalConfig.embeddingModel ?? 'text-embedding-3-small')
    } catch (error) {
      console.log(error, 'ERROR Create Embedding model')
      throw error
    }
  }

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

  public async VectorStore() {
    if (!vectorStore) {
      vectorStore = new LibSQLVector({
        connectionUrl: VECTOR_DB_FILE_PATH,
      });
      //!index must be created before use
      await AiModelFactory.rebuildVectorIndex({ vectorStore })
    }
    return vectorStore
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
