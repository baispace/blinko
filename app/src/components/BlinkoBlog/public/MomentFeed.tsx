import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "@/lib/publicBlogClient";
import { blogDeviceId } from "@/lib/blogDevice";
import { blogRoute } from "@/lib/blogPublicBase";
import { Icon } from "@/components/Common/Iconify/icons";
import { PublicArticleBody } from "@/components/BlinkoBlog/PublicArticleBody";
import { MomentFeedbackModal } from "./MomentFeedbackModal";
import { type MomentFilter } from "@shared/lib/blogMoments";

/**
 * 把异常翻译成一句能看懂的话。
 *
 * 网络层面的失败（fetch 直接抛出）没有可读信息，
 * 直接把 "Failed to fetch" 抛给读者没有意义。
 */
function readableError(error: any, fallback: string) {
  const message = typeof error?.message === "string" ? error.message.trim() : "";
  if (!message) return fallback;
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message))
    return fallback;
  return message;
}

/**
 * 空列表的文案。
 *
 * 三种情况要分开说，不然读者会以为作者什么都没写：
 *   完全没有动态 / 有动态但这个月没有 / 有动态但这个筛选下没有。
 */
function emptyText(filter: MomentFilter, month: string) {
  const hasFilter = filter !== "all";
  const hasMonth = !!month;
  if (hasFilter && hasMonth)
    return "这个筛选和月份下还没有动态，换个条件看看。";
  if (hasFilter) return "这个筛选下还没有动态，换个筛选看看。";
  if (hasMonth) return "这个月还没有动态，换个月份看看，或者回到全部月份。";
  return "还没有公开动态，作者正在慢慢记录。";
}

/**
 * 公开动态流。
 *
 * 动态不是独立实体 —— 它就是「被公开的闪念」。
 * 所以这里渲染的是闪念的 markdown 正文（图片内联在里面），
 * 标签取自闪念的公开标签，没有单独的引文、单独的图片列表。
 *
 * 列表状态全在这一层：游标翻页、筛选变化重置、旧请求丢弃。
 * 父组件只负责把「筛选 + 月份」传下来。
 */

type Moment = Awaited<
  ReturnType<typeof api.blog.publicMoments.query>
>["moments"][number];

type Cursor = { publishedAt: string; id: number };

