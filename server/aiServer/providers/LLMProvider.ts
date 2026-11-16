import { LanguageModelV1, ProviderV1 } from '@ai-sdk/provider';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOllama } from 'ollama-ai-provider';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createXai } from '@ai-sdk/xai';
import { createAzure } from '@ai-sdk/azure';
import { BaseProvider } from './BaseProvider';
import { providerDefaultBaseURL } from '@shared/lib/providerDefaults';

interface LLMConfig {
  provider: string;
  apiKey?: any;
  baseURL?: any;
  modelKey: string;
  apiVersion?: any;
}

/**
 * xAI 的 OpenAI 兼容端点固定挂在 /v1 下。
 * 早期模板写入的是 https://api.x.ai（少一层），直接透传给 SDK 会 404，
 * 所以这里统一补齐再交给 createXai。
 */
function normalizeXaiBaseURL(baseURL?: any): string {
  const raw = (typeof baseURL === 'string' ? baseURL : '').trim();
  if (!raw) return providerDefaultBaseURL('grok')!;
  const trimmed = raw.replace(/\/+$/, '');
  return /\/v1$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

export class LLMProvider extends BaseProvider {
  async getLanguageModel(config: LLMConfig): Promise<LanguageModelV1> {
    await this.ensureInitialized();
    switch (config.provider.toLowerCase()) {
      case 'openai':
        return createOpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseURL || undefined,
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);

      case 'anthropic':
        return createAnthropic({
          apiKey: config.apiKey,
          baseURL: config.baseURL || undefined,
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);

      case 'gemini':
      case 'google':
        return createGoogleGenerativeAI({
          apiKey: config.apiKey,
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);

      case 'ollama':
        return createOllama({
          baseURL: config.baseURL?.trim().replace(/\/api$/, '') + '/api' || undefined,
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);

      case 'deepseek':
        return createDeepSeek({
          apiKey: config.apiKey,
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);

      case 'openrouter':
        return createOpenRouter({
          apiKey: config.apiKey,
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);

      case 'grok':
      case 'xai':
      case 'grokbot':
        return createXai({
          apiKey: config.apiKey,
          baseURL: normalizeXaiBaseURL(config.baseURL),
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);

      case 'azureopenai':
      case 'azure':
        return createAzure({
          apiKey: config.apiKey,
          baseURL: config.baseURL || undefined,
          apiVersion: config.apiVersion || undefined,
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);

      case 'minimax':
        return createOpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseURL || providerDefaultBaseURL('minimax'),
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);

      case 'minimax-cn':
        // 国内站与国际站账号、Key 完全不互通，base URL 也必须分开
        return createOpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseURL || providerDefaultBaseURL('minimax-cn'),
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);

      case 'litellm':
        return createOpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseURL || 'http://localhost:4000/v1',
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);

      case 'custom':
      default:
        return createOpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseURL || undefined,
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);
    }
  }
}