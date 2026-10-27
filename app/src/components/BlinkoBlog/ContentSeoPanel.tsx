import { BlogButton, BlogInput, BlogTabs, BlogTextarea } from "./BlogUI";
import { confirmBlogAction } from "./confirmBlogAction";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/trpc";
import { blogImageUrl } from "@/lib/blogImage";
import { emptyArticleSeo } from "@shared/lib/blogSiteSettings";
import {
  absoluteSeoImage,
  SEO_SOURCE_LABELS,
  type SeoOverrideInput,
} from "@shared/lib/blogSeo";
import { Icon } from "@/components/Common/Iconify/icons";

/**
 * 内容 SEO 管理。
 *
 * 桌面三栏：左边选内容、中间编辑、右边预览。
 * 预览显示的是服务端按同一套继承规则解析后的结果 —— 不是把覆盖字段拼一遍，
 * 所以「待发布」和「当前公开」都能直接看到搜索引擎会读到什么。
 */

type Kind = "article" | "topic" | "page";
type Selection = { kind: Kind; id: string };
type Preview = Awaited<ReturnType<typeof api.blog.seoPreview.query>>;
type ListItem = {
  id: number;
  title: string;
  publishId: string;
  isPublished: boolean;
  updatedAt: Date;
  revision: number;
};

const KIND_LABEL: Record<Kind, string> = {
  article: "文章",
  topic: "专题",
  page: "固定页面",
};

const LIMITS = { title: 160, description: 500, imageAlt: 200 };

function emptyOverride(): SeoOverrideInput {
  return { ...emptyArticleSeo };
}

