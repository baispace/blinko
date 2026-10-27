import { Link } from "react-router-dom";
import { blogRoute } from "@/lib/blogPublicBase";
import { Icon } from "@/components/Common/Iconify/icons";
import { TopicDocDrawer } from "./TopicDocDrawer";
import { TopicDocSidebar, type DocDirectory } from "./TopicDocSidebar";

/**
 * 文档模式的专题概述页。
 *
 * 访问专题地址不应该直接跳进某篇文章 —— 读者得先知道这个专题在讲什么、
 * 有几章几篇，再决定从哪儿开始。所以概述页给的是「地图 + 入口」，
 * 不是另一份文章列表。
 */
export function DocTopicOverview({ directory }: { directory: DocDirectory }) {
  const { topic, sections, unassigned } = directory;
  /**
   * 「开始阅读」指向默认打开的那一篇：
   * 后台指定了就开指定的那篇，没指定就开编排中的第一篇 —— 两处口径一致。
   */
  const startPostId = directory.defaultPublishId ?? directory.firstPublishId;
  const startURL = startPostId
    ? blogRoute(
        "/blog/" + startPostId + "?topic=" + encodeURIComponent(topic.slug),
      )
    : null;

  return (
    <main className="ink-doc-layout">
      <aside className="ink-doc-side">
        <TopicDocSidebar directory={directory} overviewActive />
      </aside>

      <div className="ink-doc-main">
        <div className="ink-doc-mobile-bar">
          <TopicDocDrawer directory={directory} />
        </div>
        <div className="ink-doc-overview">
          <h1>{topic.name}</h1>
          {topic.desc && (
            <p className="ink-doc-overview-desc">{topic.desc}</p>
          )}
          <div className="ink-doc-overview-stats">
            <span>{directory.sectionCount} 个章节</span>
            <span>{directory.total} 篇公开文章</span>
          </div>

          {startURL ? (
            <Link className="ink-doc-start" to={startURL}>
              开始阅读
              <Icon icon="tabler:arrow-right" width={16} />
            </Link>
          ) : (
            <p className="ink-muted">
              这个专题还没有公开文章，先来写第一篇吧。
            </p>
          )}

          {/* 章节序号只数「展示了标题」的章节，不留空号 —— 与左侧目录一致。 */}
          {(() => {
            let visible = 0;
            return sections.map((section) => {
              const number = section.showTitle ? ++visible : 0;
              return (
                <section className="ink-doc-overview-section" key={section.id}>
                  <h2>
                    {section.showTitle
                      ? `${String(number).padStart(2, "0")} ${section.name}`
                      : section.name}
                  </h2>
                  <ul className="ink-doc-overview-list">
                    {section.posts.map((post) => (
                      <li key={post.id}>
                        <Link
                          to={blogRoute(
                            "/blog/" +
                              post.publishId +
                              "?topic=" +
                              encodeURIComponent(topic.slug),
                          )}
                        >
                          <span>{post.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            });
          })()}

          {unassigned.posts.length > 0 && (
            <section className="ink-doc-overview-section">
              <h2>其他文章</h2>
              <ul className="ink-doc-overview-list">
                {unassigned.posts.map((post) => (
                  <li key={post.id}>
                    <Link
                      to={blogRoute(
                        "/blog/" +
                          post.publishId +
                          "?topic=" +
                          encodeURIComponent(topic.slug),
                      )}
                    >
                      <span>{post.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
