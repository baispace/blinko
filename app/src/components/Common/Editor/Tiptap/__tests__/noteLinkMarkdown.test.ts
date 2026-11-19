import { describe, expect, test } from 'bun:test'
import MarkdownIt from 'markdown-it'
import { noteLinkMarkdownPlugin } from '../noteLinkMarkdown'

const render = (src: string) => new MarkdownIt({ html: true }).use(noteLinkMarkdownPlugin).render(src)

describe('noteLinkMarkdownPlugin', () => {
  test('turns wiki links into note-link spans', () => {
    const html = render('见 [[18|帮我完善一个详情相关推荐的策略。]] 这篇文章')
    expect(html).toContain('data-type="note-link"')
    expect(html).toContain('data-id="18"')
    expect(html).toContain('data-title="帮我完善一个详情相关推荐的策略。"')
    expect(html).not.toContain('[[18|')
  })

  test('leaves inline code alone', () => {
    const html = render('代码 `[[18|标题]]` 不要解析')
    expect(html).toContain('[[18|标题]]')
    expect(html).not.toContain('data-type="note-link"')
  })

  test('escapes titles in attributes', () => {
    const html = render('[[2|a "quote" & <x>]]')
    expect(html).toContain('data-title="a &quot;quote&quot; &amp; &lt;x&gt;"')
  })

  test('ignores invalid ids', () => {
    const html = render('[[0|zero]] [[-3|neg]] [[abc|x]]')
    expect(html).not.toContain('data-type="note-link"')
  })
})
