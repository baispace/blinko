import "@/components/BlinkoBlog/public/topic-pages.css";
import { useState } from "react";
import { blogRoute } from "@/lib/blogPublicBase";
import { Link } from "react-router-dom";
import {
  useBlogSite,
  useBlogTitle,
} from "@/components/BlinkoBlog/public/BlogShell";
import { Icon } from "@/components/Common/Iconify/icons";

export default function BlogTopics() {
  const { topics, loading, error } = useBlogSite();
  useBlogTitle("专题");
  const [search, setSearch] = useState("");
  const keyword = search.trim().toLowerCase();
  const shown = topics.filter((t) =>
    (t.name + t.desc).toLowerCase().includes(keyword),
  );
  return (
    <main className="ink-wrap">
      <header className="ink-topics-head ink-topics-head-compact">
        <div className="ink-topics-head-copy">
          <nav className="ink-topics-crumb" aria-label="面包屑">
            <Link to={blogRoute("/blog")}>首页</Link>
            <span aria-hidden="true">/</span>
            <span>专题</span>
          </nav>
          <h1>
            专题 <span className="ink-topic-count">{topics.length}</span>
          </h1>
          <p>按主题与章节整理，找到感兴趣的内容，接着读下去。</p>
        </div>
        <div className="ink-topics-head-side">
          <label className="ink-topics-search">
            <Icon icon="tabler:search" width={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索专题"
              aria-label="搜索专题"
            />
          </label>
          <p className="ink-muted">
            {keyword ? `${shown.length} 个匹配` : `${topics.length} 个专题`}
          </p>
        </div>
      </header>
      {loading ? (
        <p className="ink-empty" role="status">
          正在加载专题…
        </p>
      ) : !error && !shown.length ? (
        <p className="ink-empty">
          {keyword ? "没有匹配的专题。" : "公开专题正在整理中。"}
        </p>
      ) : (
        <div className="ink-topic-grid">
          {shown.map((t, i) => (
            <Link
              key={t.id}
              to={blogRoute("/blog/t/" + t.slug)}
              className="ink-topic-card ink-panel"
            >
              <div className="ink-topic-card-media">
                {t.coverUrl ? (
                  <img src={t.coverUrl} alt="" loading="lazy" />
                ) : (
                  <div
                    className="ink-topic-card-blank"
                    style={{ background: t.color || "var(--ink-accent)" }}
                  />
                )}
              </div>
              <div className="ink-topic-card-body">
                <span
                  className="ink-topic-num"
                  style={{ background: t.color || "#7055f8" }}
                >
                  {i + 1}
                </span>
                <div className="ink-topic-title-row">
                  <h2 className="ink-topic-name">{t.name}</h2>
                  {t.displayMode === "doc" && (
                    <span className="ink-topic-doc-badge">
                      <Icon icon="tabler:book-2" width={12} />
                      文档
                    </span>
                  )}
                </div>
                <p className="ink-topic-desc">{t.desc}</p>
                <div className="ink-topic-foot">
                  <span className="ink-muted">{t.count} 篇文章 · 持续更新</span>
                  <span className="ink-topic-go">
                    进入专题
                    <Icon icon="tabler:arrow-right" width={17} />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
