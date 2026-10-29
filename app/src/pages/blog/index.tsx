import { blogDeviceId, blogStatsEnabled } from "@/lib/blogDevice";
import { blogRoute } from "@/lib/blogPublicBase";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/publicBlogClient";
import { Icon } from "@/components/Common/Iconify/icons";
import {
  AuthorCard,
  Pagination,
  PostCard,
  RecentUpdates,
  TopicLinks,
  RSSLink,
  useBlogSite,
  useBlogTitle,
  type Post,
} from "@/components/BlinkoBlog/public/BlogShell";
import { CoverCanvas } from "@/components/BlinkoBlog/CoverCanvas";
// React 18 只认小写 DOM 属性（fetchPriority 是 React 19 的写法），
// 直接输出 fetchpriority，给浏览器做首屏图片的预加载提示。
const heroImagePriority = { fetchpriority: "high" } as const;
export default function BlogHome() {
  const site = useBlogSite();
  useBlogTitle("思考与实践");
  const [params, setParams] = useSearchParams();
  // 分页是独立 URL：?page=N 每一页都能分享、能被收录，刷新也不会跳回第一页。
  const urlPage = Math.max(1, Number(params.get("page")) || 1);
  // 专题筛选也走 URL（?topic=slug）：刷新、后退、分享都保得住。
  // canonical 仍然是不带 query 的 /blog —— 查询参数不参与地址归并。
  // 视图：精选（默认）/ 热门（按热度）/ 全部文章（按年归档）。
  // 三个视图互斥，选了哪个就把另外两个的维度清掉。
  const viewParam = params.get("view");
  const hot = viewParam === "hot";
  const all = viewParam === "all";
  const filter = hot || all ? "" : params.get("topic") || "";
  // 热门榜的时间窗：当日 / 最近一个月 / 最近一年。
  const range = params.get("range") || "month";
  // 全部文章 tab 的年份筛选：0 = 不限年份。
  const year = Number(params.get("year")) || 0;
  // 排序方式：推荐（个性化排序）/ 最新（按发布时间）。与专题筛选正交，
  // 两件事各管各的 —— 排序控件放在 banner 下方的列表标题左侧。
  // 热门与归档自带排序，不再叠加推荐/最新。
  const recommended = !hot && !all && params.get("feed") !== "latest";
  const personalization = blogStatsEnabled();
  const [grid, setGrid] = useState(() => {
      try {
        return localStorage.getItem("ink-blog-view") !== "list";
      } catch {
        return true;
      }
    }),
    [posts, setPosts] = useState<Post[]>([]),
    [page, setPage] = useState(urlPage),
    [pageCount, setPageCount] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    // 头条手动切换：banner 在最新的几篇之间轮换，不自动播放。
    [heroIndex, setHeroIndex] = useState(0);
  const seq = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // 换了专题，头条序列也换，回第一篇重新开始。
    setHeroIndex(0);
  }, [filter]);
  useEffect(() => {
    // 未筛选：列表直接用 publicIndex 返回的当页数据（它已经按 ?page= 拉好）
    if (filter || recommended || hot || all) return;
    setError("");
    setPosts(site.posts);
    setPage(site.page);
    setPageCount(site.pageCount);
    setBusy(false);
  }, [filter, recommended, hot, all, site.posts, site.page, site.pageCount]);
  useEffect(() => {
    if (!filter || recommended) return;
    // 筛选态：走 publicPosts，按 offset 取当页。
    // 页长用服务端给的 site.pageSize —— 前后端必须一致，
    // 否则算出来的总页数会和 SEO 侧的 canonical / rel=next 对不上。
    const size = site.pageSize;
    const request = ++seq.current;
    setError("");
    setBusy(true);
    setPosts([]);
    api.blog.publicPosts
      .query({
        topicSlug: filter,
        limit: size,
        offset: (urlPage - 1) * size,
      })
      .then((r) => {
        if (request === seq.current) {
          const count = Math.max(1, Math.ceil(r.total / size));
          setPosts(r.posts);
          setPageCount(count);
          setPage(Math.min(urlPage, count));
        }
      })
      .catch(() => {
        if (request === seq.current) setError("文章加载失败，请重新选择专题。");
      })
      .finally(() => {
        if (request === seq.current) setBusy(false);
      });
  }, [filter, recommended, urlPage, site.pageSize]);
  useEffect(() => {
    // 热门：按窗口内的有效点击数排序的一整份列表。跟专题筛选互斥 ——
    // chip 行一次只选中一个，选了热门就没有专题维度了。
    if (!hot) return;
    const size = site.pageSize;
    const request = ++seq.current;
    setError("");
    setBusy(true);
    api.blog.publicPosts
      .query({
        sort: "hot",
        range: range as "day" | "month" | "year",
        limit: size,
        offset: (urlPage - 1) * size,
      })
      .then((r) => {
        if (request === seq.current) {
          const count = Math.max(1, Math.ceil(r.total / size));
          setPosts(r.posts);
          setPageCount(count);
          setPage(Math.min(urlPage, count));
        }
      })
      .catch(() => {
        if (request === seq.current) setError("热门文章加载失败，请稍后再试。");
      })
      .finally(() => {
        if (request === seq.current) setBusy(false);
      });
    return () => {
      seq.current++;
    };
  }, [hot, range, urlPage, site.pageSize]);
  useEffect(() => {
    // 全部文章：一次把公开文章取全，按年份分组。选定年份时服务端直接过滤。
    if (!all) return;
    const request = ++seq.current;
    setError("");
    setBusy(true);
    api.blog.publicPosts
      .query({ limit: 200, year: year || undefined })
      .then((r) => {
        if (request === seq.current) {
          setPosts(r.posts);
          setPage(1);
          setPageCount(1);
        }
      })
      .catch(() => {
        if (request === seq.current) setError("文章加载失败，请稍后再试。");
      })
      .finally(() => {
        if (request === seq.current) setBusy(false);
      });
    return () => {
      seq.current++;
    };
  }, [all, year]);
  useEffect(() => {
    if (!recommended) return;
    const request = ++seq.current;
    setBusy(true);
    setError("");
    api.blog.publicRecommendations
      .query({
        deviceId: blogStatsEnabled() ? blogDeviceId() || undefined : undefined,
        topicSlug: filter || undefined,
        page: Math.min(100, urlPage),
      })
      .then((r) => {
        if (request === seq.current) {
          setPosts(r.posts);
          setPage(r.page);
          setPageCount(r.pageCount);

        }
      })
      .catch(() => {
        if (request === seq.current) setError("推荐暂时不可用，请切换最新。");
      })
      .finally(() => {
        if (request === seq.current) setBusy(false);
      });
    return () => {
      seq.current++;
    };
  }, [recommended, filter, urlPage, personalization]);
  const toggleView = () =>
    setGrid((old) => {
      try {
        localStorage.setItem("ink-blog-view", old ? "list" : "grid");
      } catch {}
      return !old;
    });
  /** 翻页：写进 URL（可分享、可前进后退），然后滚回列表顶部。 */
  const goToPage = (next: number) => {
    const target = Math.min(Math.max(1, next), pageCount);
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (target <= 1) p.delete("page");
        else p.set("page", String(target));
        return p;
      },
      { replace: false },
    );
    setPage(target);
    requestAnimationFrame(() =>
      listRef.current?.scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      }),
    );
  };
  /** 换专题筛选：回到第 1 页，URL 里不留旧的 page。排序方式不受影响。 */
  const changeFilter = (slug: string) => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete("page");
        // 热门与专题筛选互斥：选了专题就不再是热门视图。
        p.delete("view");
        if (slug) p.set("topic", slug);
        else p.delete("topic");
        return p;
      },
      { replace: false },
    );
  };
  /**
   * 换视图：精选（默认）/ 热门（按热度）/ 全部文章（按年归档）。
   * 三个视图跟专题筛选互斥 —— chip 行一次只选中一个，切换时把另外几个清掉。
   */
  const changeView = (view: "featured" | "hot" | "all") => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete("page");
        p.delete("topic");
        // 时间窗和年份是各自视图专属的筛选，换视图时一并清掉。
        p.delete("range");
        p.delete("year");
        if (view === "featured") p.delete("view");
        else p.set("view", view);
        return p;
      },
      { replace: false },
    );
  };
  /** 换排序方式：列表内容整批换掉，回到第 1 页。 */
  const changeFeed = (mode: "recommended" | "latest") => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete("page");
        if (mode === "latest") p.set("feed", "latest");
        else p.delete("feed");
        return p;
      },
      { replace: false },
    );
  };
  /** 换热门榜的时间窗。 */
  const changeRange = (value: string) => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete("page");
        p.set("range", value);
        return p;
      },
      { replace: false },
    );
  };
  /** 换归档年份：0 = 不限年份。 */
  const changeYear = (value: number) => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete("page");
        if (value) p.set("year", String(value));
        else p.delete("year");
        return p;
      },
      { replace: false },
    );
  };
  /**
   * 顶部那句话：告诉读者这一屏在看什么。
   * 系统视图各有一句；专题视图用作者写的介绍，没写就用「xx主题」。
   */
  const introTitle = (() => {
    if (hot) return "近期最受关注的文章。";
    if (all) return "站内全部文章。";
    if (!filter) return "";
    const topic = site.topics.find((t) => t.slug === filter);
    if (!topic) return "";
    // 专题介绍是作者写的一句话：末尾补一个句号，
    // 跟其它视图的整句描述保持同一口气。
    const desc = topic.desc?.trim() || `${topic.name}主题`;
    return /[。！？.!?]$/.test(desc) ? desc : `${desc}。`;
  })();
  /**
   * 归档分组：按发布年份把文章分堆。
   * 年份口径跟卡片上显示的日期一致（发布快照的更新时间）。
   */
  const groups = useMemo(() => {
    if (!all || year) return [];
    const map = new Map<number, Post[]>();
    for (const post of posts) {
      const key = new Date(post.updatedAt).getFullYear();
      const list = map.get(key);
      if (list) list.push(post);
      else map.set(key, [post]);
    }
    return [...map.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([groupYear, items]) => ({ year: groupYear, items }));
  }, [all, year, posts]);
  /**
   * banner 只在「推荐」tab 且没有专题筛选时出现：
   * 「最新」tab 是完整列表，专题筛选下也没有全站 banner 位。
   * 热门榜和归档是纯列表，没有头条位。
   */
  const showBanner = recommended && !filter;
  const bannerList = showBanner ? site.banner.slice(0, 3) : [];
  const active = Math.min(heroIndex, Math.max(0, bannerList.length - 1));
  const lead = bannerList[active];
  // banner 池里的文章不重复出现在下方列表里 —— 整池都过滤，不只当前这一条。
  const bannerIds = new Set(bannerList.map((p) => p.id));
  const rest = posts.filter((p) => !bannerIds.has(p.id));
  const step = (delta: number) =>
    setHeroIndex(
      (active + delta + bannerList.length) % Math.max(1, bannerList.length),
    );
  const loading = site.loading || (busy && !posts.length);
  /*
   * 顶部区块留不留，取决于这一屏有没有东西可放：
   *   · 有 banner 文章 → 展示头条，精选视图的主视觉
   *   · 正在加载 → 先占住位置，免得列表先顶上再往下跳
   *   · 专题筛选且该专题一篇公开文章都没有 → 留一句「这个专题暂无公开文章」
   * 其余情况（最新 tab / 热门榜 / 全部文章 / 归档，以及精选视图下没有勾
   * banner 的文章）顶部不留空位：作者卡挪进右侧栏，列表直接顶上来。
   *
   * 精选视图本来就是靠 banner 头条立起来的。一篇 banner 都没勾的时候，
   * 再摆一个「文章即将更新」的空占位框，只是白占掉一大块版面。
   */
  const heroVisible =
    !hot && !all && (loading || !!lead || (!!filter && !posts.length));
  return (
    <main className="ink-wrap">
      {/* 首页唯一的 h1：与 SEO title / 服务端 fallback 的 h1 保持一致。
          头条 banner 把标题烤进了封面，画面上不再叠标题，所以这里用
          视觉隐藏的站点标题做页面主标题，兼顾 SEO 语义和无障碍。 */}
      <h1 className="sr-only">
        思考与实践 · {site.profile?.displayName || "Ink"}
      </h1>
      {/* 视图说明：告诉读者这一屏在看什么。精选视图有 banner 头条，不另起标题。 */}
      {introTitle ? (
        <div className="ink-view-intro">
          <h2>{introTitle}</h2>
        </div>
      ) : null}
      {/* 主导航：视图切换（精选 / 热门 / 全部文章 / 专题）一次只选中一个。
          三个系统视图各带一个描边图标（精选=星、热门=火焰、全部文章=文件），
          图标不另配色，跟文字走同一套色 —— 整排药丸只有「常态灰 / 选中紫」两态。
          专题是作者自定义的筛选，没有图标。 */}
      <nav className="ink-chips" aria-label="文章视图与专题筛选">
        <button
          className="ink-chip"
          aria-pressed={!filter && !hot && !all}
          onClick={() => changeView("featured")}
        >
          <span className="ink-chip-icon">
            <Icon icon="tabler:star" width={15} height={15} />
          </span>
          精选
        </button>
        <button
          className="ink-chip"
          aria-pressed={hot}
          onClick={() => changeView("hot")}
        >
          <span className="ink-chip-icon">
            <Icon icon="tabler:flame" width={15} height={15} />
          </span>
          热门
        </button>
        <button
          className="ink-chip"
          aria-pressed={all}
          onClick={() => changeView("all")}
        >
          <span className="ink-chip-icon">
            <Icon icon="tabler:files" width={15} height={15} />
          </span>
          全部文章
        </button>
        {site.topics.map((t) => (
          <button
            key={t.id}
            className="ink-chip"
            aria-pressed={!hot && !all && filter === t.slug}
            onClick={() => changeFilter(t.slug)}
          >
            {t.name}
          </button>
        ))}
      </nav>
      <div className={"ink-home-grid" + (heroVisible ? "" : " is-no-hero")}>
        {heroVisible && (
          <div className="ink-home-hero">
            {loading ? (
              <p className="ink-empty" role="status">
                正在加载公开文章…
              </p>
            ) : lead ? (
              <div className="ink-lead-hero" key={lead.id}>
                {lead.coverUrl ? (
                  <CoverCanvas
                    src={lead.coverUrl}
                    alt=""
                    config={lead.coverConfig}
                    focus={lead.coverFocus}
                    placement="banner"
                    controls={bannerList.length > 1}
                    {...heroImagePriority}
                  />
                ) : (
                  <div className="ink-lead-hero-fallback">
                    <span className="ink-badge">
                      {lead.topics[0]?.name || "最近发布"}
                    </span>
                    <h2>{lead.title}</h2>
                    {lead.excerpt && <p>{lead.excerpt}</p>}
                  </div>
                )}
                <Link
                  className="ink-lead-hero-hit"
                  to={blogRoute("/blog/" + lead.publishId)}
                  aria-label={lead.title}
                />
                {/*
                 * 左下角状态行：站点标记 + 轮播圆点。
                 * 圆点直接可点（点哪条跳哪条），替代原来右下角的「1 / 3」计数器 ——
                 * 计数器只能看不能点，圆点既能看位置也能切。
                 */}
                <span className="ink-lead-hero-meta">
                  <Icon icon="tabler:star" width={15} height={15} />
                  <span className="ink-lead-hero-meta-label">全站推荐</span>
                  {bannerList.length > 1 && (
                    <span
                      className="ink-lead-hero-dots"
                      role="group"
                      aria-label="选择推荐文章"
                    >
                      {bannerList.map((p, i) => (
                        <button
                          key={p.id}
                          type="button"
                          className="ink-lead-hero-dot"
                          data-active={i === active ? "true" : undefined}
                          aria-current={i === active ? "true" : undefined}
                          aria-label={`第 ${i + 1} 条推荐`}
                          onClick={() => setHeroIndex(i)}
                        />
                      ))}
                    </span>
                  )}
                </span>
                {bannerList.length > 1 && (
                  <span
                    className="ink-lead-hero-switch"
                    role="group"
                    aria-label="切换 banner"
                  >
                    <button
                      type="button"
                      aria-label="上一条 banner"
                      onClick={() => step(-1)}
                    >
                      <Icon icon="tabler:chevron-left" width={18} />
                    </button>
                    <button
                      type="button"
                      aria-label="下一条 banner"
                      onClick={() => step(1)}
                    >
                      <Icon icon="tabler:chevron-right" width={18} />
                    </button>
                  </span>
                )}
              </div>
            ) : (
              !site.error && (
                <div className="ink-empty">
                  <h2>{site.profile?.displayName || "Ink"}</h2>
                  <p>
                    {filter
                      ? "这个专题暂无公开文章。"
                      : "这里记录思考与实践，文章即将更新。"}
                  </p>
                </div>
              )
            )}
          </div>
        )}
        <div className="ink-home-list" ref={listRef}>
          {error && (
            <p role="alert" className="ink-error">
              {error}
            </p>
          )}
          {/* 次级筛选：当前视图内部再切一层的维度 —— 排序方式 / 时间窗 / 年份。
              三处统一成同一套下划线文字 tab，跟上方的大药丸主导航拉开层级：
              同一屏里不再出现三种尺寸的控件。 */}
          <div className="ink-section-head">
            {!hot && !all && (
              <div className="ink-sub-tabs" role="group" aria-label="排序方式">
                <button
                  type="button"
                  aria-pressed={recommended}
                  onClick={() => changeFeed("recommended")}
                >
                  推荐
                </button>
                <button
                  type="button"
                  aria-pressed={!recommended}
                  onClick={() => changeFeed("latest")}
                >
                  最新
                </button>
              </div>
            )}
            {hot && (
              <div className="ink-sub-tabs" role="group" aria-label="时间范围">
                {(
                  [
                    ["day", "当日"],
                    ["month", "最近一个月"],
                    ["year", "最近一年"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={range === value}
                    onClick={() => changeRange(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {all && (
              <div className="ink-sub-tabs" role="group" aria-label="按年份筛选">
                <button
                  type="button"
                  aria-pressed={!year}
                  onClick={() => changeYear(0)}
                >
                  全部
                </button>
                {site.years.map((y) => (
                  <button
                    key={y.year}
                    type="button"
                    aria-pressed={year === y.year}
                    onClick={() => changeYear(y.year)}
                  >
                    {y.year}
                  </button>
                ))}
              </div>
            )}
            {/* 版式切换（卡片 / 列表）只影响下方这一片文章，
                所以留在列表工具条这一行，紧挨着它控制的内容。 */}
            <button
              className="ink-view-toggle"
              onClick={toggleView}
              aria-label={grid ? "切换为列表视图" : "切换为卡片视图"}
              title={grid ? "切换为列表" : "切换为卡片"}
            >
              <Icon
                icon={grid ? "tabler:list" : "tabler:layout-grid"}
                width={19}
              />
            </button>
          </div>
          {all && groups.length > 0 ? (
            /* 归档：按年份分组，每年一叠。 */
            <div className="ink-archive">
              {groups.map((group) => (
                <section className="ink-archive-group" key={group.year}>
                  <h3>
                    <span>{group.year}</span>
                    <small>{group.items.length} 篇</small>
                  </h3>
                  <div className={grid ? "ink-card-grid" : "ink-post-list"}>
                    {group.items.map((p) => (
                      <PostCard key={p.id} post={p} grid={grid} entry="home" />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : rest.length > 0 ? (
            <>
              <div className={grid ? "ink-card-grid" : "ink-post-list"}>
                {rest.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    grid={grid}
                    entry={filter ? "topic" : hot ? "hot" : "home"}
                    // 置顶角标只在全站推荐流里挂：那里的顺序由置顶决定。
                    // 专题里的顺序由推荐分决定，挂着置顶标会让人以为位置也是置顶给的。
                    showFeatured={recommended && !filter}
                  />
                ))}
              </div>
            </>
          ) : null}
          {busy && !posts.length && (
            <p className="ink-empty" role="status">
              正在加载…
            </p>
          )}
          {!busy && !posts.length && (hot || all) && (
            <p className="ink-empty" role="status">
              {hot ? "这段时间还没有文章被读过。" : "还没有公开文章。"}
            </p>
          )}
          {/* 列表空态分两种，样子也不一样：
              · 有内容但都在上面头条里了 → 这是「内容在别处」，不是「没内容」，
                摆个虚线空框反而像出了错，一行灰字说明白就够；
              · 真的没内容（没公开文章）→ 沿用虚线空框，跟热门榜、归档视图一致。
              专题筛选的空态由顶部横幅的「这个专题暂无公开文章」负责，不重复。 */}
          {!busy &&
            rest.length === 0 &&
            (posts.length > 0 || !!lead) &&
            !(hot || all) && (
              <p className="ink-empty-note" role="status">
                公开的文章都放在上面的头条里了。
              </p>
            )}
          {!busy &&
            rest.length === 0 &&
            posts.length === 0 &&
            !lead &&
            !(hot || all) &&
            !(filter && !posts.length) && (
              <p className="ink-empty" role="status">
                还没有公开文章。
              </p>
            )}
          {/* 分页走独立 URL：?page=N 每一页都能分享、能被收录 */}
          <Pagination page={page} pageCount={pageCount} onChange={goToPage} />
        </div>
        {/* 作者卡放在列表之后：双栏时它被 grid 排到右上角跟 banner 并排，
            单列时它落到文章列表下面 —— 读者先看到文章，作者名片最后再看到。
            DOM 顺序也跟着这个来，读屏不会先念一大段名片。 */}
        {heroVisible && (
          <div className="ink-home-author">
            <AuthorCard />
          </div>
        )}
        <aside className="ink-aside">
          {/* 顶部没有 banner 时作者卡挪进侧栏 —— 顶部不留一块空白 */}
          {!heroVisible && <AuthorCard />}
          <RSSLink />
          <TopicLinks />
          {/* 「最近更新」是全站语义：纯时间序的最新几篇，不用精选也不用当页的列表 */}
          <RecentUpdates posts={site.recent} />
        </aside>
      </div>
    </main>
  );
}
