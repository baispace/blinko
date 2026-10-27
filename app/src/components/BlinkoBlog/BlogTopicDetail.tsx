import { BlogButton, BlogChip, BlogInput, BlogTextarea, BlogSelect, BlogCheckbox } from "./BlogUI";
import { confirmBlogAction } from "./confirmBlogAction";
import { markBlogManager } from "@/lib/blogDevice";
import "./blog.css";
import "./manage.css";
import "./article.css";
import "./topic-workspace.css";
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
/** 专题的章节编排：章节 + 每章文章 + 未分章节的文章。 */
type Arrangement = Awaited<ReturnType<typeof api.blog.topicSections.query>>;

/**
 * 展示方式的两个选项。
 *
 * 说明只写「排版上有什么不同」，不写实现细节 —— 作者要判断的是
 * 「这个专题适合让人一篇篇读下去，还是适合先看介绍再挑着看」。
 */
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

/** 公开站与管理页共用同一个明暗键。 */
const THEME_KEY = "ink-blog-theme";
function readTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

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

/** 有未保存修改时拦一下刷新 / 关闭标签页。 */
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

/** 专题树：按 parentId 分组，父在前、子按原顺序。 */
function topicChildren(topics: Topic[], parentId: number | null) {
  return topics.filter((t) => (t.parentId ?? null) === parentId);
}

/** 连同自己在内的所有子孙 —— 上级专题下拉里要把它们排除掉。 */
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

