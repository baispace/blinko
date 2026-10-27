import { BlogButton, BlogChipGroup, BlogInput, BlogTabs } from "./BlogUI";
import { BlogStatsBreakdowns } from "./BlogStatsBreakdowns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/trpc";
import { Icon } from "@/components/Common/Iconify/icons";
import { BlogTrendChart } from "./BlogTrendChart";
import "./stats.css";

type Analytics = Awaited<ReturnType<typeof api.blog.analytics.query>>;
type ArticleRow = Analytics["articles"]["rows"][number];
type RangePreset = "today" | "7d" | "30d" | "custom";
/** 与服务端 analytics 路由同形状的范围入参。 */
type RangeInput = {
  preset?: "today" | "7d" | "30d";
  from?: string;
  to?: string;
};

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: "today", label: "今天" },
  { id: "7d", label: "近7天" },
  { id: "30d", label: "近30天" },
  { id: "custom", label: "自定义" },
];

const SORT_OPTIONS = [
  { id: "impressions", label: "曝光" },
  { id: "clicks", label: "点击" },
  { id: "ctr", label: "点击率" },
  { id: "views", label: "阅读" },
  { id: "visitors", label: "访客" },
] as const;

const PAGE_SIZE = 10;

function formatNumber(value: number) {
  return value.toLocaleString("zh-CN");
}

function formatPercent(value: number | null) {
  // 曝光为 0 时不编造百分比，直接显示「—」。
  if (value === null || !Number.isFinite(value)) return "—";
  return (value * 100).toFixed(1) + "%";
}

function metricHint(range: string) {
  return range;
}

