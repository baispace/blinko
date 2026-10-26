import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/publicBlogClient";
import { blogRoute } from "@/lib/blogPublicBase";
import { Icon } from "@/components/Common/Iconify/icons";
import { useBlogTitle } from "@/components/BlinkoBlog/public/BlogShell";
import {
  STATS_RANGES,
  STATS_RANGE_LABEL,
  STATS_REACTION_ICON,
  STATS_REACTION_LABEL,
  isStatsRange,
  type PublicStatsPage,
  type StatsRange,
} from "@shared/lib/blogStatsPage";
import "@/components/BlinkoBlog/public/stats.css";

/**
 * 公开博客的「站点数据」页。
 *
 * 这一页回答一个具体问题：这个站点最近有多少人读、读得最多的是什么。
 * 所以它分成两段口径，不能混：
 *   · 累计：公开文章、公开专题、最近 30 天更新、持续记录 —— 不随周期变化；
 *   · 区间：有效阅读、独立访客、文章回应、趋势、热门文章 —— 跟着周期切换。
 *
 * 三条实现上的硬要求：
 *   1. 周期写进 URL（?range=），刷新、前进、后退都能恢复；
 *   2. 快速切换时不串数据 —— 过期请求直接丢弃；
 *   3. 加载时不把数字清成 0 —— 旧值留在原地并变淡，布局不跳。
 *
 * 图表懒加载：它在首屏之下，不该拖着代码先进来。
 */
const StatsTrend = lazy(
  () => import("@/components/BlinkoBlog/public/StatsTrend"),
);

/**
 * 热门文章展示条数。
 *
 * 右侧「读者回应分布」只有三档，列表再长就压不住两个面板的高度 ——
 * 留 3 条刚好是一屏能读完的量。
 */
const HOT_LIMIT = 3;

/** 站点时区下的日期时间，例如 "2026.10.25 14:32"。 */
function formatTime(iso: string, timeZone: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .format(date)
      .replace(/\//g, ".");
  } catch {
    return iso;
  }
}

/** 站点时区下的日期，例如 "2026.10.25"。 */
function formatDate(iso: string, timeZone: string) {
  return formatTime(iso, timeZone).slice(0, 10);
}

function formatNumber(value: number) {
  return value.toLocaleString("zh-CN");
}

/**
 * 指标上的口径问号。
 *
 * 「这个数字怎么算」写在数字旁边最容易被找到：点一下问号展开一句话，
 * 不用先滚到页面底部找长说明。文字来自服务端下发的 notes —— 与实现同源，
 * 页面不自己编一套口径。
 */
function StatHelp({
  id,
  label,
  text,
}: {
  id: string;
  label: string;
  text?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <>
      <button
        type="button"
        className="ink-stats-help-btn"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`${label}的口径说明`}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon icon="tabler:help-circle" width={13} />
      </button>
      {open && (
        <p className="ink-stats-help-text" id={id}>
          {text}
        </p>
      )}
    </>
  );
}

/** 累计指标卡（内容积累）：图标 + 数字 + 说明 + 口径问号。 */
function StatCard({
  id,
  icon,
  value,
  unit,
  label,
  desc,
  tip,
}: {
  id: string;
  icon: string;
  value: string;
  unit: string;
  label: string;
  desc: string;
  tip?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ink-stats-card">
      <span className="ink-stats-card-icon" aria-hidden="true">
        <Icon icon={icon} width={17} />
      </span>
      <p className="ink-stats-figure">
        <b className="ink-stats-value">{value}</b>
        <span className="ink-stats-unit">{unit}</span>
      </p>
      <span className="ink-stats-label">
        {label}
        {tip && (
          <button
            type="button"
            className="ink-stats-help-btn"
            aria-expanded={open}
            aria-controls={id}
            aria-label={`${label}的口径说明`}
            onClick={() => setOpen((v) => !v)}
          >
            <Icon icon="tabler:help-circle" width={13} />
          </button>
        )}
      </span>
      <small className="ink-stats-desc">{desc}</small>
      {open && tip && (
        <p className="ink-stats-help-text" id={id}>
          {tip}
        </p>
      )}
    </div>
  );
}