/**
 * 专题详情页。
 *
 * 专题列表不再右侧挂表单：点「编辑专题」直接落到这个全屏页面，
 * 一个页面只干一件事 —— 改专题自己的设置、封面与文章归属。
 * 资料折叠、封面与章节编排共用当前页面。
 */
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
  const [theme, setTheme] = useState(readTheme);
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
  /** URL 里的 id 不是正整数，或者专题已被删掉，都算「找不到」。 */
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
    // 展示方式：老专题没这个字段时按专题模式处理，行为不变。
    displayMode: normalizeTopicDisplayMode(t?.displayMode) as TopicDisplayMode,
    // 默认打开的文章：文档模式才用得上。切回专题模式也留着，不影响展示。
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

  useEffect(() => {
    writeTheme(theme);
  }, [theme]);

  /**
   * 章节编排：既是「章节编排」入口的上下文，也是「默认打开文章」的候选来源。
   *
   * 候选必须来自编排 —— 只有排在这个专题里的文章才能当默认文章。
   */
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

  // 切换专题时重置草稿：上一个专题的未保存内容不能带到下一个。
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
        /**
         * 编排还没加载出来时不动这一项：
         * 宁可保持原样，也不要因为一次盲写把作者设好的默认文章清掉。
         */
        defaultNoteId: arrangement
          ? defaultArticleValue
            ? Number(defaultArticleValue)
            : null
          : undefined,
      });
      await load();
      RootStore.Get(ToastPlugin).success("专题已保存");
      initial.current = JSON.stringify(draft);
      // 新建保存后换成正式地址，避免停在 /new 上再存一次变成第二个专题。
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

  // 上级专题下拉：排除自己与自己的子孙，避免选出一个环。
  const excluded = topic ? descendantIds(topics, topic.id) : new Set<number>();
  const parentOptions = topics.filter((t) => !excluded.has(t.id));
  // 专题封面候选：成员文章的公开封面 + 已发布文章的附件。
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

  /**
   * 默认打开文章的候选：编排里、且当前公开可访问的文章。
   *
   * 章节名一起带上 —— 同名文章不少，只看标题分不清是哪一篇。
   */
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

  /**
   * 选中的默认文章（存的是笔记 id）。
   *
   * 存着的文章已经不可用时按「自动」处理 —— 前台读的时候还会再校验一次，
   * 两边都不会因为一条过期设置把专题页弄挂。
   */
  const defaultArticleValue = useMemo(() => {
    const id = draft.defaultNoteId;
    if (!id) return "";
    return defaultArticleOptions.some((o) => o.id === id) ? String(id) : "";
  }, [draft.defaultNoteId, defaultArticleOptions]);

  /** 存着的默认文章已经不可用了：告诉作者一句，别静默改掉。 */
  const defaultArticleStale =
    !!arrangement && !!draft.defaultNoteId && !defaultArticleValue;


  const header = (
    <>
      <header className="ink-ad-topbar">
        <div className="ink-ad-wrap">
          <div className="ink-ad-topbar-inner">
            <span className="ink-mg-brand">
              Ink
              <small>博客管理</small>
            </span>
            <span style={{ flex: 1 }} />
            <BlogButton
              className="ink-mg-button ink-mg-button-ghost"
              onClick={() =>
                setTheme((v) => (v === "light" ? "dark" : "light"))
              }
              aria-label="切换明暗主题"
            >
              <Icon icon="tabler:adjustments" width={16} />
              {theme === "light" ? "浅色" : "深色"}
            </BlogButton>
            <a
              className="ink-mg-button"
              href="/blog"
              target="_blank"
              rel="noopener noreferrer"
            >
              查看公开站 <Icon icon="tabler:external-link" width={15} />
            </a>
            <BlogButton className="ink-mg-button" onClick={goBack}>
              返回专题
            </BlogButton>
          </div>
        </div>
      </header>

      <div className="ink-ad-wrap">
        <div className="ink-ad-head">
          <div style={{ minWidth: 0 }}>
            <p className="ink-ad-crumb">
              <a
                href="/blog-manage"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/blog-manage");
                }}
              >
                博客管理
              </a>
              <Icon icon="tabler:chevron-right" width={13} />
              <a
                href="/blog-manage?section=topics"
                onClick={(e) => {
                  e.preventDefault();
                  goBack();
                }}
              >
                专题
              </a>
              <Icon icon="tabler:chevron-right" width={13} />
              <span>
                {topic?.name ||
                  (isNew ? "新建专题" : missing ? "专题不存在" : "加载中…")}
              </span>
            </p>
            <h1 className="ink-ad-title">
              {topic ? "专题管理" : "新建专题"}
              {topic && (
                <BlogChip
                  color={topic.isPublished ? "success" : "default"}
                  variant="flat"
                >
                  {topic.isPublished ? "已公开" : "未公开"}
                </BlogChip>
              )}
            </h1>
            <p className="ink-ad-note">
              专题设置保存后立即生效。
              {topic && sectionStats
                ? ` 当前 ${sectionStats.sections} 个章节，${sectionStats.unassigned} 篇未分章节。`
                : ""}
            </p>
          </div>
          <div className="ink-ad-head-actions">
            {topic && (
              <>
                <BlogButton
                  className="ink-mg-button"
                  disabled={working}
                  onClick={() =>
                    chapterArea.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    })
                  }
                >
                  <Icon icon="tabler:layout-list" width={15} />
                  编排章节
                </BlogButton>
                {topic.isPublished && (
                  <a
                    className="ink-mg-button ink-mg-button-ghost"
                    href={`/blog/t/${topic.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    查看专题 <Icon icon="tabler:external-link" width={14} />
                  </a>
                )}
              </>
            )}
            <BlogButton
              className="ink-mg-button-primary ink-mg-button"
              disabled={working || !draft.name.trim() || (!dirty && !!topic)}
              onClick={() => void save()}
            >
              {busy ? "保存中…" : "保存资料"}
            </BlogButton>
          </div>
        </div>

        {error && (
          <div className="ink-mg-alert" style={{ marginBottom: 14 }}>
            <span>{error}</span>
          </div>
        )}
      </div>
    </>
  );

  if (missing)
    return (
      <div
        className="ink-blog ink-manage ink-ad-page ink-topic-workspace"
        data-theme={theme}
      >
        {header}
        <div className="ink-ad-wrap">
          <div className="ink-mg-empty">
            <h2>专题不存在</h2>
            <p>它可能已经被删除了。</p>
            <BlogButton className="ink-mg-button" onClick={goBack}>
              返回专题列表
            </BlogButton>
          </div>
        </div>
      </div>
    );

  if (loading && !topics.length)
    return (
      <div
        className="ink-blog ink-manage ink-ad-page ink-topic-workspace"
        data-theme={theme}
      >
        {header}
        <div className="ink-ad-wrap">
          <p className="ink-mg-empty" role="status">
            正在加载专题…
          </p>
        </div>
      </div>
    );

  return (
    <div
      className="ink-blog ink-manage ink-ad-page ink-topic-workspace"
      data-theme={theme}
    >
      {header}

      <div className="ink-ad-wrap">
        <div className="ink-td-form">
          <details
            className="ink-ad-card ink-td-basics"
            open
          >
            <summary>
              <strong>基本信息</strong>
              <span>{draft.name || "填写专题名称、简介和链接"}</span>
              <small>收起</small>
            </summary>
            <div className="ink-td-basics-grid">
              <label className="ink-mg-section" style={{ gap: 6 }}>
                <span className="ink-mg-sub">名称</span>
                <BlogInput
                  className="ink-mg-field"
                  maxLength={60}
                  value={draft.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  placeholder="如：产品思考"
                />
              </label>

              <label className="ink-mg-section" style={{ gap: 6 }}>
                <span className="ink-mg-sub">简介</span>
                <BlogTextarea
                  className="ink-mg-field"
                  rows={3}
                  maxLength={500}
                  value={draft.desc}
                  onChange={(e) => patch({ desc: e.target.value })}
                  placeholder="一句话说明这个专题在讲什么"
                />
              </label>

              <div className="ink-mg-section" style={{ gap: 6 }}>
                <span className="ink-mg-sub">页面链接 (Slug)</span>
                <div className="ink-mg-slug">
                  <span>/topics/</span>
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
                  <span className="ink-mg-sub">
                    标识创建后不可改，避免公开链接失效。
                  </span>
                )}
              </div>

              {/*
                展示方式：只决定「怎么排版」，不决定「有什么内容」。
                两种模式共用同一套专题、章节、文章与排序 —— 切换不会动封面、
                文章关系与章节编排，保存后立刻在公开站生效。
              */}
              <fieldset className="ink-td-display-mode">
                <legend className="ink-mg-sub">展示方式</legend>
                <div className="ink-td-display-mode-options">
                  {DISPLAY_MODE_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className="ink-td-display-mode-option"
                      data-active={draft.displayMode === option.value}
                    >
                      <input
                        type="radio"
                        name="topic-display-mode"
                        value={option.value}
                        checked={draft.displayMode === option.value}
                        onChange={() =>
                          patch({ displayMode: option.value as TopicDisplayMode })
                        }
                      />
                      <span className="ink-td-display-mode-text">
                        <strong>{option.label}</strong>
                        <small>{option.desc}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/*
                默认打开文章：只对文档模式有意义。

                读者进专题时默认看到哪一篇，由作者在这里定。
                切回专题模式时这一项会收起，但配置仍然留着 ——
                专题模式的展示逻辑完全不受影响。
              */}
              {draft.displayMode === "doc" && (
                <div className="ink-td-default-article">
                  <span className="ink-mg-sub">默认打开文章</span>
                  <BlogSelect
                    className="ink-mg-field"
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
                  <small className="ink-mg-sub">
                    未指定，或指定的文章已撤回、移出专题、被删除时，自动打开编排中的第一篇公开文章。
                  </small>
                  {defaultArticleStale && (
                    <small className="ink-mg-sub is-warn">
                      原设置的文章已经不可访问，保存后将自动改为第一篇公开文章。
                    </small>
                  )}
                </div>
              )}
            </div>
          </details>

          <section className="ink-ad-card ink-td-display">
            <div className="ink-ad-card-head">
              <div>
                <h2 className="ink-ad-card-title">
                  <Icon icon="tabler:photo" width={17} />
                  封面与展示
                </h2>
                <p className="ink-ad-sub">专题页首屏的封面、颜色与导航位置</p>
              </div>
            </div>

            <div className="ink-mg-section" style={{ gap: 8 }}>
              <span className="ink-mg-sub">封面</span>
              <div className="ink-mg-topic-cover">
                {currentCover ? (
                  <img src={imageUrl(currentCover.path)} alt="专题封面" />
                ) : (
                  <span className="ink-mg-topic-cover-empty">
                    未设置封面 · 公开站会显示专题色块
                  </span>
                )}
              </div>
              <div className="ink-mg-row-actions" style={{ marginLeft: 0 }}>
                <BlogButton
                  className="ink-mg-button ink-mg-button-primary"
                  type="button"
                  disabled={!topic || working || !draft.name.trim()}
                  onClick={() => void generateCover()}
                >
                  <Icon icon="tabler:sparkles" width={15} />
                  {generatingCover ? "正在生成…" : "AI 生成封面"}
                </BlogButton>
                <BlogButton
                  className="ink-mg-button"
                  type="button"
                  onClick={() => setPicking((v) => !v)}
                >
                  <Icon icon="tabler:photo" width={15} />
                  {picking ? "收起封面选择" : "更换封面"}
                </BlogButton>
                {!topic && (
                  <small className="ink-mg-sub">
                    先保存专题，再根据名称和简介生成封面。
                  </small>
                )}
                {draft.coverAttachmentId !== null && (
                  <BlogButton
                    className="ink-mg-button"
                    type="button"
                    onClick={() => patch({ coverAttachmentId: null })}
                  >
                    使用专题色块
                  </BlogButton>
                )}
              </div>
              {picking && (
                <div className="ink-mg-cover-picker">
                  {coverCandidates.map((c) => (
                    <BlogButton
                      key={c.id}
                      type="button"
                      className="ink-mg-cover-option"
                      aria-label={`选择封面 ${c.name}`}
                      aria-pressed={draft.coverAttachmentId === c.id}
                      onClick={() => {
                        patch({ coverAttachmentId: c.id });
                        setPicking(false);
                      }}
                    >
                      <img src={imageUrl(c.path)} alt={c.name} />
                    </BlogButton>
                  ))}
                  {!coverCandidates.length && (
                    <p className="ink-mg-sub">
                      还没有可选的图片，先把文章发布并设置封面。
                    </p>
                  )}
                </div>
              )}
              <label className="ink-mg-section" style={{ gap: 6 }}>
                <span className="ink-mg-sub">封面短标题（最多 24 字）</span>
                <BlogInput
                  className="ink-mg-field"
                  maxLength={24}
                  value={draft.coverTitle}
                  onChange={(e) => patch({ coverTitle: e.target.value })}
                  placeholder="留空则用专题名"
                />
              </label>
            </div>

            <div className="ink-td-display-options">
              <div className="ink-mg-grid-2">
                <label className="ink-mg-section" style={{ gap: 6 }}>
                  <span className="ink-mg-sub">上级专题</span>
                  <BlogSelect
                    className="ink-mg-field ink-mg-parent-select"
                    value={draft.parentId ?? ""}
                    onChange={(e) =>
                      patch({
                        parentId: e.target.value
                          ? Number(e.target.value)
                          : null,
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
                <label className="ink-mg-section" style={{ gap: 6 }}>
                  <span className="ink-mg-sub">专题颜色</span>
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <input
                      type="color"
                      className="ink-mg-color"
                      value={draft.color}
                      onChange={(e) => patch({ color: e.target.value })}
                      aria-label="专题颜色"
                    />
                    <span className="ink-mg-sub">{draft.color}</span>
                  </span>
                </label>
              </div>

              <div className="ink-mg-section" style={{ gap: 10 }}>
                <label className="ink-mg-toggle">
                  <BlogCheckbox toggle
                    type="checkbox"
                    checked={draft.isPublished}
                    onChange={(e) => patch({ isPublished: e.target.checked })}
                  />
                  <span className="ink-mg-toggle-track" />
                  <span style={{ fontSize: 13 }}>公开专题页</span>
                </label>
                <span className="ink-mg-sub">
                  关闭后专题页不对外访问，文章仍单独公开。
                </span>
                <div className="ink-mg-grid-2">
                  <label className="ink-mg-switch">
                    <BlogCheckbox aria-label="导航展示"
                      type="checkbox"
                      checked={draft.showInNav}
                      onChange={(e) => patch({ showInNav: e.target.checked })}
                    />
                    导航展示
                  </label>
                  <label className="ink-mg-switch">
                    <BlogCheckbox aria-label="首页推荐"
                      type="checkbox"
                      checked={draft.isFeatured}
                      onChange={(e) => patch({ isFeatured: e.target.checked })}
                    />
                    首页推荐
                  </label>
                </div>
              </div>
            </div>
          </section>

          {/* 底部操作条不吸底：吸底会盖住卡片内容。顶部页头也有一个保存按钮。 */}
          <div className="ink-mg-panel-footer">
            <span>{dirty ? "有未保存修改。" : "专题设置保存后立即生效。"}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {topic && (
                <BlogButton
                  className="ink-mg-button"
                  type="button"
                  disabled={working}
                  onClick={() => void remove()}
                >
                  删除专题
                </BlogButton>
              )}
              <BlogButton
                className="ink-mg-button-primary ink-mg-button"
                disabled={working || !draft.name.trim() || (!dirty && !!topic)}
                onClick={() => void save()}
              >
                {busy ? "保存中…" : "保存资料"}
              </BlogButton>
            </span>
          </div>
          <section className="ink-td-chapters" id="chapters" ref={chapterArea}>
            <div className="ink-ad-card-head">
              <div>
                <h2 className="ink-ad-card-title">章节与文章</h2>
                <p className="ink-ad-sub">
                  直接添加章节、拖动文章编排；保存编排后更新公开目录。
                </p>
              </div>
            </div>
            {topic ? (
              <BlogTopicArrange
                topicId={topic.id}
                embedded
                onSaved={chaptersSaved}
                onDirtyChange={setArrangementDirty}
              />
            ) : (
              <p className="ink-mg-empty">保存专题后即可添加章节与文章。</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** 明暗偏好写回同一个键，公开站与管理页共用。 */
function writeTheme(theme: string) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* 隐私模式下写不进去也不影响使用 */
  }
}