export function BlogStatsPanel() {
  const [params, setParams] = useSearchParams();
  const tab = ["core", "users", "content"].includes(
    params.get("statsTab") || "",
  )
    ? params.get("statsTab")!
    : "core";

  /**
   * 筛选条件全部放在 URL 里：刷新、后退、从文章下钻返回都能恢复。
   * 顶部指标、趋势、来源、文章表共用同一个 range —— 不会出现「顶部近7天、
   * 下面却是累计」。
   */
  const preset = (params.get("range") as RangePreset | null) ?? "7d";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const sort = params.get("sort") ?? "views";
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const noteId = params.get("note") ? Number(params.get("note")) : null;
  /** 手动刷新用的令牌：URL 其余参数没变时，靠它触发一次新的取数。 */
  const refresh = Number(params.get("refresh") || 0);

  const patch = useCallback(
    (next: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const merged = new URLSearchParams(prev);
          Object.entries(next).forEach(([key, value]) => {
            if (value === null || value === "") merged.delete(key);
            else merged.set(key, value);
          });
          return merged;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchDraft, setSearchDraft] = useState(q);
  const [customOpen, setCustomOpen] = useState(preset === "custom");
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);
  /**
   * 请求序号：快速切换范围时，旧请求回来不能覆盖新结果。
   */
  const seq = useRef(0);

  useEffect(() => setSearchDraft(q), [q]);
  useEffect(() => {
    setCustomOpen(preset === "custom");
    if (from) setCustomFrom(from);
    if (to) setCustomTo(to);
  }, [preset, from, to]);

  const rangeInput = useMemo<RangeInput>(
    () => (preset === "custom" ? { from, to } : { preset }),
    [preset, from, to],
  );

  const sortKey = useMemo(
    () =>
      SORT_OPTIONS.some((o) => o.id === sort)
        ? (sort as (typeof SORT_OPTIONS)[number]["id"])
        : "views",
    [sort],
  );

  const requestKey = JSON.stringify({ rangeInput, sortKey, q, page, refresh });
  useEffect(() => {
    const id = ++seq.current;
    setLoading(true);
    api.blog.analytics
      .query({
        ...rangeInput,
        sort: sortKey,
        q,
        page,
        pageSize: PAGE_SIZE,
      })
      .then((result) => {
        if (id !== seq.current) return;
        setData(result);
        setError("");
      })
      .catch((e: any) => {
        if (id !== seq.current) return;
        setError(e?.message || "统计数据加载失败，请稍后重试。");
      })
      .finally(() => {
        if (id === seq.current) setLoading(false);
      });
    // requestKey 覆盖了全部入参，避免逐字段列依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  // 搜索输入防抖：只写 URL，不在每次按键时打接口。
  useEffect(() => {
    if (searchDraft === q) return;
    const timer = setTimeout(() => {
      patch({ q: searchDraft || null, page: null });
    }, 350);
    return () => clearTimeout(timer);
  }, [searchDraft, q, patch]);

  const metrics = data?.metrics;
  const rangeLabel = data
    ? data.range.from === data.range.to
      ? data.range.from
      : `${data.range.from} ~ ${data.range.to}`
    : "";

  const switchPreset = (next: RangePreset) => {
    if (next === "custom") {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    patch({ range: next, from: null, to: null, page: null, note: null });
  };

  const applyCustom = () => {
    if (!customFrom || !customTo) return;
    patch({
      range: "custom",
      from: customFrom,
      to: customTo,
      page: null,
      note: null,
    });
  };

  const toggleSort = (key: string) => {
    patch({ sort: key, page: null });
  };

  const total = data?.articles.total ?? 0;
  const pageCount = data?.articles.pageCount ?? 1;

  return (
    <div className="ink-stats">
      <BlogTabs
        label="数据分析维度"
        value={tab}
        onChange={key => patch({ statsTab: key, note: null })}
        items={[
          { key: "core", label: "核心数据", description: "站点表现与流量来源" },
          { key: "users", label: "用户分析", description: "访客构成与阅读深度" },
          { key: "content", label: "内容分析", description: "专题与文章表现" },
        ]}
      />
      {/* ---------- 时间筛选 ---------- */}
      <div className="ink-stats-toolbar">
        <BlogChipGroup
          label="统计时间范围"
          value={preset}
          onChange={key => switchPreset(key as RangePreset)}
          items={PRESETS.map((p) => ({ key: p.id, label: p.label }))}
        />
          {customOpen && (
            <div className="ink-stats-custom">
              <BlogInput
                type="date"
                className="ink-mg-field"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
                aria-label="开始日期"
              />
              <span className="ink-mg-sub">至</span>
              <BlogInput
                type="date"
                className="ink-mg-field"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                aria-label="结束日期"
              />
              <BlogButton
                className="ink-mg-button ink-mg-button-primary"
                onClick={applyCustom}
                disabled={!customFrom || !customTo}
              >
                应用
              </BlogButton>
            </div>
          )}
        <div className="ink-stats-toolbar-meta">
          <span className="ink-mg-sub">
            {loading ? "正在加载…" : `统计区间 ${rangeLabel}（Asia/Shanghai）`}
          </span>
          <BlogButton
            className="ink-mg-button"
            onClick={() => patch({ refresh: String(refresh + 1) })}
            disabled={loading}
          >
            <Icon icon="tabler:refresh" width={15} />
            刷新
          </BlogButton>
        </div>
      </div>

      {error && (
        <div className="ink-mg-alert" role="alert">
          {error}
          <BlogButton
            className="ink-mg-button"
            onClick={() => patch({ refresh: String(refresh + 1) })}
          >
            重试
          </BlogButton>
        </div>
      )}

      <div
        id="stats-tab-panel"
        role="tabpanel"
        aria-labelledby={"stats-tab-" + tab}
      >
        {tab === "core" && (
          <>
            {/* ---------- 顶部指标 ---------- */}
            <div className="ink-stats-metrics">
              <MetricCard
                icon="tabler:eye"
                label="阅读次数"
                value={metrics ? formatNumber(metrics.views) : "—"}
                hint="公开文章详情页的有效阅读事件，同一浏览器 30 分钟内重复阅读只记一次"
              />
              <MetricCard
                icon="tabler:users"
                label="访客数"
                value={metrics ? formatNumber(metrics.visitors) : "—"}
                hint="所选范围内跨文章去重的匿名浏览器数，不等于真实自然人数"
              />
              <MetricCard
                icon="tabler:list-check"
                label="列表曝光"
                value={metrics ? formatNumber(metrics.impressions) : "—"}
                hint="文章在公开列表中实际进入可视区域才计数"
              />
              <MetricCard
                icon="tabler:arrows-sort"
                label="文章点击率"
                value={metrics ? formatPercent(metrics.ctr) : "—"}
                hint="列表点击 ÷ 列表曝光；外链直接进入文章只有阅读，不产生列表点击"
              />
            </div>

            {metrics && (
              <p className="ink-mg-sub">
                全部区块使用同一区间 {rangeLabel}（{data?.range.timezone}
                ），按当前图表粒度聚合； 没有事件的日期按 0 计入。曝光为 0
                时点击率显示「—」，不做强行百分比。
              </p>
            )}

            {/* ---------- 趋势 + 来源 ---------- */}
            <div className="ink-stats-split">
              <section className="ink-mg-panel ink-stats-card">
                <div className="ink-mg-section-head">
                  <h2 className="ink-mg-section-title">访问趋势</h2>
                  <span className="ink-mg-sub">
                    {data?.range.granularity === "day"
                      ? "按天"
                      : data?.range.granularity === "week"
                        ? "按周"
                        : "按月"}
                  </span>
                </div>
                {loading && !data ? (
                  <p className="ink-mg-sub" role="status">
                    正在加载趋势…
                  </p>
                ) : data?.trend.length ? (
                  <BlogTrendChart
                    data={data.trend}
                    granularity={data.range.granularity}
                  />
                ) : (
                  <p className="ink-mg-sub">所选区间还没有阅读数据。</p>
                )}
              </section>

              <section className="ink-mg-panel ink-stats-card">
                <div className="ink-mg-section-head">
                  <h2 className="ink-mg-section-title">来源分布</h2>
                  <span className="ink-mg-sub">按阅读次数</span>
                </div>
                {data?.sources.length ? (
                  <ul className="ink-stats-sources">
                    {data.sources.map((s) => (
                      <li key={s.source}>
                        <div className="ink-stats-source-row">
                          <span className="ink-stats-source-name">
                            {s.label}
                          </span>
                          <span className="ink-stats-source-value">
                            {formatPercent(s.share)}
                          </span>
                        </div>
                        <div className="ink-stats-source-bar">
                          <span
                            style={{
                              width: Math.max(2, s.share * 100) + "%",
                            }}
                          />
                        </div>
                        <span className="ink-mg-sub">
                          {formatNumber(s.views)} 次阅读 ·{" "}
                          {formatNumber(s.visitors)} 位访客
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="ink-mg-sub">所选区间还没有来源数据。</p>
                )}
                <p className="ink-mg-sub">
                  站内跳转包含首页推荐、专题与站内搜索之间的互相跳转；浏览器未提供来源信息的访问记为未知，不猜测。
                </p>
              </section>
            </div>
          </>
        )}
        {(tab === "users" || tab === "content") && (
          <BlogStatsBreakdowns
            key={tab}
            view={tab}
            range={rangeInput}
            refresh={refresh}
          />
        )}
        {tab === "content" && (
          <>
            {/* ---------- 文章表现 ---------- */}
            <section className="ink-mg-panel ink-stats-card">
              <div className="ink-mg-section-head">
                <div>
                  <h2 className="ink-mg-section-title">文章表现</h2>
                  <p className="ink-mg-sub">
                    按当前区间统计，共 {formatNumber(total)} 篇有数据。
                  </p>
                </div>
                <div className="ink-stats-search">
                  <Icon icon="tabler:search" width={15} />
                  <BlogInput
                    className="ink-mg-field"
                    value={searchDraft}
                    placeholder="搜索文章标题"
                    aria-label="搜索文章"
                    onChange={(e) => setSearchDraft(e.target.value)}
                  />
                </div>
              </div>

              {loading && !data ? (
                <p className="ink-mg-sub" role="status">
                  正在加载文章表现…
                </p>
              ) : data?.articles.rows.length ? (
                <>
                  <div className="ink-stats-tablewrap">
                    <table className="ink-stats-table">
                      <thead>
                        <tr>
                          <th className="ink-stats-title-col">文章</th>
                          {SORT_OPTIONS.map((s) => (
                            <th key={s.id}>
                              <BlogButton
                                className="ink-stats-sort"
                                aria-pressed={sort === s.id}
                                onClick={() => toggleSort(s.id)}
                              >
                                {s.label}
                                {sort === s.id && (
                                  <Icon icon="tabler:chevron-down" width={13} />
                                )}
                              </BlogButton>
                            </th>
                          ))}
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.articles.rows.map((row) => (
                          <ArticleTableRow
                            key={row.noteId}
                            row={row}
                            onOpen={() => patch({ note: String(row.noteId) })}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="ink-stats-pager">
                    <span className="ink-mg-sub">
                      第 {data.articles.page} / {pageCount} 页
                    </span>
                    <div
                      className="ink-mg-row-actions"
                      style={{ marginLeft: 0 }}
                    >
                      <BlogButton
                        className="ink-mg-button"
                        disabled={page <= 1}
                        onClick={() => patch({ page: String(page - 1) })}
                      >
                        <Icon icon="tabler:chevron-left" width={15} />
                        上一页
                      </BlogButton>
                      <BlogButton
                        className="ink-mg-button"
                        disabled={page >= pageCount}
                        onClick={() => patch({ page: String(page + 1) })}
                      >
                        下一页
                        <Icon icon="tabler:chevron-right" width={15} />
                      </BlogButton>
                    </div>
                  </div>
                </>
              ) : (
                <p className="ink-mg-sub">
                  {q
                    ? "没有匹配的文章，换个关键词试试。"
                    : "所选区间还没有文章数据。"}
                </p>
              )}
            </section>

            {noteId && (
              <ArticleDrawer
                noteId={noteId}
                rangeInput={rangeInput}
                onClose={() => patch({ note: null })}
              />
            )}
          </>
        )}
        {tab === "core" && (
          <>
            {/* ---------- 第三方报表 ---------- */}
            <section className="ink-mg-panel ink-stats-card">
              <h2 className="ink-mg-section-title">第三方报表</h2>
              <p className="ink-mg-sub">
                第三方数据独立查看，未授权报表 API 时不与站内数据混合。
              </p>
              <div className="ink-stats-thirdparty">
                <BlogButton
                  as="a"
                  className="ink-mg-button"
                  href="https://analytics.google.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google Analytics 报表{" "}
                  <Icon icon="tabler:external-link" width={14} />
                </BlogButton>
                <BlogButton
                  as="a"
                  className="ink-mg-button"
                  href="https://tongji.baidu.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  百度统计报表 <Icon icon="tabler:external-link" width={14} />
                </BlogButton>
              </div>
              <p className="ink-mg-sub">
                三方结果与站内数据不同通常来自去重窗口、浏览器拦截、时区与平台规则；
                站内口径与第三方口径不合并计算。
              </p>
            </section>
          </>
        )}
      </div>
      <details className="ink-stats-notes">
        <summary>统计口径说明</summary>
        <ul>
          <li>
            阅读次数：公开文章详情页的有效阅读事件。同一浏览器 30
            分钟内重复打开只记一次（刷新不重复计数）。
          </li>
          <li>
            访客数：所选范围内跨文章去重的匿名浏览器数。设备标识由访客浏览器本地生成，
            统计服务不保存 IP、UA
            或指纹；它不等于真实自然人数，也无法跨设备识别同一个人。
          </li>
          <li>
            列表曝光：文章在公开列表中实际进入可视区域才记录，接口返回不等于曝光。
          </li>
          <li>
            文章点击率：列表点击 ÷
            列表曝光。通过站外链接直接进入文章只产生阅读， 不产生站内列表点击。
          </li>
          <li>
            时间边界：统一按 Asia/Shanghai 展示，区间为「起始日
            00:00」到「结束日次日
            00:00」的左闭右开区间，自定义结束日期包含当天。
          </li>
          <li>
            来源归因：外部来源与站内入口分开记录，同站跳转不误判为新的外部来源；
            浏览器未提供来源信息的访问记为未知，不生成推测分布。
          </li>
          <li>
            访客可在浏览器把 localStorage 的 <code>ink-blog-statistics</code>{" "}
            设为 <code>off</code> 停止上报。
          </li>
        </ul>
      </details>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="ink-stats-metric">
      <div className="ink-stats-metric-head">
        <Icon icon={icon} width={16} />
        <span>{label}</span>
      </div>
      <div className="ink-stats-metric-value">{value}</div>
      <div className="ink-stats-metric-hint">{hint}</div>
    </div>
  );
}

function ArticleTableRow({
  row,
  onOpen,
}: {
  row: ArticleRow;
  onOpen: () => void;
}) {
  return (
    <tr>
      <td className="ink-stats-title-col">
        <BlogButton className="ink-stats-link" onClick={onOpen} title={row.title}>
          {row.title}
        </BlogButton>
        {!row.hasPublication && (
          <span className="ink-stats-tag">已撤回 / 未公开</span>
        )}
      </td>
      <td className="ink-stats-num">{formatNumber(row.impressions)}</td>
      <td className="ink-stats-num">{formatNumber(row.clicks)}</td>
      <td className="ink-stats-num">{formatPercent(row.ctr)}</td>
      <td className="ink-stats-num">{formatNumber(row.views)}</td>
      <td className="ink-stats-num">{formatNumber(row.visitors)}</td>
      <td>
        <BlogButton className="ink-stats-link" onClick={onOpen}>
          查看详情 <Icon icon="tabler:arrow-right" width={13} />
        </BlogButton>
      </td>
    </tr>
  );
}

/** 单篇文章下钻：区间内的指标与趋势。 */
function ArticleDrawer({
  noteId,
  rangeInput,
  onClose,
}: {
  noteId: number;
  rangeInput: RangeInput;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Awaited<
    ReturnType<typeof api.blog.analyticsArticle.query>
  > | null>(null);
  const [error, setError] = useState("");
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    setDetail(null);
    setError("");
    api.blog.analyticsArticle
      .query({ noteId, ...rangeInput })
      .then((r) => {
        if (id !== seq.current) return;
        setDetail(r);
      })
      .catch((e: any) => {
        if (id !== seq.current) return;
        setError(e?.message || "加载失败");
      });
  }, [noteId, JSON.stringify(rangeInput)]);

  return (
    <div className="ink-stats-drawer" role="dialog" aria-label="文章指标详情">
      <div className="ink-stats-drawer-head">
        <h3>{detail?.title ?? "加载中…"}</h3>
        <BlogButton className="ink-mg-button" onClick={onClose}>
          <Icon icon="tabler:x" width={15} />
          关闭
        </BlogButton>
      </div>
      {error && <p className="ink-mg-alert">{error}</p>}
      {detail && (
        <>
          <div className="ink-stats-drawer-metrics">
            <span>曝光 {formatNumber(detail.metrics.impressions)}</span>
            <span>点击 {formatNumber(detail.metrics.clicks)}</span>
            <span>点击率 {formatPercent(detail.metrics.ctr)}</span>
            <span>阅读 {formatNumber(detail.metrics.views)}</span>
            <span>访客 {formatNumber(detail.metrics.visitors)}</span>
          </div>
          {detail.trend.length ? (
            <BlogTrendChart
              data={detail.trend}
              granularity={detail.range.granularity}
              height={200}
            />
          ) : (
            <p className="ink-mg-sub">该区间没有数据。</p>
          )}
          {detail.publishId && (
            <a
              className="ink-mg-button"
              href={`/blog/${detail.publishId}`}
              target="_blank"
              rel="noreferrer"
            >
              查看公开文章 <Icon icon="tabler:external-link" width={14} />
            </a>
          )}
        </>
      )}
    </div>
  );
}
