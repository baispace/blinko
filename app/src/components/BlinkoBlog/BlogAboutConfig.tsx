import { BlogInput, BlogSelect, BlogTextarea } from "./BlogUI";
import { Button, Card, CardBody, CardHeader } from "@heroui/react";
import { Icon } from "@/components/Common/Iconify/icons";
import { blogImageUrl } from "@/lib/blogImage";
import { RootStore } from "@/store";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { ABOUT_FEATURED_MAX, ABOUT_TOPIC_MAX } from "@shared/lib/blogAbout";

export type FeaturedDraft = { noteId: number | ""; reason: string };
export type AboutDraft = {
  spaceIntro: string;
  signature: string;
  featuredPosts: FeaturedDraft[];
  aboutTopicIds: number[];
};

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
  const publishedPosts = posts.filter((p) => p.isPublished && !!p.publication);
  const publishedTopics = topics.filter((t) => t.isPublished);
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
    <div className="space-y-5">
      {/* 关于这个空间 */}
      <Card className="rounded-xl border border-default-200 shadow-none">
        <CardHeader className="pb-1">
          <h3 className="text-base font-semibold">关于这个空间</h3>
        </CardHeader>
        <CardBody className="space-y-4 pt-0">
          <p className="text-xs text-default-500">
            讲清楚这个站点用来做什么。与上面的「个人介绍」分开 ——
            个人介绍说「我是谁」，这里说「这里用来做什么」。
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-default-500">空间说明</span>
            <BlogTextarea
              className="w-full"
              rows={5}
              maxLength={2000}
              placeholder="例如：这里主要写工作方法与工具实践，也记录一些阅读笔记。"
              value={draft.spaceIntro}
              onChange={(e) => patch({ spaceIntro: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-default-500">头像旁签名（选填）</span>
            <BlogInput
              className="w-full"
              maxLength={80}
              placeholder="一句话，例如：保持好奇，持续记录"
              value={draft.signature}
              onChange={(e) => patch({ signature: e.target.value })}
            />
          </label>
        </CardBody>
      </Card>

      {/* 精选文章 */}
      <Card className="rounded-xl border border-default-200 shadow-none">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2 pb-1">
          <h3 className="text-base font-semibold">用几篇文章，认识我</h3>
          <Button
            size="sm"
            variant="flat"
            isDisabled={draft.featuredPosts.length >= ABOUT_FEATURED_MAX}
            onPress={() =>
              setFeatured([...draft.featuredPosts, { noteId: "", reason: "" }])
            }
          >
            ＋ 添加精选
          </Button>
        </CardHeader>
        <CardBody className="space-y-3 pt-0">
          <p className="text-xs text-default-500">
            最多 {ABOUT_FEATURED_MAX} 篇。推荐理由说明「为什么值得先读这篇」，
            不要重复文章摘要。没配置时公开页不显示这一块。
          </p>

          {draft.featuredPosts.length === 0 && (
            <p className="text-xs text-default-400">
              还没有精选文章 —— 公开页不会自动替你挑文章。
            </p>
          )}

          {draft.featuredPosts.map((item, index) => {
            const post = posts.find((p) => p.id === item.noteId);
            const withdrawn = !!post && !post.isPublished;
            return (
              <div key={index} className="space-y-2 rounded-lg border border-default-200 p-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-default-100 text-xs font-semibold">
                    {index + 1}
                  </span>
                  <BlogSelect
                    className="min-w-0 flex-1"
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
                  <Button
                    size="sm"
                    isIconOnly
                    variant="light"
                    aria-label="上移"
                    isDisabled={index === 0}
                    onPress={() => moveFeatured(index, -1)}
                  >
                    <Icon icon="tabler:chevron-up" width={14} />
                  </Button>
                  <Button
                    size="sm"
                    isIconOnly
                    variant="light"
                    aria-label="下移"
                    isDisabled={index === draft.featuredPosts.length - 1}
                    onPress={() => moveFeatured(index, 1)}
                  >
                    <Icon icon="tabler:chevron-down" width={14} />
                  </Button>
                  <Button
                    size="sm"
                    isIconOnly
                    variant="light"
                    color="danger"
                    aria-label="移除这篇精选"
                    onPress={() =>
                      setFeatured(
                        draft.featuredPosts.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <Icon icon="tabler:x" width={14} />
                  </Button>
                </div>
                {item.noteId !== "" && (
                  <div className="flex items-center gap-2.5">
                    {postCover(item.noteId) && (
                      <img
                        src={postCover(item.noteId)}
                        alt=""
                        className="h-10 w-14 shrink-0 rounded-lg object-cover"
                      />
                    )}
                    <BlogInput
                      className="min-w-0 flex-1"
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
                  <span className="text-xs text-danger">
                    这篇已经不是公开状态了，公开页会自动把它从精选里去掉。
                  </span>
                )}
                {item.noteId !== "" && !withdrawn && !item.reason.trim() && (
                  <span className="text-xs text-default-500">还没写推荐理由。</span>
                )}
              </div>
            );
          })}
        </CardBody>
      </Card>

      {/* 展示专题 */}
      <Card className="rounded-xl border border-default-200 shadow-none">
        <CardHeader className="pb-1">
          <h3 className="text-base font-semibold">我在记录什么</h3>
        </CardHeader>
        <CardBody className="space-y-3 pt-0">
          <p className="text-xs text-default-500">
            最多 {ABOUT_TOPIC_MAX} 个专题，顺序即展示顺序。
            留空则按专题的默认排序取前 {ABOUT_TOPIC_MAX} 个。
          </p>

          {draft.aboutTopicIds.length === 0 && (
            <p className="text-xs text-default-400">
              没有指定，将按默认顺序展示前 {ABOUT_TOPIC_MAX} 个已发布专题。
            </p>
          )}

          {draft.aboutTopicIds.map((id, index) => (
            <div key={id} className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-default-100 text-xs font-semibold">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 text-sm">
                {topicName(id)}
              </span>
              <Button
                size="sm"
                isIconOnly
                variant="light"
                aria-label="上移"
                isDisabled={index === 0}
                onPress={() => moveTopic(index, -1)}
              >
                <Icon icon="tabler:chevron-up" width={14} />
              </Button>
              <Button
                size="sm"
                isIconOnly
                variant="light"
                aria-label="下移"
                isDisabled={index === draft.aboutTopicIds.length - 1}
                onPress={() => moveTopic(index, 1)}
              >
                <Icon icon="tabler:chevron-down" width={14} />
              </Button>
              <Button
                size="sm"
                isIconOnly
                variant="light"
                color="danger"
                aria-label="移除这个专题"
                onPress={() =>
                  setTopics(draft.aboutTopicIds.filter((v) => v !== id))
                }
              >
                <Icon icon="tabler:x" width={14} />
              </Button>
            </div>
          ))}

          {unusedTopics.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {unusedTopics.map((topic) => (
                <Button
                  key={topic.id}
                  size="sm"
                  variant="flat"
                  isDisabled={draft.aboutTopicIds.length >= ABOUT_TOPIC_MAX}
                  startContent={<Icon icon="tabler:plus" width={13} />}
                  onPress={() => {
                    if (draft.aboutTopicIds.length >= ABOUT_TOPIC_MAX) {
                      RootStore.Get(ToastPlugin).error(
                        `最多展示 ${ABOUT_TOPIC_MAX} 个专题`,
                      );
                      return;
                    }
                    setTopics([...draft.aboutTopicIds, topic.id]);
                  }}
                >
                  {topic.name}
                </Button>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
