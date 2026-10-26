import { useEffect, useMemo, useState } from "react";
import { Modal, ModalContent } from "@heroui/react";
import { api } from "@/lib/publicBlogClient";
import { readBlogTheme } from "@/lib/blogTheme";
import { Icon } from "@/components/Common/Iconify/icons";
import { BlogButton } from "@/components/BlinkoBlog/BlogUI";
import "./about-stats.css";

/**
 * 关于页的「站点数据」区块。
 *
 * 四个数字全部来自公开接口的真实聚合：
 *   累计阅读  公开文章详情页的有效阅读次数（不是曝光、不是独立读者人数）
 *   读者回应  公开文章收到的三类有效回应总数（不含私密反馈与作者回复）
 *   公开文章  当前公开可访问的文章数量（系统没有可靠的「原创」标记，不叫原创）
 *   持续分享  从最早一篇公开文章的首次发布时间到今天的自然日数
 *
 * 这块内容不阻塞页面：数据是独立请求，失败时只让数值变成「暂不可用」，
 * 介绍、专题入口与正文照常呈现。
 */
type Stats = {
  views: number;
  reactions: number;
  articles: number;
  days: number;
  firstPublishedAt: string | null;
  updatedAt: string;
  version: string;
  dedupeWindowMinutes: number;
};

/** 大数用「万」缩写，准确值留在 title 与说明弹窗里。 */
function formatCount(value: number) {
  if (value < 10000) return value.toLocaleString("zh-CN");
  const wan = value / 10000;
  const text =
    wan >= 100 ? String(Math.round(wan)) : String(Math.round(wan * 10) / 10);
  return `${text} 万`;
}

