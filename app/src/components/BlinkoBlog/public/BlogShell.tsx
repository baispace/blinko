import { BlogTracking } from "./BlogTracking";
import {
  blogInternalPath,
  blogRoute,
  blogRoutePath,
} from "@/lib/blogPublicBase";
import {
  blogDeviceId,
  blogStatsEnabled,
  configureBlogStatistics,
} from "@/lib/blogDevice";
import { blogAttribution, rememberBlogEntry } from "@/lib/blogReferrer";
import superjson from "superjson";
import { BlogMetadata } from "./BlogMetadata";
import {
  AUTHOR_STATUS_INTERVAL,
  authorStatusPool,
} from "./authorStatus";
import { copyrightYears, promoVisible } from "@shared/lib/blogFooter";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Icon } from "@/components/Common/Iconify/icons";
import { api } from "@/lib/publicBlogClient";
import type { CoverPalette } from "@/lib/coverColor";
import { CoverImage } from "../CoverImage";
import { CoverCanvas } from "../CoverCanvas";
import "../blog.css";
import "./typography.css";
import "./home-refinements.css";

type Index = Awaited<ReturnType<typeof api.blog.publicIndex.query>>;
export type Post = Index["posts"][number];
export type Topic = Index["topics"][number];
export type Profile = Index["profile"];

/** 主导航项：children 非空时渲染成二级下拉。 */
type NavItem = {
  label: string;
  to: string;
  children: { label: string; to: string }[];
};
type Site = Index & {
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  scrollRoot: RefObject<HTMLDivElement>;
  /**
   * 当前页面的封面主色调色板（文章页采样得到）。
   * 挂在站点根节点上，导航栏和顶部通栏共用同一片颜色 —— 整个顶部是一块，
   * 而不是两个各自为政的色块。
   */
  coverTint: CoverPalette | null;
  setCoverTint: (palette: CoverPalette | null) => void;
};
const Context = createContext<Site | null>(null);
export function useBlogSite() {
  const value = useContext(Context);
  if (!value) throw new Error("BlogShell missing");
  return value;
}
export function useBlogTitle(title: string) {
  // BlogMetadata owns the complete document head.
  void title;
}
export function articleURL(post: { publishId: string }, topic?: string) {
  return blogRoute(
    "/blog/" +
      post.publishId +
      (topic ? "?topic=" + encodeURIComponent(topic) : ""),
  );
}
/** 外链只显示域名，让人一眼看出这是站外的地方。 */
function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * 右上角的滚动数值。
 *
 * 顶栏常驻吸顶，操作药丸的末尾就空着一个位置 —— 放个数字，
 * 告诉读者读到哪儿了（整篇的百分比）。
 *
 * 默认不出现，开始往下滚才淡入 —— 页面刚打开时不需要它。
 * 圆点本身绝对定位：药丸变宽时圆点不会压扁，中间的导航也不会被挤动
 * （导航是绝对居中的，宽度变化影响不到它）。
 *
 * 单独做成组件是为了不牵动整页重渲染：滚动时只有它自己更新。
 */
function ScrollMeter({ rootRef }: { rootRef: RefObject<HTMLDivElement> }) {
  const [percent, setPercent] = useState(0);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const top = root.scrollTop;
        const max = root.scrollHeight - root.clientHeight;
        const next = max > 0 ? Math.min(100, Math.round((top / max) * 100)) : 0;
        // 百分比只在整点变化时才会变，setState 收到同一个值会直接跳过重渲染。
        setPercent(next);
        setShown(top > 16);
      });
    };
    root.addEventListener("scroll", update, { passive: true });
    update();
    // 内容高度变了（图片加载完、列表翻页）就要重算比例。
    const observer = new ResizeObserver(update);
    observer.observe(root);
    const content = root.querySelector(".ink-page");
    if (content) observer.observe(content);
    return () => {
      root.removeEventListener("scroll", update);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [rootRef]);
  return (
    <span
      className="ink-scroll-meter"
      data-show={shown ? "true" : "false"}
      aria-hidden="true"
    >
      <i className="ink-scroll-meter-badge">{percent}</i>
    </span>
  );
}
/**
 * 面板里的一格：圆形图标 + 名称。
 *
 * 站外链接用对方站点的 favicon（取不到就退回首字母色块），
 * 站内页面用固定图标。
 */
