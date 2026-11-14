import { renderToStaticMarkup } from "react-dom/server";
import { PublicArticleBody } from "./components/BlinkoBlog/PublicArticleBody";

export function renderArticle(article: {
  title: string;
  content: string;
  summary?: string;
}) {
  return renderToStaticMarkup(
    <main className="ink-article-page" data-ink-reading-shell>
      <section className="ink-article-hero-full">
        <div className="ink-article-hero" data-cover="false">
          <h1>{article.title}</h1>
          {article.summary && <p>{article.summary}</p>}
        </div>
      </section>
      <div className="ink-reading ink-wrap">
        <article className="ink-panel">
          <PublicArticleBody content={article.content} />
        </article>
        <aside className="ink-reading-aside" />
      </div>
    </main>,
  );
}

type HomePost = { publishId: string; title: string; excerpt?: string };
export function renderHome(site: {
  siteName: string;
  posts: HomePost[];
  topics: { slug: string; name: string }[];
}) {
  /*
   * 结构必须与前端首页一致（ink-home-page / ink-home-grid / ink-aside …）：
   * 服务端先渲染这一段，前端接管时整块换掉 —— 两版结构不一样，
   * 读者就会看到一次跳变（标题换位、卡片重排）。
   * 所以这里只输出「首屏骨架」：结构、类名、比例都按前端的同一套来，
   * 交互（轮播、筛选）在前端接上。
   */
  return renderToStaticMarkup(
    <main className="ink-wrap ink-home-page" data-ink-reading-shell>
      <nav className="ink-chips" aria-label="文章视图与专题筛选">
        {site.topics.map((topic) => (
          <a
            className="ink-chip"
            key={topic.slug}
            href={"/topic/" + encodeURIComponent(topic.slug)}
          >
            {topic.name}
          </a>
        ))}
      </nav>
      <div className="ink-home-grid">
        <div className="ink-home-hero">
          {site.posts[0] ? (
            <div className="ink-lead-hero">
              <a
                className="ink-lead-hero-hit"
                href={"/article/" + site.posts[0].publishId}
                aria-label={site.posts[0].title}
              />
              <span className="ink-lead-hero-meta">
                <span className="ink-lead-hero-meta-label">全站推荐</span>
              </span>
            </div>
          ) : null}
        </div>
        <div className="ink-home-list">
          <div className="ink-card-grid" aria-label="公开文章">
            {site.posts.map((post) => (
              <a
                key={post.publishId}
                className="ink-post-card ink-panel"
                href={"/article/" + post.publishId}
              >
                <div className="ink-post-card-body">
                  <h2>{post.title}</h2>
                  {post.excerpt && <p>{post.excerpt}</p>}
                </div>
              </a>
            ))}
          </div>
          {!site.posts.length && <p className="ink-empty">还没有公开文章。</p>}
        </div>
        <aside className="ink-aside" />
      </div>
    </main>,
  );
}

export function renderTopic(directory: {
  topic: { name: string; desc: string; slug: string };
  total: number;
  sections: {
    id: number;
    name: string;
    showTitle: boolean;
    posts: HomePost[];
  }[];
  unassigned: { posts: HomePost[] };
}) {
  const link = (post: HomePost) => (
    <li key={post.publishId}>
      <a
        href={
          "/article/" +
          post.publishId +
          "?topic=" +
          encodeURIComponent(directory.topic.slug)
        }
      >
        {post.title}
      </a>
    </li>
  );
  return renderToStaticMarkup(
    <main className="ink-wrap ink-topic-page" data-topic-ready="true" data-ink-reading-shell>
      <section className="ink-topic-intro">
        <h1>{directory.topic.name}</h1>
        <p>{directory.topic.desc}</p>
        <p>{directory.total} 篇文章</p>
      </section>
      <section className="ink-topic-directory" aria-label="文章目录">
        {directory.sections.map((section) => (
          <section key={section.id}>
            {section.showTitle && <h3>{section.name}</h3>}
            <ul>{section.posts.map(link)}</ul>
          </section>
        ))}
        <ul>{directory.unassigned.posts.map(link)}</ul>
      </section>
    </main>,
  );
}
