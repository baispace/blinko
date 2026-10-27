import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Common/Iconify/icons";
import { BlogButton, BlogChipGroup, BlogTextarea } from "./BlogUI";
import { api } from "@/lib/trpc";
import { RootStore } from "@/store";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import {
  FEEDBACK_STATUS_LABEL,
  FEEDBACK_TYPE_LABEL,
  type FeedbackStatus,
  type FeedbackType,
} from "@shared/lib/blogInteraction";
import "./article-feedback-manage.css";

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

/**
 * 反馈来源。
 *
 * 文章与动态是两种内容，但「读者留言 → 作者回复」是同一件事：
 * 一个收件箱、一套状态、一套回复动作，只有落库的地方不同。
 * 所以这里按来源分流，界面上只多一枚「来源」标签。
 */
const SOURCES = [
  { key: "all", label: "全部来源" },
  { key: "article", label: "文章" },
  { key: "moment", label: "动态" },
] as const;

type Source = (typeof SOURCES)[number]["key"];

/** 两套表的 id 会撞车，所以行��唯一键必须带上来源。 */
type RowKey = string;

/** 统一的行模型：界面上只认这一种。 */
type FeedbackRow = {
  key: RowKey;
  source: "article" | "moment";
  id: number;
  /** 公开链接：文章详情页或动态锚点。 */
  href: string;
  /** 一行标题：文章标题，或动态正文的纯文本摘要。 */
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

/**
 * 读者反馈管理。
 *
 * 文章反馈与动态反馈合并成一个收件箱：
 *   - 回复内容（一条反馈可以有多条，历史不会被覆盖）；
 *   - 处理状态（待处理 / 已回复 / 已归档）；
 *   - 邮件发送状态（未发送 / 发送中 / 已发送 / 发送失败 / 读者未订阅）。
 * 保存回复成功不等于邮件已发出 —— 界面上不会把这两件事混成一句话。
 */
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
      <p className="ink-mg-empty" role="status">
        正在加载读者反馈…
      </p>
    );
  }

  return (
    <div className="ink-mg-section">
      {error && (
        <div className="ink-mg-alert" style={{ marginBottom: 16 }}>
          <span>{error}</span>
          <BlogButton className="ink-mg-button" onClick={() => void load()}>
            重试加载
          </BlogButton>
        </div>
      )}

      {mailEnabled === false && (
        <div className="ink-fb-notice" role="note">
          <Icon icon="tabler:alert-circle" width={16} />
          <span>
            邮件服务未配置，作者仍可以处理并记录回复，但无法给订阅了通知的读者发信。{" "}
            <a href="/blog-manage?section=mail">去配置邮件服务</a>
          </span>
        </div>
      )}

      <div className="ink-mg-section-head">
        <div>
          <h2 className="ink-mg-section-title">读者反馈</h2>
          <p className="ink-mg-sub">
            共 {rows.length} 条 · 待处理 {counts.pending ?? 0} 条
          </p>
        </div>
        <div className="ink-mg-row-actions" style={{ marginLeft: 0 }}>
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
        <div className="ink-mg-empty">
          <Icon icon="tabler:message" width={28} />
          <h2>没有符合条件的反馈</h2>
          <p>换个状态筛选，或等待读者留言。</p>
        </div>
      ) : (
        <div className="ink-fb-list">
          {visible.map((row) => (
            <article key={row.key} className="ink-fb-item">
              <div className="ink-fb-head">
                <span className="ink-fb-badge is-source">
                  {row.source === "moment" ? "动态" : "文章"}
                </span>
                <a
                  className="ink-fb-article"
                  href={row.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {row.title}
                </a>
                <span className="ink-fb-badge is-pending">
                  {FEEDBACK_TYPE_LABEL[row.type as FeedbackType] ?? row.type}
                </span>
                <span className={`ink-fb-badge is-${row.status}`}>
                  {FEEDBACK_STATUS_LABEL[row.status as FeedbackStatus] ?? row.status}
                </span>
                <span className="ink-fb-time">
                  {new Date(row.createdAt).toLocaleString("zh-CN")}
                </span>
              </div>

              <p className="ink-fb-content">{row.content}</p>

              <div className="ink-fb-meta">
                <span>
                  称呼：{row.nickname || "匿名读者"}
                </span>
                <span>
                  订阅回复通知：
                  {row.wantReply ? (row.email ? "是" : "是（未留邮箱）") : "否"}
                </span>
                <span>
                  允许匿名公开：{row.allowPublic ? "是" : "否"}
                </span>
                {row.email && <code>{row.email}</code>}
              </div>

              {row.replies.length > 0 && (
                <div className="ink-fb-replies">
                  {row.replies.map((reply) => (
                    <div key={reply.id} className="ink-fb-reply">
                      <div className="ink-fb-reply-head">
                        <span>
                          作者回复 ·{" "}
                          {new Date(reply.createdAt).toLocaleString("zh-CN")}
                        </span>
                        <span className={`ink-fb-badge is-mail-${reply.mailStatus}`}>
                          邮件：{reply.mailStatus === "sent" ? "已发送" : reply.mailStatus === "failed" ? "发送失败" : reply.mailStatus === "sending" ? "发送中" : reply.mailStatus === "skipped" ? "读者未订阅通知" : "未发送"}
                        </span>
                        {reply.mailStatus !== "sent" &&
                          reply.mailStatus !== "skipped" &&
                          row.wantReply &&
                          row.email && (
                            <BlogButton
                              className="ink-mg-mini"
                              disabled={busyId === row.key}
                              onClick={() => void resend(row, reply.id)}
                            >
                              发送通知
                            </BlogButton>
                          )}
                      </div>
                      <p className="ink-fb-reply-body">{reply.content}</p>
                      {reply.mailError && (
                        <span className="ink-fb-reply-error">{reply.mailError}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {row.status !== "archived" && (
                <div className="ink-fb-compose">
                  <BlogTextarea
                    minRows={2}
                    placeholder="写下给这位读者的回复…"
                    value={drafts[row.key] ?? ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [row.key]: e.target.value }))
                    }
                  />
                  <div className="ink-fb-compose-actions">
                    <BlogButton
                      className="ink-mg-button ink-mg-button-primary"
                      disabled={busyId === row.key}
                      onClick={() => void saveReply(row)}
                    >
                      保存回复
                    </BlogButton>
                    <BlogButton
                      className="ink-mg-button"
                      disabled={busyId === row.key}
                      onClick={() => void archive(row)}
                    >
                      归档
                    </BlogButton>
                    <span className="ink-fb-hint">
                      {row.wantReply && row.email
                        ? "保存后会尝试给订阅通知的读者发一封回复邮件。"
                        : "读者未订阅邮件通知：回复只保存在后台，不会发信。"}
                    </span>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