function formatExact(value: number) {
  return value.toLocaleString("zh-CN");
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AboutStats({ enabled }: { enabled: boolean }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [noteOpen, setNoteOpen] = useState(false);
  const theme = readBlogTheme();

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setState("loading");
    api.blog.publicSiteStats
      .query()
      .then((value) => {
        if (!alive) return;
        // 站长关掉展示时接口返回 null —— 整块不渲染，而不是把数字藏起来。
        if (!value) {
          setStats(null);
          setState("ready");
          return;
        }
        setStats(value as Stats);
        setState("ready");
      })
      .catch(() => {
        if (!alive) return;
        setState("failed");
      });
    return () => {
      alive = false;
    };
  }, [enabled]);

  const metrics = useMemo(() => {
    if (!stats) return null;
    return [
      {
        key: "views",
        primary: true,
        value: formatCount(stats.views),
        exact: `${formatExact(stats.views)} 次`,
        unit: "次",
        label: "累计阅读",
        desc: "有效阅读次数",
      },
      {
        key: "reactions",
        primary: true,
        value: formatCount(stats.reactions),
        exact: `${formatExact(stats.reactions)} 次`,
        unit: "次",
        label: "读者回应",
        desc: "有启发 · 很实用 · 有共鸣",
      },
      {
        key: "articles",
        primary: false,
        value: formatCount(stats.articles),
        exact: `${formatExact(stats.articles)} 篇`,
        unit: "篇",
        label: "公开文章",
        desc: "当前公开可访问",
      },
      {
        key: "days",
        primary: false,
        value: formatExact(stats.days),
        exact: `${formatExact(stats.days)} 天`,
        unit: "天",
        label: "持续分享",
        desc: "自首次公开至今",
      },
    ];
  }, [stats]);

  // 关闭时不占位，也不请求。
  if (!enabled) return null;

  return (
    // id="stats"：导航里的「站点数据」入口直接落到这一块。
    <section className="ink-about-section" id="stats">
      <div className="ink-about-titlebar">
        <h2 className="ink-about-title">记录被看见，分享有回响。</h2>
        <button
          type="button"
          className="ink-about-stats-note"
          onClick={() => setNoteOpen(true)}
          aria-haspopup="dialog"
        >
          <Icon icon="tabler:info-circle" width={15} />
          统计说明
        </button>
      </div>

      <div className="ink-about-stats-grid" aria-busy={state === "loading"}>
        {state === "loading" &&
          [0, 1, 2, 3].map((i) => (
            <div className="ink-about-stat" key={i} aria-hidden="true">
              <span className="ink-about-stat-skeleton ink-about-stat-skeleton-value" />
              <span className="ink-about-stat-skeleton ink-about-stat-skeleton-label" />
            </div>
          ))}
        {state === "failed" && (
          <p className="ink-about-stats-error" role="status">
            统计暂时不可用，稍后再来看看。
          </p>
        )}
        {state === "ready" && metrics && (
          metrics.map((m) => (
            <div
              className={
                "ink-about-stat" + (m.primary ? " ink-about-stat-primary" : "")
              }
              key={m.key}
            >
              <p className="ink-about-stat-figure">
                <b
                  className="ink-about-stat-value"
                  title={m.exact}
                  aria-label={`${m.label} ${m.exact}`}
                >
                  {m.value}
                </b>
                <span className="ink-about-stat-unit">{m.unit}</span>
              </p>
              <span className="ink-about-stat-label">{m.label}</span>
              <small className="ink-about-stat-desc">{m.desc}</small>
            </div>
          ))
        )}
        {state === "ready" && !metrics && (
          <p className="ink-about-stats-error">站点尚未公开文章数据。</p>
        )}
      </div>

      <Modal
        isOpen={noteOpen}
        onOpenChange={(next) => setNoteOpen(next)}
        placement="center"
        size="md"
        scrollBehavior="inside"
        backdrop="blur"
        isDismissable
        hideCloseButton
        classNames={{
          base: `ink-stats-modal ink-stats-surface ${
            theme === "dark" ? "ink-stats-dark" : ""
          }`,
        }}
      >
        <ModalContent aria-label="统计说明">
          <header className="ink-stats-modal-head">
            <div>
              <h2 className="ink-stats-modal-title">这些数字是怎么来的</h2>
              <p className="ink-stats-modal-lead">
                全部统计公开可访问的内容，口径与站内统计一致。
              </p>
            </div>
            <BlogButton
              type="button"
              className="ink-stats-modal-close"
              onClick={() => setNoteOpen(false)}
              aria-label="关闭"
            >
              <Icon icon="tabler:x" width={18} />
            </BlogButton>
          </header>

          {stats && (
            <div className="ink-stats-modal-exact">
              <span>当前准确值</span>
              <b>
                累计阅读 {formatExact(stats.views)} 次 · 读者回应{" "}
                {formatExact(stats.reactions)} 次 · 公开文章{" "}
                {formatExact(stats.articles)} 篇 · 持续分享{" "}
                {formatExact(stats.days)} 天
              </b>
            </div>
          )}

          <dl className="ink-stats-modal-list">
            <div>
              <dt>累计阅读</dt>
              <dd>
                公开文章详情页的有效阅读次数。同一浏览器 {stats?.dedupeWindowMinutes ?? 30}{" "}
                分钟内重复打开同一篇只记一次，刷新不会重复计入。
                它不是曝光量，也不是独立读者人数。
              </dd>
            </div>
            <div>
              <dt>读者回应</dt>
              <dd>
                公开文章收到的「有启发 / 很实用 / 有共鸣」回应总数。同一访客对同一篇最多保留一种回应，
                切换类型不增加总数，撤销则减少。私密反馈与作者回复不计入。
              </dd>
            </div>
            <div>
              <dt>公开文章</dt>
              <dd>
                当前已发布、公开可访问的文章数量。系统没有可靠的「原创」标记，
                所以这里只叫公开文章 —— 撤回、删除或转为私有的文章会退出统计。
              </dd>
            </div>
            <div>
              <dt>持续分享</dt>
              <dd>
                从最早一篇公开文章的首次发布时间到今天的自然日数
                {stats?.firstPublishedAt
                  ? `（自 ${formatDate(stats.firstPublishedAt)} 起）`
                  : ""}
                。它不表示连续每天更新，更新发布也不会重置这段时长。
              </dd>
            </div>
            <div>
              <dt>身份识别的限制</dt>
              <dd>
                去重依据是浏览器生成的匿名设备标识（localStorage 与第一方 Cookie），
                服务端拿不到 IP、浏览器指纹或姓名。跨浏览器、跨设备或清理了站点数据之后，
                同一个读者会被算成不同的访客 —— 这些数字反映的是浏览器的访问行为，
                不等于真实自然人的人数。
              </dd>
            </div>
          </dl>

          <footer className="ink-stats-modal-foot">
            <span>
              更新于 {stats ? formatDate(stats.updatedAt) : "—"} · 口径版本{" "}
              {stats?.version ?? "—"}
            </span>
            <BlogButton
              type="button"
              className="ink-stats-modal-done"
              onClick={() => setNoteOpen(false)}
            >
              知道了
            </BlogButton>
          </footer>
        </ModalContent>
      </Modal>
    </section>
  );
}
