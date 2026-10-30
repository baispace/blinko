import { BlogChipGroup } from "./BlogUI";
import { BlogStudioBrand } from "./BlogStudioBrand";
import { Button, Chip, Card, CardBody, CardHeader } from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "@/lib/trpc";
import { blogImageUrl } from "@/lib/blogImage";
import { RootStore } from "@/store";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { Icon } from "@/components/Common/Iconify/icons";
import { PublicArticleBody } from "./PublicArticleBody";
import { ContentQuickPanel } from "./ContentQuickPanel";
import {
  CONTENT_STATUS_META,
  STATUS_TONE_COLOR,
  contentTitle,
  describeChanges,
  resolveContentStatus,
} from "./contentStatus";

type Status = Awaited<ReturnType<typeof api.notes.publicationStatus.query>>;

function plainLength(content: string) {
  return (content || "").replace(/<[^>]*>/g, "").trim().length;
}

export function BlogArticleDetail() {
  const { noteId } = useParams();
  const id = Number(noteId);
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status | null>(null);
  const [preview, setPreview] = useState<"draft" | "public">("draft");
  const [params, setParams] = useSearchParams();
  const [focusPanel, setFocusPanel] = useState(params.get('publish') === '1');
  const [error, setError] = useState("");

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

  const changedFields = useMemo(() => status?.changes ?? [], [status?.changes]);
  const changeText = describeChanges(changedFields);

  const draftTitle =
    status?.draft.title.trim() || contentTitle(status?.draft.content ?? "");
  const currentTitle = status?.current
    ? status.current.title || contentTitle(status.current.content)
    : "";

  if (!status)
    return (
      <div className="flex min-h-screen bg-background text-foreground">
        <div className="mx-auto w-full max-w-3xl px-6 pt-10">
          <div className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger">
            <span>{error || "正在加载文章…"}</span>
            {error && (
              <Button
                size="sm"
                variant="flat"
                className="ml-3"
                onPress={() => navigate("/blog-manage")}
              >
                返回管理
              </Button>
            )}
          </div>
        </div>
      </div>
    );

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
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* ---------- 顶部栏 ---------- */}
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
        <Button
          size="sm"
          variant="flat"
          onPress={() => navigate("/blog-manage")}
        >
          返回管理
        </Button>
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-8">
        {/* ---------- 页头 ---------- */}
        <div className="mb-6 min-w-0">
          <nav className="mb-2 flex items-center gap-1.5 text-xs text-default-500">
            <button
              type="button"
              className="transition-colors hover:text-foreground"
              onClick={() => navigate("/blog-manage")}
            >
              博客管理
            </button>
            <Icon icon="tabler:chevron-right" width={12} />
            <span className="truncate text-default-700">{draftTitle || "无标题"}</span>
          </nav>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">{draftTitle || "文章管理"}</h1>
            <Chip
              size="sm"
              variant="flat"
              color={STATUS_TONE_COLOR[badge.tone]}
            >
              {badge.text}
            </Chip>
          </div>
          <p className="mt-1 text-sm text-default-500">
            {stateMeta.desc}
            {/*
              变更清单只在「线上还挂着旧版」时才有意义。
              从未发布过的草稿跟空快照比，每个字段都算「变了」——
              列一串「标题、摘要、正文…」等于没列。
            */}
            {state === "changed" && changeText
              ? ` 待发布变更：${changeText}。`
              : ""}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-6 lg:flex-row">
          {/* ---------- 主内容 ---------- */}
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            {/* 发布前检查 */}
            <Card className="rounded-xl border border-default-200 shadow-none">
              <CardHeader className="flex items-center justify-between gap-3 pb-1">
                <h2 className="text-base font-semibold">发布前检查</h2>
                <Chip
                  size="sm"
                  variant="flat"
                  color={status.canPublish ? "success" : "warning"}
                >
                  {status.canPublish
                    ? "可以发布"
                    : `${status.blockers.length} 项待处理`}
                </Chip>
              </CardHeader>
              <CardBody className="pt-2">
                {status.blockers.length ? (
                  <ul className="list-inside list-disc space-y-1 text-sm text-danger">
                    {status.blockers.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-default-500">没有阻塞发布的问题。</p>
                )}
              </CardBody>
            </Card>

            {/* 公开效果预览 */}
            <Card className="rounded-xl border border-default-200 shadow-none">
              <CardHeader className="flex items-center justify-between gap-3 pb-1">
                <h2 className="text-base font-semibold">公开效果预览</h2>
                <BlogChipGroup
                  label="预览版本"
                  value={preview}
                  onChange={key => setPreview(key as typeof preview)}
                  items={[
                    { key: "draft", label: "待发布" },
                    { key: "public", label: "当前公开" },
                  ]}
                />
              </CardHeader>
              <CardBody className="space-y-3 pt-2">
                {shownCover && (
                  <img
                    className="max-h-56 w-full rounded-lg object-cover"
                    src={blogImageUrl(shownCover.path)}
                    alt="文章封面"
                  />
                )}
                <h3 className="text-lg font-semibold leading-snug">
                  {shown.title || "无标题"}
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-xs text-default-500">
                  {status.topics.map((t) => (
                    <span
                      className="rounded-full bg-default-100 px-2.5 py-0.5 text-default-600"
                      key={t.id}
                    >
                      {t.name}
                      {t.sectionName ? ` › ${t.sectionName}` : ""}
                    </span>
                  ))}
                  {shown.at && (
                    <time>{new Date(shown.at).toLocaleDateString("zh-CN")}</time>
                  )}
                </div>
                {shown.summary && (
                  <p className="text-sm text-default-600">{shown.summary}</p>
                )}
                {shown.publicTags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {shown.publicTags.map((tag) => (
                      <span
                        className="rounded-full bg-default-100 px-2.5 py-0.5 text-xs text-default-600"
                        key={tag}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="ink-prose pt-2 text-sm leading-relaxed">
                  <PublicArticleBody content={shown.content} authenticated />
                </div>
              </CardBody>
            </Card>

            {/* 原笔记依据 */}
            <Card className="rounded-xl border border-default-200 shadow-none">
              <CardBody className="p-0">
                <details className="group">
                  <summary className="flex cursor-pointer items-center gap-2 px-5 py-3.5 text-sm font-medium select-none">
                    <Icon
                      icon="tabler:chevron-down"
                      width={15}
                      className="transition-transform group-open:rotate-180"
                    />
                    原笔记依据
                    <small className="text-xs font-normal text-default-500">
                      已保存 {plainLength(status.draft.content)} 字
                    </small>
                  </summary>
                  <div className="ink-prose border-t border-default-200 px-5 py-4 text-sm leading-relaxed">
                    <PublicArticleBody content={status.draft.content} authenticated />
                  </div>
                  <div className="border-t border-default-200 px-5 py-3">
                    <a
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                      href={`/detail?id=${id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      打开原笔记 <Icon icon="tabler:external-link" width={13} />
                    </a>
                  </div>
                </details>
              </CardBody>
            </Card>
          </div>

          {/* ---------- 侧栏 ---------- */}
          <aside className="w-full shrink-0 lg:w-80">
            <ContentQuickPanel noteId={id} onChanged={load} focus={focusPanel} />
          </aside>
        </div>
      </div>

      {/* ---------- 底部提示 ---------- */}
      <div className="sticky bottom-0 border-t border-default-200 bg-background px-4 py-3">
        <p className="mx-auto w-full max-w-6xl text-xs text-default-500">
          标题、封面与展示设置都在右侧快捷操作里改；改动先存在草稿，发布后才对外生效。
        </p>
      </div>
    </div>
  );
}
