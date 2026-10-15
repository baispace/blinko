export function isModelConfigured(model: { modelKey: string; provider: { provider: string; apiKey?: string | null; baseURL?: string | null } } | undefined) {
  if (!model?.modelKey.trim()) return false;
  const { provider, apiKey, baseURL } = model.provider;
  if (['ollama', 'custom', 'litellm'].includes(provider.toLowerCase())) return !!baseURL?.trim();
  return !!apiKey?.trim();
}
