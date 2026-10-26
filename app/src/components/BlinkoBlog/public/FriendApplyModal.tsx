import { useEffect, useRef, useState } from "react";
import { Modal, ModalContent } from "@heroui/react";
import { Icon } from "@/components/Common/Iconify/icons";
import { BlogButton, BlogInput, BlogTextarea } from "@/components/BlinkoBlog/BlogUI";
import { readBlogTheme } from "@/lib/blogTheme";
import { api } from "@/lib/publicBlogClient";
import {
  friendApplySchema,
  FRIEND_DESC_MAX,
  FRIEND_NAME_MAX,
  type FriendApplyOutcome,
} from "@shared/lib/blogFriends";

/**
 * 申请友链弹窗。
 *
 * 草稿只放在模块内存里 —— 刷新页面就没了，但同一次访问里
 * 「填了一半关掉、再打开继续填」是能续上的。
 * 邮箱尤其不能落 localStorage：它是联系方式，不该留在设备上。
 */
type Draft = {
  name: string;
  url: string;
  description: string;
  email: string;
  iconUrl: string;
};

let sessionDraft: Draft | null = null;

const emptyDraft: Draft = {
  name: "",
  url: "",
  description: "",
  email: "",
  iconUrl: "",
};

type FieldKey = keyof Draft;

