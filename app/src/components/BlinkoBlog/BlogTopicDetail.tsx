import { BlogInput, BlogTextarea, BlogSelect, BlogCheckbox } from "./BlogUI";
import { BlogStudioBrand } from "./BlogStudioBrand";
import { Button, Chip, Card, CardBody, CardHeader } from "@heroui/react";
import { confirmBlogAction } from "./confirmBlogAction";
import { markBlogManager } from "@/lib/blogDevice";
import { BlogTopicArrange } from "./BlogTopicArrange";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { api } from "@/lib/trpc";
import { getBlinkoEndpoint } from "@/lib/blinkoEndpoint";
import { getAvatarUrl } from "@/lib/profileIdentity";
import { UserStore } from "@/store/user";
import { RootStore } from "@/store";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { Icon } from "@/components/Common/Iconify/icons";
import {
  normalizeTopicDisplayMode,
  type TopicDisplayMode,
} from "@shared/lib/blogTopicMode";

type Post = Awaited<ReturnType<typeof api.blog.published.query>>[number];
type Topic = Awaited<ReturnType<typeof api.blog.topics.query>>[number];
type Arrangement = Awaited<ReturnType<typeof api.blog.topicSections.query>>;

const DISPLAY_MODE_OPTIONS: {
  value: TopicDisplayMode;
  label: string;
  desc: string;
}[] = [
  {
    value: "topic",
    label: "专题模式",
    desc: "保留现有专题介绍及文章列表。",
  },
  {
    value: "doc",
    label: "文档模式",
    desc: "以章节目录和正文为主，适合系列教程、手册与连续阅读。",
  },
];

function title(content: string, explicit = "") {
  if (explicit.trim()) return explicit.trim();
  return (
    content
      .replace(/<\/(?:p|div|h[1-6])>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .split("\n")
      .find((l) => l.trim())
      ?.replace(/^#{1,6}\s*/, "")
      .trim()
      .slice(0, 100) || "无标题"
  );
}

function notify(error: unknown, fallback = "操作失败，请重试") {
  RootStore.Get(ToastPlugin).error(
    error instanceof Error && error.message ? error.message : fallback,
  );
}

function imageUrl(path: string) {
  const endpoint = getBlinkoEndpoint("/"),
    token = RootStore.Get(UserStore).token || "";
  const result = getAvatarUrl(path, token, endpoint);
  try {
    const url = new URL(result),
      base = new URL(endpoint);
    if (
      url.origin === base.origin &&
      url.pathname.startsWith("/api/s3file/") &&
      token
    )
      url.searchParams.set("token", token);
    return url.toString();
  } catch {
    return "";
  }
}

function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    if (dirty) addEventListener("beforeunload", guard);
    return () => removeEventListener("beforeunload", guard);
  }, [dirty]);
}

function topicChildren(topics: Topic[], parentId: number | null) {
  return topics.filter((t) => (t.parentId ?? null) === parentId);
}

function descendantIds(topics: Topic[], rootId: number) {
  const result = new Set<number>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const child of topicChildren(topics, current)) {
      if (result.has(child.id)) continue;
      result.add(child.id);
      queue.push(child.id);
    }
  }
  return result;
}

