import { BlogChipGroup, BlogInput, BlogTabs } from "./BlogUI";
import { Button, Card, CardBody, CardHeader } from "@heroui/react";
import { BlogStatsBreakdowns } from "./BlogStatsBreakdowns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/trpc";
import { Icon } from "@/components/Common/Iconify/icons";
import { BlogTrendChart } from "./BlogTrendChart";

type Analytics = Awaited<ReturnType<typeof api.blog.analytics.query>>;
type ArticleRow = Analytics["articles"]["rows"][number];
type RangePreset = "today" | "7d" | "30d" | "custom";
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
  if (value === null || !Number.isFinite(value)) return "—";
  return (value * 100).toFixed(1) + "%";
}

export function BlogStatsPanel() {
  const [params, setParams] = useSearchParams();
  const tab = ["core", "users", "content"].includes(
    params.get("statsTab") || "",
  )
    ? params.get("statsTab")!
    : "core";

  const preset = (params.get("range") as RangePreset | null) ?? "7d";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const sort = params.get("sort") ?? "views";
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const noteId = params.get("note") ? Number(params.get("note")) : null;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

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
    <div className="space-y-5">
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
      <div className="flex flex-wrap items-center gap-3">
        <BlogChipGroup
          label="统计时间范围"
          value={preset}
          onChange={key => switchPreset(key as RangePreset)}
          items={PRESETS.map((p) => ({ key: p.id, label: p.label }))}
        />
        {customOpen && (
          <div className="flex items-center gap-2">
            <BlogInput
              type="date"
              className="w-full"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => setCustomFrom(e.target.value)}
              aria-label="开始日期"
            />
            <span className="text-xs text-default-500">至</span>
            <BlogInput
              type="date"
              className="w-full"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => setCustomTo(e.target.value)}
              aria-label="结束日期"
            />
            <Button
              size="sm"
              color="primary"
              isDisabled={!customFrom || !customTo}
              onPress={applyCustom}
            >
              应用
            </Button>
          </div>
        )}
        <span className="flex-1" />
        <span className="text-xs text-default-500">
          {loading ? "正在加载…" : `统计区间 ${rangeLabel}（Asia/Shanghai）`}
        </span>
        <Button
          size="sm"
          variant="flat"
          isDisabled={loading}
          startContent={<Icon icon="tabler:refresh" width={15} />}
          onPress={() => patch({ refresh: String(refresh + 1) })}
        >
          刷新
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger" role="alert">
          <span className="flex-1">{error}</span>
          <Button
            size="sm"
            variant="flat"
            color="danger"
            onPress={() => patch({ refresh: String(refresh + 1) })}
          >
            重试
          </Button>
        </div>
      )}

      <div
        id="stats-tab-panel"
        role="tabpanel"
        aria-labelledby={"stats-tab-" + tab}
      >
        {tab === "core" && (
          <div className="space-y-5">
            {/* ---------- 顶部指标 ---------- */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              <p className="text-xs text-default-500">
                全部区块使用同一区间 {rangeLabel}（{data?.range.timezone}
                ），按当前图表粒度聚合； 没有事件的日期按 0 计入。曝光为 0
                时点击率显示「—」，不做强行百分比。
              </p>
            )}

            {/* ---------- 趋势 + 来源 ---------- */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card className="rounded-xl border border-default-200 shadow-none">
                <CardHeader className="flex items-center justify-between gap-3 pb-1">
                  <h2 className="text-base font-semibold">访问趋势</h2>
                  <span className="text-xs text-default-500">
                    {data?.range.granularity === "day"
                      ? "按天"
                      : data?.range.granularity === "week"
                        ? "按周"
                        : "按月"}
                  </span>
                </CardHeader>
                <CardBody className="pt-2">
                  {loading && !data ? (
                    <p className="text-sm text-default-500" role="status">
                      正在加载趋势…
                    </p>
                  ) : data?.trend.length ? (
                    <BlogTrendChart
                      data={data.trend}
                      granularity={data.range.granularity}
                    />
                  ) : (
                    <p className="text-sm text-default-500">所选区间还没有阅读数据。</p>
                  )}
                </CardBody>
              </Card>

              <Card className="rounded-xl border border-default-200 shadow-none">
                <CardHeader className="flex items-center justify-between gap-3 pb-1">
                  <h2 className="text-base font-semibold">来源分布</h2>
                  <span className="text-xs text-default-500">按阅读次数</span>
                </CardHeader>
                <CardBody className="space-y-3 pt-2">
                  {data?.sources.length ? (
                    <ul className="space-y-3">
                      {data.sources.map((s) => (
                        <li key={s.source}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{s.label}</span>
                            <span className="text-default-500">
                              {formatPercent(s.share)}
                            </span>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-default-100">
                            <span
                              className="block h-full rounded-full bg-primary transition-all"
                              style={{
                                width: Math.max(2, s.share * 100) + "%",
                              }}
                            />
                          </div>
                          <span className="mt-1 block text-xs text-default-500">
                            {formatNumber(s.views)} 次阅读 ·{" "}
                            {formatNumber(s.visitors)} 位访客
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-default-500">所选区间还没有来源数据。</p>
                  )}
                  <p className="text-xs text-default-500">
                    站内跳转包含首页推荐、专题与站内搜索之间的互相跳转；浏览器未提供来源信息的访问记为未知，不猜测。
                  </p>
                </CardBody>
              </Card>
            </div>

            {/* ---------- 第三方报表 ---------- */}
            <Card className="rounded-xl border border-default-200 shadow-none">
              <CardBody className="space-y-3">
                <h2 className="text-base font-semibold">第三方报表</h2>
                <p className="text-sm text-default-500">
                  第三方数据独立查看，未授权报表 API 时不与站内数据混合。
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="flat"
                    as="a"
                    href="https://analytics.google.com/"
                    target="_blank"
                    rel="noreferrer"
                    endContent={<Icon icon="tabler:external-link" width={14} />}
                  >
                    Google Analytics 报表
                  </Button>
                  <Button
                    size="sm"
                    variant="flat"
                    as="a"
                    href="https://tongji.baidu.com/"
                    target="_blank"
                    rel="noreferrer"
                    endContent={<Icon icon="tabler:external-link" width={14} />}
                  >
                    百度统计报表
                  </Button>
                </div>
                <p className="text-xs text-default-500">
                  三方结果与站内数据不同通常来自去重窗口、浏览器拦截、时区与平台规则；
                  站内口径与第三方口径不合并计算。
                </p>
              </CardBody>
            </Card>
          </div>
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
          <div className="space-y-5">
            {/* ---------- 文章表现 ---------- */}
            <Card className="rounded-xl border border-default-200 shadow-none">
              <CardHeader className="flex flex-wrap items-center justify-between gap-3 pb-1">
                <div>
                  <h2 className="text-base font-semibold">文章表现</h2>
                  <p className="text-xs text-default-500">
                    按当前区间统计，共 {formatNumber(total)} 篇有数据。
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Icon icon="tabler:search" width={15} className="text-default-400" />
                  <BlogInput
                    className="w-full"
                    value={searchDraft}
                    placeholder="搜索文章标题"
                    aria-label="搜索文章"
                    onChange={(e) => setSearchDraft(e.target.value)}
                  />
                </div>
              </CardHeader>
              <CardBody className="pt-2">
                {loading && !data ? (
                  <p className="text-sm text-default-500" role="status">
                    正在加载文章表现…
                  </p>
                ) : data?.articles.rows.length ? (
                  <div className="space-y-3">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-default-200 text-left text-xs font-semibold text-default-500">
                            <th className="pb-2 pr-4">文章</th>
                            {SORT_OPTIONS.map((s) => (
                              <th key={s.id} className="pb-2 pr-3 text-right">
                                <button
                                  type="button"
                                  className={`inline-flex items-center gap-0.5 transition-colors ${
                                    sort === s.id
                                      ? "text-primary"
                                      : "text-default-500 hover:text-foreground"
                                  }`}
                                  onClick={() => toggleSort(s.id)}
                                >
                                  {s.label}
                                  {sort === s.id && (
                                    <Icon icon="tabler:chevron-down" width={13} />
                                  )}
                                </button>
                              </th>
                            ))}
                            <th className="pb-2 pl-3 text-right">操作</th>
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
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-default-500">
                        第 {data.articles.page} / {pageCount} 页
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="flat"
                          isDisabled={page <= 1}
                          startContent={<Icon icon="tabler:chevron-left" width={15} />}
                          onPress={() => patch({ page: String(page - 1) })}
                        >
                          上一页
                        </Button>
                        <Button
                          size="sm"
                          variant="flat"
                          isDisabled={page >= pageCount}
                          endContent={<Icon icon="tabler:chevron-right" width={15} />}
                          onPress={() => patch({ page: String(page + 1) })}
                        >
                          下一页
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-default-500">
                    {q
                      ? "没有匹配的文章，换个关键词试试。"
                      : "所选区间还没有文章数据。"}
                  </p>
                )}
              </CardBody>
            </Card>

            {noteId && (
              <ArticleDrawer
                noteId={noteId}
                rangeInput={rangeInput}
                onClose={() => patch({ note: null })}
              />
            )}
          </div>
        )}
      </div>

      <details className="group rounded-xl border border-default-200 bg-surface">
        <summary className="flex cursor-pointer items-center justify-between px-5 py-3 text-sm font-medium select-none">
          统计口径说明
          <Icon
            icon="tabler:chevron-down"
            width={15}
            className="text-default-400 transition-transform group-open:rotate-180"
          />
        </summary>
        <ul className="space-y-1.5 px-5 pb-4 text-xs text-default-500">
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
            访客可在浏览器把 localStorage 的 <code className="rounded bg-default-100 px-1">ink-blog-statistics</code>{" "}
            设为 <code className="rounded bg-default-100 px-1">off</code> 停止上报。
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
    <div className="rounded-xl border border-default-200 bg-surface p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-default-600">
        <Icon icon={icon} width={16} />
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
      <div className="mt-1.5 text-xs text-default-500">{hint}</div>
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
    <tr className="border-b border-default-100 last:border-0">
      <td className="py-2.5 pr-4">
        <button
          type="button"
          className="text-left text-sm text-primary hover:underline"
          onClick={onOpen}
          title={row.title}
        >
          <span className="line-clamp-1">{row.title}</span>
        </button>
        {!row.hasPublication && (
          <span className="mt-0.5 inline-block rounded-full bg-default-100 px-2 py-0.5 text-[11px] text-default-500">
            已撤回 / 未公开
          </span>
        )}
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums text-default-600">
        {formatNumber(row.impressions)}
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums text-default-600">
        {formatNumber(row.clicks)}
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums text-default-600">
        {formatPercent(row.ctr)}
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums text-default-600">
        {formatNumber(row.views)}
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums text-default-600">
        {formatNumber(row.visitors)}
      </td>
      <td className="py-2.5 pl-3 text-right">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          onClick={onOpen}
        >
          查看详情 <Icon icon="tabler:arrow-right" width={13} />
        </button>
      </td>
    </tr>
  );
}

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
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/30"
      role="dialog"
      aria-label="文章指标详情"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-default-200 bg-background p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">
            {detail?.title ?? "加载中…"}
          </h3>
          <Button
            size="sm"
            variant="flat"
            startContent={<Icon icon="tabler:x" width={15} />}
            onPress={onClose}
          >
            关闭
          </Button>
        </div>
        {error && (
          <div className="mb-3 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {[
                ["曝光", formatNumber(detail.metrics.impressions)],
                ["点击", formatNumber(detail.metrics.clicks)],
                ["点击率", formatPercent(detail.metrics.ctr)],
                ["阅读", formatNumber(detail.metrics.views)],
                ["访客", formatNumber(detail.metrics.visitors)],
              ].map(([label, val]) => (
                <div
                  key={label}
                  className="rounded-lg border border-default-200 bg-surface px-3 py-2"
                >
                  <div className="text-xs text-default-500">{label}</div>
                  <div className="text-sm font-semibold tabular-nums">{val}</div>
                </div>
              ))}
            </div>
            {detail.trend.length ? (
              <BlogTrendChart
                data={detail.trend}
                granularity={detail.range.granularity}
                height={200}
              />
            ) : (
              <p className="text-sm text-default-500">该区间没有数据。</p>
            )}
            {detail.publishId && (
              <Button
                size="sm"
                variant="flat"
                as="a"
                href={`/blog/${detail.publishId}`}
                target="_blank"
                rel="noreferrer"
                endContent={<Icon icon="tabler:external-link" width={14} />}
              >
                查看公开文章
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
