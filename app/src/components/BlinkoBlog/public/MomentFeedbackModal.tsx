import { useEffect, useRef, useState } from "react";
import { Modal, ModalContent } from "@heroui/react";
import { api } from "@/lib/publicBlogClient";
import { readBlogTheme } from "@/lib/blogTheme";
import { Icon } from "@/components/Common/Iconify/icons";
import { BlogButton } from "@/components/BlinkoBlog/BlogUI";
import {
  FEEDBACK_CONTENT_MAX,
  FEEDBACK_NICKNAME_MAX,
  FEEDBACK_TYPES,
  FEEDBACK_TYPE_LABEL,
  isValidEmail,
} from "@shared/lib/blogInteraction";
import "./moments.css";

/**
 * 动态的「反馈作者」弹窗。
 *
 * 与文章那边的反馈是同一套契约（字段、校验、幂等、订阅邮件），
 * 但挂在动态上，所以是独立组件 —— 不去动文章互动的既有实现。
 *
 * 草稿只放模块内存，并按动态 id 隔离：
 * 切换动态不会把上一条的内容带过来；整页刷新则清空。
 */

type Draft = {
  type: string;
  content: string;
  nickname: string;
  wantReply: boolean;
  email: string;
  allowPublic: boolean;
};

const emptyDraft: Draft = {
  type: "question",
  content: "",
  nickname: "",
  wantReply: false,
  email: "",
  allowPublic: false,
};

/** 按动态存放的草稿：模块内存，刷新即失效。 */
const drafts = new Map<number, Draft>();

function newIdempotencyKey() {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return `m${Date.now()}${Math.random().toString(16).slice(2, 12)}`;
  }
}

