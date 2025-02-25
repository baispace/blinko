import { createOpenAI } from "@ai-sdk/openai";
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
}

