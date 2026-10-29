import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@heroui/react";
import { api } from "@/lib/trpc";
import {
  blogStatsEnabled,
  isBlogManagerBrowser,
  isLocalBlogHost,
} from "@/lib/blogDevice";

type Range = { preset?: "today" | "7d" | "30d"; from?: string; to?: string };
type Audience = Awaited<ReturnType<typeof api.blog.analyticsAudience.query>>;
type Topics = Awaited<ReturnType<typeof api.blog.analyticsTopics.query>>;

const n = (v: number) => v.toLocaleString("zh-CN");
const pct = (v: number | null) => v === null ? "—" : (v * 100).toFixed(1) + "%";

function Value({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-default-200 bg-surface p-4">
      <span className="text-xs text-default-500">{title}</span>
      <strong className="mt-1 block text-2xl font-semibold text-foreground">{value}</strong>
      <span className="mt-1 block text-xs text-default-400">{hint}</span>
    </div>
  );
}

const TABLE_TH = "px-3 py-2 text-left text-xs font-medium text-default-500";
const TABLE_TD = "px-3 py-2.5 text-sm text-default-600";

export function BlogStatsBreakdowns({
  view,
  range,
  refresh,
}: {
  view: "users" | "content";
  range: Range;
  refresh: number;
}) {
  const [data, setData] = useState<Audience | Topics | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const key = JSON.stringify({ view, range, refresh });

  useEffect(() => {
    let alive = true;
    setBusy(true);
    setData(null);
    setError("");
    const request =
      view === "users"
        ? api.blog.analyticsAudience.query(range)
        : api.blog.analyticsTopics.query(range);
    request
      .then((result) => { if (alive) setData(result); })
      .catch((e) => { if (alive) setError(e?.message || "加载失败，请刷新重试"); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [key]);

  if (error)
    return (
      <div className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger" role="alert">
        {error}
      </div>
    );

  if (busy || !data)
    return (
      <p className="text-sm text-default-500" role="status">
        正在加载{view === "users" ? "用户" : "专题"}分析…
      </p>
    );

  if (view === "content") {
    const topics = data as Topics;
    return (
      <Card className="border border-default-200 bg-surface">
        <CardHeader className="flex flex-col items-start gap-1 px-5 pb-0 pt-4">
          <h2 className="text-base font-semibold text-foreground">专题表现</h2>
          <p className="text-sm text-default-500">
            按当前文章归属汇总，最多展示 100 个专题；同一专题内访客跨文章去重。
          </p>
        </CardHeader>
        <CardBody className="gap-3 p-5">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-default-200">
                  <th className={TABLE_TH}>专题</th>
                  <th className={TABLE_TH}>文章</th>
                  <th className={TABLE_TH}>阅读</th>
                  <th className={TABLE_TH}>访客</th>
                  <th className={TABLE_TH}>曝光</th>
                  <th className={TABLE_TH}>点击</th>
                  <th className={TABLE_TH}>点击率</th>
                </tr>
              </thead>
              <tbody>
                {topics.rows.map((t) => (
                  <tr key={t.id} className="border-b border-default-100 last:border-0">
                    <td className={TABLE_TD}>{t.name}</td>
                    <td className={TABLE_TD}>{n(t.articles)}</td>
                    <td className={TABLE_TD}>{n(t.views)}</td>
                    <td className={TABLE_TD}>{n(t.visitors)}</td>
                    <td className={TABLE_TD}>{n(t.impressions)}</td>
                    <td className={TABLE_TD}>{n(t.clicks)}</td>
                    <td className={TABLE_TD}>{pct(t.ctr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!topics.rows.length && (
            <p className="text-sm text-default-500">还没有专题，先在专题管理中整理文章。</p>
          )}
          <p className="text-sm text-default-500">
            一篇文章可属于多个专题，各专题数据存在重叠，不应相加作为站点总数。专题历史数据随当前文章归属汇总。
          </p>
        </CardBody>
      </Card>
    );
  }

  const a = data as Audience;
  const local = typeof location !== "undefined" && isLocalBlogHost(location.hostname);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Value title="独立访客" value={n(a.visitors)} hint="区间内有有效文章阅读的匿名浏览器" />
        <Value title="新访客" value={n(a.newVisitors)} hint="首次已记录阅读发生在当前区间" />
        <Value title="回访访客" value={n(a.returningVisitors)} hint="当前区间前已有文章阅读记录" />
        <Value title="人均阅读次数" value={a.viewsPerVisitor?.toFixed(1) ?? "—"} hint="有效文章阅读次数 ÷ 独立访客" />
      </div>

      <Card className="border border-default-200 bg-surface">
        <CardBody className="gap-3 p-5">
          <h2 className="text-base font-semibold text-foreground">访问深度</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <p className="rounded-lg border border-default-200 p-3">
              <strong className="block text-xl font-semibold text-foreground">
                {a.visitors ? a.articlesPerVisitor.toFixed(1) : "—"}
              </strong>
              <span className="text-sm text-default-500">人均阅读文章数</span>
            </p>
            <p className="rounded-lg border border-default-200 p-3">
              <strong className="block text-xl font-semibold text-foreground">{n(a.multiDayVisitors)}</strong>
              <span className="text-sm text-default-500">跨天访问的访客</span>
            </p>
            <p className="rounded-lg border border-default-200 p-3">
              <strong className="block text-xl font-semibold text-foreground">
                {pct(a.visitors ? a.returningVisitors / a.visitors : null)}
              </strong>
              <span className="text-sm text-default-500">回访访客占比</span>
            </p>
          </div>
          <p className="text-sm text-default-500">这些是匿名浏览器行为指标，回访占比不等于用户留存率。</p>
        </CardBody>
      </Card>

      <Card className="border border-default-200 bg-surface">
        <CardHeader className="flex flex-col items-start gap-1 px-5 pb-0 pt-4">
          <h2 className="text-base font-semibold text-foreground">最近活跃访客</h2>
          <p className="text-sm text-default-500">
            展示最近活跃的 20 个匿名浏览器，不采集姓名、IP 或设备指纹。
          </p>
        </CardHeader>
        <CardBody className="gap-3 p-5">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-default-200">
                  <th className={TABLE_TH}>匿名访客</th>
                  <th className={TABLE_TH}>类型</th>
                  <th className={TABLE_TH}>阅读</th>
                  <th className={TABLE_TH}>文章</th>
                  <th className={TABLE_TH}>活跃天数</th>
                  <th className={TABLE_TH}>首次阅读</th>
                  <th className={TABLE_TH}>最近阅读</th>
                </tr>
              </thead>
              <tbody>
                {a.rows.map((v) => (
                  <tr key={v.visitor} className="border-b border-default-100 last:border-0">
                    <td className={TABLE_TD}><code className="rounded bg-default-100 px-1 py-0.5 text-xs">{v.visitor}</code></td>
                    <td className={TABLE_TD}>{v.isNew ? "新访客" : "回访"}</td>
                    <td className={TABLE_TD}>{n(v.views)}</td>
                    <td className={TABLE_TD}>{n(v.articles)}</td>
                    <td className={TABLE_TD}>{n(v.activeDays)}</td>
                    <td className={TABLE_TD}>
                      {new Date(v.firstSeenAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}
                    </td>
                    <td className={TABLE_TD}>
                      {new Date(v.lastSeenAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!a.rows.length && (
            <p className="text-sm text-default-500">所选区间暂无访客阅读记录。</p>
          )}
        </CardBody>
      </Card>

      <Card className="border border-default-200 bg-surface">
        <CardBody className="gap-3 p-5">
          <h2 className="text-base font-semibold text-foreground">访客如何识别</h2>
          <p className="text-sm text-default-500">
            同一站点、同一浏览器使用随机标识，Cookie 与本地存储相互恢复；跨标签页首次创建通过浏览器锁避免竞争。同一电脑的不同浏览器、无痕窗口、不同站点域名，或清空全部存储后，仍可能产生新标识。
          </p>
          <p className="text-sm text-default-500">
            本机状态：
            {blogStatsEnabled() ? "当前浏览器允许统计" : "当前浏览器已排除统计"}
            {local ? " · 本地测试默认不上报" : ""}
            {isBlogManagerBrowser() ? " · 已识别博客管理浏览器" : ""}
            。排除只影响后续采集，已有历史记录不会自动合并或删除。
          </p>
          <p className="text-sm text-default-500">
            历史记录不包含可靠的跨浏览器关联信息，不能据此把多个标识强行合并为一个自然人。
          </p>
        </CardBody>
      </Card>
    </>
  );
}
