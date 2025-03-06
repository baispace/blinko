import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { AiBaseModelPrivider } from '.';

export class OpenRouterModelProvider extends AiBaseModelPrivider {
  constructor({ globalConfig }) {
    super({ globalConfig });
    //@ts-ignore
    this.provider = createOpenRouter({
      apiKey: this.globalConfig.aiApiKey
    });
  }

  LLM() {
    try {
      return this.provider.languageModel(this.globalConfig.aiModel ?? 'openai/gpt-3.5-turbo')
    } catch (error) {
      throw error
    }
  }

  Image() {
    try {
      return this.provider.imageModel?.('openai/dall-e-3')
    } catch (error) {
      throw error
    }
  }
}
