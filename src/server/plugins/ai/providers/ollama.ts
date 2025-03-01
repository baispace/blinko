import { BufferLoader } from "langchain/document_loaders/fs/buffer";
import { createOllama } from 'ollama-ai-provider';
import { AiBaseModelPrivider } from ".";

export class OllamaModelProvider extends AiBaseModelPrivider {
  constructor({ globalConfig }) {
    super({ globalConfig });
    this.provider = createOllama({
      baseURL: !!this.globalConfig.aiApiEndpoint ? this.globalConfig.aiApiEndpoint.trim() : undefined,
    });
  }

  LLM() {
    try {
      console.log(this.globalConfig.aiModel)
      return this.provider.languageModel(this.globalConfig.aiModel ?? 'llama3.2')
    } catch (error) {
      throw error
    }
  }

  public AudioLoader(audioPath): BufferLoader {
    return null as unknown as BufferLoader;
  }
}
