import { AiBaseModelPrivider } from '.';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export class GeminiModelProvider extends AiBaseModelPrivider {
  constructor({ globalConfig }) {
    super({ globalConfig });
    this.provider = createGoogleGenerativeAI({
      apiKey: this.globalConfig.aiApiKey,
      baseURL: this.globalConfig.aiApiEndpoint || undefined,
    });
  }

  LLM() {
    try {
      return this.provider.languageModel(this.globalConfig.aiModel ?? 'gemini-pro');
    } catch (error) {
      throw error;
    }
  }
}
