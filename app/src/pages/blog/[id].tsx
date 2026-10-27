import { useEffect, useRef, useState } from "react";
import "@/components/BlinkoBlog/public/doc-layout.css";
import { blogRoute } from "@/lib/blogPublicBase";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "@/lib/publicBlogClient";
import { blogDeviceId, blogStatsEnabled } from "@/lib/blogDevice";
import { blogAttribution, readBlogEntry } from "@/lib/blogReferrer";
import { sampleCoverPalette } from "@/lib/coverColor";
import { Icon } from "@/components/Common/Iconify/icons";
import { PublicArticleBody } from "@/components/BlinkoBlog/PublicArticleBody";
import { CoverCanvas } from "@/components/BlinkoBlog/CoverCanvas";
import { ArticleInteraction } from "@/components/BlinkoBlog/public/ArticleInteraction";
import { DocArticleView } from "@/components/BlinkoBlog/public/DocArticleView";
import { DocTopicSkeleton } from "@/components/BlinkoBlog/public/DocTopicSkeleton";
import { useArticleHeadings } from "@/components/BlinkoBlog/public/useArticleHeadings";
import type { DocDirectory } from "@/components/BlinkoBlog/public/TopicDocSidebar";
import {
  AuthorCard,
  PostCard,
  useBlogSite,
  useBlogTitle,
  articleURL,
} from "@/components/BlinkoBlog/public/BlogShell";
type Article = Awaited<ReturnType<typeof api.blog.publicArticle.query>>;
export default function PublishedNotePage() {
  const { id = "" } = useParams(),
    [params] = useSearchParams(),
    topic = params.get("topic") || undefined;
  const site = useBlogSite();
  const [article, setArticle] = useState<Article>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false),
    [request, setRequest] = useState(0),
    // 文档模式：当前专题的目录（只含标题与地址，不带正文）。
    [directory, setDirectory] = useState<DocDirectory | null>(null),
    // 目录请求失败的标记。加载中一律摆骨架、只有失败才回退普通版式 ——
    // 用「失败」而非「加载中」做判断，是因为加载标记只能在 effect 里置位，
    // 会晚于「文章已回来、目录还没回来」的那一帧，仍会闪出普通版式。
    [docFailed, setDocFailed] = useState(false),
    // 上报成功后用接口返回的最新数字，避免页面上先显示 0 再跳一下
    [live, setLive] = useState<{ views: number; readers: number } | null>(null);
  const body = useRef<HTMLDivElement>(null),
    mobileToc = useRef<HTMLDetailsElement>(null);
  /**
   * 文档版式只在「带着专题上下文进来、且那个专题是文档模式」时启用。
   * 从全站列表直接打开文章时不该被硬套进某个专题的版式。
   */
  const docMode = article?.topicMode === "doc";
  const { headings, active, jump } = useArticleHeadings(
    body,
    // 目录加载前后 bodyRef 指向不同的 DOM（普通版式 vs 文档版式），
    // 必须让 revision 跟着变，否则 IntersectionObserver 还在盯已经卸载的旧标题。
    article?.publishId +
      ":" +
      (docMode ? "doc" : "topic") +
      ":" +
      (directory ? "dir" : "nodir"),
  );
  useBlogTitle(article?.title || "公开文章");
  useEffect(() => {
    let current = true;
    setArticle(null);
    setLoading(true);
    setError(false);
    api.blog.publicArticle
      .query({ publishId: id, topicSlug: topic })
      .then((value) => {
        if (current) setArticle(value);
      })
      .catch(() => {
        if (current) setError(true);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [id, topic, request]);
  // 文档模式：拉当前专题的目录。失败时退回收起左栏的普通版式，
  // 不让整页卡在 loading。
  useEffect(() => {
    if (!docMode || !topic) {
      setDirectory(null);
      setDocFailed(false);
      return;
    }
    let current = true;
    api.blog.publicTopicDoc
      .query({ slug: topic })
      .then((value) => {
        if (current) {
          setDirectory(value);
          setDocFailed(false);
        }
      })
      .catch(() => {
        if (current) {
          setDirectory(null);
          setDocFailed(true);
        }
      });
    return () => {
      current = false;
    };
  }, [docMode, topic]);
  // 采样封面主色：顶部背景色由它决定。采样失败就留默认紫色。
  const coverUrl = article?.coverUrl;
  const setCoverTint = site.setCoverTint;
  useEffect(() => {
    // 文档模式沿用全站浅色导航，不让封面采样把阅读页染成 Banner。
    if (docMode || !coverUrl) {
      setCoverTint(null);
      return;
    }
    let current = true;
    void sampleCoverPalette(coverUrl).then((value) => {
      if (!current) return;
      // 交给站点根节点：导航栏和通栏顶部共用这一片颜色。
      setCoverTint(value);
    });
    return () => {
      current = false;
    };
  }, [coverUrl, docMode, setCoverTint]);
  // 离开文章页才把顶部染色撤掉。
  // 延后一拍再清：React 严格模式会立刻重挂载，同步清会把颜色闪掉。
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      setTimeout(() => {
        if (!mounted.current) setCoverTint(null);
      }, 0);
    };
  }, [setCoverTint]);
  useEffect(() => {
    const focus = () => setRequest((n) => n + 1);
    addEventListener("focus", focus);
    return () => removeEventListener("focus", focus);
  }, []);
  // 记一次阅读：设备 ID 由浏览器生成，服务端按它去重。
  const publishId = article?.publishId;
  useEffect(() => {
    if (!publishId) return;
    const deviceId = blogDeviceId();
    if (!deviceId || !blogStatsEnabled()) return;
    /**
     * 这里只记阅读，不记「列表点击」。
     *
     * 列表点击由列表页那一次点击上报；文章页再报一次会把「从站外直接打开
     * 文章」也算成站内列表点击，列表点击率就失真了。
     *
     * 站内跳转靠 rememberBlogEntry 记下的上下文判断 —— SPA 的 pushState
     * 不会更新 document.referrer，只看 referrer 会把站内点击误判成外部来源。
     */
    const remembered = readBlogEntry();
    api.blog.trackView
      .mutate({
        publishId,
        deviceId,
        ...blogAttribution(remembered?.entry ?? "detail", !!remembered),
      })
      .then((value) => {
        if (value) setLive({ views: value.views, readers: value.readers });
      })
      .catch(() => {});
  }, [publishId]);
  const jumpTo = (event: React.MouseEvent, id: string) => {
    event.preventDefault();
    if (mobileToc.current) mobileToc.current.open = false;
    jump(id);
  };
  const toc = (
    <nav aria-label="文章目录">
      {headings.map((h, i) => (
        <a
          key={h.id}
          href={"#" + h.id}
          onClick={(e) => jumpTo(e, h.id)}
          aria-current={active === h.id ? "true" : undefined}
          style={{ paddingLeft: h.level === 3 ? 16 : 0 }}
        >
          <span>{String(i + 1).padStart(2, "0")}</span>
          {h.text}
        </a>
      ))}
    </nav>
  );
  if (loading)
    return (
      <main className="ink-wrap ink-empty" role="status">
        正在加载公开文章…
      </main>
    );
  if (error)
    return (
      <main className="ink-wrap ink-empty" role="alert">
        <h1>暂时无法加载文章</h1>
        <button
          className="ink-primary-button"
          onClick={() => setRequest((n) => n + 1)}
        >
          重试
        </button>
      </main>
    );
  if (!article)
    return (
      <main className="ink-wrap ink-empty">
        <h1>文章未公开或已撤回</h1>
        <p>该链接当前无法访问。</p>
        <Link to={blogRoute("/blog")}>回到首页 →</Link>
      </main>
    );
  const context = article.primaryTopic?.slug;
  const shown = live ?? article.stats;
  /**
   * 文档模式但目录还没到手（且没失败）：摆文档版式的骨架。
   * 不能落到下面的普通版式 —— 那会闪一下带右侧个人信息卡的版式再切走。
   */
  if (docMode && !directory && !docFailed) return <DocTopicSkeleton />;
  /**
   * 文档模式：双栏版式。左侧专题目录，右侧正文。
   * 目录还没到手时先按普通版式渲染正文，不让页面空着等。
   */
  if (docMode && directory)
    return (
      <DocArticleView
        article={article}
        directory={directory}
        headings={headings}
        active={active}
        onJump={jump}
        bodyRef={body}
      />
    );
  return (
    <main className="ink-article-page">
      {/* 顶部通栏：底色由封面主色采样而来（QQ 音乐那套），内容仍按 1280 收口。
          变量实际挂在站点根节点上，导航栏也是同一片颜色。 */}
      <section className="ink-article-hero-full">
        <div className="ink-article-hero">
          <div>
            <div className="ink-crumb">
              <Link to={blogRoute("/blog")}>首页</Link>
              {article.primaryTopic && (
                <>
                  {" "}
                  /{" "}
                  <Link to={blogRoute("/blog/t/" + context)}>
                    {article.primaryTopic.name}
                  </Link>
                </>
              )}
            </div>
            <h1>{article.title}</h1>
            {/* 公开标签：只来自发布快照里的 publicTags，私有标签不上公开站 */}
            {(article.publicTags ?? []).length > 0 && (
              <div className="ink-public-tags">
                {article.publicTags.map((tag) => (
                  <span className="ink-badge ink-public-tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="ink-meta">
              {article.topics.map((t) => (
                <Link key={t.id} className="ink-badge" to={blogRoute("/blog/t/" + t.slug)}>
                  {t.name}
                </Link>
              ))}
              <time dateTime={new Date(article.createdAt).toISOString()}>
                发布 {new Date(article.createdAt).toLocaleDateString("zh-CN")}
              </time>
              <time dateTime={new Date(article.updatedAt).toISOString()}>
                更新 {new Date(article.updatedAt).toLocaleDateString("zh-CN")}
              </time>
              {shown?.views ? (
                <span className="ink-read-stat">
                  <Icon icon="tabler:eye" width={15} />
                  {shown.views} 次阅读
                </span>
              ) : null}
              {shown?.readers ? (
                <span className="ink-read-stat">
                  <Icon icon="tabler:users" width={15} />
                  {shown.readers} 位读者
                </span>
              ) : null}
            </div>
          </div>
          {article.coverUrl && (
            <CoverCanvas
              src={article.coverUrl}
              alt="文章封面"
              config={article.coverConfig}
              focus={article.coverFocus}
              placement="single"
              loading="eager"
            />
          )}
        </div>
      </section>
      <div
        className={
          "ink-reading ink-wrap " +
          (!headings.length && !site.profile ? "ink-reading-wide" : "")
        }
      >
        <article className="ink-panel">
          <div className="ink-summary">
            <strong>文章摘要</strong>
            <p>{article.excerpt}</p>
          </div>
          {headings.length > 0 && (
            <details ref={mobileToc} className="ink-mobile-toc">
              <summary>文章目录 · {headings.length} 节</summary>
              {toc}
            </details>
          )}
          <div ref={body} className="ink-prose">
            <PublicArticleBody content={article.content} />
          </div>
          <div className="ink-end">本文结束</div>
          {/* 文末互动区：三种表态 + 反馈作者。位置在正文结束之后、上一篇／下一篇之前。 */}
          {article.publishId && (
            <ArticleInteraction
              publishId={article.publishId}
              articleTitle={article.title}
            />
          )}
          <nav className="ink-prev-next" aria-label="文章阅读导航">
            {article.prev ? (
              <Link to={articleURL(article.prev, context)}>
                <small>← 上一篇</small>
                <strong>{article.prev.title}</strong>
              </Link>
            ) : (
              <span className="ink-nav-empty">已是第一篇</span>
            )}
            {article.primaryTopic && (
              <Link className="ink-primary-topic" to={blogRoute("/blog/t/" + context)}>
                {article.primaryTopic.name}
                <small>返回专题目录</small>
              </Link>
            )}
            {article.next ? (
              <Link to={articleURL(article.next, context)}>
                <small>下一篇 →</small>
                <strong>{article.next.title}</strong>
              </Link>
            ) : (
              <span className="ink-nav-empty">已是最后一篇</span>
            )}
          </nav>
        </article>
        <aside className="ink-reading-aside">
          <AuthorCard />
          {headings.length > 0 && (
            <section className="ink-panel ink-toc">
              <h2>文章目录</h2>
              {toc}
            </section>
          )}
        </aside>
      </div>
      {article.related.length > 0 && (
        <div className="ink-wrap">
          <section className="ink-related ink-panel">
            <div className="ink-section-head">
              <div>
                <h2>相关文章</h2>
                <p className="ink-muted">继续探索相近的思路与实践</p>
              </div>
              <Link to={blogRoute("/blog?feed=latest")}>全部文章 →</Link>
            </div>
            <div className="ink-post-list">
              {article.related.map((p) => (
                <PostCard key={p.id} post={p} topic={context} entry="recommend" />
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
