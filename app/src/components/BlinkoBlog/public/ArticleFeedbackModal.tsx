import { useEffect, useRef, useState } from "react";
import { Modal, ModalContent } from "@heroui/react";
import { Icon } from "@/components/Common/Iconify/icons";
import { BlogButton, BlogChipGroup, BlogInput, BlogTextarea } from "@/components/BlinkoBlog/BlogUI";
import { readBlogTheme } from "@/lib/blogTheme";
import { api } from "@/lib/publicBlogClient";
import {
  FEEDBACK_CONTENT_MAX,
  FEEDBACK_NICKNAME_MAX,
  FEEDBACK_TYPE_LABEL,
  FEEDBACK_TYPES,
  type FeedbackType,
} from "@shared/lib/blogInteraction";

/**
 * 给作者的私密反馈弹窗。
 *
 * 草稿只放内存，并按文章隔离：
 * 读者在 A 文章填了一半，切到 B 文章不会把 A 的内容带过去；
 * 刷新页面草稿就没了 —— 反馈内容、称呼、邮箱都不该留在设备上。
 */
type Draft = {
  type: FeedbackType;
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

/** 按文章存放的草稿：模块内存，刷新即失效。 */
const drafts = new Map<string, Draft>();

/** 幂等键：打开一次表单生成一次，同一次提交的重试复用它。 */
function newIdempotencyKey() {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto)
      return crypto.randomUUID().replace(/-/g, "");
  } catch {
    /* 退回到随机串 */
  }
  return (
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  );
}

