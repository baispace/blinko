import { AiBaseModelPrivider } from '.';
import { createDeepSeek } from '@ai-sdk/deepseek';

export class DeepSeekModelProvider extends AiBaseModelPrivider {
  constructor({ globalConfig }) {
    super({ globalConfig });
    this.provider = createDeepSeek({
      apiKey: this.globalConfig.aiApiKey
    });
  }

  LLM() {
    try {
      return this.provider.languageModel(this.globalConfig.aiModel ?? 'deepseek-v3')
    } catch (error) {
      throw error
    }
  }
}