export function ContentSeoPanel({
  onReview,
  onDirty,
}: {
  onReview: (id: number) => void | Promise<void>;
  onDirty: (dirty: boolean) => void;
}) {
  const [kind, setKind] = useState<Kind>("article");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [list, setList] = useState<{
    articles: { items: ListItem[]; total: number };
    topics: {
      items: {
        id: number;
        name: string;
        slug: string;
        isPublished: boolean;
        count: number;
      }[];
      total: number;
    };
    pages: { key: string; label: string; path: string }[];
  } | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [form, setForm] = useState<SeoOverrideInput>(emptyOverride());
  const [baseline, setBaseline] = useState<SeoOverrideInput>(emptyOverride());
  const [side, setSide] = useState<"draft" | "live">("draft");
  const [previewTab, setPreviewTab] = useState<"search" | "share">("search");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [imageOptions, setImageOptions] = useState<
    { id: number; name: string; path: string }[]
  >([]);

  const listSeq = useRef(0);
  const previewSeq = useRef(0);

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(baseline),
    [form, baseline],
  );

  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);

  // 左侧列表：切换筛选或关键词时重新取数，序号防止旧响应覆盖新结果。
  useEffect(() => {
    const seq = ++listSeq.current;
    setList(null);
    api.blog.seoContentList
      .query({ type: kind, q: keyword, page, pageSize: 20 })
      .then((r) => {
        if (seq !== listSeq.current) return;
        setList(r);
      })
      .catch((e) => {
        if (seq === listSeq.current) setError(e.message);
      });
  }, [kind, keyword, page]);

  // 选中内容：拉预览并把表单重置成已保存的覆盖值。
  const loadPreview = useCallback((target: Selection) => {
    const seq = ++previewSeq.current;
    setPreview(null);
    setError("");
    setMessage("");
    api.blog.seoPreview
      .query({
        kind: target.kind,
        id: target.id,
        origin: typeof location !== "undefined" ? location.origin : undefined,
      })
      .then((r) => {
        if (seq !== previewSeq.current) return;
        setPreview(r);
        setForm(r.draft.override);
        setBaseline(r.draft.override);
        setSide("draft");
      })
      .catch((e) => {
        if (seq === previewSeq.current) setError(e.message);
      });
  }, []);

  // 首次进入自动选中第一条，避免右栏空着。
  useEffect(() => {
    if (!list || selection) return;
    if (kind === "page" && list.pages[0]) {
      setSelection({ kind: "page", id: list.pages[0].key });
      loadPreview({ kind: "page", id: list.pages[0].key });
      return;
    }
    if (kind === "article" && list.articles.items[0]) {
      setSelection({ kind: "article", id: String(list.articles.items[0].id) });
      loadPreview({
        kind: "article",
        id: String(list.articles.items[0].id),
      });
      return;
    }
    if (kind === "topic" && list.topics.items[0]) {
      setSelection({ kind: "topic", id: String(list.topics.items[0].id) });
      loadPreview({ kind: "topic", id: String(list.topics.items[0].id) });
    }
  }, [list, kind, selection, loadPreview]);

  // 文章的可选图片：复用发布检查里的附件候选，只列图片，不带鉴权 token。
  useEffect(() => {
    if (selection?.kind !== "article") {
      setImageOptions([]);
      return;
    }
    let live = true;
    api.notes.publicationStatus
      .query({ id: Number(selection.id) })
      .then((r) => {
        if (live) setImageOptions(r.coverOptions ?? []);
      })
      .catch(() => {
        if (live) setImageOptions([]);
      });
    return () => {
      live = false;
    };
  }, [selection]);

  const choose = async (target: Selection) => {
    if (dirty && !await confirmBlogAction("有未保存的 SEO 修改，确定切换内容？")) return;
    setSelection(target);
    loadPreview(target);
  };

  const patch = (p: Partial<SeoOverrideInput>) => {
    setForm((f) => ({ ...f, ...p }));
    setMessage("");
  };

  /** 恢复默认 = 清除覆盖，回到继承，不是把默认文本抄进字段。 */
  const restore = async () => {
    if (!preview) return;
    if (!await confirmBlogAction("恢复默认会清除本内容的 SEO 覆盖，改回继承站点规则。继续？"))
      return;
    const cleared = emptyOverride();
    setForm(cleared);
    await save(cleared, true);
  };

  const save = async (
    payload?: SeoOverrideInput,
    skipReview = false,
  ) => {
    if (!preview || !selection) return;
    const data = payload ?? form;
    setBusy(true);
    setError("");
    try {
      if (selection.kind === "article") {
        await api.blog.saveContentSEO.mutate({
          id: Number(selection.id),
          data: data as typeof emptyArticleSeo,
          expectedUpdatedAt: preview.status.updatedAt as Date,
        });
        setForm(data);
        setBaseline(data);
        setMessage("已保存为草稿，进入发布检查后才会影响公开版本。");
        if (!skipReview) await onReview(Number(selection.id));
      } else if (selection.kind === "topic") {
        await api.blog.saveTopicSEO.mutate({
          id: Number(selection.id),
          data: data as typeof emptyArticleSeo,
          revision: preview.revision,
        });
        setForm(data);
        setBaseline(data);
        setMessage("专题 SEO 已保存，公开专题页立即生效。");
        loadPreview(selection);
      } else {
        await api.blog.savePageSEO.mutate({
          data: { [selection.id]: data as typeof emptyArticleSeo },
          revision: preview.revision,
        });
        setForm(data);
        setBaseline(data);
        setMessage("固定页面 SEO 已保存，公开页面立即生效。");
        loadPreview(selection);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  /**
   * 继承时「会是什么」：服务端用同一套解析器算好后一并返回，
   * 管理端直接展示，不在这里另写一遍拼接规则。
   */
  const inherited = useMemo(() => {
    if (!preview) return null;
    if (side === "live") return preview.publishedInherited ?? preview.inherited;
    return preview.inherited;
  }, [preview, side]);

  const resolvedSources = useMemo(() => {
    if (!preview) return null;
    if (side === "live") return preview.draft.resolved.sources;
    return preview.draft.resolved.sources;
  }, [preview, side]);

  const shown = useMemo(() => {
    if (!preview) return null;
    if (side === "live") {
      return (
        preview.live ?? {
          title: preview.published?.resolved.title ?? "",
          description: preview.published?.resolved.description ?? "",
          image: preview.published?.resolved.image ?? "",
          imageAlt: preview.published?.resolved.imageAlt ?? "",
          canonical: preview.canonical,
          robots: "",
        }
      );
    }
    return {
      title: preview.draft.resolved.title,
      description: preview.draft.resolved.description,
      image: preview.draft.resolved.image,
      imageAlt: preview.draft.resolved.imageAlt,
      canonical: preview.canonical,
      robots: "",
    };
  }, [preview, side]);

  const sourceLabel = (source?: string) =>
    source ? SEO_SOURCE_LABELS[source as keyof typeof SEO_SOURCE_LABELS] : "";

  const publicOrigin = useMemo(() => {
    if (!preview?.canonical) return "";
    try {
      return new URL(preview.canonical).origin;
    } catch {
      return "";
    }
  }, [preview]);

  const copyCanonical = async () => {
    if (!preview?.canonical) return;
    try {
      await navigator.clipboard.writeText(preview.canonical);
      setMessage("Canonical 地址已复制。");
    } catch {
      setMessage("浏览器拒绝了剪贴板访问，请手动复制上面的地址。");
    }
  };

  const listBody = () => {
    if (!list)
      return (
        <p className="ink-mg-empty" role="status">
          正在加载内容列表…
        </p>
      );
    if (kind === "page")
      return (
        <div className="ink-seo-list">
          {list.pages.map((p) => (
            <BlogButton
              key={p.key}
              className="ink-seo-item"
              aria-pressed={selection?.kind === "page" && selection.id === p.key}
              onClick={() => choose({ kind: "page", id: p.key })}
            >
              <span className="ink-seo-item-title">{p.label}</span>
              <small>
                固定页面 · {p.path}
              </small>
            </BlogButton>
          ))}
        </div>
      );
    if (kind === "article")
      return (
        <div className="ink-seo-list">
          {list.articles.items.length === 0 && (
            <p className="ink-mg-empty">没有匹配的文章。</p>
          )}
          {list.articles.items.map((item) => (
            <BlogButton
              key={item.id}
              className="ink-seo-item"
              aria-pressed={
                selection?.kind === "article" && selection.id === String(item.id)
              }
              onClick={() => choose({ kind: "article", id: String(item.id) })}
            >
              <span className="ink-seo-item-title">
                {item.title || "无标题"}
              </span>
              <small>
                {item.isPublished ? "已发布" : "未公开"} · v{item.revision || 0}
                {item.publishId ? ` · /blog/${item.publishId}` : ""}
              </small>
            </BlogButton>
          ))}
          {list.articles.total > list.articles.items.length && (
            <BlogButton
              className="ink-mg-button ink-seo-more"
              onClick={() => setPage((p) => p + 1)}
            >
              加载更多（{list.articles.total - list.articles.items.length}）
            </BlogButton>
          )}
        </div>
      );
    return (
      <div className="ink-seo-list">
        {list.topics.items.length === 0 && (
          <p className="ink-mg-empty">没有匹配的专题。</p>
        )}
        {list.topics.items.map((item) => (
          <BlogButton
            key={item.id}
            className="ink-seo-item"
            aria-pressed={
              selection?.kind === "topic" && selection.id === String(item.id)
            }
            onClick={() => choose({ kind: "topic", id: String(item.id) })}
          >
            <span className="ink-seo-item-title">{item.name}</span>
            <small>
              {item.isPublished ? "已公开" : "未公开"} · {item.count} 篇 · /blog/t/
              {item.slug}
            </small>
          </BlogButton>
        ))}
        {list.topics.total > list.topics.items.length && (
          <BlogButton
            className="ink-mg-button ink-seo-more"
            onClick={() => setPage((p) => p + 1)}
          >
            加载更多（{list.topics.total - list.topics.items.length}）
          </BlogButton>
        )}
      </div>
    );
  };

  return (
    <div className="ink-admin-seo-layout">
      <aside className="ink-mg-panel">
        <h3>选择文章或专题</h3>
        <BlogInput
          className="ink-mg-field"
          placeholder="搜索文章或专题"
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            setPage(1);
          }}
        
              startContent={<Icon icon="tabler:search" width={15} />}
            />
        <BlogTabs
          label="内容类型"
          value={kind}
          onChange={key => {
            setKind(key as typeof kind);
            setPage(1);
            setSelection(null);
          }}
          items={[
            { key: "article", label: "文章" },
            { key: "topic", label: "专题" },
            { key: "page", label: "固定页面" },
          ]}
        />
        {listBody()}
      </aside>

      <section className="ink-mg-panel ink-mg-section">
        <div className="ink-mg-section-head">
          <div>
            <h3>
              {preview ? `${KIND_LABEL[preview.kind]} SEO 设置` : "SEO 设置"}
            </h3>
            {preview && (
              <p className="ink-mg-sub">
                {preview.label} ·{" "}
                {preview.status.isPublished ? "已公开" : "未公开"}
                {preview.kind === "article" ? ` · v${preview.status.version}` : ""}
              </p>
            )}
          </div>
        </div>
        {preview && (
          <p className="ink-mg-note">
            {preview.kind === "article"
              ? "文章 SEO 先存草稿，确认更新发布后才影响公开版本；发布检查里会单独列出 SEO 变更。"
              : `${KIND_LABEL[preview.kind]} SEO 保存后立即生效，不会改变公开状态，也不会公开私有内容。`}
          </p>
        )}
        {error && (
          <p className="ink-mg-alert" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="ink-mg-note" role="status">
            {message}
          </p>
        )}
        {!preview ? (
          <p role="status">正在读取 SEO 设置…</p>
        ) : (
          <>
            {(
              [
                ["title", "SEO 标题", "留空继承内容标题与站点标题模板"],
                ["description", "SEO 描述", "留空继承内容概要与站点描述"],
                ["image", "分享图片", "留空继承内容封面与站点默认分享图"],
                ["imageAlt", "分享图片说明", "留空使用解析后的标题"],
              ] as const
            ).map(([key]) => {
              const value = String(form[key] ?? "");
              const custom = value.trim().length > 0;
              const inheritedValue =
                key === "title"
                  ? inherited?.title
                  : key === "description"
                    ? inherited?.description
                    : key === "image"
                      ? // 分享图要能公开读取，预览里给绝对地址。
                        absoluteSeoImage(inherited?.image, publicOrigin)
                      : inherited?.imageAlt;
              return (
                <div className="ink-seo-field" key={key}>
                  <div className="ink-seo-field-head">
                    <span>
                      {key === "title"
                        ? "SEO 标题"
                        : key === "description"
                          ? "SEO 描述"
                          : key === "image"
                            ? "分享图片"
                            : "分享图片说明"}
                    </span>
                    <label className="ink-seo-radio">
                      <input
                        type="radio"
                        name={`seo-${key}`}
                        checked={!custom}
                        onChange={() => patch({ [key]: "" } as never)}
                      />
                      继承
                    </label>
                    <label className="ink-seo-radio">
                      <input
                        type="radio"
                        name={`seo-${key}`}
                        checked={custom}
                        onChange={() =>
                          patch({
                            [key]: (inheritedValue || "") as never,
                          } as never)
                        }
                      />
                      自定义
                    </label>
                  </div>
                  {key === "description" ? (
                    <BlogTextarea
                      className="ink-mg-field"
                      rows={4}
                      value={value}
                      maxLength={LIMITS.description}
                      onChange={(e) => patch({ description: e.target.value })}
                    />
                  ) : (
                    <BlogInput
                      className="ink-mg-field"
                      value={value}
                      maxLength={
                        key === "image"
                          ? 1000
                          : key === "imageAlt"
                            ? LIMITS.imageAlt
                            : LIMITS.title
                      }
                      placeholder={
                        key === "image" ? "https://…/share.png" : "留空即继承"
                      }
                      onChange={(e) => patch({ [key]: e.target.value } as never)}
                    />
                  )}
                  <small className="ink-seo-hint">
                    {custom
                      ? `自定义 · 系统上限 ${key === "image" ? 1000 : LIMITS[key]} 字（这是本系统的存储限制，不是搜索引擎的强制规则）`
                      : `继承中 · 实际展示：${inheritedValue || "（暂无）"}`}
                  </small>
                  <small className="ink-seo-source">
                    来源：{sourceLabel(resolvedSources?.[key])}
                  </small>
                  {key === "image" && imageOptions.length > 0 && (
                    <div className="ink-seo-image-picker">
                      {imageOptions.slice(0, 8).map((option) => (
                        <BlogButton
                          key={option.id}
                          type="button"
                          title={option.name}
                          onClick={() =>
                            patch({
                              image: publicOrigin
                                ? new URL(option.path, publicOrigin).href
                                : option.path,
                            })
                          }
                        >
                          {/* 后台预览要走登录态：私有附件直接取原地址会 401，图片渲染成空白。 */}
                          <img src={blogImageUrl(option.path)} alt={option.name} loading="lazy" />
                        </BlogButton>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="ink-seo-canonical">
              <span>Canonical（只读，由公开站点地址与内容路径生成）</span>
              <div>
                <BlogInput
                  className="ink-mg-field"
                  readOnly
                  value={preview.canonical || "发布后自动生成"}
                />
                <BlogButton
                  className="ink-mg-button"
                  onClick={() => void copyCanonical()}
                  disabled={!preview.canonical}
                >
                  <Icon icon="tabler:copy" width={15} />
                  复制
                </BlogButton>
              </div>
            </div>
            <div className="ink-admin-footer">
              <BlogButton
                className="ink-mg-button"
                disabled={busy || !dirty}
                onClick={() => void restore()}
              >
                恢复默认
              </BlogButton>
              <BlogButton
                className="ink-mg-button ink-mg-button-primary"
                disabled={busy || !dirty}
                onClick={() => void save()}
              >
                {busy
                  ? "保存中…"
                  : preview.kind === "article"
                    ? "保存并进入发布检查"
                    : "保存"}
              </BlogButton>
            </div>
          </>
        )}
      </section>

      <section className="ink-mg-panel">
        <div className="ink-mg-section-head">
          <div>
            <h3>实际展示预览</h3>
            <p className="ink-mg-sub">
              {preview
                ? preview.kind === "article"
                  ? "显示解析后的标题、描述与地址"
                  : "显示解析后的标题、描述与地址"
                : ""}
            </p>
          </div>
        </div>
        <BlogTabs
          label="预览内容"
          value={side}
          onChange={key => setSide(key as typeof side)}
          items={[
            { key: "draft", label: "待发布 SEO" },
            { key: "live", label: "当前公开 SEO" },
          ]}
        />
        <BlogTabs
          label="预览样式"
          value={previewTab}
          onChange={key => setPreviewTab(key as typeof previewTab)}
          items={[
            { key: "search", label: "搜索结果" },
            { key: "share", label: "社交分享" },
          ]}
        />
        {!shown ? (
          <p className="ink-mg-empty">还没有可预览的内容。</p>
        ) : side === "live" && !preview?.live ? (
          <p className="ink-mg-empty">
            这份内容当前没有公开版本，因此没有「当前公开 SEO」可看。
          </p>
        ) : previewTab === "search" ? (
          <div className="ink-seo-preview-search">
            <small className="ink-seo-preview-url">
              {preview?.canonical || "公开地址"}
            </small>
            <h3 className="ink-admin-preview-title">{shown.title}</h3>
            <p>{shown.description || "（没有描述）"}</p>
          </div>
        ) : (
          <div className="ink-seo-preview-share">
            {shown.image && (
              <img
                className="ink-admin-share-preview"
                src={shown.image}
                alt={shown.imageAlt || "分享图预览"}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <h3 className="ink-admin-preview-title">{shown.title}</h3>
            <p>{shown.description || "（没有描述）"}</p>
            <small className="ink-seo-preview-host">
              {publicOrigin.replace(/^https?:\/\//, "")}
            </small>
          </div>
        )}
        <p className="ink-mg-sub">
          示意预览，实际展示由平台决定；不代表已经收录或排名提升。
        </p>
      </section>
    </div>
  );
}
