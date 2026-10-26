import { BlogButton, BlogChip, BlogInput, BlogSelect, BlogCheckbox, BlogTabs } from "./BlogUI";
import { confirmBlogAction } from "./confirmBlogAction";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Modal, ModalContent } from "@heroui/react";
import { api } from "@/lib/trpc";
import { blogImageUrl } from "@/lib/blogImage";
import { RootStore } from "@/store";
import { BlinkoStore } from "@/store/blinkoStore";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { Icon } from "@/components/Common/Iconify/icons";
import { ContentQuickPanel } from "./ContentQuickPanel";
import { RowMenu } from "./RowMenu";
import {
  CONTENT_STATUS_FILTERS,
  CONTENT_STATUS_META,
  describeChanges,
  resolveContentStatus,
  type ContentStatus,
} from "./contentStatus";
import "./content.css";

type Post = Awaited<ReturnType<typeof api.blog.published.query>>[number];
type Topic = Awaited<ReturnType<typeof api.blog.topics.query>>[number];

/** 内容列表每页条数。 */
const PAGE_SIZE = 10;

const SORTS = [
  { key: "updated", label: "最近更新" },
  { key: "published", label: "首次发布" },
  { key: "title", label: "标题" },
] as const;

/** 相对时间：列表里比日期更好读。 */
function relativeTime(value: string | Date | null | undefined) {
  if (!value) return "";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  const diff = Date.now() - time;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return new Date(time).toLocaleDateString("zh-CN");
}

/** 状态徽章的配色：统一走 HeroUI Chip 的语义色，不再各写一套药丸。 */
const STATUS_COLOR: Record<
  ContentStatus,
  "default" | "primary" | "success" | "warning" | "danger"
> = {
  draft: "default",
  changed: "warning",
  published: "primary",
  withdrawn: "default",
};

/**
 * 内容列表 —— 内容管理的主入口。
 *
 * 三条设计原则：
 *   1. 筛选状态存在网址里。搜索、状态、专题、排序、页码都写进 query，
 *      返回列表时条件自动还在，也能把「只看待发布更新」这样的视图直接分享出去。
 *      之前这些状态散在内存里，来回跳转只能靠浏览器本地存储兜，丢失是常事。
 *   2. 每行只给一个主动作。状态不同，主动作不同（发布 / 更新发布 / 重新发布），
 *      其余操作收进「…」，不用在一行里挑哪个按钮才是对的。
 *   3. 编辑与列表分开。点开文章进独立的工作台，列表不在原地展开编辑器 ——
 *      展开之后列表就没了，回来时筛选与滚动位置全靠记忆。
 */