/** 区间指标（阅读与回应）：数字 + 说明 + 口径问号。 */
function StatMetric({
  id,
  value,
  unit,
  label,
  desc,
  tip,
}: {
  id: string;
  value: string;
  unit: string;
  label: string;
  desc: string;
  tip?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ink-stats-metric">
      <p className="ink-stats-figure">
        <b className="ink-stats-value">{value}</b>
        <span className="ink-stats-unit">{unit}</span>
      </p>
      <span className="ink-stats-label">
        {label}
        {tip && (
          <button
            type="button"
            className="ink-stats-help-btn"
            aria-expanded={open}
            aria-controls={id}
            aria-label={`${label}的口径说明`}
            onClick={() => setOpen((v) => !v)}
          >
            <Icon icon="tabler:help-circle" width={13} />
          </button>
        )}
      </span>
      <small className="ink-stats-desc">{desc}</small>
      {open && tip && (
        <p className="ink-stats-help-text" id={id}>
          {tip}
        </p>
      )}
    </div>
  );
}

export default function BlogStatsPage() {
  useBlogTitle("站点数据");

  const [params, setParams] = useSearchParams();
  const rangeParam = params.get("range");
  const range: StatsRange = isStatsRange(rangeParam) ? rangeParam : "7d";

  const [data, setData] = useState<PublicStatsPage | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [pending, setPending] = useState(false);

  // 序号 + AbortController：快速切换周期时，过期响应直接丢掉，绝不串数据。
  const seq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback((target: StatsRange) => {
    const request = ++seq.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPending(true);
    api.blog.publicStats
      .query({ range: target }, { signal: controller.signal })
      .then((res) => {
        if (request !== seq.current) return;
        // 站长关掉「公开展示站点数据」时接口返回 null —— 整页不渲染。
        setData((res as PublicStatsPage | null) ?? null);
        setStatus("ready");
        setPending(false);
      })
      .catch(() => {
        if (request !== seq.current) return;
        if (controller.signal.aborted) return;
        setStatus("failed");
        setPending(false);
      });
  }, []);

  useEffect(() => {
    load(range);
    return () => abortRef.current?.abort();
  }, [range, load]);

  /** 切周期：写进 URL，前进后退能走回去。 */
  const applyRange = (next: StatsRange) => {
    const search = new URLSearchParams(params);
    if (next === "7d") search.delete("range");
    else search.set("range", next);
    setParams(search, { replace: false });
  };

  const timeZone = data?.timezone ?? "Asia/Shanghai";
  const trendCaption = useMemo(() => {
    if (!data) return "";
    return data.granularity === "month"
      ? "区间访客数按月份去重，不等于各月访客之和。"
      : "区间访客数按日期去重，不等于每日访客之和。";
  }, [data]);

  /**
   * 口径说明按标签取用。
   *
   * 说明文字来自服务端下发的 notes —— 与统计实现同源，
   * 页面只负责把它放到对应指标旁边，不自己另写一套口径。
   */
  const note = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of data?.notes ?? []) map[item.label] = item.text;
    return map;
  }, [data]);

  // 整页不可用：站长关掉了公开展示，或者接口没取到。
  if (status === "ready" && !data) {
    return (
      <main className="ink-stats">
        <div className="ink-stats-inner">
          <div className="ink-stats-off">
            <div>
              <p>站点暂未公开数据页</p>
              <small>站长的设置里没有开启公开展示站点数据。</small>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (status === "failed" && !data) {
    return (
      <main className="ink-stats">
        <div className="ink-stats-inner">
          <section className="ink-stats-hero">
            <h1 className="ink-stats-hero-title">每一次记录，都有迹可循。</h1>
            <p className="ink-stats-hero-desc">
              这里公开文章更新、阅读与互动的汇总数据。统计口径与更新时间一并展示，方便了解这个站点的近况。
            </p>
          </section>
          <p className="ink-stats-error" role="status">
            数据暂时取不到，请稍后再试。
            <button type="button" onClick={() => load(range)}>
              重新加载
            </button>
          </p>
        </div>
      </main>
    );
  }

  const content = data?.content;
  const reading = data?.reading;

  return (
    <main className="ink-stats">
      <div className="ink-stats-inner">
        {/* 1. 页面介绍与更新时间：元信息挂在标题右侧，不占正文宽度 */}
        <section className="ink-stats-hero">
          <div className="ink-stats-hero-head">
            <h1 className="ink-stats-hero-title">每一次记录，都有迹可循。</h1>
            <div className="ink-stats-hero-meta">
              <span>
                <Icon icon="tabler:clock" width={14} />
                数据更新于{" "}
                <b>{data ? formatTime(data.generatedAt, timeZone) : "—"}</b>
              </span>
              <span>
                <Icon icon="tabler:world" width={14} />
                站点时区 <b>{timeZone}</b>
              </span>
              {data?.stale && (
                <span className="ink-stats-stale">
                  <Icon icon="tabler:info-circle" width={13} />
                  展示的是 {data ? formatTime(data.generatedAt, timeZone) : ""} 的旧数据
                </span>
              )}
            </div>
          </div>
          <p className="ink-stats-hero-desc">
            这里公开文章更新、阅读与互动的汇总数据。
            统计口径与更新时间一并展示，方便了解这个站点的近况。
          </p>
        </section>

        {/* 刷新失败但手上还有上一次的结果：说明白，别让人把旧数字当成新的 */}
        {status === "failed" && data && (
          <p className="ink-stats-error" role="status">
            数据更新失败，下面显示的是上一次加载的结果。
            <button type="button" onClick={() => load(range)}>
              重新加载
            </button>
          </p>
        )}

        {/* 2. 内容积累（累计，不随周期变化） */}
        <section className="ink-stats-section">
          <div className="ink-stats-titlebar">
            <h2 className="ink-stats-title">内容积累</h2>
          </div>
          <p className="ink-stats-sub">只统计公开内容，私有笔记与撤回文章不在其中。</p>
          <div className="ink-stats-content-grid" aria-busy={status === "loading"}>
            {status === "loading" &&
              [0, 1, 2, 3].map((i) => (
                <div className="ink-stats-card" key={i} aria-hidden="true">
                  <span className="ink-stats-skeleton ink-stats-skeleton-value" />
                  <span className="ink-stats-skeleton ink-stats-skeleton-label" />
                </div>
              ))}
            {content && (
              <>
                <StatCard
                  id="tip-articles"
                  icon="tabler:file-text"
                  value={formatNumber(content.articles)}
                  unit="篇"
                  label="公开文章"
                  desc="当前可访问，按文章去重"
                  tip={note["内容"]}
                />
                <StatCard
                  id="tip-topics"
                  icon="tabler:tags"
                  value={formatNumber(content.topics)}
                  unit="个"
                  label="公开专题"
                  desc="排除草稿与未公开专题"
                  tip={note["内容"]}
                />
                <StatCard
                  id="tip-updated"
                  icon="tabler:refresh"
                  value={formatNumber(content.updatedIn30Days)}
                  unit="篇"
                  label="最近 30 天更新"
                  desc="同一篇多次更新只计一篇"
                  tip={note["内容"]}
                />
                <StatCard
                  id="tip-record"
                  icon="tabler:calendar-check"
                  value={formatNumber(content.recordValue)}
                  unit={content.recordUnit}
                  label="持续记录"
                  desc={`自首篇公开文章起${
                    content.recordSince
                      ? `（${formatDate(content.recordSince, timeZone)}）`
                      : ""
                  }`}
                  tip={note["时间"]}
                />
              </>
            )}
          </div>
          <p className="ink-stats-note">
            持续记录表示从最早一篇公开文章首次发布到今天的时间，不表示连续每天更新。
          </p>
        </section>

        {/* 3. 阅读与回应（随周期切换） */}
        <section className="ink-stats-section">
          <div className="ink-stats-titlebar">
            <h2 className="ink-stats-title">阅读与回应</h2>
          </div>
          <p className="ink-stats-sub">
            下面的数字与热门文章、回应分布都会跟着周期一起切换。
          </p>

          <div className="ink-stats-toolbar">
            <div className="ink-stats-ranges" role="group" aria-label="统计周期">
              {STATS_RANGES.map((key) => (
                <button
                  type="button"
                  key={key}
                  className="ink-stats-range"
                  aria-pressed={range === key}
                  onClick={() => applyRange(key)}
                >
                  {STATS_RANGE_LABEL[key]}
                </button>
              ))}
            </div>
            <div className="ink-stats-period">
              <span>
                <Icon icon="tabler:calendar" width={14} />
                {data ? `${data.period.from} – ${data.period.to}` : "—"}
              </span>
              {pending && <span className="ink-stats-pending">正在更新…</span>}
            </div>
          </div>

          {/* 指标与趋势图合成一张卡：数字和它的走势本来就是一件事 */}
          <div
            className={
              "ink-stats-reading-card ink-stats-range-block" +
              (pending ? " is-pending" : "")
            }
            aria-busy={pending || status === "loading"}
          >
            <div className="ink-stats-metrics">
              {status === "loading"
                ? [0, 1, 2].map((i) => (
                    <div className="ink-stats-metric" key={i} aria-hidden="true">
                      <span className="ink-stats-skeleton ink-stats-skeleton-value" />
                      <span className="ink-stats-skeleton ink-stats-skeleton-label" />
                    </div>
                  ))
                : reading && (
                    <>
                      <StatMetric
                        id="tip-views"
                        value={formatNumber(reading.views)}
                        unit="次"
                        label="有效阅读"
                        desc="同一浏览器 30 分钟内重复打开只计一次"
                        tip={note["阅读"]}
                      />
                      <StatMetric
                        id="tip-visitors"
                        value={formatNumber(reading.visitors)}
                        unit="位"
                        label="独立访客"
                        desc="区间内去重，不等于自然人人数"
                        tip={note["访客"]}
                      />
                      <StatMetric
                        id="tip-reactions"
                        value={formatNumber(reading.reactions)}
                        unit="次"
                        label="文章回应"
                        desc="有启发 · 很实用 · 有共鸣"
                        tip={note["回应"]}
                      />
                    </>
                  )}
            </div>

            <div className="ink-stats-chart">
              {data ? (
                <Suspense
                  fallback={
                    <div className="ink-stat-trend-empty" style={{ minHeight: 180 }}>
                      正在加载图表…
                    </div>
                  }
                >
                  <StatsTrend
                    points={data.trend.points}
                    granularity={data.trend.granularity}
                    caption={trendCaption}
                  />
                </Suspense>
              ) : (
                <div className="ink-stat-trend-empty" style={{ minHeight: 180 }}>
                  正在加载图表…
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 4. 热门文章与读者回应分布 */}
        <section
          className={
            "ink-stats-duo ink-stats-range-block" + (pending ? " is-pending" : "")
          }
        >
          <div className="ink-stats-panel">
            <h2 className="ink-stats-panel-title">这些文章正在被阅读</h2>
            <p className="ink-stats-panel-sub">
              {data ? `${data.rangeLabel}内有效阅读最多的公开文章` : "按所选周期排序"}
            </p>
            {data && data.hot.length === 0 && (
              <p className="ink-stats-empty">
                这个区间还没有阅读数据，这里不拿最新文章冒充热门文章。
              </p>
            )}
            {data && data.hot.length > 0 && (
              <div className="ink-stats-hot-list">
                {data.hot.slice(0, HOT_LIMIT).map((item) => (
                  <Link
                    className="ink-stats-hot-item"
                    key={item.publishId}
                    to={blogRoute(`/blog/${item.publishId}`)}
                  >
                    <span className="ink-stats-hot-cover">
                      {item.coverUrl ? (
                        <img src={item.coverUrl} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <Icon icon="tabler:file-text" width={18} />
                      )}
                    </span>
                    <span className="ink-stats-hot-body">
                      {item.topicName && (
                        <span className="ink-stats-hot-topic">{item.topicName}</span>
                      )}
                      <span className="ink-stats-hot-title">{item.title}</span>
                      <span className="ink-stats-hot-meta">
                        发布于 {formatDate(item.publishedAt, timeZone)}
                      </span>
                    </span>
                    <span className="ink-stats-hot-views">
                      <Icon icon="tabler:eye" width={14} />
                      {formatNumber(item.views)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
            <Link className="ink-stats-more" to={blogRoute("/blog")}>
              浏览全部文章
              <Icon icon="tabler:arrow-up-right" width={14} />
            </Link>
          </div>

          <div className="ink-stats-panel">
            <h2 className="ink-stats-panel-title">读者回应分布</h2>
            <p className="ink-stats-panel-sub">
              {data ? `${data.rangeLabel}内收到的公开回应` : "按所选周期统计"}
            </p>
            {data && data.reading.reactions === 0 && (
              <p className="ink-stats-empty">这个区间还没有读者回应。</p>
            )}
            {data && data.reading.reactions > 0 && (
              <div className="ink-stats-reactions">
                {data.reactions.map((item) => (
                  <div className="ink-stats-reaction" key={item.kind}>
                    <div className="ink-stats-reaction-head">
                      <span className="ink-stats-reaction-name">
                        <Icon
                          icon={STATS_REACTION_ICON[item.kind] ?? "tabler:heart"}
                          width={15}
                        />
                        {STATS_REACTION_LABEL[item.kind] ?? item.kind}
                      </span>
                      <span className="ink-stats-reaction-count">
                        {formatNumber(item.count)} 次 · {Math.round(item.percent * 100)}%
                      </span>
                    </div>
                    <div
                      className="ink-stats-reaction-bar"
                      role="img"
                      aria-label={`${STATS_REACTION_LABEL[item.kind] ?? item.kind} ${item.count} 次，占比 ${Math.round(item.percent * 100)}%`}
                    >
                      <div
                        className="ink-stats-reaction-fill"
                        style={{ width: `${Math.max(item.percent * 100, item.count > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="ink-stats-note">
              回应记录读者感受，不作为文章质量评分。
            </p>
          </div>
        </section>

        {/* 7. 最近更新 */}
        <section className="ink-stats-section">
          <div className="ink-stats-titlebar">
            <h2 className="ink-stats-title">最近更新</h2>
          </div>
          <p className="ink-stats-sub">只记录真正公开生效的发布与更新。</p>
          {data && data.recent.length === 0 && (
            <p className="ink-stats-empty">还没有公开的更新记录。</p>
          )}
          {data && data.recent.length > 0 && (
            <div className="ink-stats-recent">
              {data.recent.map((item) => (
                <Link
                  className="ink-stats-recent-item"
                  key={item.id}
                  to={blogRoute(item.href)}
                >
                  <span className="ink-stats-recent-date">
                    {formatDate(item.at, timeZone)}
                  </span>
                  <span className="ink-stats-recent-body">
                    <span className="ink-stats-recent-type">
                      <Icon
                        icon={item.type === "publish" ? "tabler:file-text" : "tabler:refresh"}
                        width={13}
                      />
                      {item.type === "publish" ? "新文章发布" : "文章更新发布"}
                    </span>
                    <span className="ink-stats-recent-title">{item.title}</span>
                    {item.summary && (
                      <span className="ink-stats-recent-summary">{item.summary}</span>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* 8. 页脚只留一句隐私口径：其余口径都在各指标旁的问号里 */}
        {data && note["隐私"] && (
          <p className="ink-stats-note">{note["隐私"]}</p>
        )}
      </div>
    </main>
  );
}