function SitesEntry({
  to,
  href,
  icon,
  label,
  note,
  favicon,
  onNavigate,
}: {
  to?: string;
  href?: string;
  icon?: string;
  label: string;
  note?: string;
  favicon?: string;
  onNavigate?: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const body = (
    <>
      <span className="ink-sites-entry-icon">
        {favicon && !broken ? (
          <img
            src={favicon}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
          />
        ) : icon ? (
          <Icon icon={icon} width={18} />
        ) : (
          <span className="ink-sites-entry-letter">
            {label.trim().charAt(0).toUpperCase()}
          </span>
        )}
      </span>
      <span className="ink-sites-entry-text">
        <span className="ink-sites-entry-label">{label}</span>
        {note ? <small>{note}</small> : null}
      </span>
    </>
  );
  if (href)
    return (
      <a
        className="ink-sites-entry"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
      >
        {body}
      </a>
    );
  return (
    <Link
      className="ink-sites-entry"
      to={to ?? blogRoute("/blog")}
      onClick={onNavigate}
    >
      {body}
    </Link>
  );
}

/** 取对方站点的 favicon；地址不合法就放弃，用首字母顶上。 */
function faviconOf(url: string) {
  try {
    return new URL(url).origin + "/favicon.ico";
  } catch {
    return "";
  }
}

export function PostMeta({
  post,
  featured = false,
}: {
  post: Post;
  /**
   * 是否显示「置顶」角标。
   *
   * 只有推荐流该挂：那里的顺序由置顶决定。
   * 「最新」流是纯时间序、专题页是专题编排出来的，
   * 在那两处挂置顶标会让人以为位置也是置顶给的。
   *
   * 有封面时角标挂在封面左上角（见 PostCard），
   * 只有没封面才退回这里。
   */
  featured?: boolean;
}) {
  return (
    <div className="ink-meta">
      {featured && post.isFeatured && (
        <span className="ink-badge ink-badge-featured" title="作者置顶推荐">
          <Icon icon="tabler:bookmark" width={12} height={12} />
          置顶
        </span>
      )}
      {post.topics.map((t) => (
        <Link
          className="ink-badge"
          key={t.id}
          to={blogRoute("/blog/t/" + t.slug)}
          style={{
            color: t.color || "var(--ink-accent)",
            background: (t.color || "#7055f8") + "18",
          }}
        >
          {t.name}
        </Link>
      ))}
      <time dateTime={new Date(post.updatedAt).toISOString()}>
        {new Date(post.updatedAt).toLocaleDateString("zh-CN")}
      </time>
      {post.views ? (
        <span className="ink-read-stat">
          <Icon icon="tabler:eye" width={14} />
          {post.views}
        </span>
      ) : null}
    </div>
  );
}
export function PostCard({
  post,
  grid = false,
  topic,
  entry,
  showFeatured = false,
}: {
  post: Post;
  grid?: boolean;
  topic?: string;
  /** 站内入口位置：首页 / 专题 / 站内搜索 / 文章页相关推荐。 */
  entry?: string;
  /**
   * 是否显示「置顶」角标 —— 只在推荐流里为真。
   * 有封面时角标落在封面左上角，没有封面才退回元信息行。
   */
  showFeatured?: boolean;
}) {
  const element = useRef<HTMLElement>(null);
  const entryKey = entry ?? "recommend";
  const report = (kind: "impression" | "click") => {
    const deviceId = blogStatsEnabled() ? blogDeviceId() : null;
    if (!deviceId) return;
    void api.blog.recommendationEvent
      .mutate({
        deviceId,
        kind,
        publishId: post.publishId,
        ...blogAttribution(entryKey),
      })
      .catch(() => {});
  };
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        clearTimeout(timer);
        if (
          entries[0]?.isIntersecting &&
          entries[0].intersectionRatio >= 0.5 &&
          !document.hidden
        )
          timer = setTimeout(() => {
            if (document.hidden) return;
            report("impression");
            observer.disconnect();
          }, 1000);
      },
      { threshold: [0, 0.5] },
    );
    if (element.current) observer.observe(element.current);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [post.publishId]);
  return (
    <article
      ref={element}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a")) {
          // 记下站内入口：SPA 跳转不会更新 document.referrer，
          // 文章页要靠这段上下文才知道「用户是从哪个站内位置点过来的」。
          rememberBlogEntry(entryKey);
          report("click");
        }
      }}
      className={grid ? "ink-post-card ink-panel" : "ink-post-row ink-panel"}
    >
      {post.coverUrl ? (
        <span className="ink-post-cover-box">
          <Link
            className="ink-post-cover"
            to={articleURL(post, topic)}
            tabIndex={-1}
            aria-hidden="true"
          >
            <CoverCanvas
              src={post.coverUrl}
              alt=""
              config={post.coverConfig}
              focus={post.coverFocus}
              placement={grid ? "double" : "single"}
              loading="lazy"
            />
          </Link>
          {showFeatured && post.isFeatured && (
            <span className="ink-cover-badge" title="作者置顶推荐">
              <Icon icon="tabler:bookmark" width={13} height={13} />
              <span className="ink-cover-badge-text">置顶</span>
            </span>
          )}
        </span>
      ) : null}
      <div className={grid ? "ink-post-card-body" : "ink-post-copy"}>
        <h3>
          <Link to={articleURL(post, topic)}>{post.title}</Link>
        </h3>
        <p>{post.excerpt}</p>
        <PostMeta post={post} featured={showFeatured && !post.coverUrl} />
      </div>
      {!grid && (
        <Link
          className="ink-row-arrow"
          to={articleURL(post, topic)}
          aria-label={"阅读 " + post.title}
        >
          <Icon icon="tabler:arrow-right" width={18} />
        </Link>
      )}
    </article>
  );
}
/** 一句话介绍：优先取 tagline 后段（作者自己写的定位句），没有就退回 bio 的第一句。 */
function oneLiner(bio: string) {
  const first = bio.split(/\n+/)[0]?.trim() ?? "";
  const stop = first.indexOf("。");
  return stop > 0 ? first.slice(0, stop + 1) : first;
}

/** 读者系统是否要求减少动效。开启后动态胶囊不再自动轮播。 */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * 顶部胶囊：一句会变的短句。
 *
 * 固定文案打底 + 时段提示（深夜提示休息这一类），每 6 秒换一条，
 * 新旧两层叠在一起淡入淡出；鼠标悬停时暂停 —— 读者正在读这句就别把它换掉。
 *
 * 想立刻换一句就点它：定时轮播走「交叉淡换」，点击走「让位 → 箭头转一圈 → 新句淡入」，
 * 点击的动作有回应，读起来不生硬。
 *
 * 两层叠在同一个网格单元里，胶囊宽度不受文案长短影响，换句时不跳。
 */
