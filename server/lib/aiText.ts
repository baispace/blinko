/**
 * 推理型模型会返回 <think>...</think> 思考块，分析文字不能被当成正文内容。
 *
 * 单独放在这里，是因为它被三方共用：aiServer 的各个 Agent、AI 工具、以及
 * server/lib 下的博客文案生成。放在 aiModelFactory 里会让 server/lib →
 * aiModelFactory → AI 工具 → routerTrpc/_app → 各业务 router 形成循环依赖，
 * ESM 下表现为 "Export named 'stripThinkText' not found"。
 */
export function stripThinkText(text: string): string {
  return String(text ?? "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    .trim();
}
