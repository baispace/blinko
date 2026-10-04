import { helper } from '@/lib/helper';
import { useTheme } from 'next-themes';
import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { observer } from 'mobx-react-lite';
import { BlinkoStore } from '@/store/blinkoStore';
import { RootStore } from '@/store';
import rehypeRaw from 'rehype-raw';
import { Code } from './Code';
import { LinkPreview } from './LinkPreview';
import { ImageWrapper } from './ImageWrapper';
import { ListItem } from './ListItem';
import { TableWrapper } from './TableWrapper';
import { useNavigate, useLocation } from 'react-router-dom';
import remarkTaskList from 'remark-task-list';
// 单换行渲染成 <br>（GitHub 评论风格）。没有它时，含行内格式（**加粗**/`代码`/链接）的段落
// 会把单个 \n 当成空格吞掉 —— 编辑时看到的换行保存后就没了。
import remarkBreaks from 'remark-breaks';
import { Skeleton } from '@heroui/react';
// Heavy renderers are loaded on demand: mermaid pulls its own diagram chunks,
// echarts bundles zrender, and markmap-lib is only needed for ```mindmap blocks.
// Keeping them static added ~3MB (uncompressed) to the first-load bundle.
const MermaidWrapper = lazy(() => import('./MermaidWrapper').then(m => ({ default: m.MermaidWrapper })));
const MarkmapWrapper = lazy(() => import('./MarkmapWrapper').then(m => ({ default: m.MarkmapWrapper })));
const EchartsWrapper = lazy(() => import('./EchartsWrapper').then(m => ({ default: m.EchartsWrapper })));

const DiagramFallback = () => <Skeleton className="w-full h-40 my-4 rounded-lg" />;

// KaTeX is ~535 KB minified. Most notes contain no math at all, so the plugins
// and their stylesheet are only pulled in once a `$` shows up in the content.
const useMathPlugins = (content: string) => {
  const [plugins, setPlugins] = useState<{ remark: any[], rehype: any[] }>({ remark: [], rehype: [] });
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    if (!content?.includes('$')) return;
    let cancelled = false;
    (async () => {
      const [{ default: remarkMath }, { default: rehypeKatex }] = await Promise.all([
        import('remark-math'),
        import('rehype-katex')
      ]);
      await import('katex/dist/katex.min.css');
      if (cancelled) return;
      loadedRef.current = true;
      setPlugins({
        remark: [[remarkMath, {
          singleDollarTextMath: true,
          inlineMath: [['$', '$']],
          blockMath: [['$$', '$$']]
        }]],
        rehype: [[rehypeKatex, {
          throwOnError: false,
          output: 'html',
          trust: true,
          strict: false
        }]]
      });
    })();
    return () => { cancelled = true; };
  }, [content]);

  return plugins;
};

const HighlightTags = observer(({ text, }: { text: any }) => {
  const location = useLocation();
  const navigate = useNavigate();
  if (!text) return text
  const isShareMode = location.pathname.includes('share')

  const goTag = (tag: string) => {
    if (isShareMode) return
    // 保持当前所在视图（闪念/笔记/待办），仅做标签搜索，不跳离当前页面
    const currentPath = new URLSearchParams(location.search).get('path');
    navigate(currentPath
      ? `/?path=${currentPath}&searchText=${encodeURIComponent(tag)}`
      : `/?searchText=${encodeURIComponent(tag)}`);
    RootStore.Get(BlinkoStore).forceQuery++
  }

  /**
   * 只对**文本**做 #tag 高亮；其余 React 节点（strong / code / a / br …）原样透传。
   * 早期版本把 children 递归拍成纯字符串后再分词，会把加粗、行内代码、链接、
   * 以及 remarkBreaks 生成的 <br> 全部抹掉 —— 那正是「换行不生效」的观感来源之一。
   */
  const highlightString = (str: string, keyPrefix: string): any => {
    // 用捕获组保留空白，避免自行补空格造成行尾多空格
    return str.replace(/&nbsp;/g, ' ').split(/(\s+)/).map((token, index) => {
      if (!token.startsWith('#')) return token
      if (token.length < 2 || !token.match(helper.regex.isContainHashTag)) return token
      return (
        <span key={`${keyPrefix}-${index}`}
          className={`select-none blinko-tag px-1 font-bold cursor-pointer hover:opacity-80 !transition-all ${isShareMode ? 'pointer-events-none' : ''}`}
          onClick={() => goTag(token)}>
          {token}
        </span>
      )
    })
  }

  const walk = (node: any, keyPrefix: string): any => {
    if (node == null || typeof node === 'boolean') return node
    if (typeof node === 'string' || typeof node === 'number') return highlightString(String(node), keyPrefix)
    if (Array.isArray(node)) return node.map((child, i) => walk(child, `${keyPrefix}-${i}`))
    const children = (node as any)?.props?.children
    // 没有 children 的元素（<br/>、<img/> 等）原样返回
    if (children === undefined) return node
    return React.cloneElement(node, { key: keyPrefix }, walk(children, `${keyPrefix}-c`))
  }

  return walk(text, 'ht')
});

