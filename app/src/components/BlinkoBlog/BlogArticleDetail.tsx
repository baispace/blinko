import { BlogButton, BlogChip, BlogChipGroup } from "./BlogUI";
import "./blog.css";
import "./manage.css";
import "./article.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "@/lib/trpc";
import { blogImageUrl } from "@/lib/blogImage";
import { readBlogTheme, writeBlogTheme } from "@/lib/blogTheme";
import { RootStore } from "@/store";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { Icon } from "@/components/Common/Iconify/icons";
import { PublicArticleBody } from "./PublicArticleBody";
import { ContentQuickPanel } from "./ContentQuickPanel";
import {
  CONTENT_STATUS_META,
  contentTitle,
  describeChanges,
  resolveContentStatus,
} from "./contentStatus";
import "./content.css";

type Status = Awaited<ReturnType<typeof api.notes.publicationStatus.query>>;

/** 状态语气 → HeroUI Chip 语义色。 */
const TONE_COLOR: Record<string, "default" | "primary" | "success" | "warning"> = {
  plain: "default",
  ok: "success",
  warn: "warning",
};

/*
 * 状态、变更字段名、标题算法都收口到 contentStatus.ts。
 * 这里再写一份的话，内容列表和工作台会对同一篇文章显示不同的标题、
 * 不同的状态叫法 —— 用户会以为是两篇不同的文章。
 */

function plainLength(content: string) {
  return (content || "").replace(/<[^>]*>/g, "").trim().length;
}

