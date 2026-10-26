import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { publicAsset } from "@/lib/blogPublicBase";
import { api } from "@/lib/publicBlogClient";
import { Icon } from "@/components/Common/Iconify/icons";
import { useBlogSite, useBlogTitle } from "@/components/BlinkoBlog/public/BlogShell";
import { MomentFeed } from "@/components/BlinkoBlog/public/MomentFeed";
import {
  MOMENT_FILTERS,
  MOMENT_FILTER_LABEL,
  isMomentFilter,
  type MomentFilter,
} from "@shared/lib/blogMoments";
import { formatMonthLabel } from "@shared/lib/blogTime";
import "@/components/BlinkoBlog/public/moments.css";

/**
 * 公开博客的「动态」页。
 *
 * 桌面端是居中的单列动态流，左右留白，不设右侧栏。
 * 顶部作者信息只出现一次 —— 每条动态不再重复头像与昵称。
 *
 * 筛选与月份同步到 URL：刷新、前进、后退都能恢复原来的条件。
 */
export default function BlogMoments() {
  const { profile, siteName } = useBlogSite();
  useBlogTitle("动态");
  const [params, setParams] = useSearchParams();
  const [months, setMonths] = useState<{ key: string; count: number }[]>([]);

  const filterParam = params.get("filter");
  const filter: MomentFilter = isMomentFilter(filterParam) ? filterParam : "all";
  const month = params.get("month") || "";

  // 月份来自真实公开内容 —— 不写死任何默认值。
  useEffect(() => {
    let alive = true;
    void api.blog.publicMomentMonths
      .query()
      .then((res) => {
        if (!alive) return;
        setMonths(res.months);
      })
      .catch(() => {
        if (alive) setMonths([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const applyParams = (nextFilter: MomentFilter, nextMonth: string) => {
    const next = new URLSearchParams(params);
    if (nextFilter === "all") next.delete("filter");
    else next.set("filter", nextFilter);
    if (!nextMonth) next.delete("month");
    else next.set("month", nextMonth);
    // 用 push 而不是 replace：前进后退能在几次筛选之间来回走。
    setParams(next, { replace: false });
  };

  const monthOptions = useMemo(() => months, [months]);

  return (
    <main className="ink-moments">
      <div className="ink-moments-inner">
        <section className="ink-moments-author">
          <div className="ink-moments-author-main">
            {profile?.avatarUrl ? (
              <img
                className="ink-moments-author-avatar"
                src={profile.avatarUrl}
                alt={profile.displayName || siteName || "作者"}
              />
            ) : (
              <span className="ink-moments-author-avatar ink-moments-author-avatar-fallback">
                <Icon icon="tabler:user-circle" width={46} />
              </span>
            )}
            <div>
              <h1 className="ink-moments-author-name">
                {profile?.displayName || siteName || "作者"}
              </h1>
              <p className="ink-moments-author-bio">
                {profile?.tagline || "记录当下，也记录生活。"}
              </p>
            </div>
          </div>
          <a
            className="ink-moments-author-rss"
            href={publicAsset("/blog/moments/feed.xml")}
            target="_blank"
            rel="noopener noreferrer"
          >
            订阅动态 RSS
            <Icon icon="tabler:arrow-up-right" width={14} />
          </a>
        </section>

        <h2 className="ink-moments-title">动态</h2>
        <p className="ink-moments-subtitle">一些当下，慢慢记录。</p>

        <div className="ink-moments-toolbar">
          <div className="ink-moments-filters" role="group" aria-label="动态筛选">
            {MOMENT_FILTERS.map((key) => (
              <button
                type="button"
                key={key}
                className={"ink-moments-chip" + (filter === key ? " is-active" : "")}
                aria-pressed={filter === key}
                onClick={() => applyParams(key, month)}
              >
                {MOMENT_FILTER_LABEL[key]}
              </button>
            ))}
          </div>
          <select
            className="ink-moments-month"
            value={month}
            aria-label="按月份筛选"
            onChange={(event) => applyParams(filter, event.target.value)}
          >
            <option value="">全部月份</option>
            {monthOptions.map((item) => (
              <option key={item.key} value={item.key}>
                {formatMonthLabel(item.key)}
              </option>
            ))}
          </select>
        </div>

        <MomentFeed filter={filter} month={month} />

        <div className="ink-moments-foot">
          <a
            href={publicAsset("/blog/moments/feed.xml")}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon icon="tabler:rss" width={15} />
            订阅动态 RSS
          </a>
        </div>
      </div>
    </main>
  );
}
