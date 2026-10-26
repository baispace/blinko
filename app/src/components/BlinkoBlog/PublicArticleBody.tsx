import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
const elements = [
  "p",
  "div",
  "section",
  "span",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "del",
  "blockquote",
  "pre",
  "code",
  "br",
  "hr",
  "a",
  "img",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "sup",
  "sub",
];
/**
 * 正文里允许渲染的链接地址。
 *
 * 只放行四类：绝对 http(s) 外链、mailto、公开博客自己的 /blog 路径，
 * 以及站内文件接口 /api/file/。
 * 其余一律拦掉 —— 正文是笔记目录语义写的，相对路径在公开页上没有对应地址；
 * javascript:/data: 之类也在这里挡掉。
 *
 * 站内链接必须保留成 <a href>：公开页之间靠内链传递权重，全部吞成 <span>
 * 会让「文章 ↔ 文章 / 文章 ↔ 专题」的内链彻底消失。
 *
 * /api/file/ 是图片附件的地址（动态里内联的配图就是这种）。
 * 这里放行只是让 <img> 有个可取的地址，能不能匿名取到仍由服务端的
 * 「公开素材」判定决定 —— 私有笔记的附件照样 401。
 */
export function safeUrl(url: string | undefined) {
  const u = (url || "").trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (/^mailto:/i.test(u)) return u;
  if (u.startsWith("/blog")) return u;
  if (u.startsWith("/api/file/")) return u;
  return "";
}

export function PublicArticleBody({ content }: { content: string }) {
  return (
    <div className="markdown-body break-words [&_img]:max-w-full [&_table]:block [&_table]:overflow-x-auto [&_pre]:overflow-x-auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeRaw]}
        allowedElements={elements}
        urlTransform={safeUrl}
        components={{
          a: ({ href, children }) => {
            if (!href) return <span>{children}</span>;
            // 外链开新标签，站内链接留在当前页（内链不该把读者带离当前上下文）
            const external = /^https?:\/\//i.test(href);
            return (
              <a
                href={href}
                {...(external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
