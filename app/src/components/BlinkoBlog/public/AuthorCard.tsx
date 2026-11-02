import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { Icon } from "@/components/Common/Iconify/icons";
import { blogRoute } from "@/lib/blogPublicBase";
import {
  AUTHOR_STATUS_INTERVAL,
  authorStatusPool,
} from "./authorStatus";
import "./author-card.css";

/**
 * 公开博客的作者卡。
 *
 * 公开站和后台「公开作者」面板的预览共用这一份组件 ——
 * 后台预览必须和前台是同一张卡，否则改一处就漂移：后台看着对，线上不是那个样子。
 *
 * 样式在 author-card.css（从 blog.css 拆出来的），不依赖 `.ink-blog` 外壳，
 * 两边都能命中同一批规则。
 */

export type AuthorCardProfile = {
  displayName: string;
  bio: string;
  avatarUrl: string;
  homepage: string;
  links: { label: string; url: string }[];
};

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

/**
 * 作者卡本体。
 *
 * 两层文案各司其职，不许同一段话出现两次：
 * - 展开后的大段：个人介绍（bio），完整展示。
 * - 作者名下方那一行：站点标语，唯一出处是「站点设置 → 站点信息 → 站点标语」。
 *
 * 早前这里放的是 bio 的第一句，于是「作者名旁边的字」和「个人介绍」是同一段话，
 * 展开前后读两遍同一内容。现在两处各读各的。
 */
export function AuthorCardView({
  profile,
  tagline,
  /** 「了解作者 →」的跳转目标。后台预览传 null —— 渲染成不可点的文字，免得把人带离后台。 */
  aboutHref = null,
}: {
  profile: AuthorCardProfile;
  tagline: string;
  aboutHref?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
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
              {aboutHref ? (
                <Link to={aboutHref}>了解作者 →</Link>
              ) : (
                <span aria-disabled="true">了解作者 →</span>
              )}
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
          <small>{tagline}</small>
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

/** 公开站用的作者卡：数据来自站点上下文，作者没公开资料就不摆这张卡。 */
export function AuthorCard({
  profile,
  tagline,
}: {
  profile: (AuthorCardProfile & { published?: boolean }) | null | undefined;
  tagline: string;
}) {
  // 作者资料没公开就不摆这张卡：署名回退的是站点名，不是作者本人。
  if (!profile?.published) return null;
  return (
    <AuthorCardView
      profile={profile}
      tagline={tagline}
      aboutHref={blogRoute("/blog/about")}
    />
  );
}
