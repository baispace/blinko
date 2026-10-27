import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, ModalContent } from "@heroui/react";
import { Icon } from "@/components/Common/Iconify/icons";
import { BlogButton, BlogChipGroup, BlogInput, BlogTextarea } from "./BlogUI";
import { api } from "@/lib/trpc";
import { RootStore } from "@/store";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import {
  FRIEND_STATUS_LABEL,
  FRIEND_TYPE_LABEL,
  type FriendStatus,
} from "@shared/lib/blogFriends";
import "./friends-manage.css";

type FriendLink = Awaited<ReturnType<typeof api.blog.friendLinks.query>>[number];
type Feedback = Awaited<ReturnType<typeof api.blog.friendFeedbacks.query>>[number];

const STATUS_FILTERS = [
  { key: "pending", label: "待审核" },
  { key: "approved", label: "已通过" },
  { key: "rejected", label: "已拒绝" },
  { key: "all", label: "全部" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["key"];

const MAIL_STATUS_LABEL: Record<string, string> = {
  none: "尚未通知",
  sent: "已发送",
  failed: "发送失败",
  not_configured: "未配置邮件服务",
};

/**
 * 友情链接管理。
 *
 * 三件事分开放：
 *   审核状态（pending / approved / rejected）—— 决定这条申请走没走完流程；
 *   公开展示（isHidden）—— 决定它现在出不现在公开列表里；
 *   邮件状态 —— 只如实反映发送结果，不会因为审核成功就假装发过信。
 */
export function BlogFriendsPanel() {
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [links, setLinks] = useState<FriendLink[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [mail, setMail] = useState<{ configured: boolean; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<FriendLink | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [all, pendingFeedbacks, mailStatus] = await Promise.all([
        api.blog.friendLinks.query(),
        api.blog.friendFeedbacks.query({ status: "pending" }),
        api.blog.friendMailStatus.query(),
      ]);
      setLinks(all);
      setFeedbacks(pendingFeedbacks);
      setMail(mailStatus);
      setCounts({
        pending: all.filter((l) => l.status === "pending").length,
        approved: all.filter((l) => l.status === "approved").length,
        rejected: all.filter((l) => l.status === "rejected").length,
        all: all.length,
      });
    } catch (e: any) {
      setError(e?.message || "友链数据加载失败，请重试。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => (filter === "all" ? links : links.filter((l) => l.status === filter)),
    [links, filter],
  );

  const toastError = (e: any) =>
    RootStore.Get(ToastPlugin).error(
      e instanceof Error ? e.message : "操作失败，请重试",
    );

  const withBusy = async (id: number, task: () => Promise<void>) => {
    setBusyId(id);
    try {
      await task();
    } catch (e) {
      toastError(e);
    } finally {
      setBusyId(null);
    }
  };

  const toggleHidden = (link: FriendLink) =>
    withBusy(link.id, async () => {
      await api.blog.setFriendLinkHidden.mutate({
        id: link.id,
        isHidden: !link.isHidden,
      });
      RootStore.Get(ToastPlugin).success(
        link.isHidden ? "已恢复公开展示" : "已从公开列表隐藏",
      );
      await load();
    });

  const move = async (link: FriendLink, direction: -1 | 1) => {
    const ordered = [...links].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
    );
    const index = ordered.findIndex((l) => l.id === link.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const next = [...ordered];
    [next[index], next[target]] = [next[target], next[index]];
    await withBusy(link.id, async () => {
      await api.blog.reorderFriendLinks.mutate({ ids: next.map((l) => l.id) });
      await load();
    });
  };

  const resendMail = (link: FriendLink) =>
    withBusy(link.id, async () => {
      const result = await api.blog.resendFriendLinkMail.mutate({ id: link.id });
      RootStore.Get(ToastPlugin).success(result.message);
      await load();
    });

  const resolveFeedback = (feedback: Feedback, status: "resolved" | "dismissed") =>
    withBusy(feedback.id, async () => {
      await api.blog.resolveFriendFeedback.mutate({ id: feedback.id, status });
      await load();
    });

  if (loading) {
    return (
      <p className="ink-mg-empty" role="status">
        正在加载友链数据…
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

      {mail && !mail.configured && (
        <div className="ink-fm-notice" role="note">
          <Icon icon="tabler:alert-circle" width={16} />
          <span>
            邮件服务未配置，审核通过 / 拒绝后无法给申请人发通知。{mail.message}{" "}
            <a href="/blog-manage?section=mail">去配置邮件服务</a>
          </span>
        </div>
      )}

      <div className="ink-mg-section-head">
        <div>
          <h2 className="ink-mg-section-title">友链申请</h2>
          <p className="ink-mg-sub">
            共 {links.length} 条记录 · 待审核 {counts.pending ?? 0} 条
          </p>
        </div>
        <div className="ink-mg-row-actions" style={{ marginLeft: 0 }}>
          <BlogChipGroup
            label="友链状态筛选"
            value={filter}
            onChange={(key) => setFilter(key as StatusFilter)}
            items={STATUS_FILTERS.map((item) => ({
              key: item.key,
              label: item.label,
              count: counts[item.key] ?? 0,
            }))}
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="ink-mg-empty">
          <Icon icon="tabler:world" width={28} />
          <h2>没有符合条件的友链</h2>
          <p>换个状态筛选，或等待访客提交申请。</p>
        </div>
      ) : (
        <div className="ink-fm-list">
          {visible.map((link) => (
            <article key={link.id} className="ink-fm-item">
              <span className="ink-fm-item-icon">
                {link.iconUrl ? (
                  <img src={link.iconUrl} alt="" onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }} />
                ) : (
                  <Icon icon="tabler:world" width={20} />
                )}
              </span>
              <div className="ink-fm-item-main">
                <div className="ink-fm-item-head">
                  <b>{link.name}</b>
                  <span className={`ink-fm-badge is-${link.status}`}>
                    {FRIEND_STATUS_LABEL[link.status as FriendStatus] ?? link.status}
                  </span>
                  {link.isHidden && <span className="ink-fm-badge is-hidden">已隐藏</span>}
                  <span className="ink-fm-badge is-mail">
                    邮件：{MAIL_STATUS_LABEL[link.emailStatus] ?? link.emailStatus}
                  </span>
                </div>
                <a
                  className="ink-fm-item-url"
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {link.url}
                </a>
                {link.description && (
                  <p className="ink-fm-item-desc">{link.description}</p>
                )}
                <p className="ink-fm-item-meta">
                  申请邮箱：{link.email || "未填写"}
                  {link.emailError && ` · ${link.emailError}`}
                </p>
                {link.reviewNote && (
                  <p className="ink-fm-item-note">审核说明：{link.reviewNote}</p>
                )}
              </div>
              <div className="ink-fm-item-actions">
                <BlogButton
                  className="ink-mg-mini"
                  title="上移"
                  aria-label="上移"
                  disabled={busyId === link.id}
                  onClick={() => void move(link, -1)}
                >
                  <Icon icon="tabler:chevron-up" width={15} />
                </BlogButton>
                <BlogButton
                  className="ink-mg-mini"
                  title="下移"
                  aria-label="下移"
                  disabled={busyId === link.id}
                  onClick={() => void move(link, 1)}
                >
                  <Icon icon="tabler:chevron-down" width={15} />
                </BlogButton>
                <BlogButton
                  className="ink-mg-mini"
                  disabled={busyId === link.id}
                  onClick={() => setEditing(link)}
                >
                  编辑 / 审核
                </BlogButton>
                {link.status !== "pending" && link.emailStatus !== "sent" && (
                  <BlogButton
                    className="ink-mg-mini"
                    disabled={busyId === link.id}
                    onClick={() => void resendMail(link)}
                  >
                    重发通知
                  </BlogButton>
                )}
                {link.status === "approved" && (
                  <BlogButton
                    className="ink-mg-mini"
                    disabled={busyId === link.id}
                    onClick={() => void toggleHidden(link)}
                  >
                    {link.isHidden ? "恢复展示" : "隐藏"}
                  </BlogButton>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="ink-mg-section-head" style={{ marginTop: 28 }}>
        <div>
          <h2 className="ink-mg-section-title">异常链接反馈</h2>
          <p className="ink-mg-sub">
            {feedbacks.length} 条待处理 · 反馈本身不会自动隐藏任何友链
          </p>
        </div>
      </div>

      {feedbacks.length === 0 ? (
        <div className="ink-mg-empty">
          <p>暂时没有待处理的反馈。</p>
        </div>
      ) : (
        <div className="ink-fm-list">
          {feedbacks.map((feedback) => (
            <article key={feedback.id} className="ink-fm-item">
              <span className="ink-fm-item-icon is-feedback">
                <Icon icon="tabler:alert-circle" width={18} />
              </span>
              <div className="ink-fm-item-main">
                <div className="ink-fm-item-head">
                  <b>{feedback.linkName || "未指定站点"}</b>
                  <span className="ink-fm-badge is-feedback">
                    {FRIEND_TYPE_LABEL[feedback.type as keyof typeof FRIEND_TYPE_LABEL] ??
                      feedback.type}
                  </span>
                </div>
                {feedback.linkUrl && (
                  <a
                    className="ink-fm-item-url"
                    href={feedback.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {feedback.linkUrl}
                  </a>
                )}
                {feedback.message && (
                  <p className="ink-fm-item-desc">{feedback.message}</p>
                )}
              </div>
              <div className="ink-fm-item-actions">
                <BlogButton
                  className="ink-mg-mini"
                  disabled={busyId === feedback.id}
                  onClick={() => void resolveFeedback(feedback, "resolved")}
                >
                  标记已处理
                </BlogButton>
                <BlogButton
                  className="ink-mg-mini"
                  disabled={busyId === feedback.id}
                  onClick={() => void resolveFeedback(feedback, "dismissed")}
                >
                  忽略
                </BlogButton>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <FriendLinkEditor
          link={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

/** 编辑公开字段 + 审核（通过 / 拒绝）+ 审核说明。 */
function FriendLinkEditor({
  link,
  onClose,
  onSaved,
}: {
  link: FriendLink;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(link.name);
  const [url, setUrl] = useState(link.url);
  const [description, setDescription] = useState(link.description);
  const [iconUrl, setIconUrl] = useState(link.iconUrl);
  const [note, setNote] = useState(link.reviewNote);
  const [busy, setBusy] = useState<"" | "save" | "approve" | "reject">("");
  const [error, setError] = useState("");

  const save = async (decision?: "approved" | "rejected") => {
    if (busy) return;
    setBusy(decision === "approved" ? "approve" : decision === "rejected" ? "reject" : "save");
    setError("");
    try {
      await api.blog.saveFriendLink.mutate({
        id: link.id,
        name,
        url,
        description,
        iconUrl,
      });
      if (decision) {
        await api.blog.reviewFriendLink.mutate({ id: link.id, decision, note });
        RootStore.Get(ToastPlugin).success(
          decision === "approved" ? "已通过审核" : "已拒绝该申请",
        );
      } else {
        RootStore.Get(ToastPlugin).success("友链信息已保存");
      }
      await onSaved();
    } catch (e: any) {
      setError(e?.message || "操作失败，请重试。");
    } finally {
      setBusy("");
    }
  };

  return (
    <Modal
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="center"
      size="lg"
      scrollBehavior="inside"
      backdrop="blur"
      isDismissable={!busy}
      hideCloseButton
      classNames={{ base: "ink-fm-modal" }}
    >
      <ModalContent aria-label="编辑友链">
        <header className="ink-fm-modal-head">
          <h2 className="ink-fm-modal-title">编辑友链</h2>
          <BlogButton
            className="ink-mg-button ink-mg-button-ghost"
            onClick={onClose}
            aria-label="关闭"
            disabled={!!busy}
          >
            <Icon icon="tabler:x" width={16} />
          </BlogButton>
        </header>

        <div className="ink-fm-modal-body">
          <div className="ink-fm-field">
            <label htmlFor="fm-name">站点名称</label>
            <BlogInput
              id="fm-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="站点名称"
            />
          </div>
          <div className="ink-fm-field">
            <label htmlFor="fm-url">站点地址</label>
            <BlogInput
              id="fm-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </div>
          <div className="ink-fm-field">
            <label htmlFor="fm-desc">一句话介绍</label>
            <BlogTextarea
              id="fm-desc"
              minRows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="最多 100 字"
            />
          </div>
          <div className="ink-fm-field">
            <label htmlFor="fm-icon">站点图标地址</label>
            <BlogInput
              id="fm-icon"
              value={iconUrl}
              onChange={(e) => setIconUrl(e.target.value)}
              placeholder="https://example.com/avatar.png"
            />
          </div>
          <div className="ink-fm-field">
            <label htmlFor="fm-note">审核说明（仅后台可见）</label>
            <BlogTextarea
              id="fm-note"
              minRows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="通过或拒绝时随通知一起发给申请人"
            />
          </div>
          <p className="ink-fm-hint">
            申请邮箱：{link.email || "未填写"}（仅后台可见，不会进入公开接口）
          </p>
          {error && (
            <p className="ink-mg-alert" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="ink-fm-modal-footer">
          <BlogButton
            className="ink-mg-button"
            onClick={() => void save()}
            disabled={!!busy}
          >
            {busy === "save" ? "保存中…" : "保存修改"}
          </BlogButton>
          <div className="ink-fm-modal-actions">
            <BlogButton
              className="ink-mg-button ink-mg-button-ghost"
              onClick={() => void save("rejected")}
              disabled={!!busy}
            >
              {busy === "reject" ? "处理中…" : "拒绝"}
            </BlogButton>
            <BlogButton
              className="ink-mg-button ink-mg-button-primary"
              onClick={() => void save("approved")}
              disabled={!!busy}
            >
              {busy === "approve" ? "处理中…" : "通过审核"}
            </BlogButton>
          </div>
        </footer>
      </ModalContent>
    </Modal>
  );
}
