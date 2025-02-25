import { AiBaseModelPrivider } from '.';
import { createAzure } from '@ai-sdk/azure';

export class AzureOpenAIModelProvider extends AiBaseModelPrivider {

  constructor({ globalConfig }) {
    super({ globalConfig });
    this.provider = createAzure({
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

}
