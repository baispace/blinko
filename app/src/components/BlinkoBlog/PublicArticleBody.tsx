import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import { stripCredentialParams } from "@shared/lib/blogPublicBody";
import { toAuthenticatedFileUrl } from "@/lib/localToken";
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
 * 以及站内文件接口 /api/file/ 与 /api/s3file/。
 * 其余一律拦掉 —— 正文是笔记目录语义写的，相对路径在公开页上没有对应地址；
 * javascript:/data: 之类也在这里挡掉。
 *
 * 站内链接必须保留成 <a href>：公开页之间靠内链传递权重，全部吞成 <span>
 * 会让「文章 ↔ 文章 / 文章 ↔ 专题」的内链彻底消失。
 *
 * 公开页上的地址一律不带凭据：token / authorization 在这里被剥掉 ——
 * 公开快照谁都能读，登录凭据不能跟着走。
 *
 * 站内文件能不能匿名取到，仍由服务端的「公开素材」判定决定 ——
 * 私有笔记的附件照样 401。
 */
export function safeUrl(url: string | undefined) {
  const u = (url || "").trim();
  if (/^https?:\/\//i.test(u)) return stripCredentialParams(u);
  if (/^mailto:/i.test(u)) return u;
  if (u.startsWith("/blog")) return u;
  if (u.startsWith("/api/file/") || u.startsWith("/api/s3file/"))
    return stripCredentialParams(u);
  return "";
}

/**
 * 后台预览用的地址：站内文件要带 token 才取得到（公开页没有登录态）。
 *
 * 草稿正文里存的是干净的站内路径（凭据是渲染时才补的），
 * 直接丢给 <img> 会 401 —— 后台预览要自己把凭据补上。
 */
export function authenticatedUrl(url: string | undefined) {
  const u = (url || "").trim();
  if (!u) return "";
  if (u.startsWith("/api/file/") || u.startsWith("/api/s3file/"))
    return toAuthenticatedFileUrl(stripCredentialParams(u)) ?? u;
  return safeUrl(u);
}

export function PublicArticleBody({
  content,
  authenticated,
}: {
  content: string;
  /** 后台预览态：站内文件补上登录凭据。公开页不传。 */
  authenticated?: boolean;
}) {
  const urlTransform = (url: string | undefined) =>
    authenticated ? authenticatedUrl(url) : safeUrl(url);
  return (
    <div className="markdown-body break-words [&_img]:max-w-full [&_table]:block [&_table]:overflow-x-auto [&_pre]:overflow-x-auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeRaw]}
        allowedElements={elements}
        urlTransform={urlTransform}
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
