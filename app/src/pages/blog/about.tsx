import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { blogRoute } from "@/lib/blogPublicBase";
import { api } from "@/lib/publicBlogClient";
import { Icon } from "@/components/Common/Iconify/icons";
import {
  AuthorCard,
  useBlogSite,
  useBlogTitle,
} from "@/components/BlinkoBlog/public/BlogShell";
import { AboutStats } from "@/components/BlinkoBlog/public/AboutStats";
import { AboutMoments } from "@/components/BlinkoBlog/public/AboutMoments";
import { topicIcon, topicTint } from "@/lib/blogTopicIcon";
import "@/components/BlinkoBlog/public/about.css";

/**
 * 关于页。
 *
 * 访客依次要弄明白六件事，这一页就按这个顺序排：
 *   1. 你是谁、关注什么 —— 个人介绍
 *   2. 你攒了多少 —— 站点数据
 *   3. 你在写哪几类 —— 我在记录什么
 *   4. 先读哪几篇 —— 用几篇文章，认识我
 *   5. 最近在想什么 —— 最近动态
 *   6. 怎么跟上 —— 订阅引导
 *   7. 这个空间是什么 —— 关于这个空间
 *
 * 内容全部来自作者自己配置的东西：资料、精选文章、展示专题、站点说明。
 * 没有配置的区块就不出现，不用别处的内容顶替。
 */

type AboutPayload = {
  spaceIntro: string;
  topics: {
    id: number;
    name: string;
    slug: string;
    desc: string;
    color: string;
    count: number;
  }[];
  featured: {
    id: number;
    publishId: string;
    title: string;
    topicName: string;
    coverUrl: string;
    reason: string;
  }[];
};

