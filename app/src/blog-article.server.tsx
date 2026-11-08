import { renderToStaticMarkup } from "react-dom/server";
import { PublicArticleBody } from "./components/BlinkoBlog/PublicArticleBody";

export function renderArticle(article: {
  title: string;
  content: string;
  summary?: string;
}) {
  return renderToStaticMarkup(
    <main className="ink-blog" data-ink-reading-shell>
      <article
        style={{ maxWidth: 800, margin: "40px auto", padding: "0 24px" }}
      >
        <nav>
          <a href="/">首页</a> · <a href="/topics">专题</a>
        </nav>
        <h1>{article.title}</h1>
        {article.summary && <p>{article.summary}</p>}
        <PublicArticleBody content={article.content} />
      </article>
    </main>,
  );
}

type HomePost = { publishId: string; title: string; excerpt?: string };
export function renderHome(site: {
  siteName: string;
  posts: HomePost[];
  topics: { slug: string; name: string }[];
}) {
  return renderToStaticMarkup(
    <main className="ink-blog" data-ink-reading-shell>
      <div className="ink-wrap ink-home-page" style={{ padding: "32px 0" }}>
        <header>
          <h1>{site.siteName}</h1>
          <nav>
            <a href="/">首页</a> · <a href="/topics">专题</a> ·{" "}
            <a href="/moments">动态</a>
          </nav>
        </header>
        <nav className="ink-chips">
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
        <section className="ink-card-grid" aria-label="公开文章">
          {site.posts.map((post) => (
            <a
              key={post.publishId}
              className="ink-post-card"
              href={"/article/" + post.publishId}
            >
              <div className="ink-post-card-body">
                <h2>{post.title}</h2>
                {post.excerpt && <p>{post.excerpt}</p>}
                <span>阅读文章 →</span>
              </div>
            </a>
          ))}
        </section>
        {!site.posts.length && <p>还没有公开文章。</p>}
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
    <main className="ink-blog" data-ink-reading-shell>
      <div className="ink-wrap ink-topic-page" style={{ padding: "32px 0" }}>
        <nav>
          <a href="/">首页</a> · <a href="/topics">全部专题</a>
        </nav>
        <header>
          <h1>{directory.topic.name}</h1>
          <p>{directory.topic.desc}</p>
          <p>{directory.total} 篇文章</p>
        </header>
        <section aria-label="文章目录">
          <h2>文章目录</h2>
          {directory.sections.map((section) => (
            <section key={section.id}>
              {section.showTitle && <h3>{section.name}</h3>}
              <ul>{section.posts.map(link)}</ul>
            </section>
          ))}
          <ul>{directory.unassigned.posts.map(link)}</ul>
        </section>
      </div>
    </main>,
  );
}
