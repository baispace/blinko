import { createHash } from "node:crypto";

/**
 * 发布相关的小工具：正文指纹、草稿标题、草稿概要。
 *
 * 放在 shared 里，前后端与服务端都能用 —— 「检查更新」要在服务端
 * 算差异，前台只是把算好的结果画出来，两边口径必须一致。
 */

/**
 * 正文版本指纹。
 *
 * AI 候选是按「已保存正文」生成的：正文在生成与应用之间被改过，
 * 旧候选就不能再套用。指纹只覆盖正文与内容类型 ——
 * 改标题、摘要、标签不应该让刚生成的候选失效。
 */
export function contentVersion(content: string, type: number) {
  return createHash("sha256")
    .update(`${type}:${content ?? ""}`)
    .digest("hex")
    .slice(0, 32);
}

export function publicationTitle(metadata: unknown) {
  const value =
    metadata && typeof metadata === "object" && "title" in metadata
      ? (metadata as { title?: unknown }).title
      : "";
  return typeof value === "string" ? value.trim().slice(0, 200) : "";
}

/** 草稿里的 AI 摘要。和标题一样，发布时冻结进公开快照。 */
export function publicationSummary(metadata: unknown) {
  const value =
    metadata && typeof metadata === "object" && "summary" in metadata
      ? (metadata as { summary?: unknown }).summary
      : "";
  return typeof value === "string" ? value.trim().slice(0, 2000) : "";
}
