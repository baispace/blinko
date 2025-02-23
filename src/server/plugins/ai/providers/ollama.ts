import { BufferLoader } from "langchain/document_loaders/fs/buffer";
import { createOllama } from 'ollama-ai-provider';
import { AiBaseModelPrivider } from ".";

export class OllamaModelProvider extends AiBaseModelPrivider {
  constructor({ globalConfig }) {
    super({ globalConfig });
    this.provider = createOllama({
      baseURL: this.globalConfig.aiApiEndpoint,
    });
  }

  LLM() {
    try {
      return this.provider.languageModel(this.globalConfig.aiModel ?? 'llama2')
    } catch (error) {
      throw error
    }
  }

  Embeddings() {
    try {
      return this.provider.textEmbeddingModel(this.globalConfig.embeddingModel ?? 'mxbai-embed-large')
    } catch (error) {
      throw error
    }
  }

  public AudioLoader(audioPath): BufferLoader {
    return null as unknown as BufferLoader;
  }
}
