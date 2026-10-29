import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, ModalContent, Button, Card, CardBody, Chip } from "@heroui/react";
import { Icon } from "@/components/Common/Iconify/icons";
import { BlogChipGroup, BlogInput, BlogTextarea } from "./BlogUI";
import { api } from "@/lib/trpc";
import { RootStore } from "@/store";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import {
  FRIEND_STATUS_LABEL,
  FRIEND_TYPE_LABEL,
  type FriendStatus,
} from "@shared/lib/blogFriends";

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

const STATUS_COLOR: Record<string, "default" | "success" | "danger" | "warning"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

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
    } catch (e: any) {
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
      <p className="py-8 text-center text-sm text-default-500" role="status">
        正在加载友链数据…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger">
          <span className="flex-1">{error}</span>
          <Button size="sm" variant="flat" color="danger" onPress={() => void load()}>
            重试加载
          </Button>
        </div>
      )}

      {mail && !mail.configured && (
        <div className="flex items-start gap-2 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning" role="note">
          <Icon icon="tabler:alert-circle" width={16} className="mt-0.5 shrink-0" />
          <span>
            邮件服务未配置，审核通过 / 拒绝后无法给申请人发通知。{mail.message}{" "}
            <a className="font-medium text-warning hover:underline" href="/blog-manage?section=mail">
              去配置邮件服务
            </a>
          </span>
        </div>
      )}

      {/* ---------- 友链申请 ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">友链申请</h2>
          <p className="text-xs text-default-500">
            共 {links.length} 条记录 · 待审核 {counts.pending ?? 0} 条
          </p>
        </div>
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

      {visible.length === 0 ? (
        <div className="py-10 text-center">
          <Icon icon="tabler:world" width={28} className="mx-auto text-default-300" />
          <h2 className="mt-2 text-sm font-semibold">没有符合条件的友链</h2>
          <p className="mt-1 text-xs text-default-500">换个状态筛选，或等待访客提交申请。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((link) => (
            <Card key={link.id} className="rounded-xl border border-default-200 shadow-none">
              <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-default-100">
                  {link.iconUrl ? (
                    <img
                      className="h-9 w-9 rounded-full object-cover"
                      src={link.iconUrl}
                      alt=""
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <Icon icon="tabler:world" width={18} className="text-default-400" />
                  )}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-sm">{link.name}</b>
                    <Chip
                      size="sm"
                      variant="flat"
                      color={STATUS_COLOR[link.status] ?? "default"}
                    >
                      {FRIEND_STATUS_LABEL[link.status as FriendStatus] ?? link.status}
                    </Chip>
                    {link.isHidden && (
                      <Chip size="sm" variant="flat" color="default">已隐藏</Chip>
                    )}
                    <Chip size="sm" variant="flat" color="default">
                      邮件：{MAIL_STATUS_LABEL[link.emailStatus] ?? link.emailStatus}
                    </Chip>
                  </div>
                  <a
                    className="block truncate text-xs text-primary hover:underline"
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {link.url}
                  </a>
                  {link.description && (
                    <p className="text-xs text-default-600">{link.description}</p>
                  )}
                  <p className="text-xs text-default-500">
                    申请邮箱：{link.email || "未填写"}
                    {link.emailError && ` · ${link.emailError}`}
                  </p>
                  {link.reviewNote && (
                    <p className="text-xs text-default-500">审核说明：{link.reviewNote}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    isIconOnly
                    variant="light"
                    title="上移"
                    aria-label="上移"
                    isDisabled={busyId === link.id}
                    onPress={() => void move(link, -1)}
                  >
                    <Icon icon="tabler:chevron-up" width={15} />
                  </Button>
                  <Button
                    size="sm"
                    isIconOnly
                    variant="light"
                    title="下移"
                    aria-label="下移"
                    isDisabled={busyId === link.id}
                    onPress={() => void move(link, 1)}
                  >
                    <Icon icon="tabler:chevron-down" width={15} />
                  </Button>
                  <Button
                    size="sm"
                    variant="flat"
                    isDisabled={busyId === link.id}
                    onPress={() => setEditing(link)}
                  >
                    编辑 / 审核
                  </Button>
                  {link.status !== "pending" && link.emailStatus !== "sent" && (
                    <Button
                      size="sm"
                      variant="flat"
                      isDisabled={busyId === link.id}
                      onPress={() => void resendMail(link)}
                    >
                      重发通知
                    </Button>
                  )}
                  {link.status === "approved" && (
                    <Button
                      size="sm"
                      variant="flat"
                      isDisabled={busyId === link.id}
                      onPress={() => void toggleHidden(link)}
                    >
                      {link.isHidden ? "恢复展示" : "隐藏"}
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* ---------- 异常链接反馈 ---------- */}
      <div className="flex items-start gap-3 pt-2">
        <div>
          <h2 className="text-base font-semibold">异常链接反馈</h2>
          <p className="text-xs text-default-500">
            {feedbacks.length} 条待处理 · 反馈本身不会自动隐藏任何友链
          </p>
        </div>
      </div>

      {feedbacks.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-sm text-default-500">暂时没有待处理的反馈。</p>
        </div>
      ) : (
        <div className="space-y-3">
          {feedbacks.map((feedback) => (
            <Card key={feedback.id} className="rounded-xl border border-default-200 shadow-none">
              <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning-50">
                  <Icon icon="tabler:alert-circle" width={18} className="text-warning" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-sm">{feedback.linkName || "未指定站点"}</b>
                    <Chip size="sm" variant="flat" color="default">
                      {FRIEND_TYPE_LABEL[feedback.type as keyof typeof FRIEND_TYPE_LABEL] ??
                        feedback.type}
                    </Chip>
                  </div>
                  {feedback.linkUrl && (
                    <a
                      className="block truncate text-xs text-primary hover:underline"
                      href={feedback.linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {feedback.linkUrl}
                    </a>
                  )}
                  {feedback.message && (
                    <p className="text-xs text-default-600">{feedback.message}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    size="sm"
                    variant="flat"
                    color="success"
                    isDisabled={busyId === feedback.id}
                    onPress={() => void resolveFeedback(feedback, "resolved")}
                  >
                    标记已处理
                  </Button>
                  <Button
                    size="sm"
                    variant="light"
                    isDisabled={busyId === feedback.id}
                    onPress={() => void resolveFeedback(feedback, "dismissed")}
                  >
                    忽略
                  </Button>
                </div>
              </CardBody>
            </Card>
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
    >
      <ModalContent aria-label="编辑友链" className="overflow-hidden rounded-2xl">
        <header className="flex items-center justify-between border-b border-default-200 px-5 py-3.5">
          <h2 className="text-base font-semibold">编辑友链</h2>
          <Button
            size="sm"
            isIconOnly
            variant="light"
            onClick={onClose}
            aria-label="关闭"
            isDisabled={!!busy}
          >
            <Icon icon="tabler:x" width={16} />
          </Button>
        </header>

        <div className="space-y-4 px-5 py-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">站点名称</span>
            <BlogInput
              id="fm-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="站点名称"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">站点地址</span>
            <BlogInput
              id="fm-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">一句话介绍</span>
            <BlogTextarea
              id="fm-desc"
              minRows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="最多 100 字"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">站点图标地址</span>
            <BlogInput
              id="fm-icon"
              value={iconUrl}
              onChange={(e) => setIconUrl(e.target.value)}
              placeholder="https://example.com/avatar.png"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">审核说明（仅后台可见）</span>
            <BlogTextarea
              id="fm-note"
              minRows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="通过或拒绝时随通知一起发给申请人"
            />
          </label>
          <p className="text-xs text-default-500">
            申请邮箱：{link.email || "未填写"}（仅后台可见，不会进入公开接口）
          </p>
          {error && (
            <p className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-default-200 px-5 py-3">
          <Button
            size="sm"
            variant="flat"
            onPress={() => void save()}
            isDisabled={!!busy}
          >
            {busy === "save" ? "保存中…" : "保存修改"}
          </Button>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="flat"
              color="danger"
              onPress={() => void save("rejected")}
              isDisabled={!!busy}
            >
              {busy === "reject" ? "处理中…" : "拒绝"}
            </Button>
            <Button
              size="sm"
              color="primary"
              onPress={() => void save("approved")}
              isDisabled={!!busy}
            >
              {busy === "approve" ? "处理中…" : "通过审核"}
            </Button>
          </div>
        </footer>
      </ModalContent>
    </Modal>
  );
}
