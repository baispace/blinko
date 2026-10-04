import Image from '@tiptap/extension-image'
import { mergeAttributes } from '@tiptap/core'
import { toContentFileUrl } from '../editorStore'
import { toAuthenticatedFileUrl } from '@/lib/fileUrl'

/**
 * 正文内联图片（markdown `![](path)` → image 节点）。
 *
 * 只在「渲染成 DOM」这一步把内部路径解析为可访问地址（CDN 绝对地址 / 本地
 * ?token=），markdown 序列化仍然写原始路径 —— 否则 JWT、环境相关的 CDN
 * 域名会被写进笔记内容里（换环境/换登录就失效）。
 * 节点名保持 `image`，tiptap-markdown 的默认 image 序列化规则不受影响。
 *
 * 尺寸（width）/ 对齐（align）：
 *  - 只有用户显式调整过才写进内容，格式为行内 HTML
 *    `<img src="..." width="320" align="center" />`。
 *    渲染端开了 rehype-raw，markdown-it 也开了 html:true，两端都能解析回来。
 *  - 未调整过的图片仍是纯 `![](path)`，存量笔记与导出格式完全不变。
 */

export type ImageAlign = 'left' | 'center' | 'right'

const ALIGNS: ImageAlign[] = ['left', 'center', 'right']

export const isImageAlign = (v: unknown): v is ImageAlign =>
  typeof v === 'string' && (ALIGNS as string[]).includes(v)

export const normalizeWidth = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n)
}

/** HTML 属性值转义：src / alt 来自用户输入，直接拼接会截断标签 */
const escapeAttr = (v: string) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const ContentImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => normalizeWidth(element.getAttribute('width')),
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
      },
      align: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute('align') ?? element.getAttribute('data-align')
          return isImageAlign(raw) ? raw : null
        },
        renderHTML: (attrs) => (isImageAlign(attrs.align) ? { 'data-align': attrs.align } : {}),
      },
    }
  },

  renderHTML({ HTMLAttributes }) {
    const raw = String((HTMLAttributes as any)?.src ?? '')
    const src = raw ? toAuthenticatedFileUrl(toContentFileUrl(raw)) : raw
    return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { src })]
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const src = String(node.attrs?.src ?? '')
          const alt = String(node.attrs?.alt ?? '')
          const width = normalizeWidth(node.attrs?.width)
          const align = isImageAlign(node.attrs?.align) ? node.attrs.align : null

          // 表格里的行内 HTML 会打断表格结构，那里退回标准 markdown 语法
          if ((!width && !align) || state?.inTable) {
            state.write(`![${alt}](${src})`)
            return
          }

          const attrs = [`src="${escapeAttr(src)}"`]
          if (alt) attrs.push(`alt="${escapeAttr(alt)}"`)
          if (width) attrs.push(`width="${width}"`)
          if (align) attrs.push(`align="${align}"`)
          state.write(`<img ${attrs.join(' ')} />`)
        },
      },
    }
  },
})
