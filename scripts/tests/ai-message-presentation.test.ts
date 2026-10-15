import { cleanConversationTitle } from '../../shared/lib/conversationTitle';
import { describe, expect, test } from 'bun:test';
import { splitAssistantContent } from '../../app/src/components/BlinkoAi/messagePresentation';
import { isModelConfigured } from '../../server/lib/modelReadiness';
describe('Conversation presentation', () => {
  test('uses the actual title instead of the model reasoning', () => {
    expect(cleanConversationTitle('<think>long internal commentary</think>\n询问模型身份')).toBe('询问模型身份');
    expect(cleanConversationTitle('<think>unfinished', '新对话')).toBe('新对话');
    expect(cleanConversationTitle('技能：沉淀笔记\n用户确认的来源')).toBe('技能：沉淀笔记');
  });
  test('keeps the complete final answer while folding explicit process text', () => {
    const result = splitAssistantContent('<think>正在查找\n校对信息</think>\n# 结论\n全部正文');
    expect(result.answer).toBe('# 结论\n全部正文');
    expect(result.process).toContain('校对信息');
  });
  test('does not leak an unfinished process block into the answer during streaming', () => {
    expect(splitAssistantContent('<think>还在处理').answer).toBe('');
    expect(splitAssistantContent('<think>还在处理').thinking).toBe(true);
  });
  test('keeps code examples and ordinary explanations intact', () => {
    const answer = '解释完整保留\n```html\n<think>这是代码示例</think>\n```';
    expect(splitAssistantContent(answer).answer).toBe(answer);
    expect(splitAssistantContent(answer).process).toBe('');
  });
  test('hides unavailable hosted models while allowing configured local providers', () => {
    expect(isModelConfigured(undefined)).toBe(false);
    expect(isModelConfigured({ modelKey: 'model', provider: { provider: 'openai', apiKey: '' } })).toBe(false);
    expect(isModelConfigured({ modelKey: 'model', provider: { provider: 'ollama', baseURL: 'http://localhost:11434' } })).toBe(true);
    expect(isModelConfigured({ modelKey: 'model', provider: { provider: 'custom', baseURL: 'http://localhost:8000/v1' } })).toBe(true);
  });
});
