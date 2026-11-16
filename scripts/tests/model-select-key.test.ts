import { describe, expect, test } from 'bun:test';
import { findModelTemplate, inferModelCapabilities, resolveProviderModelKey } from '../../shared/lib/modelTemplates';

// 服务商目录（与 server/routerTrpc/ai.ts 里 minimax / minimax-cn 的静态列表一致）：
// 同一个模型同时存在 modelKey（MiniMax-H3-Image）和显示名（MiniMax H3-Image）两种写法。
const minimaxCatalog = [
  { id: 'MiniMax-M3', name: 'MiniMax M3' },
  { id: 'MiniMax-M3.1-Flash', name: 'MiniMax M3.1 Flash' },
  { id: 'MiniMax-M2.7', name: 'MiniMax M2.7' },
  { id: 'MiniMax-H3-Image', name: 'MiniMax H3-Image' },
  { id: 'MiniMax-H3-Image-Highspeed', name: 'MiniMax H3-Image Highspeed' },
  { id: 'image-01', name: 'MiniMax Image 01' },
  { id: 'image-01-live', name: 'MiniMax Image 01 Live' },
];

describe('模型下拉选择 → modelKey / config 映射', () => {
  test('显示名要映射回真实 modelKey', () => {
    expect(resolveProviderModelKey(minimaxCatalog, 'MiniMax H3-Image')).toBe('MiniMax-H3-Image');
    expect(resolveProviderModelKey(minimaxCatalog, 'MiniMax H3-Image Highspeed')).toBe('MiniMax-H3-Image-Highspeed');
    expect(resolveProviderModelKey(minimaxCatalog, 'MiniMax Image 01')).toBe('image-01');
    expect(resolveProviderModelKey(minimaxCatalog, 'MiniMax M3.1 Flash')).toBe('MiniMax-M3.1-Flash');
  });

  test('已经是 modelKey 时保持不变', () => {
    expect(resolveProviderModelKey(minimaxCatalog, 'MiniMax-H3-Image')).toBe('MiniMax-H3-Image');
    expect(resolveProviderModelKey(minimaxCatalog, 'image-01-live')).toBe('image-01-live');
  });

  test('目录里没有的值原样返回（还要支持手输任意模型）', () => {
    expect(resolveProviderModelKey(minimaxCatalog, 'my-custom-model')).toBe('my-custom-model');
    expect(resolveProviderModelKey(minimaxCatalog, '')).toBe('');
    expect(resolveProviderModelKey([], 'MiniMax-H3-Image')).toBe('MiniMax-H3-Image');
  });

  test('显示名也能查到模板，不会把生图协议丢掉', () => {
    const template = findModelTemplate('MiniMax H3-Image');
    expect(template).toBeDefined();
    expect(template!.modelKey).toBe('MiniMax-H3-Image');
    expect(template!.config?.imageGenerationProtocol).toBe('minimax');
  });

  test('显示名与 modelKey 推断出的能力一致', () => {
    expect(inferModelCapabilities('MiniMax H3-Image')).toEqual(inferModelCapabilities('MiniMax-H3-Image'));
    expect(inferModelCapabilities('MiniMax H3-Image').imageGeneration).toBe(true);
    expect(inferModelCapabilities('MiniMax H3-Image').inference).toBe(false);
    expect(inferModelCapabilities('MiniMax Image 01').imageGeneration).toBe(true);
  });

  test('归一化不会把别的模型串味', () => {
    expect(findModelTemplate('gpt-4o')?.modelKey).toBe('gpt-4o');
    expect(findModelTemplate('MiniMax M3')?.modelKey).toBe('MiniMax-M3');
    expect(findModelTemplate('claude-3-5-sonnet-20241022')?.modelKey).toBe('claude-3-5-sonnet-20241022');
  });

  test('映射 + 查模板串起来：下拉选出的模型一定带得上模板配置', () => {
    for (const item of minimaxCatalog) {
      const key = resolveProviderModelKey(minimaxCatalog, item.name);
      expect(key).toBe(item.id);
      const template = findModelTemplate(key);
      if (item.id.includes('Image') || item.id.includes('image')) {
        expect(template?.config?.imageGenerationProtocol).toBe('minimax');
      }
    }
  });

  test('M3.1 Flash 要命中自己的模板，不能被 M3 抢走', () => {
    const key = resolveProviderModelKey(minimaxCatalog, 'MiniMax M3.1 Flash');
    expect(key).toBe('MiniMax-M3.1-Flash');
    expect(findModelTemplate('MiniMax M3.1 Flash')?.modelKey).toBe('MiniMax-M3.1-Flash');
    expect(findModelTemplate('MiniMax M3.1 Flash')?.title).toBe('MiniMax M3.1 Flash');
  });
});
