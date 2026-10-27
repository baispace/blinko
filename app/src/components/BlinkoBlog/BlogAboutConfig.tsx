import { BlogButton, BlogInput, BlogSelect, BlogTextarea } from "./BlogUI";
import { Icon } from "@/components/Common/Iconify/icons";
import { blogImageUrl } from "@/lib/blogImage";
import { RootStore } from "@/store";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { ABOUT_FEATURED_MAX, ABOUT_TOPIC_MAX } from "@shared/lib/blogAbout";

/**
 * 关于页的可配置项。
 *
 * 三件事，都在「公开作者」面板里配置，不另开一个管理分区：
 *   1. 精选文章：最多 3 篇公开文章 + 每篇一句推荐理由 + 顺序；
 *   2. 展示专题：最多 4 个 + 顺序（留空则按专题默认排序取前 4）；
 *   3. 站点说明：这个空间用来做什么（与个人介绍分开）。
 *
 * 精选只列当前已发布的文章 —— 撤回或转私有的文章不该被选进来。
 * 已经选过、但后来变成未发布的，会在列表里标出来提醒作者。
 */

export type FeaturedDraft = { noteId: number | ""; reason: string };
export type AboutDraft = {
  spaceIntro: string;
  signature: string;
  featuredPosts: FeaturedDraft[];
  aboutTopicIds: number[];
};

/** 后台文章列表里用到的字段（结构化定义，避免把整个 trpc 类型拖进来）。 */
type Post = {
  id: number;
  title: string;
  isPublished: boolean;
  publication?: { title?: string | null; coverAttachmentId?: number | null } | null;
  attachments?: { id: number; path: string }[];
};

type Topic = {
  id: number;
  name: string;
  isPublished: boolean;
};