export function BlogContentList({
  posts,
  topics,
  onReload,
}: {
  posts: Post[];
  topics: Topic[];
  onReload: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  /** 右侧快捷操作面板当前针对的文章。 */
  const [activeId, setActiveId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  /** 改筛选条件：写回网址，顺手把页码归一。 */
  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  const status = (params.get("status") ?? "all") as ContentStatus | "all";
  const topicFilter = params.get("topic") ?? "all";
  const sort = params.get("sort") ?? "updated";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const query = params.get("q") ?? "";

  /* 搜索框：本地先跟手，再防抖写进网址。 */
  const [keyword, setKeyword] = useState(query);
  useEffect(() => setKeyword(query), [query]);
  useEffect(() => {
    if (keyword === query) return;
    const timer = setTimeout(
      () => update({ q: keyword || null, page: null }),
      260,
    );
    return () => clearTimeout(timer);
    // update 每次渲染都是新函数，这里只关心关键词本身的变化。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword]);

  const statusOf = useMemo(
    () =>
      (post: Post): ContentStatus =>
        resolveContentStatus({
          isPublished: post.isPublished,
          hasDraftChanges: post.hasDraftChanges,
          revision: post.revision,
        }),
    [],
  );

  const counts = useMemo(() => {
    const acc = { all: posts.length } as Record<string, number>;
    for (const key of CONTENT_STATUS_FILTERS) {
      if (key.key !== "all") acc[key.key] = 0;
    }
    for (const post of posts) {
      const key = statusOf(post);
      acc[key] = (acc[key] ?? 0) + 1;
    }
    return acc;
  }, [posts, statusOf]);

  const filtered = useMemo(() => {
    const keywordLower = keyword.trim().toLowerCase();
    const list = posts.filter((post) => {
      if (status !== "all" && statusOf(post) !== status) return false;
      if (topicFilter !== "all" && !post.topicIds.includes(Number(topicFilter)))
        return false;
      if (
        keywordLower &&
        !`${post.title} ${post.excerpt}`.toLowerCase().includes(keywordLower)
      )
        return false;
      return true;
    });
    return list.sort((a, b) => {
      if (sort === "title")
        return a.title.localeCompare(b.title, "zh");
      if (sort === "published")
        return (
          new Date(b.publication?.createdAt ?? b.updatedAt).getTime() -
          new Date(a.publication?.createdAt ?? a.updatedAt).getTime()
        );
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [posts, status, topicFilter, keyword, sort, statusOf]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  // 面板默认针对第一篇，选中态也要跟着它 —— 否则「面板里是这篇、行里没高亮」。
  // 选中行被筛掉或翻页挤走时，回到当前第一篇。
  const activeNoteId =
    activeId && rows.some((post) => post.id === activeId)
      ? activeId
      : rows[0]?.id ?? null;
  // 筛选结果变了以后原来的勾选多半已经不在列表里，直接清掉免得误操作。
  useEffect(() => {
    setSelected((prev) =>
      prev.filter((id) => filtered.some((post) => post.id === id)),
    );
  }, [filtered]);

  const notify = (error: unknown, fallback = "操作失败，请重试") =>
    RootStore.Get(ToastPlugin).error(
      error instanceof Error && error.message ? error.message : fallback,
    );

  /** 批量操作：一次请求，服务端逐篇按最新状态处理。 */
  const bulk = async (action: "publish" | "withdraw") => {
    if (!selected.length) return;
    const verb = action === "publish" ? "发布" : "撤回发布";
    if (!await confirmBlogAction(`确定要${verb}选中的 ${selected.length} 篇吗？`)) return;
    setBusy(true);
    try {
      const result = await api.blog.bulkAction.mutate({
        noteIds: selected,
        action,
      });
      await onReload();
      RootStore.Get(BlinkoStore).updateTicker++;
      setSelected([]);
      if (result.failCount) {
        RootStore.Get(ToastPlugin).error(
          `${result.okCount} 篇成功，${result.failCount} 篇失败：${result.results.find((r) => !r.ok)?.message ?? ""}`,
        );
      } else {
        RootStore.Get(ToastPlugin).success(
          action === "publish"
            ? `已发布 ${result.okCount} 篇`
            : `已撤回 ${result.okCount} 篇`,
        );
      }
    } catch (error) {
      notify(error);
    } finally {
      setBusy(false);
    }
  };

  /** 把草稿移出草稿箱：它还留在笔记里，只是不再出现在内容管理里。 */
  const removeDraft = async (post: Post) => {
    setBusy(true);
    try {
      await api.blog.setDraft.mutate({ noteId: post.id, inDrafts: false });
      await onReload();
      RootStore.Get(ToastPlugin).success("已移出草稿箱");
    } catch (error) {
      notify(error, "移出草稿箱失败");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: number) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id],
    );

  const allOnPageSelected =
    rows.length > 0 && rows.every((row) => selected.includes(row.id));

  const emptyAll = posts.length === 0;
  const emptyFiltered = !emptyAll && filtered.length === 0;

  return (
    <div className="ink-cl-layout">
      <div className="ink-cl">
      {/* 分段筛选：状态做成一眼能看完的页签，不用点开下拉才知道有几个。 */}
      <BlogTabs
        label="按发布状态筛选"
        value={status}
        onChange={key =>
          update({
            status: key === "all" ? null : (key as ContentStatus),
            page: null,
          })
        }
        items={CONTENT_STATUS_FILTERS.map((item) => ({
          key: item.key,
          label: item.label,
          count: counts[item.key] ?? 0,
        }))}
      />

      <div className="ink-cl-toolbar">
        <BlogInput
          className="ink-mg-field ink-cl-search"
          aria-label="搜索文章标题或摘要"
          placeholder="搜索标题或摘要…"
          value={keyword}
          startContent={<Icon icon="tabler:search" width={15} />}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <BlogSelect
          className="ink-mg-field"
          aria-label="所属专题筛选"
          value={topicFilter}
          onChange={(e) =>
            update({ topic: e.target.value === "all" ? null : e.target.value, page: null })
          }
        >
          <option value="all">全部专题</option>
          {topics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.name}
            </option>
          ))}
        </BlogSelect>
        <BlogSelect
          className="ink-mg-field"
          aria-label="排序方式"
          value={sort}
          onChange={(e) => update({ sort: e.target.value, page: null })}
        >
          {SORTS.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </BlogSelect>
        <BlogButton
          type="button"
          className="ink-mg-button"
          onClick={() => setPickerOpen(true)}
        >
          <Icon icon="tabler:plus" width={15} />
          加入草稿
        </BlogButton>
      </div>

      {selected.length > 0 && (
        <div className="ink-cl-bulk" role="region" aria-label="批量操作">
          <span>已选 {selected.length} 篇</span>
          <BlogButton
            type="button"
            className="ink-mg-button ink-mg-button-primary"
            disabled={busy}
            onClick={() => void bulk("publish")}
          >
            批量发布
          </BlogButton>
          <BlogButton
            type="button"
            className="ink-mg-button"
            disabled={busy}
            onClick={() => void bulk("withdraw")}
          >
            批量撤回
          </BlogButton>
          <BlogButton
            type="button"
            className="ink-mg-button ink-mg-button-ghost"
            onClick={() => setSelected([])}
          >
            取消选择
          </BlogButton>
        </div>
      )}

      {emptyAll ? (
        <div className="ink-mg-empty">
          <Icon icon="tabler:files" width={28} />
          <h2>内容管理还是空的</h2>
          <p>
            把一篇笔记加入草稿箱，在这里改公开标题、封面与专题，确认后再发布。
          </p>
          <BlogButton
            type="button"
            className="ink-mg-button ink-mg-button-primary"
            onClick={() => setPickerOpen(true)}
          >
            <Icon icon="tabler:plus" width={15} />
            从笔记加入草稿
          </BlogButton>
        </div>
      ) : emptyFiltered ? (
        <div className="ink-mg-empty">
          <Icon icon="tabler:filter" width={28} />
          <h2>没有符合条件的内容</h2>
          <p>换个状态、专题或关键词再看看。</p>
          <BlogButton
            type="button"
            className="ink-mg-button"
            onClick={() =>
              update({
                status: null,
                topic: null,
                sort: null,
                q: null,
                page: null,
              })
            }
          >
            清除筛选条件
          </BlogButton>
        </div>
      ) : (
        <div className="ink-cl-table">
          <div className="ink-cl-thead">
            <span>
              <BlogCheckbox
                type="checkbox"
                aria-label="选中本页全部内容"
                checked={allOnPageSelected}
                onChange={(e) =>
                  setSelected((prev) =>
                    e.target.checked
                      ? [...new Set([...prev, ...rows.map((row) => row.id)])]
                      : prev.filter((id) => !rows.some((row) => row.id === id)),
                  )
                }
              />
            </span>
            <span>文章</span>
            <span>状态</span>
            <span>专题</span>
            <span>更新</span>
            <span>操作</span>
          </div>

          {rows.map((post) => {
            const state = statusOf(post);
            const meta = CONTENT_STATUS_META[state];
            const cover = post.attachments.find(
              (a) => a.id === post.publication?.coverAttachmentId,
            );
            const changeText = describeChanges(post.changes);
            return (
              <div
                key={post.id}
                className="ink-cl-row"
                data-active={activeNoteId === post.id ? "1" : undefined}
                onClick={(event) => {
                  // 点按钮、链接、勾选框不触发选中：那些都是各自的动作。
                  const target = event.target as HTMLElement;
                  if (target.closest("button, a, input, label, select, textarea")) return;
                  setActiveId(post.id);
                }}
              >
                <div className="ink-cl-cell">
                  <BlogCheckbox
                    type="checkbox"
                    aria-label={`选中《${post.title}》`}
                    checked={selected.includes(post.id)}
                    onChange={() => toggle(post.id)}
                  />
                </div>

                <div className="ink-cl-cell">
                  <div className="ink-mg-tarticle">
                    <span className="ink-mg-tthumb">
                      {cover ? (
                        <img src={blogImageUrl(cover.path)} alt="" />
                      ) : (
                        <Icon icon="tabler:file-text" width={18} />
                      )}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <BlogButton
                        type="button"
                        className="ink-mg-ttitle ink-cl-title"
                        aria-pressed={activeNoteId === post.id}
                        onClick={() => setActiveId(post.id)}
                      >
                        {post.title}
                      </BlogButton>
                      <span className="ink-mg-texcerpt">{post.excerpt}</span>
                    </span>
                  </div>
                </div>

                <div className="ink-cl-cell ink-cl-cell-stack">
                  <BlogChip color={STATUS_COLOR[state]} variant="flat">
                    {meta.label}
                  </BlogChip>
                  <span className="ink-mg-tcell-muted">
                    {changeText ? `${changeText}已修改` : ""}
                  </span>
                </div>

                <div className="ink-cl-cell ink-cl-cell-stack">
                  {post.topics.length ? (
                    post.topics.slice(0, 2).map((topic) => (
                      <BlogChip key={topic.id} color="primary" variant="flat">
                        {topic.name}
                      </BlogChip>
                    ))
                  ) : (
                    <span className="ink-mg-tcell-muted">—</span>
                  )}
                </div>

                <div className="ink-cl-cell ink-cl-cell-stack">
                  <span className="ink-mg-tcell-muted">
                    {relativeTime(post.updatedAt)}
                  </span>
                  <span className="ink-mg-tcell-muted">
                    {post.revision ? `v${post.revision}` : "草稿"}
                  </span>
                </div>

                <div className="ink-cl-cell">
                  <div className="ink-cl-actions">
                    <BlogButton
                      type="button"
                      className="ink-mg-button"
                      aria-pressed={activeNoteId === post.id}
                      onClick={() => setActiveId(post.id)}
                    >
                      管理
                    </BlogButton>
                    {/*
                      行内只留一个主动作「管理」。
                      查看公开页、撤回发布这些都在右侧面板的「运营管理」里，
                      更多菜单里也各有一份 —— 行里再摆一遍就是重复入口。
                    */}
                    <RowMenu label={`《${post.title}》的更多操作`}>
                      <BlogButton
                        className="ink-mg-menu-item"
                        onClick={() =>
                          navigate(`/blog-manage/content/${post.id}`)
                        }
                      >
                        <Icon icon="tabler:edit" width={15} />
                        打开工作台
                      </BlogButton>
                      <BlogButton
                        className="ink-mg-menu-item"
                        onClick={() => setActiveId(post.id)}
                      >
                        <Icon icon="tabler:adjustments" width={15} />
                        快捷操作
                      </BlogButton>
                      {post.publishId && (
                        <a
                          className="ink-mg-menu-item"
                          href={`/blog/${post.publishId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Icon icon="tabler:external-link" width={15} />
                          查看公开页
                        </a>
                      )}
                      <a
                        className="ink-mg-menu-item"
                        href={`/detail?id=${post.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Icon icon="tabler:file-text" width={15} />
                        编辑原笔记
                      </a>
                      {state === "draft" && (
                        <BlogButton
                          className="ink-mg-menu-item"
                          onClick={() => void removeDraft(post)}
                        >
                          <Icon icon="tabler:trash" width={15} />
                          移出草稿箱
                        </BlogButton>
                      )}
                      {post.isPublished && (
                        <BlogButton
                          className="ink-mg-menu-item"
                          onClick={() => setActiveId(post.id)}
                        >
                          <Icon icon="tabler:eye-off" width={15} />
                          撤回发布
                        </BlogButton>
                      )}
                    </RowMenu>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!emptyAll && !emptyFiltered && pageCount > 1 && (
        <div className="ink-mg-page">
          <BlogButton
            className="ink-mg-page-btn"
            disabled={safePage <= 1}
            aria-label="上一页"
            onClick={() =>
              update({ page: safePage <= 2 ? null : String(safePage - 1) })
            }
          >
            ‹
          </BlogButton>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <BlogButton
              key={n}
              className="ink-mg-page-btn"
              aria-current={safePage === n ? "page" : undefined}
              onClick={() =>
                update({ page: n === 1 ? null : String(n) })
              }
            >
              {n}
            </BlogButton>
          ))}
          <BlogButton
            className="ink-mg-page-btn"
            disabled={safePage >= pageCount}
            aria-label="下一页"
            onClick={() => update({ page: String(safePage + 1) })}
          >
            ›
          </BlogButton>
        </div>
      )}

      {pickerOpen && (
        <DraftPicker
          onClose={() => setPickerOpen(false)}
          onAdded={async () => {
            await onReload();
            RootStore.Get(ToastPlugin).success("已加入草稿箱");
          }}
        />
      )}
      </div>
      <ContentQuickPanel
        noteId={activeNoteId}
        onChanged={onReload}
      />
    </div>
  );
}

/**
 * 草稿箱选篇：从笔记里挑一篇放进内容管理。
 *
 * 内容管理之前只管"已经发布过的东西"，作者写到一半的文章完全不在视野里，
 * 想找都得回笔记翻。现在可以先放进草稿箱，在同一处改标题、封面与专题。
 */
function DraftPicker({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<
    { id: number; content: string; contentLength?: number }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const search = async (keyword: string) => {
    setLoading(true);
    setError("");
    try {
      const result = await api.notes.list.mutate({
        view: "summary",
        searchText: keyword.trim(),
        type: -1,
        isArchived: null,
        isRecycle: false,
        size: 20,
        page: 1,
      });
      setRows(result as unknown as { id: number; content: string }[]);
    } catch (e: any) {
      setError(e?.message || "读取笔记失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void search("");
    // 只在打开时读一次，之后由搜索框驱动。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 搜索防抖：每敲一个字就发一次请求，笔记多了就是一堆无效查询。 */
  useEffect(() => {
    if (!term.trim()) return;
    const timer = setTimeout(() => void search(term), 280);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const add = async (id: number) => {
    setBusyId(id);
    try {
      await api.blog.setDraft.mutate({ noteId: id, inDrafts: true });
      await onAdded();
      onClose();
    } catch (e: any) {
      setError(e?.message || "加入草稿箱失败");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      hideCloseButton
      disableAnimation
      scrollBehavior="inside"
      placement="center"
      classNames={{ backdrop: "ink-cl-backdrop", wrapper: "ink-cl-wrapper" }}
    >
      <ModalContent aria-label="从笔记加入草稿" className="ink-cl-modal">
        <header className="ink-cl-modal-head">
          <h2>从笔记加入草稿</h2>
          <BlogButton
            type="button"
            className="ink-mg-button ink-mg-button-ghost"
            onClick={onClose}
            aria-label="关闭"
          >
            <Icon icon="tabler:x" width={16} />
          </BlogButton>
        </header>
        <div className="ink-cl-modal-body">
          <BlogInput
            className="ink-mg-field"
            aria-label="搜索笔记"
            placeholder="搜索笔记内容…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          {error && (
            <p className="ink-mg-alert" role="alert">
              {error}
            </p>
          )}
          {loading ? (
            <p className="ink-mg-empty" role="status">
              正在读取笔记…
            </p>
          ) : rows.length ? (
            <ul className="ink-cl-picker">
              {rows.map((row) => (
                <li key={row.id}>
                  <span className="ink-cl-picker-text">
                    {row.content?.replace(/<[^>]*>/g, " ").slice(0, 80) ||
                      "（空白笔记）"}
                  </span>
                  <BlogButton
                    type="button"
                    className="ink-mg-button ink-mg-button-primary"
                    disabled={busyId === row.id}
                    onClick={() => void add(row.id)}
                  >
                    加入
                  </BlogButton>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ink-mg-empty">没有找到匹配的笔记。</p>
          )}
        </div>
      </ModalContent>
    </Modal>
  );
}