export function BlogTopicDetail() {
  useEffect(() => { markBlogManager(); }, []);
  const { topicId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isNew = topicId === "new";
  const id = Number(topicId);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [generatingCover, setGeneratingCover] = useState(false);
  const [generatedCovers, setGeneratedCovers] = useState<
    { id: number; path: string; name: string }[]
  >([]);
  const [arrangementDirty, setArrangementDirty] = useState(false);
  const chapterArea = useRef<HTMLDivElement>(null);
  const working = busy || generatingCover;

  const topic = useMemo(
    () => (isNew ? null : (topics.find((t) => t.id === id) ?? null)),
    [topics, id, isNew],
  );
  const badId = !isNew && (!Number.isInteger(id) || id <= 0);
  const missing = badId || (!loading && !topic);

  const buildDraft = (t: Topic | null) => ({
    name: t?.name || "",
    slug: t?.slug || "",
    desc: t?.desc || "",
    color: t?.color || "#7055ff",
    isPublished: t?.isPublished || false,
    showInNav: t?.showInNav ?? true,
    isFeatured: t?.isFeatured ?? false,
    parentId: t?.parentId ?? null,
    coverTitle: t?.coverTitle || "",
    coverAttachmentId: t?.coverAttachmentId ?? null,
    displayMode: normalizeTopicDisplayMode(t?.displayMode) as TopicDisplayMode,
    defaultNoteId: t?.defaultNoteId ?? null,
    noteIds: t?.noteIds || [],
  });

  const load = useCallback(async () => {
    const [t, p] = await Promise.all([
      api.blog.topics.query(),
      api.blog.published.query(),
    ]);
    setTopics(t);
    setPosts(p);
    setError("");
  }, []);

  useEffect(() => {
    setLoading(true);
    void load()
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [load]);

  const [arrangement, setArrangement] = useState<Arrangement | null>(null);
  const sectionStats = useMemo(
    () =>
      arrangement
        ? {
            sections: arrangement.sections.length,
            unassigned: arrangement.unassignedNoteIds.length,
          }
        : null,
    [arrangement],
  );
  useEffect(() => {
    if (!topic?.id) {
      setArrangement(null);
      return;
    }
    let alive = true;
    api.blog.topicSections
      .query({ topicId: topic.id })
      .then((r) => {
        if (!alive) return;
        setArrangement(r);
      })
      .catch(() => {
        if (!alive) setArrangement(null);
      });
    return () => {
      alive = false;
    };
  }, [topic?.id]);

  useEffect(() => {
    if (topic && location.hash === "#chapters")
      chapterArea.current?.scrollIntoView({ block: "start" });
  }, [topic?.id, location.hash]);

  const [draft, setDraft] = useState(() => buildDraft(topic));
  const initial = useRef(JSON.stringify(draft));
  const dirty = JSON.stringify(draft) !== initial.current;
  useLeaveGuard(dirty || arrangementDirty);

  useEffect(() => {
    const next = buildDraft(topic);
    setDraft(next);
    initial.current = JSON.stringify(next);
    setPicking(false);
    setGeneratedCovers([]);
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic?.id]);

  const patch = (p: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...p }));
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const saved = await api.blog.saveTopic.mutate({
        ...draft,
        noteIds: isNew ? draft.noteIds : undefined,
        id: topic?.id,
        slug: draft.slug || undefined,
        coverAttachmentId: draft.coverAttachmentId,
        defaultNoteId: arrangement
          ? defaultArticleValue
            ? Number(defaultArticleValue)
            : null
          : undefined,
      });
      await load();
      RootStore.Get(ToastPlugin).success("专题已保存");
      initial.current = JSON.stringify(draft);
      if (isNew && saved?.id)
        navigate(`/blog-manage/topic/${saved.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const generateCover = async () => {
    if (!topic || working) return;
    setGeneratingCover(true);
    setError("");
    try {
      const image = await api.blog.generateTopicCover.mutate({
        topicId: topic.id,
        name: draft.name,
        desc: draft.desc,
      });
      setGeneratedCovers((previous) => [image, ...previous]);
      patch({ coverAttachmentId: image.id });
      RootStore.Get(ToastPlugin).success("封面已生成，保存资料后应用到专题。");
    } catch (error) {
      setError(error instanceof Error ? error.message : "生成失败，请重试。");
    } finally {
      setGeneratingCover(false);
    }
  };
  const chaptersSaved = async () => {
    await load();
    if (topic) {
      const next = await api.blog.topicSections.query({ topicId: topic.id });
      setArrangement(next);
    }
  };
  const goBack = async () => {
    if ((dirty || arrangementDirty) && !await confirmBlogAction("有未保存的修改，确定离开？"))
      return;
    navigate("/blog-manage?section=topics");
  };
  const remove = async () => {
    if (!topic) return;
    if (!await confirmBlogAction("删除专题只解除关联，不会删除文章。确定删除？")) return;
    setBusy(true);
    try {
      await api.blog.deleteTopic.mutate({ id: topic.id });
      RootStore.Get(ToastPlugin).success("专题已删除");
      navigate("/blog-manage?section=topics", { replace: true });
    } catch (e) {
      notify(e, "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const excluded = topic ? descendantIds(topics, topic.id) : new Set<number>();
  const parentOptions = topics.filter((t) => !excluded.has(t.id));
  const coverCandidates = useMemo(() => {
    const map = new Map<number, { id: number; path: string; name: string }>();
    const memberIds = new Set(draft.noteIds);
    posts.forEach((p) => {
      const relevant = memberIds.has(p.id) || p.publication?.coverAttachmentId;
      if (!relevant) return;
      p.attachments
        .filter((a) => /^image\/(png|jpeg|webp|gif|avif)$/.test(a.type))
        .forEach((a) => {
          if (!map.has(a.id))
            map.set(a.id, { id: a.id, path: a.path, name: a.name });
        });
    });
    generatedCovers.forEach((image) => map.set(image.id, image));
    return [...map.values()];
  }, [posts, draft.noteIds, generatedCovers]);
  const currentCover = useMemo(() => {
    if (!draft.coverAttachmentId) return null;
    const candidate = generatedCovers.find(
      (image) => image.id === draft.coverAttachmentId,
    );
    if (candidate) return candidate;
    const direct = topic?.cover;
    if (direct?.id === draft.coverAttachmentId) return direct;
    for (const p of posts) {
      const hit = p.attachments.find((a) => a.id === draft.coverAttachmentId);
      if (hit) return hit;
    }
    return null;
  }, [topic?.cover, posts, draft.coverAttachmentId, generatedCovers]);

  const defaultArticleOptions = useMemo(() => {
    if (!arrangement) return [];
    const postById = new Map(posts.map((p) => [p.id, p]));
    const usable = (noteId: number) => {
      const post = postById.get(noteId);
      return !!post && post.isPublished && !post.isRecycle && !!post.publication;
    };
    const options: { id: number; title: string; section: string }[] = [];
    for (const section of arrangement.sections) {
      for (const noteId of section.noteIds) {
        if (!usable(noteId)) continue;
        const post = postById.get(noteId);
        if (!post) continue;
        options.push({
          id: noteId,
          title: title(post.content || "", post.publication?.title || ""),
          section: section.name,
        });
      }
    }
    for (const noteId of arrangement.unassignedNoteIds) {
      if (!usable(noteId)) continue;
      const post = postById.get(noteId);
      if (!post) continue;
      options.push({
        id: noteId,
        title: title(post.content || "", post.publication?.title || ""),
        section: "未分章节",
      });
    }
    return options;
  }, [arrangement, posts]);

  const defaultArticleValue = useMemo(() => {
    const id = draft.defaultNoteId;
    if (!id) return "";
    return defaultArticleOptions.some((o) => o.id === id) ? String(id) : "";
  }, [draft.defaultNoteId, defaultArticleOptions]);

  const defaultArticleStale =
    !!arrangement && !!draft.defaultNoteId && !defaultArticleValue;

  /* ---------- 共用布局片段 ---------- */

  const topBar = (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-default-200 bg-background px-4">
      <BlogStudioBrand className="text-sm" />
      <span className="flex-1" />
      <Button
        size="sm"
        variant="light"
        as="a"
        href="/blog"
        target="_blank"
        rel="noopener noreferrer"
        startContent={<Icon icon="tabler:external-link" width={15} />}
      >
        查看公开站
      </Button>
      <Button size="sm" variant="flat" onPress={goBack}>
        返回专题
      </Button>
    </header>
  );

  const pageHeader = (
    <div className="mb-6 min-w-0">
      <nav className="mb-2 flex items-center gap-1.5 text-xs text-default-500">
        <button
          type="button"
          className="transition-colors hover:text-foreground"
          onClick={(e) => { e.preventDefault(); navigate("/blog-manage"); }}
        >
          博客管理
        </button>
        <Icon icon="tabler:chevron-right" width={12} />
        <button
          type="button"
          className="transition-colors hover:text-foreground"
          onClick={(e) => { e.preventDefault(); goBack(); }}
        >
          专题
        </button>
        <Icon icon="tabler:chevron-right" width={12} />
        <span className="truncate text-default-700">
          {topic?.name || (isNew ? "新建专题" : missing ? "专题不存在" : "加载中…")}
        </span>
      </nav>
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">
          {topic ? "专题管理" : "新建专题"}
        </h1>
        {topic && (
          <Chip
            size="sm"
            variant="flat"
            color={topic.isPublished ? "success" : "default"}
          >
            {topic.isPublished ? "已公开" : "未公开"}
          </Chip>
        )}
      </div>
      <p className="mt-1 text-sm text-default-500">
        专题设置保存后立即生效。
        {topic && sectionStats
          ? ` 当前 ${sectionStats.sections} 个章节，${sectionStats.unassigned} 篇未分章节。`
          : ""}
      </p>
      <div className="mt-3 flex items-center gap-2">
        {topic && (
          <>
            <Button
              size="sm"
              variant="flat"
              isDisabled={working}
              startContent={<Icon icon="tabler:layout-list" width={15} />}
              onPress={() =>
                chapterArea.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })
              }
            >
              编排章节
            </Button>
            {topic.isPublished && (
              <Button
                size="sm"
                variant="light"
                as="a"
                href={`/blog/t/${topic.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                endContent={<Icon icon="tabler:external-link" width={14} />}
              >
                查看专题
              </Button>
            )}
          </>
        )}
        <span className="flex-1" />
        <Button
          size="sm"
          color="primary"
          isDisabled={working || !draft.name.trim() || (!dirty && !!topic)}
          onPress={() => void save()}
        >
          {busy ? "保存中…" : "保存资料"}
        </Button>
      </div>
    </div>
  );

  const shellClass = "flex min-h-screen flex-col bg-background text-foreground";

  if (missing)
    return (
      <div className={shellClass}>
        {topBar}
        <div className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center px-6">
          <div className="text-center">
            <h2 className="text-lg font-semibold">专题不存在</h2>
            <p className="mt-1 text-sm text-default-500">它可能已经被删除了。</p>
            <Button className="mt-4" variant="flat" onPress={goBack}>
              返回专题列表
            </Button>
          </div>
        </div>
      </div>
    );

  if (loading && !topics.length)
    return (
      <div className={shellClass}>
        {topBar}
        <div className="mx-auto w-full max-w-3xl px-6 py-10">
          <p className="text-center text-sm text-default-500" role="status">
            正在加载专题…
          </p>
        </div>
      </div>
    );

  return (
    <div className={shellClass}>
      {topBar}

      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 lg:px-8">
        {pageHeader}

        {error && (
          <div className="mb-4 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="space-y-5">
          {/* ---------- 基本信息 ---------- */}
          <Card className="rounded-xl border border-default-200 shadow-none">
            <details open>
              <summary className="flex cursor-pointer items-center justify-between px-5 py-3.5 select-none">
                <div className="min-w-0">
                  <strong className="text-sm font-semibold">基本信息</strong>
                  <span className="ml-2 truncate text-xs text-default-500">
                    {draft.name || "填写专题名称、简介和链接"}
                  </span>
                </div>
                <small className="shrink-0 text-xs text-default-400">收起</small>
              </summary>
              <CardBody className="grid grid-cols-1 gap-5 pt-0 md:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-default-500">名称</span>
                  <BlogInput
                    className="w-full"
                    maxLength={60}
                    value={draft.name}
                    onChange={(e) => patch({ name: e.target.value })}
                    placeholder="如：产品思考"
                  />
                </label>

                <label className="flex flex-col gap-1.5 md:col-span-2">
                  <span className="text-xs font-medium text-default-500">简介</span>
                  <BlogTextarea
                    className="w-full"
                    rows={3}
                    maxLength={500}
                    value={draft.desc}
                    onChange={(e) => patch({ desc: e.target.value })}
                    placeholder="一句话说明这个专题在讲什么"
                  />
                </label>

                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <span className="text-xs font-medium text-default-500">页面链接 (Slug)</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-default-400">/topics/</span>
                    <BlogInput
                      value={draft.slug}
                      maxLength={80}
                      readOnly={!!topic}
                      placeholder="product-thinking"
                      onChange={(e) =>
                        patch({
                          slug: e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9-]/g, "-")
                            .replace(/-+/g, "-"),
                        })
                      }
                    />
                  </div>
                  {!!topic && (
                    <span className="text-xs text-default-500">
                      标识创建后不可改，避免公开链接失效。
                    </span>
                  )}
                </div>

                {/* 展示方式 */}
                <fieldset className="flex flex-col gap-2 md:col-span-2">
                  <legend className="text-xs font-medium text-default-500">展示方式</legend>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {DISPLAY_MODE_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-sm transition-colors ${
                          draft.displayMode === option.value
                            ? "border-primary bg-primary/5"
                            : "border-default-200 hover:border-default-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="topic-display-mode"
                          value={option.value}
                          checked={draft.displayMode === option.value}
                          onChange={() =>
                            patch({ displayMode: option.value as TopicDisplayMode })
                          }
                          className="mt-0.5"
                        />
                        <div>
                          <strong className="font-semibold">{option.label}</strong>
                          <small className="mt-0.5 block text-xs text-default-500">
                            {option.desc}
                          </small>
                        </div>
                      </label>
                    ))}
                  </div>
                </fieldset>

                {/* 默认打开文章 */}
                {draft.displayMode === "doc" && (
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <span className="text-xs font-medium text-default-500">默认打开文章</span>
                    <BlogSelect
                      className="w-full"
                      value={defaultArticleValue}
                      onChange={(e) =>
                        patch({
                          defaultNoteId: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                    >
                      <option value="">自动选择第一篇公开文章</option>
                      {defaultArticleOptions.map((option) => (
                        <option key={option.id} value={String(option.id)}>
                          {option.section} · {option.title}
                        </option>
                      ))}
                    </BlogSelect>
                    <small className="text-xs text-default-500">
                      未指定，或指定的文章已撤回、移出专题、被删除时，自动打开编排中的第一篇公开文章。
                    </small>
                    {defaultArticleStale && (
                      <small className="text-xs text-warning">
                        原设置的文章已经不可访问，保存后将自动改为第一篇公开文章。
                      </small>
                    )}
                  </div>
                )}
              </CardBody>
            </details>
          </Card>

          {/* ---------- 封面与展示 ---------- */}
          <Card className="rounded-xl border border-default-200 shadow-none">
            <CardHeader className="flex flex-col items-start gap-1 pb-1">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Icon icon="tabler:photo" width={17} />
                封面与展示
              </h2>
              <p className="text-xs text-default-500">专题页首屏的封面、颜色与导航位置</p>
            </CardHeader>
            <CardBody className="space-y-5 pt-2">
              {/* 封面 */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-default-500">封面</span>
                <div className="flex h-40 w-full items-center justify-center overflow-hidden rounded-xl border border-default-200 bg-default-50">
                  {currentCover ? (
                    <img
                      className="h-full w-full object-cover"
                      src={imageUrl(currentCover.path)}
                      alt="专题封面"
                    />
                  ) : (
                    <span className="text-sm text-default-400">
                      未设置封面 · 公开站会显示专题色块
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    color="primary"
                    isDisabled={!topic || working || !draft.name.trim()}
                    startContent={<Icon icon="tabler:sparkles" width={15} />}
                    onPress={() => void generateCover()}
                  >
                    {generatingCover ? "正在生成…" : "AI 生成封面"}
                  </Button>
                  <Button
                    size="sm"
                    variant="flat"
                    startContent={<Icon icon="tabler:photo" width={15} />}
                    onPress={() => setPicking((v) => !v)}
                  >
                    {picking ? "收起封面选择" : "更换封面"}
                  </Button>
                  {!topic && (
                    <small className="text-xs text-default-500">
                      先保存专题，再根据名称和简介生成封面。
                    </small>
                  )}
                  {draft.coverAttachmentId !== null && (
                    <Button
                      size="sm"
                      variant="light"
                      onPress={() => patch({ coverAttachmentId: null })}
                    >
                      使用专题色块
                    </Button>
                  )}
                </div>
                {picking && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {coverCandidates.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`overflow-hidden rounded-lg border-2 transition-colors ${
                          draft.coverAttachmentId === c.id
                            ? "border-primary"
                            : "border-transparent hover:border-default-300"
                        }`}
                        aria-label={`选择封面 ${c.name}`}
                        aria-pressed={draft.coverAttachmentId === c.id}
                        onClick={() => {
                          patch({ coverAttachmentId: c.id });
                          setPicking(false);
                        }}
                      >
                        <img
                          className="h-24 w-full object-cover"
                          src={imageUrl(c.path)}
                          alt={c.name}
                        />
                      </button>
                    ))}
                    {!coverCandidates.length && (
                      <p className="col-span-full text-sm text-default-500">
                        还没有可选的图片，先把文章发布并设置封面。
                      </p>
                    )}
                  </div>
                )}
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-default-500">
                    封面短标题（最多 24 字）
                  </span>
                  <BlogInput
                    className="w-full"
                    maxLength={24}
                    value={draft.coverTitle}
                    onChange={(e) => patch({ coverTitle: e.target.value })}
                    placeholder="留空则用专题名"
                  />
                </label>
              </div>

              {/* 上级专题 + 颜色 */}
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-default-500">上级专题</span>
                  <BlogSelect
                    className="w-full"
                    value={draft.parentId ?? ""}
                    onChange={(e) =>
                      patch({
                        parentId: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">顶级专题</option>
                    {parentOptions.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </BlogSelect>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-default-500">专题颜色</span>
                  <span className="flex items-center gap-2.5">
                    <input
                      type="color"
                      className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent"
                      value={draft.color}
                      onChange={(e) => patch({ color: e.target.value })}
                      aria-label="专题颜色"
                    />
                    <span className="text-xs text-default-500">{draft.color}</span>
                  </span>
                </label>
              </div>

              {/* 公开 / 导航 / 推荐 */}
              <div className="space-y-3">
                <label className="flex items-center gap-2.5">
                  <BlogCheckbox
                    toggle
                    type="checkbox"
                    checked={draft.isPublished}
                    onChange={(e) => patch({ isPublished: e.target.checked })}
                  />
                  <span className="text-sm">公开专题页</span>
                </label>
                <p className="text-xs text-default-500">
                  关闭后专题页不对外访问，文章仍单独公开。
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <BlogCheckbox
                      aria-label="导航展示"
                      type="checkbox"
                      checked={draft.showInNav}
                      onChange={(e) => patch({ showInNav: e.target.checked })}
                    />
                    导航展示
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <BlogCheckbox
                      aria-label="首页推荐"
                      type="checkbox"
                      checked={draft.isFeatured}
                      onChange={(e) => patch({ isFeatured: e.target.checked })}
                    />
                    首页推荐
                  </label>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* ---------- 底部操作 ---------- */}
          <div className="flex items-center justify-between rounded-xl border border-default-200 bg-surface px-5 py-3.5">
            <span className="text-sm text-default-500">
              {dirty ? "有未保存修改。" : "专题设置保存后立即生效。"}
            </span>
            <div className="flex items-center gap-2.5">
              {topic && (
                <Button
                  size="sm"
                  variant="flat"
                  color="danger"
                  isDisabled={working}
                  onPress={() => void remove()}
                >
                  删除专题
                </Button>
              )}
              <Button
                size="sm"
                color="primary"
                isDisabled={working || !draft.name.trim() || (!dirty && !!topic)}
                onPress={() => void save()}
              >
                {busy ? "保存中…" : "保存资料"}
              </Button>
            </div>
          </div>

          {/* ---------- 章节与文章 ---------- */}
          <section id="chapters" ref={chapterArea}>
            <div className="mb-3">
              <h2 className="text-base font-semibold">章节与文章</h2>
              <p className="text-xs text-default-500">
                直接添加章节、拖动文章编排；保存编排后更新公开目录。
              </p>
            </div>
            {topic ? (
              <BlogTopicArrange
                topicId={topic.id}
                embedded
                onSaved={chaptersSaved}
                onDirtyChange={setArrangementDirty}
              />
            ) : (
              <p className="text-sm text-default-500">保存专题后即可添加章节与文章。</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
