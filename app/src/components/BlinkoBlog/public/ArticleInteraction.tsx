import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Common/Iconify/icons";
import { BlogButton } from "@/components/BlinkoBlog/BlogUI";
import { blogDeviceId } from "@/lib/blogDevice";
import { api } from "@/lib/publicBlogClient";
import { ArticleFeedbackModal } from "./ArticleFeedbackModal";
import {
  REACTION_KINDS,
  REACTION_LABEL,
  type ReactionKind,
} from "@shared/lib/blogInteraction";
import "./article-interaction.css";

/** 每种表态配一个图标。 */
const REACTION_ICON: Record<ReactionKind, string> = {
  inspired: "tabler:bulb",
  useful: "tabler:circle-check",
  resonant: "tabler:heart",
};

type ReactionState = {
  counts: Record<ReactionKind, number>;
  total: number;
  mine: ReactionKind | null;
};

/** 乐观更新：本地先算一遍，失败再回滚。 */
function applyOptimistic(
  state: ReactionState,
  from: ReactionKind | null,
  to: ReactionKind | null,
): ReactionState {
  const counts = { ...state.counts };
  if (from) counts[from] = Math.max(0, counts[from] - 1);
  if (to) counts[to] = counts[to] + 1;
  return {
    counts,
    total: REACTION_KINDS.reduce((sum, kind) => sum + counts[kind], 0),
    mine: to,
  };
}

/**
 * 文章文末的互动区。
 *
 * 只有表态与「反馈作者」两个入口 —— 不做收藏、分享、公开评论。
 * 数量全部来自真实接口：加载失败时显示错误，不会拿 0 冒充真实数据。
 */
export function ArticleInteraction({
  publishId,
  articleTitle,
}: {
  publishId: string;
  articleTitle: string;
}) {
  const [state, setState] = useState<ReactionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [mailEnabled, setMailEnabled] = useState(false);
  const [deviceMissing, setDeviceMissing] = useState(false);

  const load = useCallback(async () => {
    const deviceId = blogDeviceId();
    if (!deviceId) {
      // 匿名标识存不下来：不能每次点击都生成新身份去重复计数。
      setDeviceMissing(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const value = await api.blog.publicReactionState.query({ publishId, deviceId });
      setState(value);
    } catch {
      setError("表态数据加载失败，请重试。");
    } finally {
      setLoading(false);
    }
  }, [publishId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    api.blog.publicMailNotice
      .query()
      .then((value) => {
        if (!cancelled) setMailEnabled(!!value.mailEnabled);
      })
      .catch(() => {
        /* 拿不到就按「通知不可用」处理：不承诺做不到的事。 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = async (kind: ReactionKind) => {
    if (saving) return;
    const deviceId = blogDeviceId();
    if (!deviceId) {
      setDeviceMissing(true);
      return;
    }
    const previous = state;
    if (!previous) return;
    // 再点一次当前选项 = 撤销；点别的 = 替换。
    const next = previous.mine === kind ? null : kind;
    setSaving(true);
    setError("");
    setState(applyOptimistic(previous, previous.mine, next));
    try {
      const value = await api.blog.publicReactionSet.mutate({
        publishId,
        deviceId,
        kind: next,
      });
      setState(value);
    } catch {
      // 失败回滚选择与数量
      setState(previous);
      setError("操作失败，请重试。");
    } finally {
      setSaving(false);
    }
  };

  const counts = state?.counts;
  const disabled = saving || loading || !state || deviceMissing;

  return (
    <section className="ink-ai-box" aria-label="文章互动">
      <div className="ink-ai-main">
        <h2 className="ink-ai-title">
          <Icon icon="tabler:bulb" width={20} />
          读到这里，留下你的感受吧。
        </h2>
        <p className="ink-ai-desc">一个小小的回应，也是继续分享的动力。</p>
        <div className="ink-ai-reactions">
          {REACTION_KINDS.map((kind) => {
            const selected = state?.mine === kind;
            return (
              <button
                key={kind}
                type="button"
                className="ink-ai-reaction"
                aria-pressed={selected}
                disabled={disabled}
                title={
                  selected
                    ? `已选择「${REACTION_LABEL[kind]}」，再次点击可撤销`
                    : `选择「${REACTION_LABEL[kind]}」`
                }
                onClick={() => void choose(kind)}
              >
                <span className="is-icon">
                  <Icon icon={REACTION_ICON[kind]} width={18} />
                </span>
                <span>{REACTION_LABEL[kind]}</span>
                <span className="ink-ai-count">
                  {/* 没拿到真实数据时显示占位符，绝不用 0 冒充「真的是零」 */}
                  {loading || !state ? "—" : (counts?.[kind] ?? 0)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="ink-ai-side">
        <BlogButton
          type="button"
          className="ink-ai-feedback-btn"
          onClick={() => setFeedbackOpen(true)}
        >
          <Icon icon="tabler:message" width={18} />
          反馈作者
        </BlogButton>
        <span className="ink-ai-feedback-hint">仅作者可见，可选邮件回复</span>
      </div>

      {(error || deviceMissing) && (
        <p className={`ink-ai-notice${error ? " is-error" : ""}`} role={error ? "alert" : "status"}>
          <Icon icon="tabler:alert-circle" width={15} />
          <span>
            {deviceMissing
              ? "当前浏览器无法保存匿名标识，表态无法持久保存，请允许本站存储本地数据后再试。"
              : error}
          </span>
          {error && (
            <button type="button" onClick={() => void load()}>
              重试
            </button>
          )}
        </p>
      )}

      <ArticleFeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        publishId={publishId}
        articleTitle={articleTitle}
        mailEnabled={mailEnabled}
      />
    </section>
  );
}
