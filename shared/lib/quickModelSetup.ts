import { z } from 'zod';
export const QUICK_PROVIDERS=['openai','anthropic','google','ollama','openrouter','deepseek','siliconflow','grok','minimax','custom'] as const;
export const quickModelSetupSchema = z.object({
  providerId: z.number().int().positive().optional(),
  provider: z.object({
    title:z.string().trim().min(1).max(100),
    provider:z.enum(QUICK_PROVIDERS),
    baseURL:z.string().trim().url().max(500).refine(value => /^https?:\/\//i.test(value)),
    apiKey:z.string().trim().max(500),
  }).optional(),
  modelKey:z.string().trim().min(1).max(255),
  makeDefault:z.boolean().default(false),
}).superRefine((value,ctx) => {
  if (!!value.providerId === !!value.provider) ctx.addIssue({code:'custom',message:'请选择已有服务商，或填写新的服务商信息'});
  if(value.provider && value.provider.provider !== 'ollama' && !value.provider.apiKey) ctx.addIssue({code:'custom',message:'请填写 API 密钥'});
});
