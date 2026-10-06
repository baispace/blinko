/**
 * 标签 token（`#标签名`）的判定规则。
 *
 * 服务端 upsert 用它建 tagsToNote 关系，阅读侧用它给标签上色，编辑器侧用它做行内高亮。
 * 三处必须看到同一批 token，否则会出现「卡片上是标签、编辑器里没高亮」这类错位。
 *
 * 判定规则与服务端 `note.ts` 的 extractHashtags 保持一致：token 两侧必须是空白或
 * 文档边界，且不含空白与 `#`。层级标签 `#a/b` 是单个 token（`/` 允许）。
 *
 * 不用 lookbehind 断言：helper.regex 里有注释说明 iOS webview 不支持，扫描要跑在
 * 浏览器里，所以边界判断手工做。
 */

export interface HashtagToken {
  /** 完整 token，含 `#`，如 `#新人指南/更多资料` */
  token: string
  /** 不含 `#` 的标签名，如 `新人指南/更多资料` */
  name: string
  /** 在原文中的起止位置，可直接用于回写 */
  start: number
  end: number
}

/**
 * 把围栏代码块与行内代码挖成等长空格 —— 偏移量全部保留，
 * 于是扫描结果的位置可以直接用于改写原文，不用再做一次字符串对齐。
 */
const maskCode = (input: string): string =>
  input
    .replace(/```[\s\S]*?```/g, (m) => ' '.repeat(m.length))
    .replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length))

/** 扫描正文里所有标签 token（代码块内的不算） */
export const scanHashtagTokens = (content?: string | null): HashtagToken[] => {
  if (!content) return []
  const masked = maskCode(content)
  const tokens: HashtagToken[] = []
  for (const match of masked.matchAll(/#[^\s#]+/g)) {
    const start = match.index ?? -1
    if (start < 0) continue
    const end = start + match[0].length
    // 必须是「独立的一个词」：左邻空白/文首，右邻空白/文尾
    if (start > 0 && !/\s/.test(masked[start - 1])) continue
    if (end < masked.length && !/\s/.test(masked[end])) continue
    tokens.push({
      token: content.slice(start, end),
      name: content.slice(start + 1, end),
      start,
      end,
    })
  }
  return tokens
}