export function BlogAboutConfig({
  draft,
  patch,
  posts,
  topics,
}: {
  draft: AboutDraft;
  patch: (p: Partial<AboutDraft>) => void;
  posts: Post[];
  topics: Topic[];
}) {
  /** 只有当前公开的文章能被选为精选。 */
  const publishedPosts = posts.filter((p) => p.isPublished && !!p.publication);
  const publishedTopics = topics.filter((t) => t.isPublished);
  const postTitle = (id: number) => {
    const post = posts.find((p) => p.id === id);
    return post?.publication?.title || post?.title || `文章 #${id}`;
  };
  const postCover = (id: number) => {
    const post = posts.find((p) => p.id === id);
    const cover = post?.attachments?.find(
      (a) => a.id === post.publication?.coverAttachmentId,
    );
    return cover ? blogImageUrl(cover.path) : "";
  };
  const topicName = (id: number) =>
    topics.find((t) => t.id === id)?.name || `专题 #${id}`;

  const setFeatured = (next: FeaturedDraft[]) =>
    patch({ featuredPosts: next });

  const moveFeatured = (index: number, delta: -1 | 1) => {
    const next = [...draft.featuredPosts];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setFeatured(next);
  };

  const setTopics = (ids: number[]) => patch({ aboutTopicIds: ids });

  const moveTopic = (index: number, delta: -1 | 1) => {
    const next = [...draft.aboutTopicIds];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setTopics(next);
  };

  const unusedTopics = publishedTopics.filter(
    (t) => !draft.aboutTopicIds.includes(t.id),
  );

  return (
    <>
      <div className="ink-mg-panel ink-mg-section" style={{ gap: 14 }}>
        <div className="ink-mg-section-head">
          <h3 className="ink-mg-section-title">关于这个空间</h3>
        </div>
        <p className="ink-mg-sub">
          讲清楚这个站点用来做什么。与上面的「个人介绍」分开 ——
          个人介绍说「我是谁」，这里说「这里用来做什么」。
        </p>
        <label className="ink-mg-section" style={{ gap: 6 }}>
          <span className="ink-mg-sub">空间说明</span>
          <BlogTextarea
            className="ink-mg-field"
            rows={5}
            maxLength={2000}
            placeholder="例如：这里主要写工作方法与工具实践，也记录一些阅读笔记。"
            value={draft.spaceIntro}
            onChange={(e) => patch({ spaceIntro: e.target.value })}
          />
        </label>
        <label className="ink-mg-section" style={{ gap: 6 }}>
          <span className="ink-mg-sub">头像旁签名（选填）</span>
          <BlogInput
            className="ink-mg-field"
            maxLength={80}
            placeholder="一句话，例如：保持好奇，持续记录"
            value={draft.signature}
            onChange={(e) => patch({ signature: e.target.value })}
          />
        </label>
      </div>

      <div className="ink-mg-panel ink-mg-section" style={{ gap: 14 }}>
        <div className="ink-mg-section-head">
          <h3 className="ink-mg-section-title">用几篇文章，认识我</h3>
          <BlogButton
            className="ink-mg-button"
            disabled={draft.featuredPosts.length >= ABOUT_FEATURED_MAX}
            onClick={() =>
              setFeatured([...draft.featuredPosts, { noteId: "", reason: "" }])
            }
          >
            ＋ 添加精选
          </BlogButton>
        </div>
        <p className="ink-mg-sub">
          最多 {ABOUT_FEATURED_MAX} 篇。推荐理由说明「为什么值得先读这篇」，
          不要重复文章摘要。没配置时公开页不显示这一块。
        </p>

        {draft.featuredPosts.length === 0 && (
          <p className="ink-mg-hint">
            还没有精选文章 —— 公开页不会自动替你挑文章。
          </p>
        )}

        {draft.featuredPosts.map((item, index) => {
          const post = posts.find((p) => p.id === item.noteId);
          const withdrawn = !!post && !post.isPublished;
          return (
            <div key={index} className="ink-mg-section" style={{ gap: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="ink-mg-topic-count">{index + 1}</span>
                <BlogSelect
                  className="ink-mg-field"
                  style={{ flex: 1, minWidth: 0 }}
                  aria-label={`第 ${index + 1} 篇精选文章`}
                  value={item.noteId === "" ? "" : String(item.noteId)}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFeatured(
                      draft.featuredPosts.map((row, i) =>
                        i === index
                          ? { ...row, noteId: value ? Number(value) : "" }
                          : row,
                      ),
                    );
                  }}
                >
                  <option value="">选择一篇已公开的文章…</option>
                  {publishedPosts.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.publication?.title || p.title}
                    </option>
                  ))}
                </BlogSelect>
                <BlogButton
                  className="ink-mg-mini"
                  aria-label="上移"
                  disabled={index === 0}
                  onClick={() => moveFeatured(index, -1)}
                >
                  ↑
                </BlogButton>
                <BlogButton
                  className="ink-mg-mini"
                  aria-label="下移"
                  disabled={index === draft.featuredPosts.length - 1}
                  onClick={() => moveFeatured(index, 1)}
                >
                  ↓
                </BlogButton>
                <BlogButton
                  className="ink-mg-mini"
                  aria-label="移除这篇精选"
                  onClick={() =>
                    setFeatured(
                      draft.featuredPosts.filter((_, i) => i !== index),
                    )
                  }
                >
                  ×
                </BlogButton>
              </div>
              {item.noteId !== "" && (
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {postCover(item.noteId) && (
                    <img
                      src={postCover(item.noteId)}
                      alt=""
                      style={{
                        width: 56,
                        height: 42,
                        objectFit: "cover",
                        borderRadius: 8,
                        flex: "none",
                      }}
                    />
                  )}
                  <BlogInput
                    className="ink-mg-field"
                    style={{ flex: 1, minWidth: 0 }}
                    maxLength={120}
                    placeholder="推荐理由：为什么值得先读这篇"
                    value={item.reason}
                    onChange={(e) =>
                      setFeatured(
                        draft.featuredPosts.map((row, i) =>
                          i === index ? { ...row, reason: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </div>
              )}
              {withdrawn && (
                <span className="ink-mg-hint" style={{ color: "var(--ink-warn, #d9482f)" }}>
                  这篇已经不是公开状态了，公开页会自动把它从精选里去掉。
                </span>
              )}
              {item.noteId !== "" && !withdrawn && !item.reason.trim() && (
                <span className="ink-mg-hint">还没写推荐理由。</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="ink-mg-panel ink-mg-section" style={{ gap: 14 }}>
        <div className="ink-mg-section-head">
          <h3 className="ink-mg-section-title">我在记录什么</h3>
        </div>
        <p className="ink-mg-sub">
          最多 {ABOUT_TOPIC_MAX} 个专题，顺序即展示顺序。
          留空则按专题的默认排序取前 {ABOUT_TOPIC_MAX} 个。
        </p>

        {draft.aboutTopicIds.length === 0 && (
          <p className="ink-mg-hint">
            没有指定，将按默认顺序展示前 {ABOUT_TOPIC_MAX} 个已发布专题。
          </p>
        )}

        {draft.aboutTopicIds.map((id, index) => (
          <div key={id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="ink-mg-topic-count">{index + 1}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
              {topicName(id)}
            </span>
            <BlogButton
              className="ink-mg-mini"
              aria-label="上移"
              disabled={index === 0}
              onClick={() => moveTopic(index, -1)}
            >
              ↑
            </BlogButton>
            <BlogButton
              className="ink-mg-mini"
              aria-label="下移"
              disabled={index === draft.aboutTopicIds.length - 1}
              onClick={() => moveTopic(index, 1)}
            >
              ↓
            </BlogButton>
            <BlogButton
              className="ink-mg-mini"
              aria-label="移除这个专题"
              onClick={() =>
                setTopics(draft.aboutTopicIds.filter((v) => v !== id))
              }
            >
              ×
            </BlogButton>
          </div>
        ))}

        {unusedTopics.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {unusedTopics.map((topic) => (
              <BlogButton
                key={topic.id}
                className="ink-mg-mini"
                disabled={draft.aboutTopicIds.length >= ABOUT_TOPIC_MAX}
                onClick={() => {
                  if (draft.aboutTopicIds.length >= ABOUT_TOPIC_MAX) {
                    RootStore.Get(ToastPlugin).error(
                      `最多展示 ${ABOUT_TOPIC_MAX} 个专题`,
                    );
                    return;
                  }
                  setTopics([...draft.aboutTopicIds, topic.id]);
                }}
              >
                <Icon icon="tabler:plus" width={13} />
                {topic.name}
              </BlogButton>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
