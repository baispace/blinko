import "@/components/BlinkoBlog/public/topic-pages.css";
import "@/components/BlinkoBlog/public/doc-layout.css";
import { useEffect, useRef, useState } from "react";
import { blogRoute } from "@/lib/blogPublicBase";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "@/lib/publicBlogClient";
import { DocTopicOverview } from "@/components/BlinkoBlog/public/DocTopicOverview";
import { DocTopicSkeleton } from "@/components/BlinkoBlog/public/DocTopicSkeleton";
import type { DocDirectory } from "@/components/BlinkoBlog/public/TopicDocSidebar";
import {
  Pagination,
  PostCard,
  useBlogTitle,
} from "@/components/BlinkoBlog/public/BlogShell";
type Data = Awaited<ReturnType<typeof api.blog.publicTopic.query>>;
export default function BlogTopicDetail() {
  const { slug = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  // 分页是独立 URL：?page=N 每一页都能分享、能被收录。
  const urlPage = Math.max(1, Number(params.get("page")) || 1);
  /**
   * ?view=overview：读者明确要看专题概述。
   *
   * 没有这个参数时，文档模式专题会直接打开默认文章 ——
   * 概述是可选的一站，不该挡在正文前面。
   */
  const wantsOverview = params.get("view") === "overview";
  const [data, setData] = useState<Data>(null),
    // 专题目录（轻量）：顺带告诉我们这个专题是专题模式还是文档模式。
    [directory, setDirectory] = useState<DocDirectory | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(false),
    [request, setRequest] = useState(0);
  const seq = useRef(0);
  const listSeq = useRef(0);
  const listRef = useRef<HTMLElement>(null);
  useBlogTitle(directory?.topic.name || "专题");
  // 先读目录：它只含章节与标题，不带正文，读起来很快。
  useEffect(() => {
    const id = ++seq.current;
    setDirectory(null);
    setBusy(true);
    setError(false);
    api.blog.publicTopicDoc
      .query({ slug })
      .then((r) => {
        if (id === seq.current) setDirectory(r);
      })
      .catch(() => {
        // 目录都读不到就直接报错，不能让页面永远停在「正在加载」。
        if (id === seq.current) {
          setDirectory(null);
          setBusy(false);
          setError(true);
        }
      });
    return () => {
      seq.current++;
    };
  }, [slug, request]);
  useEffect(() => {
    // 文档模式不需要分页文章列表 —— 目录页自己就是全部内容。
    if (!directory) return;
    if (directory.topic.displayMode === "doc") {
      setData(null);
      setBusy(false);
      setError(false);
      return;
    }
    const id = ++listSeq.current;
    setData(null);
    setBusy(true);
    setError(false);
    api.blog.publicTopic
      .query({ slug, page: urlPage })
      .then((r) => {
        if (id === listSeq.current) setData(r);
      })
      .catch(() => {
        if (id === listSeq.current) setError(true);
      })
      .finally(() => {
        if (id === listSeq.current) setBusy(false);
      });
    return () => {
      listSeq.current++;
    };
  }, [directory, slug, urlPage, request]);
  /** 翻页：写进 URL，然后滚回目录顶部。 */
  const goToPage = (next: number) => {
    const target = Math.min(Math.max(1, next), data?.pageCount ?? 1);
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (target <= 1) p.delete("page");
        else p.set("page", String(target));
        return p;
      },
      { replace: false },
    );
    requestAnimationFrame(() =>
      listRef.current?.scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      }),
    );
  };
  /**
   * 文档模式：默认直接打开文章正文。
   *
   * 解析顺序：URL 明确要概述 → 概述；否则用后台配置的默认文章；
   * 默认文章没配或已失效 → 编排中的第一篇；一篇都没有 → 概述 + 空状态。
   * 真正的「第一篇」由服务端按章节与文章编排顺序算好，前台不按发布时间重排。
   */
  const docMode = directory?.topic.displayMode === "doc";
  const docTarget = docMode && !wantsOverview ? directory?.defaultPublishId : null;
  useEffect(() => {
    if (!docTarget) return;
    /**
     * 用 replace 而不是 push：
     * 返回键不该反复经过这个「还没决定打开哪一篇」的专题入口。
     */
    navigate(
      blogRoute("/blog/" + docTarget + "?topic=" + encodeURIComponent(slug)),
      { replace: true },
    );
  }, [docTarget, navigate, slug]);
  // 文档模式优先判断：目录一到手就知道该不该跳正文，别先闪一下通用加载态。
  if (directory?.topic.displayMode === "doc") {
    // 正在解析默认文章：先摆一份同尺寸的骨架，不闪专题概述。
    if (docTarget) return <DocTopicSkeleton />;
    return <DocTopicOverview directory={directory} />;
  }
  if (busy && !data)
    return (
      <main className="ink-wrap ink-empty" role="status">
        正在加载专题…
      </main>
    );
  if (error && !data)
    return (
      <main className="ink-wrap ink-empty" role="alert">
        专题加载失败。
        <button onClick={() => setRequest((n) => n + 1)}>重试</button>
      </main>
    );
  if (!data)
    return (
      <main className="ink-wrap ink-empty">
        <h1>专题暂未公开</h1>
        <p>可能已停用，或还没有公开文章。</p>
        <Link to={blogRoute("/blog/topics")}>查看其他专题</Link>
      </main>
    );
  // 专题封面由服务端按同一套规则算好，和专题列表页保持一致；
  // 没有就退回第一篇文章的封面。
  const allPosts = [
    ...data.sections.flatMap((s) => s.posts),
    ...data.unassigned.posts,
  ];
  const heroCover =
    data.coverUrl ?? allPosts.find((p) => p.coverUrl)?.coverUrl ?? null;
  // 「开始阅读」指向第一篇已发布文章：章节顺序 → 章内顺序 → 未分章节。
  const firstPost =
    data.sections.find((s) => s.posts.length > 0)?.posts[0] ??
    data.unassigned.posts[0] ??
    null;
  return (
    <main className="ink-wrap">
      <section className="ink-topic-intro">
        <div>
          <Link to={blogRoute("/blog/topics")} className="ink-topic-back">
            全部专题
          </Link>
          <h1>{data.topic.name}</h1>
          <p>{data.topic.desc}</p>
          <p>
            {data.total} 篇文章 ·{" "}
            {data.sections.filter((section) => section.showTitle).length} 个章节
          </p>
          {firstPost && (
            <Link
              className="ink-topic-start"
              to={blogRoute(
                "/blog/" +
                  firstPost.publishId +
                  "?topic=" +
                  encodeURIComponent(slug),
              )}
            >
              开始阅读 →
            </Link>
          )}
        </div>
        {heroCover && <img src={heroCover} alt="" />}
      </section>
      <section className="ink-topic-directory" ref={listRef}>
        <h2>文章目录</h2>
        {/* 章节目录：专题 → 章节 → 文章。序号只数「展示了标题」的章节，
            不留空号；showTitle=false 的章节只出文章列表，不出标题。 */}
        {(() => {
          let visible = 0;
          return data.sections.map((section) => {
            const number = section.showTitle ? ++visible : 0;
            const posts = (
              <div className="ink-post-list">
                {section.posts.map((p) => (
                  <PostCard key={p.id} post={p} topic={slug} entry="topic" />
                ))}
              </div>
            );
            if (!section.showTitle)
              return (
                <div className="ink-topic-section is-plain" key={section.id}>
                  {posts}
                </div>
              );
            return (
              <details className="ink-topic-section" key={section.id} open>
                <summary>
                  <span className="ink-topic-section-num">{number}.</span>
                  <span className="ink-topic-section-name">{section.name}</span>
                  <span className="ink-topic-section-count">
                    {section.posts.length} 篇
                  </span>
                </summary>
                {section.desc && (
                  <p className="ink-topic-section-desc">{section.desc}</p>
                )}
                {posts}
              </details>
            );
          });
        })()}
        {data.unassigned.posts.length > 0 && (
          <div className="ink-topic-unassigned">
            <h3>未分章节</h3>
            <div className="ink-post-list">
              {data.unassigned.posts.map((p) => (
                <PostCard key={p.id} post={p} topic={slug} entry="topic" />
              ))}
            </div>
          </div>
        )}
        {error && <p className="ink-error">加载失败，请重试。</p>}
        {/* 分页走独立 URL：?page=N 每一页都能分享、能被收录 */}
        <Pagination
          page={data.page}
          pageCount={data.pageCount}
          onChange={goToPage}
          label="专题文章分页"
        />
      </section>
    </main>
  );
}
