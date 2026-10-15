import { userCaller } from '@server/routerTrpc/_app';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod/v3';
import { verifyToken } from '@server/lib/helper';

/**
 * 把外部 AI 工具（ChatGPT 定时任务 / 其他 Agent）产生的对话导入 Blinko 会话历史。
 *
 * 幂等由 (accountId, externalId) 和 (conversationId, externalId) 两层唯一键保证：
 * 同一个 externalId 重复导入只会更新，不会产生第二份会话。
 *
 * ⚠️ 调用方（尤其是 LLM）必须生成**确定性**的 externalId。
 * 如果每次都传随机 ID，每次调用都会新建一条会话 —— 这正是这里最容易踩的坑。
 * 正确做法是由「任务标识 + 时间桶」拼出来，例如：
 *   chatgpt-task:每日资讯:2026-10-15
 * 同一天内重试会命中同一条会话并更新，而不是堆积。
 */
export const importConversationTool = createTool({
  id: 'import-conversation-tool',
  description: [
    'Import an AI conversation into Blinko so it shows up in the conversation history.',
    '',
    'Use this when you finish generating a scheduled/batch conversation and want the full',
    'exchange (prompts + answers + model names) preserved in Blinko.',
    '',
    'CRITICAL — externalId must be DETERMINISTIC. It is the idempotency key. Re-importing the',
    'same externalId updates that conversation in place; a fresh random id creates a duplicate.',
    'Derive it deterministically from the task identity plus a time bucket, e.g.',
    '  "chatgpt-task:daily-digest:2026-10-15"',
    '  "chatgpt-task:weekly-review:2026-W42"',
    '  "chatgpt-task:hourly-check:2026-10-15T14"',
    'Only change it when the content is genuinely a new run of a new time bucket.',
    '',
    'Message externalIds are optional — if omitted, a stable hash of role+content is used,',
    'which still keeps re-runs idempotent.',
  ].join('\n'),
  inputSchema: z.object({
    externalId: z
      .string()
      .describe(
        'Stable idempotency key for the whole conversation. MUST be deterministic across re-runs. ' +
          'Recommended format: `${source}:${taskName}:${timeBucket}`, e.g. "chatgpt-task:daily-digest:2026-10-15".',
      ),
    title: z.string().optional().describe('Human readable conversation title. Falls back to externalId.'),
    source: z
      .string()
      .optional()
      .default('chatgpt-task')
      .describe('Where this came from, for filtering. e.g. "chatgpt-task", "claude", "custom-script".'),
    messages: z
      .array(
        z.object({
          externalId: z.string().optional().describe('Stable id for this message. Optional — hashed if omitted.'),
          role: z.string().describe('"user" or "assistant" (aliases like "human"/"ai"/"model" are also accepted).'),
          content: z.string().describe('Message body. Preserve the full text, do not truncate or summarize.'),
          model: z.string().optional().describe('Model that produced this message, e.g. "gpt-5", "claude-opus-4".'),
        }),
      )
      .describe('The conversation, in chronological order. Include the whole exchange.'),
    pruneMissing: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Set true only when this payload is the complete new state of the thread and you want ' +
          'messages missing from it deleted. Leave false for normal incremental imports.',
      ),
    token: z.string().optional().describe('internal use, do not pass!'),
  }),
  execute: async ({ context }) => {
    const accountId = (await verifyToken(context.token))?.sub;
    if (!accountId) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const caller = userCaller({
        id: String(accountId),
        exp: 0,
        iat: 0,
        name: 'external-import',
        sub: String(accountId),
        role: 'user',
      });

      return await caller.aiImport.import({
        conversation: {
          externalId: context.externalId,
          title: context.title,
          source: context.source,
        },
        messages: context.messages.map((m: any) => ({
          externalId: m.externalId,
          role: m.role,
          content: m.content,
          model: m.model,
        })),
        pruneMissing: context.pruneMissing,
      });
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  },
});