export function FriendApplyModal({
  open,
  onClose,
  onSubmitted,
  mailEnabled,
  onShowApplyNote,
}: {
  open: boolean;
  onClose: () => void;
  /** 提交成功后把结果抛给页面（页面据此提示「已在审核中 / 已收录」）。 */
  onSubmitted?: (outcome: FriendApplyOutcome, name: string, url: string) => void;
  /** 邮件服务是否真的配了 —— 没配就不能承诺「会发邮件给你」。 */
  mailEnabled: boolean;
  /** 「查看申请说明」入口。 */
  onShowApplyNote?: () => void;
}) {
  const theme = readBlogTheme();
  const [values, setValues] = useState<Draft>(sessionDraft ?? emptyDraft);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState<null | {
    outcome: FriendApplyOutcome;
    name: string;
    url: string;
    iconUrl: string;
  }>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const iconRef = useRef<HTMLInputElement>(null);

  // 打开时恢复草稿；关闭且没提交成功时把草稿留住。
  useEffect(() => {
    if (open) {
      setValues(sessionDraft ?? emptyDraft);
      setErrors({});
      setSubmitError("");
      setDone(null);
    }
  }, [open]);

  const update = (key: FieldKey, value: string) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      sessionDraft = next;
      return next;
    });
    // 改过的字段立刻撤掉旧错误，别让红字一直挂着。
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const refs: Record<FieldKey, { current: HTMLInputElement | HTMLTextAreaElement | null }> = {
    name: nameRef,
    url: urlRef,
    description: descRef,
    email: emailRef,
    iconUrl: iconRef,
  };

  const submit = async () => {
    if (submitting) return;
    const parsed = friendApplySchema.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<FieldKey, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as FieldKey | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      const first = (["name", "url", "description", "email", "iconUrl"] as FieldKey[]).find(
        (key) => next[key],
      );
      if (first) {
        // 等这一轮渲染结束再聚焦，否则焦点会被新的错误提示顶掉。
        window.setTimeout(() => refs[first].current?.focus(), 30);
      }
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const result = await api.blog.publicFriendApply.mutate(parsed.data);
      // 提交成功：草稿清空，不留联系方式在内存里。
      sessionDraft = null;
      setDone({
        outcome: result.outcome,
        name: result.name,
        url: result.url,
        iconUrl: values.iconUrl,
      });
      onSubmitted?.(result.outcome, result.name, result.url);
    } catch (error) {
      // 网络或服务异常：保留表单内容，让用户能直接重试。
      const message =
        error instanceof Error && error.message
          ? error.message
          : "提交失败，请稍后重试。";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    if (submitting) return;
    onClose();
  };

  const fieldError = (key: FieldKey) => errors[key];

  return (
    <Modal
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      placement="center"
      size="lg"
      scrollBehavior="inside"
      backdrop="blur"
      /* 提交中不让误关：正在投递的申请不能被一次误点吞掉。 */
      isDismissable={!submitting}
      hideCloseButton
      classNames={{
        base: `ink-friends-modal ink-friends-surface ${theme === "dark" ? "ink-friends-dark" : ""}`,
      }}
    >
      <ModalContent aria-label="申请友链">
        {done ? (
          <div className="ink-friends-success">
            <span className="ink-friends-success-icon">
              <Icon icon="tabler:check" width={28} />
            </span>
            <h2 className="ink-friends-success-title">申请已收到</h2>
            <span className="ink-friends-success-badge">待审核</span>
            <p className="ink-friends-success-text">
              {done.outcome === "approved"
                ? "这个站点已经在友链列表里了，无需重复申请。"
                : done.outcome === "pending"
                  ? "这个站点已在审核中，无需重复提交。"
                  : "通过审核后，站点会出现在友链列表中。"}
            </p>
            {done.outcome === "created" && mailEnabled && (
              <p className="ink-friends-success-text">
                审核结果会发送至你填写的邮箱。
              </p>
            )}
            <div className="ink-friends-success-card">
              <span className="ink-friends-success-card-icon">
                {done.iconUrl ? (
                  <img src={done.iconUrl} alt="" />
                ) : (
                  <Icon icon="tabler:world" width={20} />
                )}
              </span>
              <span className="ink-friends-success-card-body">
                <span className="ink-friends-success-card-name">{done.name}</span>
                <span className="ink-friends-success-card-url">{done.url}</span>
              </span>
            </div>
            <BlogButton
              type="button"
              className="ink-friends-submit"
              onClick={onClose}
            >
              返回友链列表
            </BlogButton>
          </div>
        ) : (
          <>
            <header className="ink-friends-modal-head">
              <div>
                <h2 className="ink-friends-modal-title">申请友链</h2>
                <p className="ink-friends-modal-lead">
                  {mailEnabled
                    ? "介绍一下你的站点，审核结果将通过邮件通知。"
                    : "介绍一下你的站点，审核结果会在本站后台处理。"}
                </p>
                {onShowApplyNote && (
                  <button type="button" className="ink-friends-note-link" onClick={onShowApplyNote}>
                    查看申请说明
                    <Icon icon="tabler:arrow-up-right" width={14} />
                  </button>
                )}
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
                <label className="ink-friends-label" htmlFor="friend-name">
                  站点名称<span className="is-required">*</span>
                  <span className="is-count">
                    {values.name.length}/{FRIEND_NAME_MAX}
                  </span>
                </label>
                <BlogInput
                  id="friend-name"
                  ref={nameRef}
                  placeholder="例如：山间来信"
                  value={values.name}
                  maxLength={FRIEND_NAME_MAX}
                  invalid={!!fieldError("name")}
                  onChange={(e) => update("name", e.target.value)}
                />
                {fieldError("name") && (
                  <span className="ink-friends-error" role="alert">
                    <Icon icon="tabler:alert-circle" width={14} />
                    {fieldError("name")}
                  </span>
                )}
              </div>

              <div className="ink-friends-field-row">
                <label className="ink-friends-label" htmlFor="friend-url">
                  站点地址<span className="is-required">*</span>
                </label>
                <BlogInput
                  id="friend-url"
                  ref={urlRef}
                  placeholder="https://example.com"
                  value={values.url}
                  invalid={!!fieldError("url")}
                  onChange={(e) => update("url", e.target.value)}
                />
                {fieldError("url") ? (
                  <span className="ink-friends-error" role="alert">
                    <Icon icon="tabler:alert-circle" width={14} />
                    {fieldError("url")}
                  </span>
                ) : (
                  <span className="ink-friends-help">需要以 https:// 或 http:// 开头。</span>
                )}
              </div>

              <div className="ink-friends-field-row">
                <label className="ink-friends-label" htmlFor="friend-desc">
                  一句话介绍<span className="is-required">*</span>
                  <span className="is-count">
                    {values.description.length}/{FRIEND_DESC_MAX}
                  </span>
                </label>
                <BlogTextarea
                  id="friend-desc"
                  ref={descRef}
                  minRows={2}
                  placeholder="你主要记录或分享什么？"
                  value={values.description}
                  maxLength={FRIEND_DESC_MAX}
                  invalid={!!fieldError("description")}
                  onChange={(e) => update("description", e.target.value)}
                />
                {fieldError("description") && (
                  <span className="ink-friends-error" role="alert">
                    <Icon icon="tabler:alert-circle" width={14} />
                    {fieldError("description")}
                  </span>
                )}
              </div>

              <div className="ink-friends-field-row">
                <label className="ink-friends-label" htmlFor="friend-email">
                  联系邮箱<span className="is-required">*</span>
                </label>
                <BlogInput
                  id="friend-email"
                  ref={emailRef}
                  type="email"
                  placeholder="用于接收审核结果"
                  value={values.email}
                  invalid={!!fieldError("email")}
                  onChange={(e) => update("email", e.target.value)}
                />
                {fieldError("email") ? (
                  <span className="ink-friends-error" role="alert">
                    <Icon icon="tabler:alert-circle" width={14} />
                    {fieldError("email")}
                  </span>
                ) : (
                  <span className="ink-friends-help">
                    邮箱仅用于审核通知，不会公开展示。
                  </span>
                )}
              </div>

              <div className="ink-friends-field-row">
                <label className="ink-friends-label" htmlFor="friend-icon">
                  站点图标（选填）
                </label>
                <BlogInput
                  id="friend-icon"
                  ref={iconRef}
                  placeholder="https://example.com/avatar.png"
                  value={values.iconUrl}
                  invalid={!!fieldError("iconUrl")}
                  onChange={(e) => update("iconUrl", e.target.value)}
                />
                {fieldError("iconUrl") ? (
                  <span className="ink-friends-error" role="alert">
                    <Icon icon="tabler:alert-circle" width={14} />
                    {fieldError("iconUrl")}
                  </span>
                ) : (
                  <span className="ink-friends-help">
                    填写可公开访问的图片地址，留空使用默认图标。
                  </span>
                )}
              </div>

              {submitError && (
                <p className="ink-friends-error" role="alert">
                  <Icon icon="tabler:alert-circle" width={14} />
                  {submitError}
                </p>
              )}
            </div>

            <footer className="ink-friends-modal-footer">
              <span className="ink-friends-modal-note">
                站点信息将在审核通过后公开展示。
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
                  {submitting ? (
                    <>
                      <span className="ink-friends-spinner" aria-hidden="true" />
                      提交中…
                    </>
                  ) : (
                    "提交申请"
                  )}
                </BlogButton>
              </div>
            </footer>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
