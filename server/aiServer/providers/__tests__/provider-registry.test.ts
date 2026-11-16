import { describe, it, expect, mock, beforeEach } from 'bun:test';

// Mock the proxy module before importing LLMProvider
mock.module('@server/lib/proxy', () => ({
  fetchWithProxy: async () => fetch
}));

const mockCreateOpenAI = mock((config: any) => ({
  languageModel: mock((modelKey: string) => ({ modelId: modelKey }))
}));
const mockCreateXai = mock((config: any) => ({
  languageModel: mock((modelKey: string) => ({ modelId: modelKey }))
}));

mock.module('@ai-sdk/openai', () => ({ createOpenAI: mockCreateOpenAI }));
mock.module('@ai-sdk/xai', () => ({ createXai: mockCreateXai }));

// Mock other SDK modules to avoid import errors
mock.module('@ai-sdk/anthropic', () => ({
  createAnthropic: mock(() => ({ languageModel: mock(() => ({})) }))
}));
mock.module('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: mock(() => ({ languageModel: mock(() => ({})) }))
}));
mock.module('ollama-ai-provider', () => ({
  createOllama: mock(() => ({ languageModel: mock(() => ({})) }))
}));
mock.module('@ai-sdk/deepseek', () => ({
  createDeepSeek: mock(() => ({ languageModel: mock(() => ({})) }))
}));
mock.module('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: mock(() => ({ languageModel: mock(() => ({})) }))
}));
mock.module('@ai-sdk/azure', () => ({
  createAzure: mock(() => ({ languageModel: mock(() => ({})) }))
}));

describe('新增服务商分支', () => {
  beforeEach(() => {
    mockCreateOpenAI.mockClear();
    mockCreateXai.mockClear();
  });

  it('minimax-cn 走 OpenAI 兼容，默认国内站地址', async () => {
    const { LLMProvider } = await import('../LLMProvider');
    await new LLMProvider().getLanguageModel({
      provider: 'minimax-cn',
      apiKey: 'cn-key',
      modelKey: 'MiniMax-M3'
    });
    expect(mockCreateOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'cn-key', baseURL: 'https://api.minimaxi.com/v1' })
    );
  });

  it('minimax-cn 允许自定义 base URL', async () => {
    const { LLMProvider } = await import('../LLMProvider');
    await new LLMProvider().getLanguageModel({
      provider: 'minimax-cn',
      apiKey: 'cn-key',
      baseURL: 'https://api.minimax.cn/v1',
      modelKey: 'MiniMax-M3'
    });
    expect(mockCreateOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://api.minimax.cn/v1' })
    );
  });

  it('grokbot 走 xAI 官方 API', async () => {
    const { LLMProvider } = await import('../LLMProvider');
    await new LLMProvider().getLanguageModel({
      provider: 'grokbot',
      apiKey: 'xai-key',
      modelKey: 'grok-4.20-multi-agent'
    });
    expect(mockCreateXai).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'xai-key', baseURL: 'https://api.x.ai/v1' })
    );
  });

  it('历史遗留的不带 /v1 的 xAI 地址会被补齐，不会 404', async () => {
    const { LLMProvider } = await import('../LLMProvider');
    await new LLMProvider().getLanguageModel({
      provider: 'grok',
      apiKey: 'xai-key',
      baseURL: 'https://api.x.ai',
      modelKey: 'grok-4.7'
    });
    expect(mockCreateXai).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://api.x.ai/v1' })
    );
  });

  it('已经带 /v1 的地址不会被重复拼接', async () => {
    const { LLMProvider } = await import('../LLMProvider');
    await new LLMProvider().getLanguageModel({
      provider: 'grokbot',
      apiKey: 'xai-key',
      baseURL: 'https://api.x.ai/v1/',
      modelKey: 'grok-4.7'
    });
    expect(mockCreateXai).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://api.x.ai/v1' })
    );
  });
});
