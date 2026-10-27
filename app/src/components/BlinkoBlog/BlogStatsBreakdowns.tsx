import { useEffect, useState } from "react";
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
const pct = (v: number | null) =>
  v === null ? "—" : (v * 100).toFixed(1) + "%";
function Value({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="ink-stats-metric">
      <span className="ink-stats-metric-head">{title}</span>
      <strong className="ink-stats-metric-value">{value}</strong>
      <span className="ink-stats-metric-hint">{hint}</span>
    </div>
  );
}
export function BlogStatsBreakdowns({
  view,
  range,
  refresh,
}: {
  view: "users" | "content";
  range: Range;
  refresh: number;
}) {
  const [data, setData] = useState<Audience | Topics | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
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
      .then((result) => {
        if (alive) setData(result);
      })
      .catch((e) => {
        if (alive) setError(e?.message || "加载失败，请刷新重试");
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [key]);
  if (error)
    return (
      <div className="ink-mg-alert" role="alert">
        {error}
      </div>
    );
  if (busy || !data)
    return (
      <p className="ink-mg-sub" role="status">
        正在加载{view === "users" ? "用户" : "专题"}分析…
      </p>
    );
  if (view === "content") {
    const topics = data as Topics;
    return (
      <section className="ink-mg-panel ink-stats-card">
        <div className="ink-mg-section-head">
          <div>
            <h2 className="ink-mg-section-title">专题表现</h2>
            <p className="ink-mg-sub">
              按当前文章归属汇总，最多展示 100
              个专题；同一专题内访客跨文章去重。
            </p>
          </div>
        </div>
        <div className="ink-stats-tablewrap">
          <table className="ink-stats-table">
            <thead>
              <tr>
                <th>专题</th>
                <th>文章</th>
                <th>阅读</th>
                <th>访客</th>
                <th>曝光</th>
                <th>点击</th>
                <th>点击率</th>
              </tr>
            </thead>
            <tbody>
              {topics.rows.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{n(t.articles)}</td>
                  <td>{n(t.views)}</td>
                  <td>{n(t.visitors)}</td>
                  <td>{n(t.impressions)}</td>
                  <td>{n(t.clicks)}</td>
                  <td>{pct(t.ctr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!topics.rows.length && (
          <p className="ink-mg-sub">还没有专题，先在专题管理中整理文章。</p>
        )}
        <p className="ink-mg-sub">
          一篇文章可属于多个专题，各专题数据存在重叠，不应相加作为站点总数。专题历史数据随当前文章归属汇总。
        </p>
      </section>
    );
  }
  const a = data as Audience;
  const local =
    typeof location !== "undefined" && isLocalBlogHost(location.hostname);
  return (
    <>
      <div className="ink-stats-metrics">
        <Value
          title="独立访客"
          value={n(a.visitors)}
          hint="区间内有有效文章阅读的匿名浏览器"
        />
        <Value
          title="新访客"
          value={n(a.newVisitors)}
          hint="首次已记录阅读发生在当前区间"
        />
        <Value
          title="回访访客"
          value={n(a.returningVisitors)}
          hint="当前区间前已有文章阅读记录"
        />
        <Value
          title="人均阅读次数"
          value={a.viewsPerVisitor?.toFixed(1) ?? "—"}
          hint="有效文章阅读次数 ÷ 独立访客"
        />
      </div>
      <section className="ink-mg-panel ink-stats-card">
        <h2 className="ink-mg-section-title">访问深度</h2>
        <div className="ink-stats-audience-depth">
          <p>
            <strong>
              {a.visitors ? a.articlesPerVisitor.toFixed(1) : "—"}
            </strong>
            <span>人均阅读文章数</span>
          </p>
          <p>
            <strong>{n(a.multiDayVisitors)}</strong>
            <span>跨天访问的访客</span>
          </p>
          <p>
            <strong>
              {pct(a.visitors ? a.returningVisitors / a.visitors : null)}
            </strong>
            <span>回访访客占比</span>
          </p>
        </div>
        <p className="ink-mg-sub">
          这些是匿名浏览器行为指标，回访占比不等于用户留存率。
        </p>
      </section>
      <section className="ink-mg-panel ink-stats-card">
        <div className="ink-mg-section-head">
          <div>
            <h2 className="ink-mg-section-title">最近活跃访客</h2>
            <p className="ink-mg-sub">
              展示最近活跃的 20 个匿名浏览器，不采集姓名、IP 或设备指纹。
            </p>
          </div>
        </div>
        <div className="ink-stats-tablewrap">
          <table className="ink-stats-table">
            <thead>
              <tr>
                <th>匿名访客</th>
                <th>类型</th>
                <th>阅读</th>
                <th>文章</th>
                <th>活跃天数</th>
                <th>首次阅读</th>
                <th>最近阅读</th>
              </tr>
            </thead>
            <tbody>
              {a.rows.map((v) => (
                <tr key={v.visitor}>
                  <td>
                    <code>{v.visitor}</code>
                  </td>
                  <td>{v.isNew ? "新访客" : "回访"}</td>
                  <td>{n(v.views)}</td>
                  <td>{n(v.articles)}</td>
                  <td>{n(v.activeDays)}</td>
                  <td>
                    {new Date(v.firstSeenAt).toLocaleString("zh-CN", {
                      timeZone: "Asia/Shanghai",
                      hour12: false,
                    })}
                  </td>
                  <td>
                    {new Date(v.lastSeenAt).toLocaleString("zh-CN", {
                      timeZone: "Asia/Shanghai",
                      hour12: false,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!a.rows.length && (
          <p className="ink-mg-sub">所选区间暂无访客阅读记录。</p>
        )}
      </section>
      <section className="ink-mg-panel ink-stats-card">
        <h2 className="ink-mg-section-title">访客如何识别</h2>
        <p className="ink-mg-sub">
          同一站点、同一浏览器使用随机标识，Cookie
          与本地存储相互恢复；跨标签页首次创建通过浏览器锁避免竞争。同一电脑的不同浏览器、无痕窗口、不同站点域名，或清空全部存储后，仍可能产生新标识。
        </p>
        <p className="ink-mg-sub">
          本机状态：
          {blogStatsEnabled() ? "当前浏览器允许统计" : "当前浏览器已排除统计"}
          {local ? " · 本地测试默认不上报" : ""}
          {isBlogManagerBrowser() ? " · 已识别博客管理浏览器" : ""}
          。排除只影响后续采集，已有历史记录不会自动合并或删除。
        </p>
        <p className="ink-mg-sub">
          历史记录不包含可靠的跨浏览器关联信息，不能据此把多个标识强行合并为一个自然人。
        </p>
      </section>
    </>
  );
}
