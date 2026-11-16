/**
 * 服务商的默认接入地址。
 *
 * MiniMax 国内站与国际站的账号、Key、域名都不互通，地址必须按服务商类型分开；
 * xAI 的 OpenAI 兼容端点固定挂在 /v1 下。
 * 这些地址以前散落在前端模板表和后端各写一份，只要改漏一处就会打到旧域名
 * （例如已废弃的 api.minimax.cn）上，所以统一收在这里。
 */
export const PROVIDER_DEFAULT_BASE_URL = {
  minimax: 'https://api.minimax.io/v1',
  'minimax-cn': 'https://api.minimaxi.com/v1',
  grok: 'https://api.x.ai/v1',
  grokbot: 'https://api.x.ai/v1',
} as const;

export type ProviderDefaultBaseURLKey = keyof typeof PROVIDER_DEFAULT_BASE_URL;

export function providerDefaultBaseURL(provider: string): string | undefined {
  return PROVIDER_DEFAULT_BASE_URL[provider.toLowerCase() as ProviderDefaultBaseURLKey];
}
