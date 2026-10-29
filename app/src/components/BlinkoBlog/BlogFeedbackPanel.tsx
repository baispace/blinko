import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, CardBody, Chip } from "@heroui/react";
import { Icon } from "@/components/Common/Iconify/icons";
import { BlogChipGroup, BlogTextarea } from "./BlogUI";
import { api } from "@/lib/trpc";
import { RootStore } from "@/store";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import {
  FEEDBACK_STATUS_LABEL,
  FEEDBACK_TYPE_LABEL,
  type FeedbackStatus,
  type FeedbackType,
} from "@shared/lib/blogInteraction";

type ArticleFeedback = Awaited<
  ReturnType<typeof api.blog.articleFeedbacks.query>
>[number];
type MomentFeedback = Awaited<
  ReturnType<typeof api.blog.momentFeedbacks.query>
>[number];

const FILTERS = [
  { key: "pending", label: "待处理" },
  { key: "replied", label: "已回复" },
  { key: "archived", label: "已归档" },
  { key: "all", label: "全部" },
] as const;

type Filter = (typeof FILTERS)[number]["key"];

const SOURCES = [
  { key: "all", label: "全部来源" },
  { key: "article", label: "文章" },
  { key: "moment", label: "动态" },
] as const;

type Source = (typeof SOURCES)[number]["key"];
type RowKey = string;

type FeedbackRow = {
  key: RowKey;
  source: "article" | "moment";
  id: number;
  href: string;
  title: string;
  type: string;
  content: string;
  nickname: string;
  wantReply: boolean;
  email: string;
  allowPublic: boolean;
  status: string;
  createdAt: string | Date;
  replies: {
    id: number;
    content: string;
    mailStatus: string;
    mailError: string;
    createdAt: string | Date;
  }[];
};

function toArticleRow(row: ArticleFeedback): FeedbackRow {
  return {
    key: `article:${row.id}`,
    source: "article",
    id: row.id,
    href: `/blog/${row.publishId}`,
    title: row.title || "（无标题）",
    type: row.type,
    content: row.content,
    nickname: row.nickname,
    wantReply: row.wantReply,
    email: row.email,
    allowPublic: row.allowPublic,
    status: row.status,
    createdAt: row.createdAt,
    replies: row.replies,
  };
}

function toMomentRow(row: MomentFeedback): FeedbackRow {
  const summary = row.note?.summary?.trim();
  return {
    key: `moment:${row.id}`,
    source: "moment",
    id: row.id,
    href: `/blog/moments#m${row.noteId}`,
    title: summary || `动态 #${row.noteId}`,
    type: row.type,
    content: row.content,
    nickname: row.nickname,
    wantReply: row.wantReply,
    email: row.email,
    allowPublic: row.allowPublic,
    status: row.status,
    createdAt: row.createdAt,
    replies: row.replies,
  };
}

const STATUS_COLOR: Record<string, "default" | "success" | "warning" | "danger"> = {
  pending: "warning",
  replied: "success",
  archived: "default",
};

