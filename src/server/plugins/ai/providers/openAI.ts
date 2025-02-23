import { createOpenAI, openai } from "@ai-sdk/openai";
import { AiBaseModelPrivider } from '.';


export class OpenAIModelProvider extends AiBaseModelPrivider {
  constructor({ globalConfig }) {
    super({ globalConfig });
    this.provider = createOpenAI({
      apiKey: this.globalConfig.aiApiKey,
      baseURL: this.globalConfig.aiApiEndpoint || undefined,
    });
  }

  LLM() {
    try {
      return this.provider.languageModel(this.globalConfig.aiModel ?? 'gpt-3.5-turbo')
    } catch (error) {
      throw error
    }
  }

  Image() {
    try {
      return this.provider.imageModel?.('dall-e-3')
    } catch (error) {
      throw error
    }
  }

  Embeddings() {
    console.log(this.globalConfig.embeddingApiKey,'embeddingApiKeyxxx')
    try {
      if (this.globalConfig.embeddingApiKey) {
        let overrideProvider = createOpenAI({
          apiKey: this.globalConfig.embeddingApiKey,
          baseURL: this.globalConfig.embeddingApiEndpoint || undefined,
        })
        return overrideProvider.textEmbeddingModel(this.globalConfig.embeddingModel ?? 'text-embedding-3-small')
      }
      return this.provider.textEmbeddingModel(this.globalConfig.embeddingModel ?? 'text-embedding-3-small')
    } catch (error) {
      console.log(error,'errorxxx')
      throw error
    }
  }
}