const Table = ({ children }: { children: React.ReactNode }) => {
  return <div className="table-container">{children}</div>;
};

/**
 * Callout 是自定义的 HTML 块（<div data-callout-...>）。一旦它在正文里带了缩进
 * （嵌套在列表/引用内、粘贴或 AI 生成时带空格），markdown 会把它当成**缩进代码块**，
 * 于是列表里直接显示 `<div data-callout...>` 这类 HTML 文本。
 * 渲染前把 callout 块的行首缩进抬到顶层即可；``` 代码块内的内容不动，避免误伤示例代码。
 */
const liftIndentedCallouts = (content: string): string => {
  if (!content || !content.includes('data-callout')) return content
  let inFence = false
  let inCallout = false
  return content.split('\n').map(line => {
    if (line.trim().startsWith('```')) { inFence = !inFence; return line }
    if (inFence) return line
    if (line.includes('data-callout')) inCallout = true
    if (!inCallout) return line
    const lifted = line.replace(/^[ \t]+/, '')
    if (lifted.includes('</div>')) inCallout = false
    return lifted
  }).join('\n')
}

/**
 * 去掉行尾孤立单反斜杠（存量硬换行产物的兜底自愈）。
 * tiptap-markdown 默认把 hardBreak 序列化成 `\` + 换行，新代码已通过 MarkdownHardBreak
 * 扩展覆盖成裸 `\n`，理论上不会有 `\\\nB` 形态。但**存量笔记**可能仍然含此形态
 * （旧版本写入），渲染侧必须兼容。
 *
 * 规则收窄为「行尾且只有一个反斜杠、前面不是反斜杠」：
 *   - 单个 `\` = hardBreak 标记产物 → 删
 *   - 双反斜杠 `\\` = LaTeX/KaTeX 行尾（如 aligned / matrix）→ 保留
 *
 * 跳过 ``` 代码块与 $$ ... $$ 数学块，避免误伤示例代码与公式。
 * 注意：单行 `$$...$$` 是完整的数学块；多行矩阵 `$$\n\begin{matrix}...\end{matrix}\n$$`
 * 需正确识别起止行。
 */
export const stripTrailingBackslashes = (content: string): string => {
  if (!content) return content
  let inFence = false
  let inMath = false
  return content.split('\n').map(line => {
    if (line.trim().startsWith('```')) { inFence = !inFence; return line }
    if (inFence) return line
    // 检测本行 $$ 的出现次数。KaTeX 块起止标 `$$` 可单行配对（$$x=1$$）
    // 也可多行（$$\n\begin{matrix}...\end{matrix}\n$$）。
    // - 不在数学块内遇到 $$：进入数学块（inMath=true），计数奇数后退出（false）；
    //   偶数 = 同行配对，单行数学公式，本行进/出，下一行仍是 false
    // - 已在数学块内：保持状态；奇数结尾退出
    const matches = line.match(/\$\$/g)
    const dollarCount = matches ? matches.length : 0
    if (dollarCount > 0) {
      const wasInMath = inMath
      // 进入/退出按出现次数奇偶推进
      for (let i = 0; i < dollarCount; i++) inMath = !inMath
      // 单行配对（偶数个 $$）且进出抵消，回归 false
      if (dollarCount % 2 === 0) inMath = wasInMath
      return line
    }
    if (inMath) return line
    // (^|[^\\])\\$  ——  行尾是单 `\` 且前面不是 `\`；`\\` 双反斜杠不被匹配。
    return line.replace(/(^|[^\\])\\$/, '$1')
  }).join('\n')
}