/** 相对时间：今天显示时刻，更早的显示日期。 */
function formatTime(iso: string, timeZone: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  const day = `${map.year}-${map.month}-${map.day}`;
  const clock = `${map.hour}:${map.minute}`;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (day === today) return `今天 ${clock}`;
  return `${map.year}.${map.month}.${map.day}`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

function MomentItem({
  moment,
  timeZone,
  deviceId,
  onResonance,
  onFeedback,
  onHint,
}: {
  moment: Moment;
  timeZone: string;
  deviceId: string | null;
  onResonance: (moment: Moment) => void;
  onFeedback: (moment: Moment) => void;
  onHint: (text: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // 是否真的超出了折叠高度：量渲染后的高度，不用字符数猜。
  // 正文是 markdown（有段落、有图），字符数判断不了「看起来长不长」。
  const [overflowing, setOverflowing] = useState(false);

  // 点到菜单外面就收起。
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // 折叠时量高度差：展开状态下高度已被放开，比出来的结果没有意义。
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => {
      if (expanded) return;
      setOverflowing(el.scrollHeight > el.clientHeight + 4);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, moment.content]);

  const collapsed = !expanded;
  const permalink = `${location.origin}${blogRoute("/blog/moments")}#m${moment.id}`;

  const share = async () => {
    const nav = navigator as Navigator & {
      share?: (data: { title?: string; url?: string }) => Promise<void>;
    };
    if (nav.share) {
      try {
        await nav.share({ title: "动态", url: permalink });
        return;
      } catch {
        // 用户取消或系统不支持分享 —— 退回复制链接。
      }
    }
    const ok = await copyText(permalink);
    onHint(ok ? "链接已复制。" : "复制失败，请手动复制地址栏。");
  };

  return (
    <article className="ink-moment" id={`m${moment.id}`}>
      <div className="ink-moment-head">
        <time className="ink-moment-time" dateTime={moment.publishedAt}>
          {formatTime(moment.publishedAt, timeZone)}
        </time>
        <div style={{ position: "relative" }} ref={menuRef}>
          <button
            type="button"
            className="ink-moment-more"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="更多操作"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <Icon icon="tabler:dots-vertical" width={18} />
          </button>
          {menuOpen && (
            <div className="ink-moment-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  setMenuOpen(false);
                  const ok = await copyText(permalink);
                  onHint(ok ? "链接已复制。" : "复制失败，请手动复制地址栏。");
                }}
              >
                <Icon icon="tabler:link" width={16} />
                复制链接
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={async () => {
                  setMenuOpen(false);
                  const ok = await copyText(moment.content);
                  onHint(ok ? "内容已复制。" : "复制失败。");
                }}
              >
                <Icon icon="tabler:copy" width={16} />
                复制正文
              </button>
            </div>
          )}
        </div>
      </div>

      {moment.content && (
        <div
          ref={bodyRef}
          className={"ink-moment-body" + (collapsed ? " is-collapsed" : "")}
        >
          <PublicArticleBody content={moment.content} />
        </div>
      )}

      {overflowing && (
        <button
          type="button"
          className="ink-moment-expand"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "收起" : "展开全文"}
          <Icon icon={expanded ? "tabler:chevron-up" : "tabler:chevron-down"} width={14} />
        </button>
      )}

      {moment.tags.length > 0 && (
        <div className="ink-moment-tags">
          {moment.tags.map((tag) => (
            <span className="ink-moment-tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="ink-moment-actions">
        <button
          type="button"
          className={
            "ink-moment-action" + (moment.resonated ? " is-on" : "")
          }
          onClick={() => onResonance(moment)}
          aria-pressed={moment.resonated}
          disabled={!deviceId}
          title={deviceId ? undefined : "当前浏览器不允许保存访问标识，暂时无法回应。"}
        >
          {/* 白名单里没有 heart-filled：选中态用 CSS 给同一个心形填色。 */}
          <Icon icon="tabler:heart" width={18} />
          共鸣
          <span className="ink-moment-action-count">{moment.resonance}</span>
        </button>
        <button
          type="button"
          className="ink-moment-action"
          onClick={() => onFeedback(moment)}
        >
          <Icon icon="tabler:message" width={18} />
          反馈作者
        </button>
        <button
          type="button"
          className="ink-moment-action is-pushed"
          onClick={() => void share()}
        >
          <Icon icon="tabler:share" width={18} />
          分享
        </button>
      </div>
    </article>
  );
}

export function MomentFeed({
  filter,
  month,
}: {
  filter: MomentFilter;
  month: string;
}) {
  const [items, setItems] = useState<Moment[]>([]);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [timeZone, setTimeZone] = useState("Asia/Shanghai");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [feedbackFor, setFeedbackFor] = useState<number | null>(null);
  const [mailEnabled, setMailEnabled] = useState(false);
  // 请求序号：只有最后一次请求的结果算数，切换筛选时旧请求的结果直接丢掉。
  const requestId = useRef(0);
  const deviceId = useRef<string | null>(null);

  useEffect(() => {
    deviceId.current = blogDeviceId();
    void api.blog.publicMailNotice
      .query()
      .then((v) => setMailEnabled(!!v.mailEnabled))
      .catch(() => setMailEnabled(false));
  }, []);

  const load = useCallback(
    async (reset: boolean, nextCursor?: Cursor) => {
      const id = ++requestId.current;
      setError("");
      if (reset) {
        setItems([]);
        setCursor(null);
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      try {
        const res = await api.blog.publicMoments.query({
          filter,
          month: month || undefined,
          cursor: nextCursor,
          deviceId: deviceId.current ?? undefined,
        });
        if (id !== requestId.current) return;
        setItems((prev) => (reset ? res.moments : [...prev, ...res.moments]));
        setCursor(res.nextCursor);
        setTimeZone(res.timezone);
      } catch (e: any) {
        if (id !== requestId.current) return;
        setError(readableError(e, "动态加载失败，请检查网络后重试。"));
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [filter, month],
  );

  // 筛选或月份一变就重置分页重新拉第一页。
  useEffect(() => {
    void load(true);
  }, [load]);

  const toggleResonance = async (moment: Moment) => {
    if (!deviceId.current) {
      setHint("当前浏览器不允许保存访问标识，暂时无法回应。");
      return;
    }
    const next = !moment.resonated;
    // 乐观更新，失败回滚。
    setItems((prev) =>
      prev.map((m) =>
        m.id === moment.id
          ? {
              ...m,
              resonated: next,
              resonance: Math.max(0, m.resonance + (next ? 1 : -1)),
            }
          : m,
      ),
    );
    try {
      const res = await api.blog.publicMomentResonanceSet.mutate({
        momentId: moment.id,
        deviceId: deviceId.current,
        resonated: next,
      });
      setItems((prev) =>
        prev.map((m) =>
          m.id === moment.id
            ? { ...m, resonated: res.resonated, resonance: res.resonance }
            : m,
        ),
      );
    } catch {
      setItems((prev) =>
        prev.map((m) =>
          m.id === moment.id
            ? {
                ...m,
                resonated: !next,
                resonance: Math.max(0, m.resonance + (next ? -1 : 1)),
              }
            : m,
        ),
      );
      setHint("回应没能保存，请再试一次。");
    }
  };

  if (loading)
    return (
      <div className="ink-moments-list">
        {[0, 1, 2].map((i) => (
          <div className="ink-moment-skeleton" key={i}>
            <span className="ink-moment-skeleton-line ink-moment-skeleton-time" />
            <span className="ink-moment-skeleton-line ink-moment-skeleton-text" />
            <span className="ink-moment-skeleton-line ink-moment-skeleton-text is-short" />
          </div>
        ))}
      </div>
    );

  if (error && !items.length)
    return (
      <div className="ink-moments-error" role="alert">
        <span>{error}</span>
        <button type="button" onClick={() => void load(true)}>
          重试
        </button>
      </div>
    );

  if (!items.length)
    return <p className="ink-moments-empty">{emptyText(filter, month)}</p>;

  return (
    <>
      {hint && (
        <p className="ink-moments-hint-banner" role="status">
          {hint}
        </p>
      )}
      <div className="ink-moments-list">
        {items.map((moment) => (
          <MomentItem
            key={moment.id}
            moment={moment}
            timeZone={timeZone}
            deviceId={deviceId.current}
            onResonance={(m) => void toggleResonance(m)}
            onFeedback={(m) => setFeedbackFor(m.id)}
            onHint={setHint}
          />
        ))}
      </div>

      {cursor ? (
        <button
          type="button"
          className="ink-moments-more"
          disabled={loadingMore}
          onClick={() => void load(false, cursor)}
        >
          {loadingMore ? "加载中…" : "加载更多"}
        </button>
      ) : (
        <p className="ink-moments-end">已经到底了，没有更多动态了。</p>
      )}

      {error && (
        <div className="ink-moments-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void load(false, cursor ?? undefined)}>
            重试
          </button>
        </div>
      )}

      {feedbackFor !== null && (
        <MomentFeedbackModal
          momentId={feedbackFor}
          open
          mailEnabled={mailEnabled}
          onClose={() => setFeedbackFor(null)}
        />
      )}
    </>
  );
}
