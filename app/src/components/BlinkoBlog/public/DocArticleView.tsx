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
 * 左边是专题目录，右边是正文。正文用的是现成的公开渲染器
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
    <main className="ink-doc-layout">
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
          <ArticleTocPopover headings={headings} active={active} onJump={onJump} />
        </div>

        {article.excerpt && (
          <p className="ink-doc-article-excerpt">{article.excerpt}</p>
        )}

        <div className="ink-doc-meta">
          {site.profile?.displayName && <span>{site.profile.displayName}</span>}
          <span>
            更新于{" "}
            {new Date(article.updatedAt).toLocaleDateString("zh-CN")}
          </span>
          <span>约 {readingMinutes(article.content)} 分钟</span>
        </div>

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
    </main>
  );
}