export function ArticleFeedbackModal({
  open,
  onClose,
  publishId,
  articleTitle,
  /** 邮件服务是否真的可用 —— 没配就不能承诺「会发邮件提醒你」。 */
  mailEnabled,
}: {
  open: boolean;
  onClose: () => void;
  publishId: string;
  articleTitle: string;
  mailEnabled: boolean;
}) {
  const theme = readBlogTheme();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<Partial<Record<"content" | "email", string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const idempotencyKey = useRef(newIdempotencyKey());

  const contentRef = useRef<HTMLTextAreaElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // 打开时取回这篇文章的草稿；每次打开换一个新的幂等键。
  useEffect(() => {
    if (!open) return;
    setDraft(drafts.get(publishId) ?? emptyDraft);
    setErrors({});
    setSubmitError("");
    setDone(false);
    setSubscribed(false);
    idempotencyKey.current = newIdempotencyKey();
  }, [open, publishId]);

  const update = (patch: Partial<Draft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      drafts.set(publishId, next);
      return next;
    });
  };

  const submit = async () => {
    if (submitting) return;
    const nextErrors: Partial<Record<"content" | "email", string>> = {};
    if (!draft.content.trim()) nextErrors.content = "请填写反馈内容";
    if (draft.wantReply && !draft.email.trim())
      nextErrors.email = "请填写通知邮箱";
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
      await api.blog.publicArticleFeedback.mutate({
        publishId,
        type: draft.type,
        content: draft.content,
        nickname: draft.nickname,
        wantReply: draft.wantReply,
        // 没勾订阅就不提交邮箱
        email: draft.wantReply ? draft.email : "",
        allowPublic: draft.allowPublic,
        idempotencyKey: idempotencyKey.current,
      });
      // 提交成功：清掉这篇的草稿
      drafts.delete(publishId);
      setSubscribed(draft.wantReply);
      setDone(true);
    } catch (error) {
      setSubmitError(
        error instanceof Error && error.message
          ? error.message
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
      /* 提交中不让误关：正在投递的反馈不能被一次误点吞掉。 */
      isDismissable={!submitting}
      hideCloseButton
      classNames={{
        base: `ink-ai-modal ink-ai-surface ${theme === "dark" ? "ink-ai-dark" : ""}`,
      }}
    >
      <ModalContent aria-label="反馈作者">
        {done ? (
          <div className="ink-ai-success">
            <span className="ink-ai-success-icon">
              <Icon icon="tabler:check" width={28} />
            </span>
            <h2 className="ink-ai-success-title">反馈已收到。</h2>
            {subscribed && mailEnabled && (
              <p className="ink-ai-success-text">
                作者回复后，会通过邮件提醒你。
              </p>
            )}
            <p className="ink-ai-success-text">
              这条反馈只有作者可见，不会出现在文章页面上。
            </p>
            <BlogButton type="button" className="ink-ai-submit" onClick={onClose}>
              知道了
            </BlogButton>
          </div>
        ) : (
          <>
            <header className="ink-ai-modal-head">
              <div>
                <h2 className="ink-ai-modal-title">反馈作者</h2>
                <p className="ink-ai-modal-lead">
                  有疑问、想补充，或发现了错误，都可以告诉我。
                </p>
              </div>
              <BlogButton
                type="button"
                className="ink-ai-quiet"
                onClick={close}
                aria-label="关闭"
                disabled={submitting}
              >
                <Icon icon="tabler:x" width={17} />
              </BlogButton>
            </header>

            <div className="ink-ai-modal-body">
              <div className="ink-ai-field">
                <span className="ink-ai-label">
                  反馈类型<span className="is-required">*</span>
                </span>
                <BlogChipGroup
                  label="反馈类型"
                  value={draft.type}
                  onChange={(key) => update({ type: key as FeedbackType })}
                  items={FEEDBACK_TYPES.map((type) => ({
                    key: type,
                    label: FEEDBACK_TYPE_LABEL[type],
                  }))}
                />
              </div>

              <div className="ink-ai-field">
                <label className="ink-ai-label" htmlFor="ai-feedback-content">
                  反馈内容<span className="is-required">*</span>
                  <span className="is-count">
                    {draft.content.length}/{FEEDBACK_CONTENT_MAX}
                  </span>
                </label>
                <BlogTextarea
                  id="ai-feedback-content"
                  ref={contentRef}
                  minRows={3}
                  maxLength={FEEDBACK_CONTENT_MAX}
                  placeholder="具体说说你的问题或建议…"
                  value={draft.content}
                  invalid={!!errors.content}
                  onChange={(e) => {
                    update({ content: e.target.value });
                    setErrors((prev) => ({ ...prev, content: undefined }));
                  }}
                />
                {errors.content ? (
                  <span className="ink-ai-error" role="alert">
                    <Icon icon="tabler:alert-circle" width={14} />
                    {errors.content}
                  </span>
                ) : (
                  <span className="ink-ai-help">仅作者可见，不会公开显示。</span>
                )}
              </div>

              <div className="ink-ai-field">
                <label className="ink-ai-label" htmlFor="ai-feedback-nickname">
                  称呼（选填）
                  <span className="is-count">
                    {draft.nickname.length}/{FEEDBACK_NICKNAME_MAX}
                  </span>
                </label>
                <BlogInput
                  id="ai-feedback-nickname"
                  maxLength={FEEDBACK_NICKNAME_MAX}
                  placeholder="方便作者称呼你"
                  value={draft.nickname}
                  onChange={(e) => update({ nickname: e.target.value })}
                />
                <span className="ink-ai-help">留空按匿名读者处理。</span>
              </div>

              <label className="ink-ai-checkbox">
                <input
                  type="checkbox"
                  checked={draft.wantReply}
                  disabled={!mailEnabled || submitting}
                  onChange={(e) => {
                    const wantReply = e.target.checked;
                    // 取消勾选就不保留此前填写的邮箱
                    update({ wantReply, email: wantReply ? draft.email : "" });
                    if (!wantReply) setErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                />
                <span>
                  希望收到回复通知
                  <small>
                    {mailEnabled
                      ? "勾选后填写邮箱，作者回复时提醒你。"
                      : "当前站点尚未配置邮件服务，暂时无法开通回复通知。"}
                  </small>
                </span>
              </label>

              {draft.wantReply && mailEnabled && (
                <div className="ink-ai-field">
                  <label className="ink-ai-label" htmlFor="ai-feedback-email">
                    通知邮箱<span className="is-required">*</span>
                  </label>
                  <BlogInput
                    id="ai-feedback-email"
                    ref={emailRef}
                    type="email"
                    placeholder="reader@example.com"
                    value={draft.email}
                    invalid={!!errors.email}
                    onChange={(e) => {
                      update({ email: e.target.value });
                      setErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                  />
                  {errors.email ? (
                    <span className="ink-ai-error" role="alert">
                      <Icon icon="tabler:alert-circle" width={14} />
                      {errors.email}
                    </span>
                  ) : (
                    <span className="ink-ai-help">
                      邮箱不公开，仅用于这次反馈的回复通知。
                    </span>
                  )}
                </div>
              )}

              <label className="ink-ai-checkbox">
                <input
                  type="checkbox"
                  checked={draft.allowPublic}
                  disabled={submitting}
                  onChange={(e) => update({ allowPublic: e.target.checked })}
                />
                <span>
                  允许审核后匿名公开这条反馈
                  <small>默认仅作者可见；未经允许不会公开。</small>
                </span>
              </label>

              {submitError && (
                <p className="ink-ai-error" role="alert">
                  <Icon icon="tabler:alert-circle" width={14} />
                  {submitError}
                </p>
              )}
            </div>

            <footer className="ink-ai-modal-footer">
              <BlogButton
                type="button"
                className="ink-ai-quiet"
                onClick={close}
                disabled={submitting}
              >
                取消
              </BlogButton>
              <BlogButton
                type="button"
                className="ink-ai-submit"
                onClick={() => void submit()}
                disabled={submitting}
              >
                {submitting ? "提交中…" : "发送反馈"}
              </BlogButton>
            </footer>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