function AuthorStatus() {
  const [layers, setLayers] = useState(() => {
    const pool = authorStatusPool();
    return [{ id: 0, index: 0, text: pool[0], out: false }];
  });
  const [paused, setPaused] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const reduced = usePrefersReducedMotion();
  const swapTimer = useRef<number | null>(null);

  /** 定时轮播：新旧两句交叉淡换。 */
  const advance = useCallback(() => {
    setLayers((prev) => {
      const pool = authorStatusPool();
      const index = (prev[0].index + 1) % pool.length;
      return [
        { id: prev[0].id + 1, index, text: pool[index], out: false },
        { ...prev[0], out: true },
      ];
    });
  }, []);

  /** 点击换句：只留新句，旧的直接让位给转圈的箭头。 */
  const swapNow = useCallback(() => {
    setLayers((prev) => {
      const pool = authorStatusPool();
      const index = (prev[0].index + 1) % pool.length;
      return [{ id: prev[0].id + 1, index, text: pool[index], out: false }];
    });
  }, []);

  const handleClick = useCallback(() => {
    swapNow();
    setSwapping(true);
    if (swapTimer.current) window.clearTimeout(swapTimer.current);
    swapTimer.current = window.setTimeout(() => setSwapping(false), 450);
  }, [swapNow]);

  useEffect(
    () => () => {
      if (swapTimer.current) window.clearTimeout(swapTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (reduced || paused) return;
    const timer = window.setInterval(advance, AUTHOR_STATUS_INTERVAL);
    return () => window.clearInterval(timer);
  }, [reduced, paused, advance]);

  return (
    <button
      type="button"
      className={"ink-author-tag" + (swapping ? " is-swapping" : "")}
      title="点一下换一句"
      aria-live="polite"
      onClick={handleClick}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {layers.map((layer) => (
        <span
          key={layer.id}
          className={"ink-author-tag-text " + (layer.out ? "is-out" : "is-in")}
          aria-hidden={layer.out || undefined}
        >
          {layer.text}
        </span>
      ))}
      {/* 点击瞬间占住正中的箭头：文字先让位，箭头转一圈，再把新句交回来。 */}
      <span className="ink-author-tag-flash" aria-hidden="true">
        <Icon icon="tabler:refresh" width={14} />
      </span>
    </button>
  );
}

export function AuthorCard() {
  const { profile } = useBlogSite();
  const [expanded, setExpanded] = useState(false);
  if (!profile) return null;
  // 原型这张卡分两层文案：顶部胶囊是一句会变的短句、底部是一句话介绍。
  // tagline 按「·」分段刚好能对上：后段当介绍，前段那个身份标签不再上卡片。
  const parts = (profile.tagline || "")
    .split("·")
    .map((s) => s.trim())
    .filter(Boolean);
  const intro =
    parts.length > 1
      ? parts.slice(1).join(" · ")
      : profile.bio
        ? oneLiner(profile.bio)
        : profile.tagline;
  // 卡片上只留一个作品集/代码入口（原型如此），其余链接在页脚。
  const rest = profile.links.filter((l) => !/rss|feed\.xml/i.test(l.url));
  const featured = rest.find((l) => /github\.com/i.test(l.url)) ?? rest[0];
  const social = featured ? [featured] : [];
  const avatar = profile.avatarUrl ? (
    <img src={profile.avatarUrl} alt={profile.displayName || "作者"} />
  ) : (
    <Icon icon="tabler:user-circle" width={112} />
  );
  return (
    <section
      className={"ink-author " + (expanded ? "is-expanded" : "")}
      onKeyDown={(e) => {
        if (e.key === "Escape") setExpanded(false);
      }}
    >
      <AuthorStatus />
      <div className="ink-author-middle">
        {/*
          右上角原本挂着一个 ⓘ 按钮用来展开自述，视觉上多余 —— 改成直接点头像：
          桌面端悬停本来就能展开，触屏与键盘靠这个头像。
          自述和「了解作者 →」都还在，只是不再画一个图标按钮。
        */}
        {profile.bio ? (
          <button
            type="button"
            className="ink-author-avatar"
            aria-label={expanded ? "收起作者介绍" : "查看作者介绍"}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {avatar}
          </button>
        ) : (
          <div className="ink-author-avatar">{avatar}</div>
        )}
        {profile.bio && (
          <div className="ink-author-bio">
            <p>{profile.bio}</p>
            <div className="ink-author-bio-foot">
              <Link to={blogRoute("/blog/about")}>了解作者 →</Link>
              {/* 展开后头像淡出，触屏就少了一个收起的入口 —— 这里补一个。 */}
              {expanded && (
                <button
                  type="button"
                  className="ink-author-bio-close"
                  onClick={() => setExpanded(false)}
                >
                  收起
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="ink-author-base">
        <div>
          <h3>{profile.displayName || "作者"}</h3>
          <small>{intro}</small>
        </div>
        <div className="ink-author-links">
          {profile.homepage && (
            <a
              href={profile.homepage}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="个人主页"
              title="个人主页"
            >
              <Icon icon="tabler:world" width={19} />
            </a>
          )}
          {/* 原型这张卡只放两个：个人主页 + 作品集/GitHub。其余链接在页脚。 */}
          {social.map((l, i) => (
            <a
              key={i}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={l.label || "相关站点"}
              title={l.label}
            >
              <Icon
                icon={
                  /github\.com/i.test(l.url)
                    ? "tabler:brand-github"
                    : "tabler:link"
                }
                width={19}
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
export function RecentUpdates({ posts }: { posts: Post[] }) {
  const list = posts.slice(0, 5);
  if (!list.length) return null;
  return (
    <section className="ink-panel ink-recent">
      <h3>
        最近更新
        <Link className="ink-recent-all" to={blogRoute("/blog")}>
          查看全部
          <Icon icon="tabler:arrow-right" width={15} />
        </Link>
      </h3>
      <ol className="ink-recent-list">
        {list.map((p) => {
          const topic = p.topics[0];
          return (
            <li key={p.id}>
              <Link
                className="ink-recent-cover"
                to={articleURL(p)}
                tabIndex={-1}
                aria-hidden="true"
              >
                {p.coverUrl ? (
                  <CoverImage
                    src={p.coverUrl}
                    alt=""
                    focus={p.coverFocus}
                    loading="lazy"
                  />
                ) : null}
              </Link>
              <div className="ink-recent-body">
                <Link className="ink-recent-title" to={articleURL(p)}>
                  {p.title}
                </Link>
                <div className="ink-recent-foot">
                  {topic && (
                    <Link
                      className="ink-recent-topic"
                      to={blogRoute("/blog/t/" + topic.slug)}
                      style={{
                        color: topic.color || "var(--ink-accent)",
                        background: (topic.color || "#7055f8") + "18",
                      }}
                    >
                      {topic.name}
                    </Link>
                  )}
                  <time dateTime={new Date(p.updatedAt).toISOString()}>
                    {new Date(p.updatedAt).toLocaleDateString("zh-CN")}
                  </time>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * 列表分页控件。
 *
 * 分页是**独立 URL**（?page=N）而不是「加载更多」：每一页都能被分享、
 * 被搜索引擎收录，刷新也不会跳回第一页。rel=prev/next 由 SEO 侧负责。
 */
export function Pagination({
  page,
  pageCount,
  onChange,
  label = "分页导航",
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  label?: string;
}) {
  if (pageCount <= 1) return null;
  // 页码窗口：当前页居中，两侧各留 1 页，多的用省略号收掉
  const pages: (number | "gap")[] = [];
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== "gap") pages.push("gap");
  }
  return (
    <nav className="ink-pagination" aria-label={label}>
      <button
        className="ink-page-step"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="上一页"
      >
        <Icon icon="tabler:chevron-left" width={16} />
        上一页
      </button>
      <div className="ink-page-numbers">
        {pages.map((p, i) =>
          p === "gap" ? (
            <span key={"gap" + i} className="ink-page-gap" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={p}
              className="ink-page-number"
              aria-current={p === page ? "page" : undefined}
              onClick={() => onChange(p)}
              aria-label={"第 " + p + " 页"}
            >
              {p}
            </button>
          ),
        )}
      </div>
      <button
        className="ink-page-step"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
        aria-label="下一页"
      >
        下一页
        <Icon icon="tabler:chevron-right" width={16} />
      </button>
    </nav>
  );
}
export function TopicLinks() {
  const { topics } = useBlogSite();
  if (!topics.length) return null;
  return (
    <section className="ink-panel ink-topic-links">
      <h3>
        专题导览
        <Link to={blogRoute("/blog/topics")} aria-label="查看全部专题">
          <Icon icon="tabler:arrow-right" width={17} />
        </Link>
      </h3>
      {topics.map((t, i) => (
        <Link
          key={t.id}
          to={blogRoute("/blog/t/" + t.slug)}
          className="ink-topic-link"
        >
          <span
            className="ink-topic-num"
            style={{ background: t.color || "#7055f8" }}
          >
            {i + 1}
          </span>
          <span className="ink-topic-label">
            <b>{t.name}</b>
            <small>{t.desc || `${t.count} 篇文章`}</small>
          </span>
          <span className="ink-muted">{t.count}</span>
        </Link>
      ))}
    </section>
  );
}
/**
 * 侧栏的订阅入口。
 *
 * 指向订阅页而不是直接甩一个 feed.xml —— 订阅页才讲得清
 * 「这个源里有什么、怎么加进阅读器」。想直接拿地址的人可以在那里复制。
 */
export function RSSLink() {
  return (
    <Link to={blogRoute("/blog/subscribe")} className="ink-panel ink-rss">
      <span className="ink-rss-icon">
        <Icon icon="tabler:rss" width={20} />
      </span>
      <span className="ink-rss-copy">
        <b>订阅更新</b>
        <small>微信公众号与 RSS</small>
      </span>
      <Icon icon="tabler:arrow-right" width={17} />
    </Link>
  );
}
function Footer() {
  const { topics, profile, siteName, scrollRoot, publicSettings } = useBlogSite();
  // 品牌名跟工作区「站点名称」走，站点改名不用改代码
  const brand = siteName || "Ink";
  // 页脚信息全部来自站点设置：备案号、版权署名、推广位。
  const footer = publicSettings?.footer;
  const timeZone = publicSettings?.timezone || "Asia/Shanghai";
  const promo = footer?.promo;
  const showPromo = promoVisible(promo, timeZone);
  const years = copyrightYears(footer);
  const owner = footer?.owner?.trim() ?? "";
  return (
    <footer className="ink-footer">
      <div className="ink-footer-grid ink-wrap">
        <div>
          <Link to={blogRoute("/blog")} className="ink-brand">
            {brand}
          </Link>
          <p>
            {profile?.tagline || "记录思考与实践，让经验成为有脉络的内容。"}
          </p>
          {!!profile && (!!profile.links.length || !!profile.homepage) && (
            <div className="ink-footer-social">
              {profile.homepage && (
                <a
                  href={profile.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="个人主页"
                  title="个人主页"
                >
                  <Icon icon="tabler:world" width={17} />
                </a>
              )}
              {profile.links.map((l, i) => (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={l.label || "相关站点"}
                  title={l.label}
                >
                  <Icon
                    icon={
                      /github\.com/i.test(l.url)
                        ? "tabler:brand-github"
                        : "tabler:link"
                    }
                    width={17}
                  />
                </a>
              ))}
            </div>
          )}
        </div>
        <div>
          <h4>阅读</h4>
          <Link to={blogRoute("/blog")}>全部文章</Link>
          <Link to={blogRoute("/blog/moments")}>动态</Link>
          <Link to={blogRoute("/blog/topics")}>专题</Link>
          <Link to={blogRoute("/blog/friends")}>友情链接</Link>
          <Link to={blogRoute("/blog/about")}>关于作者</Link>
          <Link to={blogRoute("/blog/stats")}>站点数据</Link>
        </div>
        <div>
          <h4>专题</h4>
          {topics.slice(0, 6).map((t) => (
            <Link key={t.id} to={blogRoute("/blog/t/" + t.slug)}>
              {t.name}
            </Link>
          ))}
          {!topics.length && <p>专题持续整理中</p>}
        </div>
        <div>
          <h4>订阅与更新</h4>
          <Link to={blogRoute("/blog/subscribe")}>订阅更新</Link>
          <Link to={blogRoute("/blog/moments")}>动态订阅</Link>
          <p>微信公众号与 RSS，两种方式随你挑。</p>
        </div>
      </div>
      <div className="ink-footer-bottom ink-wrap">
        {/* 左：备案号与推广位。备案号点开是官方查询页，推广位到期自动消失。 */}
        <div className="ink-footer-legal">
          {footer?.icp?.trim() && (
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              {footer.icp.trim()}
            </a>
          )}
          {footer?.police?.trim() && (
            <a
              href="https://beian.mps.gov.cn/"
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              {footer.police.trim()}
            </a>
          )}
          {showPromo && promo && (
            <span className="ink-footer-promo">
              {promo.title?.trim() && <b>{promo.title.trim()}</b>}
              {promo.text?.trim() && <span>{promo.text.trim()}</span>}
              {promo.url?.trim() && (
                <a
                  href={promo.url.trim()}
                  target="_blank"
                  rel="noopener noreferrer nofollow sponsored"
                >
                  去看看 ↗
                </a>
              )}
            </span>
          )}
        </div>
        <div className="ink-footer-meta">
          <span>
            © {years}
            {owner ? ` By ${owner}` : ` ${brand}`}
          </span>
          <a href="/sitemap.xml" target="_blank" rel="noopener noreferrer">
            站点地图
          </a>
          <button
            onClick={() =>
              scrollRoot.current?.scrollTo({
                top: 0,
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "auto"
                  : "smooth",
              })
            }
          >
            返回顶部 ↑
          </button>
        </div>
      </div>
    </footer>
  );
}
/** 最近搜索词：只存在本机 localStorage，最多 8 条。 */
const RECENT_SEARCH_KEY = "ink-blog-recent-searches";
function readRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCH_KEY);
    if (!raw) return [];
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter((v): v is string => typeof v === "string" && !!v.trim())
      .slice(0, 8);
  } catch {
    return [];
  }
}
function writeRecentSearches(list: string[]) {
  try {
    localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {}
}
function SearchDialog({ close }: { close: () => void }) {
  const site = useBlogSite(),
    navigate = useNavigate(),
    dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(""),
    [term, setTerm] = useState(""),
    [scope, setScope] = useState("all"),
    [active, setActive] = useState(-1),
    [recent, setRecent] = useState<string[]>([]);
  const [results, setResults] = useState<{
      posts: Post[];
      topics: Topic[];
      total: number;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    input.current?.focus();
    setRecent(readRecentSearches());
  }, []);
  /** 记住这次搜过的词：只存本机，最多 8 条。 */
  const remember = (value: string) => {
    const text = value.trim();
    if (!text) return;
    const deviceId = blogStatsEnabled() ? blogDeviceId() : null;
    if (deviceId)
      void api.blog.recommendationEvent
        .mutate({
          deviceId,
          kind: "search",
          term: text.slice(0, 80),
          ...blogAttribution("search", true),
        })
        .catch(() => {});
    setRecent((prev) => {
      const next = [text, ...prev.filter((r) => r !== text)].slice(0, 8);
      writeRecentSearches(next);
      return next;
    });
  };
  useEffect(() => {
    const timer = setTimeout(() => setTerm(q.trim()), 200);
    return () => clearTimeout(timer);
  }, [q]);
  useEffect(() => {
    setActive(-1);
    if (!term) {
      setResults(null);
      setBusy(false);
      setError(false);
      return;
    }
    let current = true;
    setBusy(true);
    setError(false);
    api.blog.publicSearch
      .query({ search: term })
      .then((r) => {
        if (current) setResults(r);
      })
      .catch(() => {
        if (current) {
          setError(true);
          setResults(null);
        }
      })
      .finally(() => {
        if (current) setBusy(false);
      });
    return () => {
      current = false;
    };
  }, [term]);
  // 只有真的在搜的时候才有结果列表；空态走原型那套「最近搜索 / 推荐阅读 / 从专题开始」。
  const posts = term ? (results?.posts ?? []) : site.posts.slice(0, 3),
    topics = term ? (results?.topics ?? []) : site.topics.slice(0, 3);
  const items = [
    ...(term && scope === "topics"
      ? []
      : posts.map((p) => ({
          key: "p" + p.id,
          to: articleURL(p),
          title: p.title,
          sub: p.excerpt,
          cover: p.coverUrl,
          kind: "文章",
        }))),
    ...(term && scope === "posts"
      ? []
      : topics.map((t) => ({
          key: "t" + t.id,
          to: blogRoute("/blog/t/" + t.slug),
          title: t.name,
          sub: t.desc || `${t.count} 篇文章`,
          cover: t.coverUrl,
          kind: "专题",
        }))),
  ];
  useEffect(() => {
    dialog.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const open = (url: string) => {
    close();
    navigate(url);
  };
  return (
    <dialog
      ref={dialog}
      className="ink-search"
      aria-label="搜索公开文章与专题"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) {
          const rect = dialog.current.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            close();
        }
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActive((v) => Math.min(v + 1, items.length - 1));
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setActive((v) => Math.max(-1, v - 1));
        }
        if (
          e.key === "Enter" &&
          e.target === input.current &&
          active >= 0 &&
          items[active]
        ) {
          e.preventDefault();
          remember(term);
          open(items[active].to);
        } else if (
          e.key === "Enter" &&
          e.target === input.current &&
          q.trim()
        ) {
          // 没选中任何结果时，Enter = 记住这次搜索词。
          remember(q);
        }
      }}
    >
      <div className="ink-search-input">
        <Icon icon="tabler:search" width={20} />
        <input
          ref={input}
          value={q}
          maxLength={200}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(-1);
          }}
          aria-label="搜索关键词"
          placeholder="搜索文章、正文或专题"
        />
        {q && (
          <button
            aria-label="清除关键词"
            onClick={() => {
              setQ("");
              setTerm("");
              setResults(null);
              setError(false);
              input.current?.focus();
            }}
          >
            <Icon icon="tabler:x" width={18} />
          </button>
        )}
        <button
          className="ink-search-close"
          onClick={close}
          aria-label="关闭搜索"
        >
          关闭
          <kbd>Esc</kbd>
        </button>
      </div>
      {term ? (
        <>
          <div className="ink-search-scope">
            {[
              ["all", "全部"],
              ["posts", "文章"],
              ["topics", "专题"],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={scope === value}
                onClick={() => {
                  setScope(value);
                  setActive(-1);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="ink-search-results" aria-live="polite">
            <p className="ink-search-label">
              {busy || q.trim() !== term
                ? "正在查找公开内容…"
                : error
                  ? "搜索失败，请稍后重试"
                  : `匹配文章 ${results?.total ?? 0} 篇，最多展示 12 篇`}
            </p>
            {items.map((item, i) => (
              <Link
                key={item.key}
                to={item.to}
                onClick={() => {
                  remember(term);
                  close();
                }}
                data-index={i}
                data-active={i === active}
                className="ink-search-item"
              >
                {item.cover && <img src={item.cover} alt="" loading="lazy" />}
                <span>
                  <small>{item.kind}</small>
                  <b>{item.title}</b>
                  <small>{item.sub}</small>
                </span>
              </Link>
            ))}
            {!busy && !error && !items.length && (
              <div className="ink-empty">
                没有找到匹配内容，试试缩短关键词。
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="ink-search-idle" aria-live="polite">
          <p className="ink-search-hint">
            还没有想好搜什么？可以先看看这些内容。
          </p>

          {recent.length > 0 && (
            <section className="ink-search-block">
              <div className="ink-search-block-head">
                <h4>最近搜索</h4>
                <button
                  onClick={() => {
                    setRecent([]);
                    writeRecentSearches([]);
                  }}
                >
                  <Icon icon="tabler:trash" width={15} />
                  清空
                </button>
              </div>
              <div className="ink-search-chips">
                {recent.map((r) => (
                  <button
                    key={r}
                    className="ink-search-chip"
                    onClick={() => {
                      setQ(r);
                      setTerm(r);
                      setActive(-1);
                    }}
                  >
                    <Icon icon="tabler:clock" width={14} />
                    {r}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="ink-search-block">
            <div className="ink-search-block-head">
              <h4>推荐阅读</h4>
              <span className="ink-search-tag">作者精选</span>
            </div>
            <div className="ink-search-picks">
              {site.posts.slice(0, 3).map((p, i) => (
                <Link
                  key={p.id}
                  to={articleURL(p)}
                  onClick={close}
                  className="ink-search-pick"
                  data-index={i}
                  data-active={active === i}
                >
                  {p.coverUrl ? (
                    <CoverImage
                      src={p.coverUrl}
                      alt=""
                      focus={p.coverFocus}
                      loading="lazy"
                    />
                  ) : (
                    <span className="ink-search-pick-blank" />
                  )}
                  <span className="ink-search-pick-body">
                    <b>{p.title}</b>
                    <small>{p.excerpt}</small>
                    <span className="ink-search-pick-meta">
                      {p.topics[0] && (
                        <span
                          className="ink-search-pick-topic"
                          style={{
                            color: p.topics[0].color || "var(--ink-accent)",
                            background: (p.topics[0].color || "#7055f8") + "18",
                          }}
                        >
                          {p.topics[0].name}
                        </span>
                      )}
                      <time dateTime={new Date(p.updatedAt).toISOString()}>
                        {new Date(p.updatedAt).toLocaleDateString("zh-CN")}
                      </time>
                    </span>
                  </span>
                  <Icon
                    icon="tabler:chevron-right"
                    width={18}
                    className="ink-search-pick-arrow"
                  />
                </Link>
              ))}
              {!site.posts.length && (
                <p className="ink-search-empty">还没有公开文章。</p>
              )}
            </div>
          </section>

          {site.topics.length > 0 && (
            <section className="ink-search-block">
              <div className="ink-search-block-head">
                <h4>从专题开始</h4>
              </div>
              <div className="ink-search-topics">
                {site.topics.slice(0, 3).map((t, i) => (
                  <Link
                    key={t.id}
                    to={blogRoute("/blog/t/" + t.slug)}
                    onClick={close}
                    className="ink-search-topic"
                    data-index={site.posts.slice(0, 3).length + i}
                    data-active={active === site.posts.slice(0, 3).length + i}
                  >
                    <span
                      className="ink-search-topic-num"
                      style={{ background: t.color || "#7055f8" }}
                    >
                      {i + 1}
                    </span>
                    <span className="ink-search-topic-body">
                      <b>{t.name}</b>
                      <small>{t.desc || `${t.count} 篇文章`}</small>
                    </span>
                    <Icon icon="tabler:chevron-right" width={16} />
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      <div className="ink-search-foot">
        <span>
          {term
            ? "↑↓ 选择 · Enter 打开 · Esc 关闭"
            : "输入关键词，或用 ↑↓ 选择内容"}
        </span>
        <small>仅展示已发布内容</small>
      </div>
    </dialog>
  );
}
function initialPublicBlog(): Index | null {
  try {
    const payload = JSON.parse(
      document.getElementById("ink-blog-bootstrap")?.textContent || "null",
    );
    if (payload?.path !== blogInternalPath(window.location.pathname))
      return null;
    return superjson.deserialize<Index>(payload.data);
  } catch {
    return null;
  }
}
export function BlogShell() {
  const [initial] = useState(initialPublicBlog);
  const initialKey = useRef(window.location.pathname + window.location.search);
  const bootstrapped = useRef(!!initial);
  const scrollRoot = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<Index>(
    initial || {
      profile: null,
      topics: [],
      posts: [],
      total: 0,
      nextCursor: null,
      siteName: "Ink",
      publicSettings: null as any,
      // banner 池：没有服务端首屏数据时先空着，首页拿到数据后再渲染。
      banner: [],
      featured: [],
      // 「最近更新」是纯时间序，和精选（featured）不是一回事
      recent: [],
      // 年份归档：公开文章分布在哪些年份
      years: [],
      page: 1,
      // 占位值：真实页长由服务端 site.pageSize 下发，不在这里另立一份
      pageSize: 12,
      pageCount: 1,
      hasPrev: false,
      hasNext: false,
    },
  );
  useLayoutEffect(() => {
    configureBlogStatistics(data.publicSettings);
  }, [data.publicSettings]);
  const [loading, setLoading] = useState(!initial),
    [error, setError] = useState(""),
    [search, setSearch] = useState(false),
    [menu, setMenu] = useState(false);
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem("ink-blog-theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch {}
    return "light";
  });
  const location = useLocation(),
    seq = useRef(0);
  const [scrolled, setScrolled] = useState(false);
  // 「站点与应用」面板：默认收成一个图标。
  const [sitesOpen, setSitesOpen] = useState(false);
  // 鼠标从按钮移到面板时会有短暂间隙，留 150ms 防抖避免闪烁。
  const sitesCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearSitesCloseTimer = () => {
    if (sitesCloseTimer.current) {
      clearTimeout(sitesCloseTimer.current);
      sitesCloseTimer.current = null;
    }
  };
  const scheduleSitesClose = () => {
    clearSitesCloseTimer();
    sitesCloseTimer.current = setTimeout(() => setSitesOpen(false), 150);
  };
  const [randomBusy, setRandomBusy] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const root = scrollRoot.current;
    if (!root) return;
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setScrolled(root.scrollTop > 16);
      });
    };
    root.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      root.removeEventListener("scroll", update);
      cancelAnimationFrame(frame);
    };
  }, []);

  /** 面板与路由切换后自动收起，免得浮在内容上。 */
  useEffect(() => {
    setSitesOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!sitesOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".ink-header-left")) setSitesOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSitesOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [sitesOpen]);
  // 组件卸载时清理定时器。
  useEffect(() => {
    return () => clearSitesCloseTimer();
  }, []);

  /**
   * 主导航。
   *
   * 一级项都是读者自己会去的页面，直接点过去就行：
   * 专题本身就是一个页面，原来在它下面再挂一层「各个专题」的下拉，
   * 读者想看专题列表却先要点开一层才知道有哪些 —— 多一次点击，少一层信息。
   *
   * 「我的」是唯一的二级项：关于我、订阅、站点数据这三个入口讲的都是
   * 「我」而不是「内容」，收到一起，顶栏不会越挂越长。
   */
  const navItems: NavItem[] = [
    { label: "首页", to: blogRoute("/blog"), children: [] },
    { label: "动态", to: blogRoute("/blog/moments"), children: [] },
    { label: "专题", to: blogRoute("/blog/topics"), children: [] },
    { label: "友链", to: blogRoute("/blog/friends"), children: [] },
    {
      label: "我的",
      // 「我的」自己指向第一个子项：点它落到「关于我」，不会把人带到一个说不清的地方。
      to: blogRoute("/blog/about"),
      children: [
        { label: "关于我", to: blogRoute("/blog/about") },
        { label: "订阅", to: blogRoute("/blog/subscribe") },
        { label: "站点数据", to: blogRoute("/blog/stats") },
      ],
    },
  ];

  /**
   * 导航项是否点亮。
   *
   * 二级项在自己的任何一个子页面上都要亮（「我的」下面三个页面都属于它）；
   * 专题在具体某个专题页里也算在专题这一栏里。
   */
  const navPath = blogRoutePath(location.pathname);
  const navActive = (item: NavItem) => {
    if (item.children.length)
      return item.children.some((child) => navPath === child.to);
    if (item.label === "专题")
      return navPath === item.to || navPath.startsWith("/t/");
    return navPath === item.to;
  };

  /** 面板里的「其他站点」：作者资料里登记的链接，指向本站的除外。 */
  const profileLinks = (data.profile?.links ?? []).filter(
    (link) => !link.url.startsWith(window.location.origin),
  );

  /**
   * 品牌卡上的标：只用后台配的站点图标，没有就退回首字母色块。
   * 刻意不取作者头像 —— 顶栏是站点标识，不该摆一张人像。
   */
  const siteLogo = data.publicSettings?.iconUrl || "";

  /** 「随便看看」：随机跳一篇公开文章。 */
  const randomArticle = async () => {
    if (randomBusy) return;
    setRandomBusy(true);
    try {
      const hit = await api.blog.publicRandomArticle.query();
      if (hit?.publishId) navigate(blogRoute("/blog/" + hit.publishId));
    } catch {
      /* 抽不到就算了，不打扰读者 */
    } finally {
      setRandomBusy(false);
    }
  };

  // 顶部主题色：由文章页把封面主色采样结果交上来，导航栏和通栏顶部共用。
  const [coverTint, setCoverTint] = useState<CoverPalette | null>(null);
  const applyCoverTint = useCallback((palette: CoverPalette | null) => {
    setCoverTint(palette);
  }, []);
  const reload = useCallback(async () => {
    const request = ++seq.current;
    try {
      // 首页列表按 ?page= 分页；其它页面用第一页就够了。
      const search = new URLSearchParams(location.search);
      const isHome = blogRoutePath(location.pathname) === "/";
      const page = isHome ? Math.max(1, Number(search.get("page")) || 1) : 1;
      const value = await api.blog.publicIndex.query({ page });
      if (request === seq.current) {
        setData(value);
        setError("");
      }
    } catch {
      if (request === seq.current) {
        setData({
          profile: null,
          topics: [],
          posts: [],
          total: 0,
          nextCursor: null,
          siteName: "Ink",
          publicSettings: null as any,
          banner: [],
          featured: [],
          // 「最近更新」是纯时间序，和精选（featured）不是一回事
          recent: [],
          // 年份归档：公开文章分布在哪些年份
          years: [],
          page: 1,
          // 占位值：真实页长由服务端 site.pageSize 下发，不在这里另立一份
          pageSize: 12,
          pageCount: 1,
          hasPrev: false,
          hasNext: false,
        });
        setError("公开内容加载失败，请重试。");
      }
    } finally {
      if (request === seq.current) setLoading(false);
    }
  }, [location.pathname, location.search]);
  useEffect(() => {
    if (
      !bootstrapped.current ||
      initialKey.current !== location.pathname + location.search
    ) {
      bootstrapped.current = false;
      void reload();
    }
    setMenu(false);
    setSearch(false);
    scrollRoot.current?.scrollTo({ top: 0 });
  }, [location.pathname, location.search, reload]);
  useEffect(() => {
    const focus = () => {
      void reload();
    };
    addEventListener("focus", focus);
    return () => removeEventListener("focus", focus);
  }, [reload]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "k" &&
        !e.isComposing
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setSearch(true);
      }
      if (e.key === "Escape") setMenu(false);
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("ink-blog-theme", theme);
    } catch {}
  }, [theme]);
  return (
    <Context.Provider
      value={{
        ...data,
        loading,
        error,
        reload,
        scrollRoot,
        coverTint,
        setCoverTint: applyCoverTint,
      }}
    >
      <div
        ref={scrollRoot}
        className={"ink-blog" + (coverTint ? " has-cover-tint" : "")}
        data-theme={theme}
        style={
          coverTint
            ? ({
                overflowY: search ? "hidden" : "auto",
                "--ink-hero-bg": coverTint.light,
                "--ink-hero-deep": coverTint.lightDeep,
                "--ink-hero-bg-dark": coverTint.dark,
                "--ink-hero-deep-dark": coverTint.darkDeep,
                "--ink-hero-accent": coverTint.base,
              } as React.CSSProperties)
            : { overflowY: search ? "hidden" : "auto" }
        }
      >
        <header className="ink-header ink-wrap" data-scrolled={scrolled}>
          {/*
           * 最左侧：收束菜单 + 品牌卡。
           *
           * 两件事分开，各管一头：
           *   ⊞ 收束菜单 —— 点开「站点与应用」面板（作者的应用与站点清单）；
           *   品牌卡     —— 站点身份，logo 点击回首页。
           */}
          <div
            className="ink-header-left"
            onMouseEnter={clearSitesCloseTimer}
            onMouseLeave={scheduleSitesClose}
          >
            <button
              className="ink-icon-btn ink-sites-btn"
              aria-label="站点与应用"
              aria-expanded={sitesOpen}
              aria-haspopup="true"
              title="站点与应用"
              onClick={() => setSitesOpen((v) => !v)}
              onMouseEnter={() => {
                clearSitesCloseTimer();
                setSitesOpen(true);
              }}
            >
              <Icon
                icon={sitesOpen ? "tabler:x" : "tabler:layout-grid"}
                width={18}
              />
            </button>
            <div className="ink-brand-card">
              <Link
                className="ink-brand-logo"
                to={blogRoute("/blog")}
                aria-label="返回博客主页"
              >
                {siteLogo ? (
                  <img src={siteLogo} alt="" />
                ) : (
                  <span className="ink-brand-letter">
                    {(data.siteName || "Ink").trim().charAt(0).toUpperCase()}
                  </span>
                )}
                <Icon
                  icon="tabler:home"
                  width={20}
                  className="ink-brand-home"
                />
              </Link>
              {/*
                站名文字不再在这里出现 —— 圆形标识已经是「回首页」的入口，
                名字再摆一遍只是重复。站点名称本身仍然保留：
                SEO（og:site_name、标题）、页脚署名、分享图都用它，
                在后台「站点设置 › 站点信息」里维护。
              */}
            </div>
            {sitesOpen && (
              <div className="ink-sites-panel" role="dialog" aria-label="站点与应用">
                <section>
                  <h4>博客</h4>
                  <div className="ink-sites-grid">
                    <SitesEntry
                      to={blogRoute("/blog")}
                      icon="tabler:home"
                      label="首页"
                      note="当前站点"
                      onNavigate={() => setSitesOpen(false)}
                    />
                    <SitesEntry
                      to={blogRoute("/blog/topics")}
                      icon="tabler:layout-grid"
                      label="专题"
                      onNavigate={() => setSitesOpen(false)}
                    />
                    <SitesEntry
                      to={blogRoute("/blog?view=all")}
                      icon="tabler:notes"
                      label="全部文章"
                      onNavigate={() => setSitesOpen(false)}
                    />
                    <SitesEntry
                      to={blogRoute("/blog/about")}
                      icon="tabler:user-circle"
                      label="关于作者"
                      onNavigate={() => setSitesOpen(false)}
                    />
                    <SitesEntry
                      to={blogRoute("/blog/friends")}
                      icon="tabler:world"
                      label="友情链接"
                      onNavigate={() => setSitesOpen(false)}
                    />
                  </div>
                </section>
                {(data.profile?.homepage || profileLinks.length > 0) && (
                  <section>
                    <h4>站点与应用</h4>
                    <div className="ink-sites-grid">
                      {data.profile?.homepage && (
                        <SitesEntry
                          href={data.profile.homepage}
                          label="作者主页"
                          note={hostOf(data.profile.homepage)}
                          favicon={faviconOf(data.profile.homepage)}
                        />
                      )}
                      {profileLinks.map((link) => (
                        <SitesEntry
                          key={link.url}
                          href={link.url}
                          label={link.label}
                          favicon={faviconOf(link.url)}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
          <nav className="ink-desktop-nav" aria-label="博客主导航">
            {navItems.map((item) => (
              <div className="ink-nav-item" key={item.label}>
                <Link
                  to={item.to}
                  aria-current={navActive(item) ? "page" : undefined}
                >
                  {item.label}
                  {item.children.length > 0 && (
                    <Icon icon="tabler:chevron-down" width={14} />
                  )}
                </Link>
                {item.children.length > 0 && (
                  <div className="ink-nav-drop">
                    {item.children.map((child) => (
                      <Link key={child.to} to={child.to}>
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
          <div className="ink-actions">
            {/*
             * 「随便看看」：等轴测骰子。
             * 线框是常态，鼠标移上去换成实心 —— 两个图标叠在同一个位置，
             * 切换时不会撑动按钮的尺寸。
             */}
            <button
              className="ink-icon-btn ink-dice-btn"
              aria-label="随便看看一篇"
              title="随便看看一篇"
              disabled={randomBusy}
              onClick={() => void randomArticle()}
            >
              <Icon
                icon="sidekickicons:dice"
                width={21}
                className="ink-dice-line"
              />
              <Icon
                icon="sidekickicons:dice-solid"
                width={21}
                className="ink-dice-solid"
              />
            </button>
            <button
              className="ink-icon-btn"
              aria-label="搜索文章与专题"
              onClick={() => setSearch(true)}
            >
              <Icon icon="tabler:search" width={21} />
            </button>
            <button
              className="ink-icon-btn"
              aria-label={theme === "light" ? "切换暗色" : "切换亮色"}
              onClick={() =>
                setTheme((v) => (v === "light" ? "dark" : "light"))
              }
            >
              <Icon
                icon={theme === "light" ? "tabler:moon" : "tabler:sun"}
                width={21}
              />
            </button>
            <button
              className="ink-icon-btn ink-menu-btn"
              aria-label="导航菜单"
              aria-expanded={menu}
              onClick={() => setMenu((v) => !v)}
            >
              <Icon icon={menu ? "tabler:x" : "tabler:menu-2"} width={21} />
            </button>
            {/*
             * 滚动数值：常驻在操作药丸末尾。
             * 顶栏一直钉在顶部，这个位置就空着 —— 放个数字，
             * 读者随时知道读到哪儿了（整篇的百分比）。
             */}
            <ScrollMeter rootRef={scrollRoot} />
          </div>
          {menu && (
            <nav className="ink-menu-pop" aria-label="移动端博客导航">
              {navItems.map((item) =>
                item.children.length ? (
                  /* 二级项：组名单独一行，子项缩进一级 —— 和顶栏的层级对得上。 */
                  <div className="ink-menu-group" key={item.label}>
                    <span className="ink-menu-group-title">{item.label}</span>
                    {item.children.map((child) => (
                      <Link key={child.to} to={child.to}>
                        {child.label}
                        <Icon icon="tabler:chevron-right" width={17} />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <Link key={item.to} to={item.to}>
                    {item.label}
                    <Icon icon="tabler:chevron-right" width={17} />
                  </Link>
                ),
              )}
            </nav>
          )}
        </header>
        {error && (
          <div className="ink-wrap ink-error" role="alert">
            {error}
            <button onClick={() => void reload()}>重试</button>
          </div>
        )}
        <div className="ink-page">
          <BlogMetadata />
          <BlogTracking config={data.publicSettings} />
          <Outlet />
        </div>
        <Footer />
        {search && <SearchDialog close={() => setSearch(false)} />}
      </div>
    </Context.Provider>
  );
}
