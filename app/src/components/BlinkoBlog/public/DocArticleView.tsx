import { useEffect, useState, type RefObject } from "react";
import { Link } from "react-router-dom";
import { blogRoute } from "@/lib/blogPublicBase";
import { Icon } from "@/components/Common/Iconify/icons";
import { PublicArticleBody } from "@/components/BlinkoBlog/PublicArticleBody";
import { ArticleTocPopover } from "./ArticleTocPopover";
import { TopicDocDrawer } from "./TopicDocDrawer";
import { TopicDocSidebar, type DocDirectory } from "./TopicDocSidebar";
import { useBlogSite } from "./BlogShell";
import type { ArticleHeading } from "./articleHeadings";

type ArticleCard = {
  id: number;
  publishId: string;
  title: string;
};

type DocArticle = {
  /** 已发布文章一定有 publishId；类型上留 null 是因为 DTO 沿用数据库的 nullable。 */
  publishId: string | null;
  title: string;
  excerpt: string;
  content: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  publicTags?: string[];
  primaryTopic?: { id: number; name: string; slug: string } | null;
  prev?: ArticleCard | null;
  next?: ArticleCard | null;
};

/** 中文阅读速度按每分钟 350 字估算，只是个大概，让读者对篇幅有个预期。 */
function readingMinutes(content: string) {
  const text = (content || "").replace(/<[^>]*>/g, "");
  const chars = text.replace(/\s/g, "").length;
  return Math.max(1, Math.round(chars / 350));
}

/**
 * 文档模式下的文章页。
 *
 * 左边是专题目录，中间是正文，宽屏右侧展示本文目录。正文用的是现成的公开渲染器
 * （PublicArticleBody），图片、表格、代码块、引用、链接的能力全部照旧 ——
 * 文档模式只换版式，不换正文。
 */
export function DocArticleView({
  article,
  directory,
  headings,
  active,
  onJump,
  bodyRef,
}: {
  article: DocArticle;
  directory: DocDirectory;
  headings: ArticleHeading[];
  active: string;
  onJump: (id: string) => void;
  /** 正文容器：与普通文章页共用同一份标题计算逻辑。 */
  bodyRef: RefObject<HTMLDivElement>;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(timer); }, [copied]);
  const orderedPosts = [...directory.sections.flatMap(section => section.posts), ...directory.unassigned.posts];
  const position = orderedPosts.findIndex(post => post.publishId === article.publishId) + 1;
  const topicSlug = directory.topic.slug;
  const site = useBlogSite();
  // 当前文章在哪个章节 —— 面包屑上的最后一段。
  const currentSection = directory.sections.find((section) =>
    section.posts.some((post) => post.publishId === article.publishId),
  );

  const articleURL = (post: ArticleCard) =>
    blogRoute(
      "/blog/" + post.publishId + "?topic=" + encodeURIComponent(topicSlug),
    );

  const sidebar = (
    <TopicDocSidebar
      directory={directory}
      currentPublishId={article.publishId ?? undefined}
    />
  );

  return (
    <main className="ink-doc-layout ink-doc-reading-layout">
      <aside className="ink-doc-side">{sidebar}</aside>

      <div className="ink-doc-main">
        <div className="ink-doc-mobile-bar">
          <TopicDocDrawer
            directory={directory}
            currentPublishId={article.publishId ?? undefined}
          />
        </div>

        <nav className="ink-doc-crumb" aria-label="面包屑">
          <Link to={blogRoute("/blog/topics")}>专题</Link>
          <span aria-hidden="true">/</span>
          {/* 面包屑指向专题概述：这是一处稳定的页面，
              不该把读者弹到默认打开的那一篇文章上。 */}
          <Link to={blogRoute("/blog/t/" + topicSlug + "?view=overview")}>
            {directory.topic.name}
          </Link>
          {currentSection && (
            <>
              <span aria-hidden="true">/</span>
              <span>{currentSection.name}</span>
            </>
          )}
        </nav>

        <div className="ink-doc-article-head">
          <div style={{ minWidth: 0 }}>
            <h1 className="ink-doc-article-title">{article.title}</h1>
          </div>
          <div className="ink-doc-compact-toc"><ArticleTocPopover headings={headings} active={active} onJump={onJump} /></div>
        </div>

        {article.excerpt && (
          <p className="ink-doc-article-excerpt">{article.excerpt}</p>
        )}

        <div className="ink-doc-meta-row"><div className="ink-doc-meta">
          {site.profile?.displayName && <span>{site.profile.displayName}</span>}
          <span>
            更新于{" "}
            {new Date(article.updatedAt).toLocaleDateString("zh-CN")}
          </span>
          <span>约 {readingMinutes(article.content)} 分钟</span>
        </div><button type="button" className="ink-doc-copy" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setCopyError(false); } catch { setCopyError(true); } }}><Icon icon="tabler:copy" width={16} />{copied ? '已复制' : '复制链接'}</button>{copyError && <span role="status" className="ink-doc-copy-error">复制失败，请复制地址栏链接</span>}</div>

        <hr className="ink-doc-rule" />

        <div className="ink-doc-body">
          <div ref={bodyRef} className="ink-prose">
            <PublicArticleBody content={article.content} />
          </div>
        </div>

        {/*
          上一篇 / 下一篇严格按当前专题的编排顺序 —— 服务端算好，
          前台不按发布时间重排。没有前后篇就不留空位。
        */}
        {(article.prev || article.next) && (
          <nav className="ink-doc-prev-next" aria-label="文章阅读导航">
            {article.prev ? (
              <Link to={articleURL(article.prev)}>
                <small>
                  <Icon icon="tabler:chevron-left" width={14} />
                  上一篇
                </small>
                <strong>{article.prev.title}</strong>
              </Link>
            ) : (
              <span />
            )}
            {article.next ? (
              <Link to={articleURL(article.next)} className="is-next">
                <small>
                  下一篇
                  <Icon icon="tabler:chevron-right" width={14} />
                </small>
                <strong>{article.next.title}</strong>
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </div>
      <aside className="ink-doc-reading-rail" aria-label="本文目录与专题进度"><h2>本文目录</h2>
        {headings.length ? <nav aria-label="本文目录">{headings.map(heading => <a key={heading.id} href={'#' + heading.id} aria-current={active === heading.id ? 'location' : undefined} data-active={active === heading.id || undefined} style={{ paddingLeft: heading.level > 2 ? 28 : 18 }} onClick={event => { event.preventDefault(); onJump(heading.id); }}>{heading.text}</a>)}</nav> : <p className="ink-doc-rail-empty">本文暂无分节标题</p>}
        <div className="ink-doc-reading-progress"><span>专题阅读进度</span><p>第 {position || 1} 篇 / 共 {directory.total} 篇</p></div>
      </aside>
    </main>
  );
}
