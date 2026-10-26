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

/**
 * 服务就绪状态：给「按服务决定入口是否出现」的前端用。
 *
 * 与 getChatCapabilities 的区别：
 *   - 这里只看默认模型（config 里的 mainModelId / embeddingModelId），不接受临时指定；
 *   - chat 与 embedding 分开报 —— 「关联笔记」这类功能两个都要，别的只要一个；
 *   - readiness 看的是「服务商凭据齐不齐」，不是「模型 ID 填了没」——
 *     填了 ID 但把 API Key 删了，等于没配。
 */
export async function getServiceCapabilities() {
  const config = await AiModelFactory.globalConfig();
  const models = await prisma.aiModels.findMany({ include: { provider: true } });
  const inference = models.find(
    model => model.id === config.mainModelId && !!(model.capabilities as any)?.inference,
  );
  const embedding = models.find(
    model => model.id === config.embeddingModelId && !!(model.capabilities as any)?.embedding,
  );
  return {
    chat: isModelConfigured(inference),
    embedding: isModelConfigured(embedding),
  };
}
