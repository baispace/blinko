import { AzureChatOpenAI, AzureOpenAIEmbeddings } from '@langchain/openai'
import { AiBaseModelPrivider } from './openAIModelProvider'

export class AzureOpenAIModelProvider extends AiBaseModelPrivider {
  LLM() {
    return new AzureChatOpenAI({
      azureOpenAIApiInstanceName: this.globalConfig.aiApiEndpoint,
      deploymentName: this.globalConfig.aiModel,
      openAIApiKey: this.globalConfig.aiApiKey,
      openAIApiVersion: this.globalConfig.aiApiVersion,
      temperature: 0
    })
  }

  Embeddings() {
    return new AzureOpenAIEmbeddings({
      azureOpenAIApiInstanceName: this.globalConfig.embeddingApiEndpoint ?? this.globalConfig.aiApiEndpoint,
      apiKey: this.globalConfig.embeddingApiKey ?? this.globalConfig.aiApiKey,
      deploymentName: this.globalConfig.embeddingModel,      
      openAIApiVersion: this.globalConfig.aiApiVersion
    })
  }
}
