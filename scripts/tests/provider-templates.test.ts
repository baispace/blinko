import { describe, expect, test } from 'bun:test';
import { PROVIDER_TEMPLATES } from '../../app/src/components/BlinkoSettings/AiSetting/constants';
import { QUICK_PROVIDERS } from '../../shared/lib/quickModelSetup';
import { DEFAULT_MODEL_TEMPLATES, inferModelCapabilities } from '../../shared/lib/modelTemplates';
import { imageProtocol } from '../../server/lib/blogCoverGeneration';

const template = (value: string) => PROVIDER_TEMPLATES.find(item => item.value === value);

describe('服务商模板注册表', () => {
  test('MiniMax 国内站与国际站是两条独立配置', () => {
    const cn = template('minimax-cn');
    const intl = template('minimax');
    expect(cn).toBeDefined();
    expect(intl).toBeDefined();
    // 两站账号与 Key 不互通，base URL 必须分开
    expect(cn!.defaultBaseURL).toBe('https://api.minimaxi.com/v1');
    expect(intl!.defaultBaseURL).toBe('https://api.minimax.io/v1');
    expect(cn!.defaultBaseURL).not.toBe(intl!.defaultBaseURL);
  });

  test('Grok Bot 是独立条目，走 xAI 官方 API', () => {
    const bot = template('grokbot');
    expect(bot).toBeDefined();
    expect(bot!.defaultBaseURL).toBe('https://api.x.ai/v1');
    expect(bot!.docs).toContain('docs.x.ai/grok-bot');
  });

  test('xAI 兼容端点必须带 /v1，否则拉模型列表会 404', () => {
    expect(template('grok')!.defaultBaseURL).toBe('https://api.x.ai/v1');
  });

  test('快速配置下拉包含新增的两个服务商', () => {
    expect(QUICK_PROVIDERS).toContain('minimax-cn');
    expect(QUICK_PROVIDERS).toContain('grokbot');
  });
});

describe('Grok 模型能力', () => {
  test('构建与对话模型具备对话和工具能力', () => {
    for (const key of ['grok-build-0.1', 'grok-code-fast-1', 'grok-4.7']) {
      const caps = inferModelCapabilities(key);
      expect(caps.inference).toBe(true);
      expect(caps.tools).toBe(true);
    }
  });

  test('带日期后缀的推理模型也能套到同一个模板', () => {
    const caps = inferModelCapabilities('grok-4.20-0309-reasoning');
    expect(caps.inference).toBe(true);
    expect(caps.tools).toBe(true);
  });

  test('模板表里登记了 Grok 模型', () => {
    const keys = DEFAULT_MODEL_TEMPLATES.map(item => item.modelKey);
    expect(keys).toContain('grok-build-0.1');
    expect(keys).toContain('grok-code-fast-1');
  });

  test('多智能体模型不走 chat/completions，不能登记成可用模板', () => {
    // xAI 对 grok-4.20-multi-agent 返回 400：not allowed on chat completions
    const keys = DEFAULT_MODEL_TEMPLATES.map(item => item.modelKey);
    expect(keys.some(key => key.startsWith('grok-4.20-multi-agent'))).toBe(false);
  });
});

describe('封面生图的服务商判定', () => {
  const imageModel = (provider: string) => ({
    id: 1,
    title: 'image',
    modelKey: 'image-01',
    capabilities: { imageGeneration: true },
    provider: { provider, apiKey: 'key', baseURL: 'https://api.minimaxi.com/v1' }
  }) as any;

  test('国内站与国际站都走 MiniMax 原生生图协议', () => {
    expect(imageProtocol(imageModel('minimax'))).toBe('minimax');
    expect(imageProtocol(imageModel('minimax-cn'))).toBe('minimax');
  });

  test('对话模型不能靠勾选能力变成生图模型', () => {
    const text = { ...imageModel('minimax-cn'), modelKey: 'MiniMax-M3.1-Flash' } as any;
    expect(imageProtocol(text)).toBeNull();
  });
});
