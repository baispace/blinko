import type { ReactNode } from "react";
import "./page-state.css";

/**
 * 公开页统一的加载 / 空 / 错误三态。
 *
 * 之前每个页面自己写：有的用 ink-empty 一行字、有的用 ink-stats-error、
 * 有的直接吞掉错误 —— 同一件事四种说法。现在收成一套：
 *   · 加载中：一行状态文字（role=status，屏幕阅读器会念出来）
 *   · 空：一句说明，可选一句补充与一个去处
 *   · 出错：一句人话 + 一个「重试」按钮（能重试就必须给重试）
 *
 * 三个页面（动态 / 专题 / 关于 / 站点数据）都用它，样式也只有这一处。
 */

/** 加载中：语气平静，不闪烁，也不打断阅读。 */
export function PageLoading({ label = "正在加载…" }: { label?: string }) {
  return (
    <p className="ink-state ink-state-loading" role="status">
      {label}
    </p>
  );
}

/** 空状态：说明「为什么空」与「接下来能做什么」。 */
export function PageEmpty({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="ink-state ink-state-empty" role="status">
      <span className="ink-state-title">{title}</span>
      {hint ? <span className="ink-state-hint">{hint}</span> : null}
      {action ? <span className="ink-state-action">{action}</span> : null}
    </div>
  );
}

/**
 * 出错：说清发生了什么，并给出重试。
 *
 * onRetry 缺省时只显示提示 —— 有些错误重试也没用（比如内容没公开），
 * 那类情况不该给一个点了没反应按钮。
 */
export function PageError({
  message = "暂时无法加载，请稍后重试。",
  onRetry,
  retryLabel = "重试",
}: {
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="ink-state ink-state-error" role="alert">
      <span className="ink-state-title">{message}</span>
      {onRetry ? (
        <button type="button" className="ink-state-retry" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