export function BlogArticleDetail() {
  const { noteId } = useParams();
  const id = Number(noteId);
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status | null>(null);
  const [preview, setPreview] = useState<"draft" | "public">("draft");
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useSearchParams();
  /** 从笔记右键「发布到博客」跳过来时，把注意力引到右侧的操作面板。 */
  const [focusPanel, setFocusPanel] = useState(params.get('publish') === '1');
  const [error, setError] = useState("");
  const [theme, setTheme] = useState(readBlogTheme);

  const notify = (e: unknown, fallback = "操作失败，请重试") =>
    RootStore.Get(ToastPlugin).error(
      e instanceof Error && e.message ? e.message : fallback,
    );

  const applyStatus = useCallback((next: Status) => {
    setStatus(next);
  }, []);

  const load = useCallback(async () => {
    if (!Number.isInteger(id) || id <= 0) return;
    applyStatus(await api.notes.publicationStatus.query({ id }));
    setError("");
  }, [id, applyStatus]);

  useEffect(() => {
    void load().catch((e) =>
      setError(e instanceof Error ? e.message : "加载失败"),
    );
  }, [load]);

  useEffect(() => {
    writeBlogTheme(theme);
  }, [theme]);

  /** 高亮只闪一下，顺手把 URL 里的 publish=1 去掉。 */
  useEffect(() => {
    if (!focusPanel) return;
    const timer = setTimeout(() => {
      setFocusPanel(false);
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.delete("publish");
          return next;
        },
        { replace: true },
      );
    }, 2400);
    return () => clearTimeout(timer);
  }, [focusPanel, setParams]);

  /** 待发布的字段级变更。内容列表、发布检查用的是同一套名字。 */
  const changedFields = useMemo(() => status?.changes ?? [], [status?.changes]);
  const changeText = describeChanges(changedFields);

  const draftTitle =
    status?.draft.title.trim() || contentTitle(status?.draft.content ?? "");
  const currentTitle = status?.current
    ? status.current.title || contentTitle(status.current.content)
    : "";

  if (!status)
    return (
      <div className="ink-blog ink-manage ink-ad-page" data-theme={theme}>
        <div className="ink-ad-wrap" style={{ paddingTop: 40 }}>
          <div className="ink-mg-alert">
            <span>{error || "正在加载文章…"}</span>
            {error && (
              <BlogButton className="ink-mg-button" onClick={() => navigate("/blog-manage")}>
                返回管理
              </BlogButton>
            )}
          </div>
        </div>
      </div>
    );

  /*
   * 状态只有四种，判定方式跟内容列表完全一致。
   * 这里原来自己写了一套说法，内容列表写的是另一套，同一个状态两种叫法，
   * 用户得来回对照才知道是一回事。
   */
  const state = resolveContentStatus({
    isPublished: status.isPublished,
    hasDraftChanges: changedFields.length > 0,
    revision: status.revision,
  });
  const stateMeta = CONTENT_STATUS_META[state];
  const badge = { text: stateMeta.label, tone: stateMeta.tone };
  const shown = preview === "public" && status.current
    ? {
        title: currentTitle,
        summary: status.current.summary,
        content: status.current.content,
        coverAttachmentId: status.current.coverAttachmentId,
        publicTags: status.current.publicTags ?? [],
        at: status.publishedUpdatedAt ?? status.publishedAt,
      }
    : {
        title: draftTitle,
        summary: status.draft.summary,
        content: status.draft.content,
        coverAttachmentId: status.draft.coverAttachmentId,
        publicTags: status.draft.publicTags ?? [],
        at: status.draftUpdatedAt,
      };
  const shownCover = status.coverOptions.find(
    (c) => c.id === shown.coverAttachmentId,
  );

  return (
    <div className="ink-blog ink-manage ink-ad-page" data-theme={theme}>
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
              onClick={() => setTheme((v) => (v === "light" ? "dark" : "light"))}
              aria-label="切换明暗主题"
            >
              <Icon icon="tabler:adjustments" width={16} />
              {theme === "light" ? "浅色" : "深色"}
            </BlogButton>
            <BlogButton
              as="a"
              className="ink-mg-button"
              href="/blog"
              target="_blank"
              rel="noopener noreferrer"
            >
              查看公开站 <Icon icon="tabler:external-link" width={15} />
            </BlogButton>
            <BlogButton className="ink-mg-button" onClick={() => navigate("/blog-manage")}>
              返回管理
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
                href="/blog-manage"
                onClick={(e) => {
                  e.preventDefault();
                  navigate("/blog-manage");
                }}
              >
                内容
              </a>
              <Icon icon="tabler:chevron-right" width={13} />
              <span>{draftTitle || "无标题"}</span>
            </p>
            <h1 className="ink-ad-title">
              文章管理
              <BlogChip color={TONE_COLOR[badge.tone]} variant="flat">
                {badge.text}
              </BlogChip>
            </h1>
            <p className="ink-ad-note">
              {stateMeta.desc}
              {changeText && ` 待发布变更：${changeText}。`}
            </p>
          </div>
          {/*
            页头不再摆公开页链接 —— 右侧面板的「运营管理」里已经有一份，
            同一个页面给两个入口只会让人以为它们不一样。
          */}
        </div>
        {error && (
          <div className="ink-mg-alert" style={{ marginBottom: 14 }}>
            <span>{error}</span>
          </div>
        )}

        <div className="ink-ad-columns">
          <div className="ink-ad-main">
            {/*
              发布前检查的摘要卡。
              之前只有一条"检查并发布"的链接，点了才知道能不能发；
              现在把拦路的问题直接摆在这里，省掉一次来回。
            */}
            <section className="ink-ad-card">
              <div className="ink-ad-card-head">
                <h2 className="ink-ad-card-title">发布前检查</h2>
                <BlogChip
                  color={status.canPublish ? "success" : "warning"}
                  variant="flat"
                >
                  {status.canPublish
                    ? "可以发布"
                    : `${status.blockers.length} 项待处理`}
                </BlogChip>
              </div>
              {status.blockers.length ? (
                <ul className="ink-ad-blockers">
                  {status.blockers.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="ink-ad-note">没有阻塞发布的问题。</p>
              )}
              {changeText && (
                <p className="ink-ad-note">待发布变更：{changeText}。</p>
              )}
            </section>

            <section className="ink-ad-card">
              <div className="ink-ad-card-head">
                <h2 className="ink-ad-card-title">公开效果预览</h2>
                <BlogChipGroup
                  label="预览版本"
                  value={preview}
                  onChange={key => setPreview(key as typeof preview)}
                  items={[
                    { key: "draft", label: "待发布" },
                    { key: "public", label: "当前公开" },
                  ]}
                />
              </div>
              {shownCover && (
                <img
                  className="ink-ad-preview-cover"
                  src={blogImageUrl(shownCover.path)}
                  alt="文章封面"
                />
              )}
              <h3 className="ink-ad-preview-title">{shown.title || "无标题"}</h3>
              <div className="ink-ad-preview-meta">
                {status.topics.map((t) => (
                  <span className="ink-ad-preview-topic" key={t.id}>
                    {t.name}
                    {t.sectionName ? ` › ${t.sectionName}` : ""}
                  </span>
                ))}
                {shown.at && (
                  <time>{new Date(shown.at).toLocaleDateString("zh-CN")}</time>
                )}
              </div>
              {shown.summary && (
                <p className="ink-ad-preview-summary">{shown.summary}</p>
              )}
              {shown.publicTags.length > 0 && (
                <div className="ink-ad-preview-tags">
                  {shown.publicTags.map((tag) => (
                    <span className="ink-ad-preview-topic" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="ink-ad-preview-body ink-prose">
                <PublicArticleBody content={shown.content} />
              </div>
            </section>

            <section className="ink-ad-card"><h2>发布信息</h2><p>{draftTitle}</p><p className="ink-ad-note">{status.draft.summary || '尚未填写概要'}</p></section>

            <section className="ink-ad-card">
              <details className="ink-ad-source">
                <summary>
                  <Icon icon="tabler:chevron-down" width={15} />
                  原笔记依据
                  <small>已保存 {plainLength(status.draft.content)} 字</small>
                </summary>
                <div className="ink-prose ink-ad-source-body">
                  <PublicArticleBody content={status.draft.content} />
                </div>
                <a
                  className="ink-ad-source-link"
                  href={`/detail?id=${id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  打开原笔记 <Icon icon="tabler:external-link" width={13} />
                </a>
              </details>
            </section>
          </div>

          {/* 快捷操作面板：与内容列表右侧是同一套。 */}
          <aside className="ink-ad-aside">
            <ContentQuickPanel noteId={id} onChanged={load} focus={focusPanel} />
          </aside>
        </div>
      </div>

      <div className="ink-ad-bottombar">
        <div className="ink-ad-wrap">
          <div className="ink-ad-bottombar-inner">
            <span className="ink-ad-bottom-note">
              {changeText
                ? `待发布变更：${changeText}。`
                : "标题、封面与展示设置都在右侧快捷操作里改；改动先存在草稿，发布后才对外生效。"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