export default function BlogAbout() {
  const { profile, loading, error, publicSettings } = useBlogSite();
  useBlogTitle("关于作者");

  const [about, setAbout] = useState<AboutPayload | null>(null);

  // 精选文章与展示专题单独取：这一块挂了也不影响个人介绍和其它区块。
  useEffect(() => {
    let alive = true;
    void api.blog.publicAbout
      .query()
      .then((res) => {
        if (!alive) return;
        setAbout(res as AboutPayload);
      })
      .catch(() => {
        // 精选/专题取不到就少这两块，其余内容照常。
      });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * 「站点数据」锚点：导航里的入口带 #stats 过来，落到这一块。
   *
   * 两个坑：
   *   1. 公开站的滚动容器是 .ink-blog，不是 window —— 浏览器自带的锚点定位在这里不生效；
   *   2. 站点数据是异步取回来的，元素要等一会儿才出现，所以得轮询等它渲染出来再滚。
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const scrollToStats = () => {
      if (window.location.hash !== "#stats") return;
      const root = document.querySelector(".ink-blog");
      if (!root) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let tries = 0;
      const tick = () => {
        const el = document.getElementById("stats");
        if (el && el.getBoundingClientRect().height > 0) {
          const top = root.scrollTop + el.getBoundingClientRect().top - 24;
          root.scrollTo({
            top,
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "auto"
              : "smooth",
          });
          return;
        }
        tries += 1;
        if (tries > 25) return;
        timer = setTimeout(tick, 120);
      };
      // 先等外层把页面滚回顶部（换页时它会重置滚动位置），再定位到数据区。
      timer = setTimeout(tick, 180);
      return () => clearTimeout(timer);
    };
    const off = scrollToStats();
    const onHash = () => scrollToStats();
    addEventListener("hashchange", onHash);
    return () => {
      off?.();
      removeEventListener("hashchange", onHash);
    };
  }, [about, profile]);

  if (loading)
    return (
      <main className="ink-about">
        <div className="ink-about-inner">
          <p className="ink-empty" role="status">
            正在加载公开资料…
          </p>
        </div>
      </main>
    );

  if (!profile)
    return (
      <main className="ink-about">
        <div className="ink-about-inner">
          <div className="ink-empty">
            <p>{error ? "暂时无法加载资料。" : "作者尚未公开个人资料。"}</p>
            <Link to={blogRoute("/blog")}>阅读公开文章 →</Link>
          </div>
        </div>
      </main>
    );

  const topics = about?.topics ?? [];
  const featured = about?.featured ?? [];
  const spaceIntro = about?.spaceIntro ?? "";
  const name = profile.displayName || "作者";

  return (
    <main className="ink-about">
      <div className="ink-about-inner">
        {/* 1. 个人介绍：左边是作者卡（跟首页侧栏同一个组件），右边是关于我的文字。
            两栏在同一个面板里 —— 原型就是这么排的，作者跟文字并排比，
            比「文字配一张照片」更贴这个站点（作者卡本身就是这个站点的标识）。 */}
        <section className="ink-about-hero">
          <div className="ink-about-hero-card">
            <AuthorCard />
          </div>
          <div className="ink-about-hero-copy">
            <span className="ink-about-hero-badge">关于我</span>
            <h1 className="ink-about-hero-name">{name}</h1>
            {profile.tagline && (
              <h2 className="ink-about-hero-tagline">{profile.tagline}</h2>
            )}
            {profile.bio && (
              <p className="ink-about-hero-bio">{profile.bio}</p>
            )}
            <div className="ink-about-hero-actions">
              <Link className="ink-primary-button" to={blogRoute("/blog")}>
                <Icon icon="tabler:file-text" width={16} />
                阅读文章
                <Icon icon="tabler:arrow-right" width={16} />
              </Link>
            </div>
          </div>
        </section>

        {/* 2. 站点数据 */}
        <AboutStats enabled={publicSettings?.showPublicStats !== false} />

        {/* 3. 我在记录什么 */}
        {topics.length > 0 && (
          <section className="ink-about-section">
            <h2 className="ink-about-title">我在记录什么</h2>
            <div className="ink-about-topics">
              {topics.map((topic) => (
                <Link
                  key={topic.id}
                  className="ink-about-topic"
                  to={blogRoute("/blog/t/" + topic.slug)}
                >
                  <span className="ink-about-topic-head">
                    <span
                      className="ink-about-topic-icon"
                      style={{
                        background: topicTint(topic.color),
                        color: topic.color || undefined,
                      }}
                      aria-hidden="true"
                    >
                      <Icon icon={topicIcon(topic.name)} width={18} />
                    </span>
                    <span className="ink-about-topic-name">{topic.name}</span>
                    <span className="ink-about-topic-arrow" aria-hidden="true">
                      <Icon icon="tabler:arrow-right" width={15} />
                    </span>
                  </span>
                  {topic.desc && (
                    <span className="ink-about-topic-desc">{topic.desc}</span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 4. 用几篇文章，认识我 */}
        {featured.length > 0 && (
          <section className="ink-about-section">
            <div className="ink-about-titlebar">
              <h2 className="ink-about-title">用几篇文章，认识我</h2>
              <Link className="ink-about-more" to={blogRoute("/blog")}>
                浏览全部文章
                <Icon icon="tabler:arrow-up-right" width={14} />
              </Link>
            </div>
            <p className="ink-about-sub">从这些文章，了解我的思考与实践。</p>
            <div className="ink-about-featured-list">
              {featured.map((post) => (
                <Link
                  key={post.id}
                  className="ink-about-featured-row"
                  to={blogRoute("/blog/" + post.publishId)}
                >
                  <span className="ink-about-featured-cover">
                    {post.coverUrl ? (
                      <img
                        src={post.coverUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <Icon icon="tabler:file-text" width={20} />
                    )}
                  </span>
                  <span className="ink-about-featured-body">
                    {post.topicName && (
                      <span className="ink-about-featured-topic">
                        {post.topicName}
                      </span>
                    )}
                    <span className="ink-about-featured-title">{post.title}</span>
                    {post.reason && (
                      <span className="ink-about-featured-reason">
                        {post.reason}
                      </span>
                    )}
                  </span>
                  <span className="ink-about-featured-arrow" aria-hidden="true">
                    <Icon icon="tabler:arrow-right" width={17} />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 5. 最近动态 */}
        <AboutMoments />

        {/* 6. 订阅引导 */}
        <section className="ink-about-subscribe">
          <span className="ink-about-subscribe-icon" aria-hidden="true">
            <Icon icon="tabler:rss" width={18} />
          </span>
          <p className="ink-about-subscribe-text">
            如果这些思考对你有帮助，可以订阅后续更新。
          </p>
          <Link
            className="ink-primary-button"
            to={blogRoute("/blog/subscribe")}
          >
            订阅更新
            <Icon icon="tabler:arrow-right" width={16} />
          </Link>
        </section>

        {/* 7. 关于这个空间 */}
        {spaceIntro && (
          <section className="ink-about-section">
            <h2 className="ink-about-title">关于这个空间</h2>
            <div className="ink-about-space">
              <p className="ink-about-space-text">{spaceIntro}</p>
              <div className="ink-about-space-links">
                <Link to={blogRoute("/blog/friends")}>
                  友情链接
                  <Icon icon="tabler:arrow-up-right" width={13} />
                </Link>
                {profile.homepage && (
                  <a href={profile.homepage} target="_blank" rel="noopener noreferrer">
                    联系我
                    <Icon icon="tabler:arrow-up-right" width={13} />
                  </a>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
