import { MarkdownTextSplitter, TokenTextSplitter } from "@langchain/textsplitters"
import path from "path"
import { GlobalConfig } from "@/server/types"
import { BufferLoader } from "langchain/document_loaders/fs/buffer";
import { OpenAIWhisperAudio } from "@langchain/community/document_loaders/fs/openai_whisper_audio"
import { ProviderV1, LanguageModelV1, EmbeddingModelV1 } from '@ai-sdk/provider';
import { DefaultVectorDB } from '@mastra/core/storage';
import { VECTOR_DB_FILE_PATH } from "@/lib/constant";
import { AiModelFactory } from "../aiModelFactory";

let vectorStore: DefaultVectorDB

export abstract class AiBaseModelPrivider {
  globalConfig: GlobalConfig
  provider: ProviderV1

  constructor({ globalConfig }) {
    this.globalConfig = globalConfig
  }

  abstract LLM(): LanguageModelV1;
  abstract Embeddings(): EmbeddingModelV1<string>

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
      vectorStore = new DefaultVectorDB({
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