export function BlogFeedbackPanel() {
  const [filter, setFilter] = useState<Filter>("pending");
  const [source, setSource] = useState<Source>("all");
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mailEnabled, setMailEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<RowKey, string>>({});
  const [busyId, setBusyId] = useState<RowKey | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [articles, moments, notice] = await Promise.all([
        api.blog.articleFeedbacks.query(),
        api.blog.momentFeedbacks.query(),
        api.blog.publicMailNotice.query(),
      ]);
      const all = [
        ...articles.map(toArticleRow),
        ...moments.map(toMomentRow),
      ].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setRows(all);
      setMailEnabled(!!notice.mailEnabled);
      setCounts({
        pending: all.filter((r) => r.status === "pending").length,
        replied: all.filter((r) => r.status === "replied").length,
        archived: all.filter((r) => r.status === "archived").length,
        all: all.length,
      });
    } catch (e: any) {
      setError(e?.message || "反馈数据加载失败，请重试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          (filter === "all" || r.status === filter) &&
          (source === "all" || r.source === source),
      ),
    [rows, filter, source],
  );

  const toastError = (e: any) =>
    RootStore.Get(ToastPlugin).error(
      e instanceof Error ? e.message : "操作失败，请重试",
    );

  const withBusy = async (key: RowKey, task: () => Promise<void>) => {
    setBusyId(key);
    try {
      await task();
    } catch (e) {
      toastError(e);
    } finally {
      setBusyId(null);
    }
  };

  const saveReply = (row: FeedbackRow) =>
    withBusy(row.key, async () => {
      const content = (drafts[row.key] ?? "").trim();
      if (!content) {
        toastError("请先填写回复内容");
        return;
      }
      const result =
        row.source === "moment"
          ? await api.blog.momentFeedbackReply.mutate({
              feedbackId: row.id,
              content,
            })
          : await api.blog.articleFeedbackReply.mutate({
              feedbackId: row.id,
              content,
            });
      setDrafts((prev) => ({ ...prev, [row.key]: "" }));
      if (result.skipped) {
        RootStore.Get(ToastPlugin).success("回复已保存（读者未订阅邮件通知）");
      } else if (result.mailStatus === "sent") {
        RootStore.Get(ToastPlugin).success("回复已保存，通知邮件已发出");
      } else if (result.mailStatus === "failed") {
        RootStore.Get(ToastPlugin).error(
          `回复已保存，但通知邮件发送失败：${result.mailError}`,
        );
      } else {
        RootStore.Get(ToastPlugin).success("回复已保存");
      }
      await load();
    });

  const resend = (row: FeedbackRow, replyId: number) =>
    withBusy(row.key, async () => {
      const result =
        row.source === "moment"
          ? await api.blog.momentFeedbackResend.mutate({
              feedbackId: row.id,
              replyId,
            })
          : await api.blog.articleFeedbackResend.mutate({
              feedbackId: row.id,
              replyId,
            });
      if (result.skipped) {
        RootStore.Get(ToastPlugin).error(
          "读者未订阅回复通知，无法发送邮件。",
        );
      } else if (result.mailStatus === "sent") {
        RootStore.Get(ToastPlugin).success("通知邮件已发出");
      } else {
        RootStore.Get(ToastPlugin).error(
          `发送失败：${result.mailError || "未知原因"}`,
        );
      }
      await load();
    });

  const archive = (row: FeedbackRow) =>
    withBusy(row.key, async () => {
      if (row.source === "moment")
        await api.blog.momentFeedbackArchive.mutate({ feedbackId: row.id });
      else
        await api.blog.articleFeedbackArchive.mutate({ feedbackId: row.id });
      RootStore.Get(ToastPlugin).success("反馈已归档");
      await load();
    });

  if (loading) {
    return (
      <p className="py-8 text-center text-sm text-default-500" role="status">
        正在加载读者反馈…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger">
          <span className="flex-1">{error}</span>
          <Button size="sm" variant="flat" color="danger" onPress={() => void load()}>
            重试加载
          </Button>
        </div>
      )}

      {mailEnabled === false && (
        <div className="flex items-start gap-2 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning" role="note">
          <Icon icon="tabler:alert-circle" width={16} className="mt-0.5 shrink-0" />
          <span>
            邮件服务未配置，作者仍可以处理并记录回复，但无法给订阅了通知的读者发信。{" "}
            <a className="font-medium text-warning hover:underline" href="/blog-manage?section=mail">
              去配置邮件服务
            </a>
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">读者反馈</h2>
          <p className="text-xs text-default-500">
            共 {rows.length} 条 · 待处理 {counts.pending ?? 0} 条
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <BlogChipGroup
            label="反馈来源筛选"
            value={source}
            onChange={(key) => setSource(key as Source)}
            items={SOURCES.map((item) => ({
              key: item.key,
              label: item.label,
            }))}
          />
          <BlogChipGroup
            label="反馈状态筛选"
            value={filter}
            onChange={(key) => setFilter(key as Filter)}
            items={FILTERS.map((item) => ({
              key: item.key,
              label: item.label,
              count: counts[item.key] ?? 0,
            }))}
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="py-10 text-center">
          <Icon icon="tabler:message" width={28} className="mx-auto text-default-300" />
          <h2 className="mt-2 text-sm font-semibold">没有符合条件的反馈</h2>
          <p className="mt-1 text-xs text-default-500">换个状态筛选，或等待读者留言。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((row) => (
            <Card key={row.key} className="rounded-xl border border-default-200 shadow-none">
              <CardBody className="space-y-3">
                {/* 头部信息 */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Chip size="sm" variant="flat" color={row.source === "moment" ? "secondary" : "primary"}>
                    {row.source === "moment" ? "动态" : "文章"}
                  </Chip>
                  <a
                    className="font-medium text-primary hover:underline"
                    href={row.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {row.title}
                  </a>
                  <Chip size="sm" variant="flat" color="default">
                    {FEEDBACK_TYPE_LABEL[row.type as FeedbackType] ?? row.type}
                  </Chip>
                  <Chip size="sm" variant="flat" color={STATUS_COLOR[row.status] ?? "default"}>
                    {FEEDBACK_STATUS_LABEL[row.status as FeedbackStatus] ?? row.status}
                  </Chip>
                  <span className="ml-auto text-default-500">
                    {new Date(row.createdAt).toLocaleString("zh-CN")}
                  </span>
                </div>

                {/* 内容 */}
                <p className="text-sm leading-relaxed">{row.content}</p>

                {/* 元数据 */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-default-500">
                  <span>称呼：{row.nickname || "匿名读者"}</span>
                  <span>
                    订阅回复通知：
                    {row.wantReply ? (row.email ? "是" : "是（未留邮箱）") : "否"}
                  </span>
                  <span>允许匿名公开：{row.allowPublic ? "是" : "否"}</span>
                  {row.email && <code className="rounded bg-default-100 px-1">{row.email}</code>}
                </div>

                {/* 历史回复 */}
                {row.replies.length > 0 && (
                  <div className="space-y-2 border-t border-default-200 pt-3">
                    {row.replies.map((reply) => (
                      <div key={reply.id} className="rounded-lg bg-default-50 p-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-medium text-default-600">
                            作者回复 · {new Date(reply.createdAt).toLocaleString("zh-CN")}
                          </span>
                          <Chip size="sm" variant="flat" color="default">
                            邮件：{reply.mailStatus === "sent" ? "已发送" : reply.mailStatus === "failed" ? "发送失败" : reply.mailStatus === "sending" ? "发送中" : reply.mailStatus === "skipped" ? "读者未订阅通知" : "未发送"}
                          </Chip>
                          {reply.mailStatus !== "sent" &&
                            reply.mailStatus !== "skipped" &&
                            row.wantReply &&
                            row.email && (
                              <Button
                                size="sm"
                                variant="light"
                                isDisabled={busyId === row.key}
                                onPress={() => void resend(row, reply.id)}
                              >
                                发送通知
                              </Button>
                            )}
                        </div>
                        <p className="mt-1 text-sm">{reply.content}</p>
                        {reply.mailError && (
                          <span className="mt-1 block text-xs text-danger">{reply.mailError}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* 回复输入 */}
                {row.status !== "archived" && (
                  <div className="space-y-2 border-t border-default-200 pt-3">
                    <BlogTextarea
                      minRows={2}
                      placeholder="写下给这位读者的回复…"
                      value={drafts[row.key] ?? ""}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [row.key]: e.target.value }))
                      }
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        color="primary"
                        isDisabled={busyId === row.key}
                        onPress={() => void saveReply(row)}
                      >
                        保存回复
                      </Button>
                      <Button
                        size="sm"
                        variant="flat"
                        isDisabled={busyId === row.key}
                        onPress={() => void archive(row)}
                      >
                        归档
                      </Button>
                      <span className="text-xs text-default-500">
                        {row.wantReply && row.email
                          ? "保存后会尝试给订阅通知的读者发一封回复邮件。"
                          : "读者未订阅邮件通知：回复只保存在后台，不会发信。"}
                      </span>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
