import { AiBaseModelPrivider } from '.';
import { createVoyage } from 'voyage-ai-provider';

export class VoyageModelProvider extends AiBaseModelPrivider {
  constructor({ globalConfig }) {
    super({ globalConfig });
    this.provider = createVoyage({
      apiKey: this.globalConfig.aiApiKey
    });
  }

  LLM() {
    return this.provider.languageModel(this.globalConfig.aiModel ?? 'voyage-3');
  }

  Embeddings() {
    try {
      if (this.globalConfig.embeddingApiKey) {
        let overrideProvider = createVoyage({
          apiKey: this.globalConfig.embeddingApiKey,
        });
        return overrideProvider.textEmbeddingModel(this.globalConfig.embeddingModel ?? 'voyage-3-large')
      }
      return this.provider.textEmbeddingModel(this.globalConfig.embeddingModel ?? 'voyage-3-large')
    } catch (error) {
      throw error
    }
  }

} 