export const MarkdownRender = observer(({ content = '', onChange, isShareMode, largeSpacing = false }: { content?: string, onChange?: (updater: (current: string) => string) => void, isShareMode?: boolean, largeSpacing?: boolean }) => {
  const { theme } = useTheme()
  const contentRef = useRef(null);
  const mathPlugins = useMathPlugins(content);
  const normalizedContent = stripTrailingBackslashes(liftIndentedCallouts(content));

  return (
    <div className={`markdown-body ${largeSpacing ? 'markdown-large-spacing' : ''}`}>
      <div ref={contentRef} data-markdown-theme={theme} className={`markdown-body content ${largeSpacing ? 'markdown-large-spacing' : ''}`}>
        <ReactMarkdown
          remarkPlugins={[
            remarkBreaks,
            [remarkGfm, { table: false }],
            remarkTaskList,
            ...mathPlugins.remark
          ]}
          rehypePlugins={[
            rehypeRaw,
            ...mathPlugins.rehype
          ]}
          components={{
            p: ({ node, children }) => {
              // 只含图片的段落：图片是块级展示，直接套在 <p> 里会形成
              // <div>（HeroUI Image 包裹层）嵌在 <p> 的非法嵌套，React 会告警、
              // 布局也容易被 margin 规则影响。改成块级容器渲染。
              const kids = node?.children ?? []
              const meaningful = kids.filter((c: any) => !(c.type === 'text' && !String(c.value || '').trim()))
              if (meaningful.length > 0 && meaningful.every((c: any) => c.type === 'element' && c.tagName === 'img')) {
                return <div className="md-image-block">{children}</div>
              }
              // Check if paragraph contains only a single link
              if (
                node &&
                node.children &&
                node.children.length === 1 && 
                node.children[0].type === 'element' && 
                node.children[0].tagName === 'a'
              ) {
                // This is a standalone link block
                const linkNode = node.children[0] as any;
                const href = linkNode.properties?.href;
                
                // Extract text content from link children
                // children passed to p is already React elements, so we can't easily reuse it for LinkPreview text prop
                // But LinkPreview expects ReactNode as text, so we can pass the children of the link
                // However, since we are replacing the p, we need to get the children of the a tag.
                // In ReactMarkdown, the children prop of p will contain the rendered a tag.
                
                // Let's verify if we can access the link properties directly
                if (typeof href === 'string') {
                  // We need to reconstruct the link content. 
                  // Since we are in the 'p' renderer, 'children' is the rendered 'a' element.
                  // We can't easily pass 'children' (which is <a>...</a>) as 'text' to LinkPreview.
                  // Instead, we'll let the 'a' renderer handle it, but we need a way to tell the 'a' renderer it's a block.
                  
                  // Actually, simpler approach:
                  // If we detect this pattern, we render a div instead of p, but we can't easily pass "isBlock" down 
                  // unless we render LinkPreview directly here.
                  
                  // To render LinkPreview here, we need the text content.
                  // linkNode.children contains the AST nodes for the link text.
                  
                  // Let's try to extract text from AST for simple cases
                  // This might lose formatting inside the link (e.g. bold), but that's rare for standalone links.
                  let linkText = href; // Default fallback
                  if (linkNode.children && linkNode.children.length > 0) {
                    // If it's just text
                    if (linkNode.children[0].type === 'text') {
                      linkText = linkNode.children[0].value;
                    } 
                    // If it's complex, we might just render the children variable which is the <a> tag
                    // But we want to replace the <a> tag with LinkPreview(isBlock=true)
                  }
                  
                  // Since we can't easily reconstruct the exact React children structure of the link here without recursion,
                  // and we want to use LinkPreview which accepts 'text' as ReactNode.
                  
                  // Better strategy: The 'a' component logic below handles inline vs block? 
                  // No, 'a' component doesn't know parent.
                  
                  // Strategy: Render the children (which is the <a> tag), but we can't modify props of already rendered children easily.
                  // Actually 'children' in p renderer IS the result of 'a' renderer if we don't override it?
                  // No, components are called during rendering.
                  
                  // Let's use the fact that we identified it's a block link.
                  // We can render LinkPreview directly.
                  
                  // To get the content of the link (the text):
                  // We can use a utility or just simplistic text extraction since standalone links usually just text.
                  
                  return (
                    <div className="my-2">
                      <LinkPreview href={href} text={linkText} isBlock={true} />
                    </div>
                  );
                }
              }
              return <p><HighlightTags text={children} /></p>;
            },
            code: ({ node, className, children, ...props }) => {
              const match = /language-(\w+)/.exec(className || '');
              const language = match ? match[1] : '';

              if (language === 'mermaid') {
                return <Suspense fallback={<DiagramFallback />}><MermaidWrapper content={String(children || '')} /></Suspense>;
              }

              if (language === 'mindmap') {
                return <Suspense fallback={<DiagramFallback />}><MarkmapWrapper content={String(children || '')} /></Suspense>;
              }

              if (language === 'echarts') {
                return <Suspense fallback={<DiagramFallback />}><EchartsWrapper options={String(children || '').trim()} /></Suspense>;
              }

              return <Code node={node} className={className} {...props}>{children}</Code>;
            },
            a: ({ node, children }) => {
              const href = node?.properties?.href;
              if (typeof href === 'string') {
                // By default render as inline (isBlock=false)
                return <LinkPreview href={href} text={children} isBlock={false} />
              }
              return <>{children}</>;
            },
            li: ({ node, children, className }) => {
              const isTaskListItem = className?.includes('task-list-item');
              if (isTaskListItem && onChange && !isShareMode) {
                // remark-task-list 会给每个任务项注入 id="task-list-item-N"，
                // N 是 DFS 全局递增序号，用它精确定位源 markdown 中的任务项。
                const id = node?.properties?.id as string | undefined;
                const taskIndex = typeof id === 'string' && id.startsWith('task-list-item-')
                  ? parseInt(id.slice('task-list-item-'.length), 10)
                  : -1;
                return (
                  <ListItem
                    onChange={onChange}
                    className={className}
                    taskIndex={taskIndex}
                  >
                    {children}
                  </ListItem>
                );
              }
              return <li className={className}>{children}</li>;
            },
            img: ImageWrapper,
            table: TableWrapper
          }}
        >
          {normalizedContent}
        </ReactMarkdown>
      </div>
    </div>
  );
});

export const StreamingCodeBlock = observer(({ markdown }: { markdown: string }) => {
  return (
    <ReactMarkdown components={{ code: Code }}>
      {markdown}
    </ReactMarkdown>
  );
}); 