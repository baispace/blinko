import { AiBaseModelPrivider } from '.';
import { createXai } from '@ai-sdk/xai';

export class GrokModelProvider extends AiBaseModelPrivider {
  constructor({ globalConfig }) {
    super({ globalConfig });
    this.provider = createXai({
      apiKey: this.globalConfig.aiApiKey
    });
  }

  LLM() {
    try {
      return this.provider.languageModel(this.globalConfig.aiModel ?? 'grok-v1');
    } catch (error) {
      throw error;
    }
  }

}  