import { ChatOllama } from "@langchain/ollama";
import { OllamaEmbeddings } from "@langchain/ollama";
import { AiBaseModelPrivider } from './openAIModelProvider';
import { BufferLoader } from "langchain/document_loaders/fs/buffer";

export class OllamaModelProvider extends AiBaseModelPrivider {
  LLM() {
    return new ChatOllama({
      baseUrl: this.globalConfig.aiApiEndpoint,
      model: this.globalConfig.aiModel ?? 'llama2'
    });
  }

  Embeddings() {
    return new OllamaEmbeddings({
      model: this.globalConfig.embeddingModel ?? "mxbai-embed-large", //default model
      baseUrl: this.globalConfig.embeddingApiEndpoint ?? this.globalConfig.aiApiEndpoint,// "http://localhost:11434"
    });
  }

  public AudioLoader(audioPath): BufferLoader {
    return null as unknown as BufferLoader;
  }
}
