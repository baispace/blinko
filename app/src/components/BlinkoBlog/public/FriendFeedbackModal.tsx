import { useEffect, useMemo, useState } from "react";
import { Modal, ModalContent } from "@heroui/react";
import { Icon } from "@/components/Common/Iconify/icons";
import {
  BlogButton,
  BlogChipGroup,
  BlogSelect,
  BlogTextarea,
} from "@/components/BlinkoBlog/BlogUI";
import { readBlogTheme } from "@/lib/blogTheme";
import { api } from "@/lib/publicBlogClient";
import {
  FRIEND_MESSAGE_MAX,
  FRIEND_TYPE_LABEL,
  type FriendFeedbackType,
} from "@shared/lib/blogFriends";

export type FriendLinkOption = {
  id: number;
  name: string;
  url: string;
};

/**
 * 异常链接反馈弹窗。
 *
 * 反馈只进后台待处理列表 —— 一次反馈不会把站点从友链列表里拿掉，
 * 那是审核人才有权做的决定。
 */
export function FriendFeedbackModal({
  open,
  onClose,
  links,
  /** 从某个友链入口进来时带上它，弹窗会自动选中。 */
  initialLinkId,
}: {
  open: boolean;
  onClose: () => void;
  links: FriendLinkOption[];
  initialLinkId?: number | null;
}) {
  const theme = readBlogTheme();
  const [linkId, setLinkId] = useState<number | "">("");
  const [type, setType] = useState<FriendFeedbackType>("unreachable");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLinkId(initialLinkId ?? "");
    setType("unreachable");
    setMessage("");
    setError("");
    setDone(false);
  }, [open, initialLinkId]);

  const options = useMemo(
    () =>
      links.map((link) => ({
        value: String(link.id),
        label: `${link.name} · ${link.url}`,
      })),
    [links],
  );

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await api.blog.publicFriendFeedback.mutate({
        linkId: linkId === "" ? undefined : Number(linkId),
        type,
        message,
      });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "提交失败，请稍后重试。",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    if (submitting) return;
    onClose();
  };

  return (
    <Modal
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      placement="center"
      size="md"
      scrollBehavior="inside"
      backdrop="blur"
      isDismissable={!submitting}
      hideCloseButton
      classNames={{
        base: `ink-friends-modal ink-friends-surface ${theme === "dark" ? "ink-friends-dark" : ""}`,
      }}
    >
      <ModalContent aria-label="异常链接反馈">
        {done ? (
          <div className="ink-friends-success">
            <span className="ink-friends-success-icon">
              <Icon icon="tabler:check" width={28} />
            </span>
            <h2 className="ink-friends-success-title">反馈已收到</h2>
            <p className="ink-friends-success-text">
              我们会核实这条链接，处理结果不会自动影响页面上其他友链的展示。
            </p>
            <BlogButton type="button" className="ink-friends-submit" onClick={onClose}>
              知道了
            </BlogButton>
          </div>
        ) : (
          <>
            <header className="ink-friends-modal-head">
              <div>
                <h2 className="ink-friends-modal-title">异常链接反馈</h2>
                <p className="ink-friends-modal-lead">
                  哪条友链出了问题？告诉我们具体站点和情况。
                </p>
              </div>
              <BlogButton
                type="button"
                className="ink-friends-quiet"
                onClick={close}
                aria-label="关闭"
                disabled={submitting}
              >
                <Icon icon="tabler:x" width={17} />
              </BlogButton>
            </header>

            <div className="ink-friends-modal-body">
              <div className="ink-friends-field-row">
                <label className="ink-friends-label" htmlFor="friend-feedback-link">
                  站点
                </label>
                {options.length ? (
                  <BlogSelect
                    id="friend-feedback-link"
                    value={linkId === "" ? "" : String(linkId)}
                    onChange={(e) =>
                      setLinkId(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  >
                    <option value="">不指定具体站点</option>
                    {options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </BlogSelect>
                ) : (
                  <span className="ink-friends-help">
                    当前还没有可反馈的友链，先申请通过后再回来反馈。
                  </span>
                )}
              </div>

              <div className="ink-friends-field-row">
                <span className="ink-friends-label">问题类型</span>
                <BlogChipGroup
                  label="问题类型"
                  value={type}
                  onChange={(key) => setType(key as FriendFeedbackType)}
                  items={[
                    { key: "unreachable", label: FRIEND_TYPE_LABEL.unreachable },
                    { key: "changed", label: FRIEND_TYPE_LABEL.changed },
                    { key: "content", label: FRIEND_TYPE_LABEL.content },
                    { key: "other", label: FRIEND_TYPE_LABEL.other },
                  ]}
                />
              </div>

              <div className="ink-friends-field-row">
                <label className="ink-friends-label" htmlFor="friend-feedback-message">
                  补充说明
                  <span className="is-count">
                    {message.length}/{FRIEND_MESSAGE_MAX}
                  </span>
                </label>
                <BlogTextarea
                  id="friend-feedback-message"
                  minRows={3}
                  maxLength={FRIEND_MESSAGE_MAX}
                  placeholder="简单描述一下你遇到的情况（选填）"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              {error && (
                <p className="ink-friends-error" role="alert">
                  <Icon icon="tabler:alert-circle" width={14} />
                  {error}
                </p>
              )}
            </div>

            <footer className="ink-friends-modal-footer">
              <span className="ink-friends-modal-note">
                反馈不会直接删除或隐藏任何友链。
              </span>
              <div className="ink-friends-modal-actions">
                <BlogButton
                  type="button"
                  className="ink-friends-quiet"
                  onClick={close}
                  disabled={submitting}
                >
                  取消
                </BlogButton>
                <BlogButton
                  type="button"
                  className="ink-friends-submit"
                  onClick={() => void submit()}
                  disabled={submitting}
                >
                  {submitting ? "提交中…" : "提交反馈"}
                </BlogButton>
              </div>
            </footer>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
