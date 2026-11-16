import { describe, expect, test } from 'bun:test';
import { PROVIDER_DEFAULT_BASE_URL, providerDefaultBaseURL } from '../../shared/lib/providerDefaults';
import { PROVIDER_TEMPLATES } from '../../app/src/components/BlinkoSettings/AiSetting/constants';

const template = (value: string) => PROVIDER_TEMPLATES.find(item => item.value === value);

describe('服务商默认接入地址', () => {
  test('MiniMax 国内站与国际站地址必须不同', () => {
    expect(PROVIDER_DEFAULT_BASE_URL.minimax).toBe('https://api.minimax.io/v1');
    expect(PROVIDER_DEFAULT_BASE_URL['minimax-cn']).toBe('https://api.minimaxi.com/v1');
    expect(PROVIDER_DEFAULT_BASE_URL.minimax).not.toBe(PROVIDER_DEFAULT_BASE_URL['minimax-cn']);
  });

  test('xAI 系列统一挂在 /v1 下', () => {
    expect(PROVIDER_DEFAULT_BASE_URL.grok).toBe('https://api.x.ai/v1');
    expect(PROVIDER_DEFAULT_BASE_URL.grokbot).toBe('https://api.x.ai/v1');
  });

  test('不再使用已废弃的 api.minimax.cn', () => {
    const all = Object.values(PROVIDER_DEFAULT_BASE_URL);
    expect(all.every(url => !url.includes('api.minimax.cn'))).toBe(true);
  });

  test('查找不区分大小写', () => {
    expect(providerDefaultBaseURL('MiniMax-CN')).toBe('https://api.minimaxi.com/v1');
    expect(providerDefaultBaseURL('MINIMAX')).toBe('https://api.minimax.io/v1');
    expect(providerDefaultBaseURL('unknown')).toBeUndefined();
  });

  test('前端模板表与后端兜底用同一份地址，不会各写各的', () => {
    for (const value of ['minimax', 'minimax-cn', 'grok', 'grokbot']) {
      expect(template(value)!.defaultBaseURL).toBe(providerDefaultBaseURL(value));
    }
  });
});
