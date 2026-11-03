import { BlogChip, BlogInput, BlogSelect, BlogTabs } from "./BlogUI";
import { confirmBlogAction } from "./confirmBlogAction";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Button,
  Checkbox,
  Chip,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  User,
} from "@heroui/react";
import { api } from "@/lib/trpc";
import { blogImageUrl } from "@/lib/blogImage";
import { RootStore } from "@/store";
import { BlinkoStore } from "@/store/blinkoStore";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { Icon } from "@/components/Common/Iconify/icons";
import { RowMenu } from "./RowMenu";
import { BlogAiCopyDialog } from "./BlogAiCopyDialog";
import { BlogCoverAssistant } from "./BlogCoverAssistant";
import {
  CONTENT_STATUS_FILTERS,
  CONTENT_STATUS_META,
  STATUS_TONE_COLOR,
  describeChanges,
  resolveContentStatus,
  type ContentStatus,
} from "./contentStatus";

type Post = Awaited<ReturnType<typeof api.blog.published.query>>[number];
type Topic = Awaited<ReturnType<typeof api.blog.topics.query>>[number];

const PAGE_SIZE = 10;

const SORTS = [
  { key: "updated", label: "最近更新" },
  { key: "published", label: "首次发布" },
  { key: "title", label: "标题" },
] as const;

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
  const [busy, setBusy] = useState(false);
  /** 正在发布的那一行：只有它在转圈，其余行照常可点。 */
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** 正在做 AI 文案的文章。 */
  const [copyTarget, setCopyTarget] = useState<number | null>(null);
  /** 正在做 AI 封面的文章。 */
  const [coverTarget, setCoverTarget] = useState<number | null>(null);

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

  const [keyword, setKeyword] = useState(query);
  useEffect(() => setKeyword(query), [query]);
  useEffect(() => {
    if (keyword === query) return;
    const timer = setTimeout(
      () => update({ q: keyword || null, page: null }),
      260,
    );
    return () => clearTimeout(timer);
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

  /**
   * 状态分段：只留有内容的。
   *
   * 一个新站通常只有「草稿」或「待发布更新」里有东西，其余三个都是 0 ——
   * 一排 0 计数的页签只是噪声，还把真正有事的那一个挤到视线边缘。
   * 当前选中的那个始终保留：筛出空结果时得留一条退路。
   */
  const statusItems = useMemo(
    () =>
      CONTENT_STATUS_FILTERS.filter(
        (item) =>
          item.key === "all" ||
          item.key === status ||
          (counts[item.key] ?? 0) > 0,
      ).map((item) => ({
        key: item.key,
        label: item.label,
        count: counts[item.key] ?? 0,
      })),
    [counts, status],
  );

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

  const notify = (error: unknown, fallback = "操作失败，请重试") =>
    RootStore.Get(ToastPlugin).error(
      error instanceof Error && error.message ? error.message : fallback,
    );

  /**
   * 单篇发布。
   *
   * 不做批量：一次发多篇时最怕「到底发了哪几篇」说不清，
   * 一篇一篇点反而踏实 —— 每篇要确认什么、改了什么、发了什么，都在这一行里看得见。
   *
   * 走的是笔记发布快照那条路：公开版读草稿（标题、概要、封面、标签都取草稿那份），
   * 发布设置、SEO 与精选位一概不动。
   */
  const publish = async (post: Post) => {
    if (busy) return;
    setBusy(true);
    setPublishingId(post.id);
    try {
      /*
       * 正文撞车要先让作者决定：原笔记和发布草稿都改过、两边还不一样时，
       * 默默替作者挑一份就是在丢内容。列表里不做这个选择，
       * 把他送到文章页 —— 那里有「保留发布草稿 / 采用原笔记最新正文」两个选项。
       */
      const state = await api.blog.publishSettings.query({ noteId: post.id });
      if (state.check.conflicts.some((conflict) => conflict.field === "body")) {
        RootStore.Get(ToastPlugin).error(
          "原笔记与发布草稿的正文都改过，请到文章页选择要发布的正文。",
        );
        navigate(`/blog-manage/content/${post.id}`);
        return;
      }
      await api.notes.publishNote.mutate({ id: post.id });
      RootStore.Get(ToastPlugin).success(
        state.isPublished ? "已更新发布" : "已发布",
      );
      RootStore.Get(BlinkoStore).updateTicker++;
      await onReload();
    } catch (error) {
      notify(error, "发布失败，请重试。");
    } finally {
      setPublishingId(null);
      setBusy(false);
    }
  };

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

  const withdraw = async (post: Post) => {
    const ok = await confirmBlogAction(
      '撤回后公开链接、首页、搜索与专题将停止展示，原笔记和草稿会保留。确定撤回这篇文章？',
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api.notes.publishNote.mutate({
        id: post.id,
        isCancel: true,
      });
      RootStore.Get(ToastPlugin).success('已撤回发布');
      RootStore.Get(BlinkoStore).updateTicker++;
      await onReload();
    } catch (error) {
      notify(error, '撤回失败，请重试。');
    } finally {
      setBusy(false);
    }
  };

  const emptyAll = posts.length === 0;
  const emptyFiltered = !emptyAll && filtered.length === 0;

  return (
    <div className="flex flex-col">
      <BlogTabs
        label="按发布状态筛选"
        value={status}
        onChange={key =>
          update({
            status: key === "all" ? null : (key as ContentStatus),
            page: null,
          })
        }
        items={statusItems}
      />

      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <BlogInput
          aria-label="搜索文章标题或摘要"
          placeholder="搜索标题或摘要…"
          value={keyword}
          startContent={<Icon icon="tabler:search" width={15} />}
          onChange={(e) => setKeyword(e.target.value)}
          className="flex-1 min-w-[180px] max-w-xs"
        />
        {/* 没有专题时不摆这个筛选 —— 一个只有「全部专题」的选项框没有信息量。 */}
        {topics.length > 0 && (
          <BlogSelect
            aria-label="所属专题筛选"
            value={topicFilter}
            onChange={(e) =>
              update({ topic: e.target.value === "all" ? null : e.target.value, page: null })
            }
            className="w-[150px]"
          >
            <option value="all">全部专题</option>
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </BlogSelect>
        )}
        <BlogSelect
          aria-label="排序方式"
          value={sort}
          onChange={(e) => update({ sort: e.target.value, page: null })}
          className="w-[150px]"
        >
          {SORTS.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </BlogSelect>
        <Button
          variant="flat"
          size="sm"
          onPress={() => setPickerOpen(true)}
        >
          <Icon icon="tabler:plus" width={15} />
          加入草稿
        </Button>
      </div>

      {emptyAll ? (
        <div className="flex flex-col items-center justify-center py-16 text-default-400">
          <Icon icon="tabler:files" width={28} />
          <h2 className="text-base font-medium mt-3 text-default-600">内容管理还是空的</h2>
          <p className="text-sm mt-1 max-w-md text-center">
            把一篇笔记加入草稿箱，在这里改公开标题、封面与专题，确认后再发布。
          </p>
          <Button color="primary" className="mt-4" onPress={() => setPickerOpen(true)}>
            <Icon icon="tabler:plus" width={15} />
            从笔记加入草稿
          </Button>
        </div>
      ) : emptyFiltered ? (
        <div className="flex flex-col items-center justify-center py-16 text-default-400">
          <Icon icon="tabler:filter" width={28} />
          <h2 className="text-base font-medium mt-3 text-default-600">没有符合条件的内容</h2>
          <p className="text-sm mt-1">换个状态、专题或关键词再看看。</p>
          <Button
            variant="flat"
            className="mt-4"
            onPress={() =>
              update({ status: null, topic: null, sort: null, q: null, page: null })
            }
          >
            清除筛选条件
          </Button>
        </div>
      ) : (
        <>
          <Table
            aria-label="文章列表"
            classNames={{
              base: "rounded-xl border border-default-200",
              th: "bg-default-50 text-default-500 text-xs font-semibold",
              td: "text-sm",
            }}
          >
            <TableHeader>
              <TableColumn>文章</TableColumn>
              <TableColumn width={110}>状态</TableColumn>
              <TableColumn width={90} className="hidden lg:table-cell">更新</TableColumn>
              <TableColumn>操作</TableColumn>
            </TableHeader>
            <TableBody>
              {rows.map((post) => {
                const state = statusOf(post);
                const meta = CONTENT_STATUS_META[state];
                const cover = post.attachments.find(
                  (a) => a.id === post.publication?.coverAttachmentId,
                );
                const changeText = describeChanges(post.changes);
                return (
                  <TableRow
                    key={post.id}
                    className="cursor-pointer hover:bg-default-50"
                    onClickCapture={(event) => {
                      const target = event.target as HTMLElement;
                      if (target.closest('button, a, input, label, [role="checkbox"], [role="menuitem"]')) return;
                      navigate(`/blog-manage/content/${post.id}`);
                    }}
                  >
                    <TableCell>
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="w-10 h-10 rounded-lg bg-default-100 flex items-center justify-center shrink-0 overflow-hidden">
                          {cover ? (
                            <img src={blogImageUrl(cover.path)} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Icon icon="tabler:file-text" width={18} className="text-default-400" />
                          )}
                        </span>
                        {/*
                          标题栏要有宽度上限。
                          表格是自动列宽的，摘要越长这一列越宽 ——
                          操作列（发布、AI、更多）就被推到屏幕外，作者得横着拖才能点。
                          上限 340px，摘要最多两行，操作列始终在视野里。
                        */}
                        <div className="min-w-0 flex-1 max-w-[140px] sm:max-w-[340px]">
                          <a
                            href={`/blog-manage/content/${post.id}`}
                            className="text-sm font-medium text-foreground hover:text-primary bg-transparent border-0 p-0 cursor-pointer text-left truncate block w-full"
                            onClick={(event) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate(`/blog-manage/content/${post.id}`); }}
                          >
                            {post.title}
                          </a>
                          <span className="text-xs text-default-500 line-clamp-2">
                            {post.excerpt}
                          </span>
                          {/*
                            变更明细与专题标签都收在标题下面。
                            原来「专题」是一整列，没有专题时整列都是「—」——
                            一列换来一个破折号不值；标签挂在标题下反而更好认。
                            变更明细只在「线上还挂着旧版」时才有意义：草稿跟空快照比，
                            每个字段都算变了，列出来等于没列。
                          */}
                          {((state === "changed" && changeText) ||
                            post.topics.length > 0) && (
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {state === "changed" && changeText && (
                                <span className="text-xs text-warning-600">
                                  {changeText}已修改
                                </span>
                              )}
                              {post.topics.slice(0, 2).map((topic) => (
                                <Chip key={topic.id} size="sm" color="primary" variant="flat">
                                  {topic.name}
                                </Chip>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Chip size="sm" color={STATUS_TONE_COLOR[meta.tone]} variant="flat">
                        {meta.label}
                      </Chip>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-xs text-default-500 whitespace-nowrap">
                        {relativeTime(post.updatedAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {/*
                        两个 AI 入口直接摆在行里，不藏进「更多」：
                        改标题、补概述、换封面是列表页最常做的三件事，
                        藏进二级菜单等于让作者每篇都多点两下。
                        图标按钮 + 原生 tooltip：列宽不用撑开，一眼能分清谁是谁。
                      */}
                      <div className="flex items-center justify-end gap-0.5">
                        {/*
                          手机上只留「发布」与「更多」：四个按钮挤在一行，
                          标题就没地方放了，整张表只能横着滑出去。
                          两个 AI 入口在文章页的快捷面板里一样有。
                        */}
                        <div className="hidden sm:flex items-center gap-0.5">
                        <Button
                          isIconOnly
                          size="sm"
                          radius="md"
                          variant="light"
                          aria-label={`AI 优化《${post.title}》的标题与概述`}
                          title="AI 优化标题与概述"
                          onPress={() => setCopyTarget(post.id)}
                        >
                          <Icon icon="tabler:sparkles" width={16} />
                        </Button>
                        <Button
                          isIconOnly
                          size="sm"
                          radius="md"
                          variant="light"
                          aria-label={`AI 生成《${post.title}》的封面`}
                          title="AI 生成封面"
                          onPress={() => setCoverTarget(post.id)}
                        >
                          <Icon icon="tabler:photo" width={16} />
                        </Button>
                        </div>
                        {/*
                          每行一个主动作，写法取自状态模型：
                          草稿是「发布」、有改动是「更新发布」、撤回过是「重新发布」，
                          已经是最新的就没有可发布的东西 —— 只给「查看公开页」。
                          一个状态只给一个主动作，作者不用在一排等价按钮里挑。

                          窄屏只留图标：操作列要跟标题抢宽度，
                          与其让整张表横着滚出去、把主动作推到屏幕外，
                          不如把字换成图标（tooltip 与 aria-label 仍说清是什么）。
                        */}
                        {state === "published" ? (
                          post.publishId ? (
                            <Button
                              size="sm"
                              radius="md"
                              variant="light"
                              as="a"
                              href={`/blog/${post.publishId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`查看《${post.title}》的公开页`}
                              className="px-2 min-w-[2rem]"
                            >
                              <span className="hidden sm:inline">{meta.action}</span>
                              <Icon
                                icon="tabler:external-link"
                                width={15}
                                className="sm:hidden"
                              />
                            </Button>
                          ) : null
                        ) : (
                          <Button
                            size="sm"
                            radius="md"
                            color="primary"
                            variant="flat"
                            isDisabled={busy}
                            isLoading={publishingId === post.id}
                            aria-label={`${meta.action}《${post.title}》`}
                            onPress={() => void publish(post)}
                            className="px-2 min-w-[2rem]"
                          >
                            <span className="hidden sm:inline">{meta.action}</span>
                            <Icon icon="tabler:upload" width={15} className="sm:hidden" />
                          </Button>
                        )}
                      <RowMenu label={`《${post.title}》的更多操作`}>
                        {/*
                          只给真的公开了的文章这个入口。
                          发布标记在、公开快照缺失时，那个地址打不开 ——
                          给一个点进去是 404 的链接没有意义。
                        */}
                        {post.isPublished && post.publishId && (
                          <a
                            className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg hover:bg-default-100 no-underline text-foreground"
                            href={`/blog/${post.publishId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Icon icon="tabler:external-link" width={15} />
                            查看公开页
                          </a>
                        )}
                        <a
                          className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg hover:bg-default-100 no-underline text-foreground"
                          href={`/detail?id=${post.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Icon icon="tabler:file-text" width={15} />
                          编辑原笔记
                        </a>
                        {state === "draft" && (
                          <Button
                            variant="light"
                            className="justify-start w-full text-sm"
                            onPress={() => void removeDraft(post)}
                          >
                            <Icon icon="tabler:trash" width={15} />
                            移出草稿箱
                          </Button>
                        )}
                        {post.isPublished && (
                          <Button
                            variant="light"
                            className="justify-start w-full text-sm"
                            onPress={() => void withdraw(post)}
                          >
                            <Icon icon="tabler:eye-off" width={15} />
                            撤回发布
                          </Button>
                        )}
                      </RowMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {pageCount > 1 && (
            <div className="flex justify-center mt-4">
              <Pagination
                total={pageCount}
                page={safePage}
                onChange={(p) => update({ page: p === 1 ? null : String(p) })}
                size="sm"
              />
            </div>
          )}
        </>
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

      {/*
        两个 AI 窗口都写到草稿里：公开页读的是快照，
        改完要回文章页点「更新发布」才会对外生效。
      */}
      {copyTarget !== null && (
        <BlogAiCopyDialog
          noteId={copyTarget}
          onApplied={async () => {
            await onReload();
          }}
          onClose={() => setCopyTarget(null)}
        />
      )}
      {coverTarget !== null && (
        <BlogCoverAssistant
          noteId={coverTarget}
          onApplied={async () => {
            await onReload();
          }}
          onClose={() => setCoverTarget(null)}
        />
      )}
    </div>
  );
}

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      scrollBehavior="inside"
      placement="center"
      size="lg"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center justify-between">
              <h2 className="text-base font-semibold">从笔记加入草稿</h2>
            </ModalHeader>
            <ModalBody className="pb-6">
              <BlogInput
                aria-label="搜索笔记"
                placeholder="搜索笔记内容…"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
              {error && (
                <p className="text-sm text-danger rounded-lg bg-danger-50 border border-danger-200 px-3 py-2" role="alert">
                  {error}
                </p>
              )}
              {loading ? (
                <p className="text-sm text-default-500 py-8 text-center" role="status">
                  正在读取笔记…
                </p>
              ) : rows.length ? (
                <ul className="flex flex-col gap-2">
                  {rows.map((row) => (
                    <li key={row.id} className="flex items-center gap-3 p-3 rounded-xl border border-default-200 bg-content1">
                      <span className="flex-1 min-w-0 text-sm text-foreground truncate">
                        {row.content?.replace(/<[^>]*>/g, " ").slice(0, 80) || "（空白笔记）"}
                      </span>
                      <Button
                        color="primary"
                        size="sm"
                        isDisabled={busyId === row.id}
                        isLoading={busyId === row.id}
                        onPress={() => void add(row.id)}
                      >
                        加入
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-default-500 py-8 text-center">没有找到匹配的笔记。</p>
              )}
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
