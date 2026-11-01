import { BlogStudioBrand } from "./BlogStudioBrand";
import { Button, Chip } from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "@/lib/trpc";
import { Icon } from "@/components/Common/Iconify/icons";
import { ContentQuickPanel } from "./ContentQuickPanel";
import {
  CONTENT_STATUS_META,
  STATUS_TONE_COLOR,
  contentTitle,
  describeChanges,
  resolveContentStatus,
} from "./contentStatus";

type Status = Awaited<ReturnType<typeof api.notes.publicationStatus.query>>;

export function BlogArticleDetail() {
  const { noteId } = useParams();
  const id = Number(noteId);
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status | null>(null);
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

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-y-auto overscroll-contain bg-background text-foreground">
      {/* ---------- 顶部栏 ---------- */}
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-default-200 bg-background px-4">
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

      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 lg:px-8">
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
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold">{draftTitle || "文章管理"}</h1>
            <Chip
              size="sm"
              variant="flat"
              color={STATUS_TONE_COLOR[badge.tone]}
            >
              {badge.text}
            </Chip>
            <Button color="primary" size="sm" className="ml-auto" type="submit" form={`blog-publish-${id}`}>
              {state === "withdrawn" ? "重新发布" : state === "draft" ? "发布文章" : "更新发布"}
            </Button>
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

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-default-200 px-4 py-3">
          <div className="text-sm">
            <strong>{status.canPublish ? "可以发布" : `${status.blockers.length} 项待处理`}</strong>
            {status.blockers.length > 0 && <ul className="mt-1 list-inside list-disc text-danger">{status.blockers.map(item => <li key={item}>{item}</li>)}</ul>}
          </div>
          <Button as="a" href={`/detail?id=${id}`} target="_blank" rel="noopener noreferrer" size="sm" variant="flat">打开原笔记 ↗</Button>
        </div>
        <ContentQuickPanel noteId={id} onChanged={load} focus={focusPanel} />
      </div>

      {/* ---------- 底部提示 ---------- */}
      <div className="sticky bottom-0 shrink-0 border-t border-default-200 bg-background px-4 py-3">
        <p className="mx-auto w-full max-w-6xl text-xs text-default-500">
          在此管理标题、封面与展示设置；保存草稿不会改变公开内容，发布后才对外生效。
        </p>
      </div>
    </div>
  );
}
