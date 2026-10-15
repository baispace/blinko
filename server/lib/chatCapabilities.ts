import { AiModelFactory } from '../aiServer/aiModelFactory';
import { prisma } from '../prisma';
import { isModelConfigured } from './modelReadiness';

/** Configuration availability only; no keys or provider secrets reach the browser. */
export async function getChatCapabilities(modelId?: number) {
  const config = await AiModelFactory.globalConfig();
  const models = await prisma.aiModels.findMany({ include: { provider: true }, orderBy: { sortOrder: 'asc' } });
  const chatModels = models.filter(model => !!(model.capabilities as any)?.inference);
  const selected = chatModels.find(model => model.id === (modelId || config.mainModelId));
  const embedding = models.find(model => model.id === config.embeddingModelId && !!(model.capabilities as any)?.embedding);
  const canChat = isModelConfigured(selected);
  const tools = canChat && !!(selected?.capabilities as any)?.tools;
  return {
    modelId: selected?.id ?? null,
    defaultModelId: config.mainModelId ?? null,
    canChat,
    rag: canChat && isModelConfigured(embedding),
    tools,
    online: tools && !!String(config.tavilyApiKey ?? '').trim(),
    models: chatModels.map(model => ({ id: model.id, title: model.title || model.modelKey, providerTitle: model.provider.title, ready: isModelConfigured(model) })),
  };
}