export function MomentFeedbackModal({
  momentId,
  open,
  onClose,
  mailEnabled,
}: {
  momentId: number;
  open: boolean;
  onClose: () => void;
  mailEnabled: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<Partial<Record<"content" | "email", string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const theme = readBlogTheme();
  const contentRef = useRef<HTMLTextAreaElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  // 幂等键：打开表单时生成一次，重试复用；再次主动提交换新键。
  const idempotencyKey = useRef(newIdempotencyKey());

  useEffect(() => {
    if (!open) return;
    setDraft(drafts.get(momentId) ?? emptyDraft);
    setErrors({});
    setSubmitError("");
    setDone(false);
    idempotencyKey.current = newIdempotencyKey();
  }, [open, momentId]);

  const update = (patch: Partial<Draft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      drafts.set(momentId, next);
      return next;
    });
  };

  const close = () => {
    if (submitting) return;
    onClose();
  };

  const submit = async () => {
    const nextErrors: Partial<Record<"content" | "email", string>> = {};
    if (!draft.content.trim()) nextErrors.content = "请填写反馈内容";
    if (draft.wantReply && !isValidEmail(draft.email))
      nextErrors.email = "请填写有效的通知邮箱";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      window.setTimeout(() => {
        if (nextErrors.content) contentRef.current?.focus();
        else emailRef.current?.focus();
      }, 30);
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      await api.blog.publicMomentFeedback.mutate({
        momentId,
        type: draft.type as (typeof FEEDBACK_TYPES)[number],
        content: draft.content.trim(),
        nickname: draft.nickname.trim(),
        wantReply: draft.wantReply,
        email: draft.wantReply ? draft.email.trim() : "",
        allowPublic: draft.allowPublic,
        idempotencyKey: idempotencyKey.current,
      });
      drafts.delete(momentId);
      setSubscribed(draft.wantReply);
      setDone(true);
    } catch (e: any) {
      setSubmitError(e?.message || "发送失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
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
      /* 提交中不让误关：正在投递的反馈不能被一次误点吞掉。 */
      isDismissable={!submitting}
      hideCloseButton
      classNames={{
        base: `ink-moments-modal ink-moments-surface ${
          theme === "dark" ? "ink-moments-dark" : ""
        }`,
      }}
    >
      <ModalContent aria-label="反馈作者">
        {done ? (
          <div className="ink-moments-modal-success">
            <span className="ink-moments-modal-success-icon">
              <Icon icon="tabler:check" width={28} />
            </span>
            <h2 className="ink-moments-modal-success-title">反馈已收到。</h2>
            {subscribed && mailEnabled && (
              <p className="ink-moments-modal-success-text">
                作者回复后，会通过邮件提醒你。
              </p>
            )}
            <p className="ink-moments-modal-success-text">
              这条反馈只有作者可见，不会出现在动态页面上。
            </p>
            <BlogButton
              type="button"
              className="ink-moments-modal-submit"
              onClick={onClose}
            >
              知道了
            </BlogButton>
          </div>
        ) : (
          <>
            <header className="ink-moments-modal-head">
              <div>
                <h2 className="ink-moments-modal-title">反馈作者</h2>
                <p className="ink-moments-modal-lead">
                  有疑问、想补充，或发现了错误，都可以告诉我。
                </p>
              </div>
              <BlogButton
                type="button"
                className="ink-moments-modal-close"
                onClick={close}
                aria-label="关闭"
                disabled={submitting}
              >
                <Icon icon="tabler:x" width={18} />
              </BlogButton>
            </header>

            <div className="ink-moments-modal-body">
              <div className="ink-moments-field">
                <span className="ink-moments-label">反馈类型</span>
                <div className="ink-moments-types">
                  {FEEDBACK_TYPES.map((type) => (
                    <button
                      type="button"
                      key={type}
                      className={
                        "ink-moments-type" + (draft.type === type ? " is-active" : "")
                      }
                      onClick={() => update({ type })}
                    >
                      {FEEDBACK_TYPE_LABEL[type]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ink-moments-field">
                <label className="ink-moments-label" htmlFor={`ink-moment-fb-${momentId}`}>
                  反馈内容
                </label>
                <textarea
                  id={`ink-moment-fb-${momentId}`}
                  ref={contentRef}
                  className="ink-moments-input ink-moments-textarea"
                  rows={4}
                  maxLength={FEEDBACK_CONTENT_MAX}
                  value={draft.content}
                  placeholder="想说的都可以写在这里"
                  onChange={(e) => {
                    update({ content: e.target.value });
                    if (errors.content) setErrors((p) => ({ ...p, content: "" }));
                  }}
                />
                <div className="ink-moments-field-foot">
                  {errors.content ? (
                    <span className="ink-moments-error" role="alert">
                      {errors.content}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className="ink-moments-counter">
                    {draft.content.length} / {FEEDBACK_CONTENT_MAX}
                  </span>
                </div>
              </div>

              <div className="ink-moments-field">
                <label className="ink-moments-label" htmlFor={`ink-moment-nick-${momentId}`}>
                  称呼（选填）
                </label>
                <input
                  id={`ink-moment-nick-${momentId}`}
                  className="ink-moments-input"
                  maxLength={FEEDBACK_NICKNAME_MAX}
                  value={draft.nickname}
                  placeholder="留空按匿名读者处理"
                  onChange={(e) => update({ nickname: e.target.value })}
                />
              </div>

              <div className="ink-moments-field">
                <label className="ink-moments-check">
                  <input
                    type="checkbox"
                    checked={draft.wantReply}
                    disabled={!mailEnabled}
                    onChange={(e) => update({ wantReply: e.target.checked })}
                  />
                  希望收到回复通知
                </label>
                {!mailEnabled && (
                  <small className="ink-moments-hint">
                    当前站点尚未配置邮件服务，暂时无法订阅回复通知。
                  </small>
                )}
                {draft.wantReply && (
                  <>
                    <input
                      ref={emailRef}
                      className="ink-moments-input"
                      type="email"
                      value={draft.email}
                      placeholder="邮箱地址"
                      onChange={(e) => {
                        update({ email: e.target.value });
                        if (errors.email) setErrors((p) => ({ ...p, email: "" }));
                      }}
                    />
                    <small className="ink-moments-hint">
                      邮箱不公开，仅用于这次反馈的回复通知。
                    </small>
                    {errors.email && (
                      <span className="ink-moments-error" role="alert">
                        {errors.email}
                      </span>
                    )}
                  </>
                )}
              </div>

              <div className="ink-moments-field">
                <label className="ink-moments-check">
                  <input
                    type="checkbox"
                    checked={draft.allowPublic}
                    onChange={(e) => update({ allowPublic: e.target.checked })}
                  />
                  允许审核后匿名公开这条反馈
                </label>
                <small className="ink-moments-hint">
                  默认仅作者可见；未经允许不会公开。
                </small>
              </div>

              {submitError && (
                <p className="ink-moments-alert" role="alert">
                  {submitError}
                </p>
              )}
            </div>

            <footer className="ink-moments-modal-foot">
              <BlogButton
                type="button"
                className="ink-moments-modal-cancel"
                onClick={close}
                disabled={submitting}
              >
                取消
              </BlogButton>
              <BlogButton
                type="button"
                className="ink-moments-modal-submit"
                onClick={() => void submit()}
                disabled={submitting}
              >
                {submitting ? "发送中…" : "发送反馈"}
              </BlogButton>
            </footer>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
