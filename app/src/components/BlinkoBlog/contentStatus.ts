/**
 * 内容管理的状态模型 —— 全站唯一来源。
 *
 * 为什么单独抽一份：
 *   内容列表、文章工作台、发布检查三处都要回答同一个问题
 *   ——「这篇文章现在是什么状态，下一步该做什么」。
 *   之前每处各写各的文案（列表叫"有更新"、详情页叫"有未发布修改"、
 *   发布向导叫"有更新待发布"），同一个状态三种说法，
 *   用户会以为是三件不同的事，做决定时反复试探。
 *
 *   这里定一份模型，三处都引用它：
 *   状态怎么判定、叫什么、什么色调、此刻该点哪个按钮，都在一处。
 */

/** 内容状态。只有这四种，没有第五种。 */
export type ContentStatus = "draft" | "changed" | "published" | "withdrawn";

export type ContentStatusMeta = {
  /** 徽章上的短标签，列表与详情页共用。 */
  label: string;
  /** 这个状态意味着什么 —— 说明文字与 tooltip 用。 */
  desc: string;
  /** 徽章色调：plain 中性 / ok 正常 / warn 需要处理。 */
  tone: "plain" | "ok" | "warn";
  /**
   * 这一状态下最该做的那个动作。
   * 列表行内按钮就写它 —— 每种状态只给一个主动作，不摆一排等价按钮让用户挑。
   */
  action: string;
};

export const CONTENT_STATUS_META: Record<ContentStatus, ContentStatusMeta> = {
  draft: {
    label: "草稿",
    desc: "还没公开过。这里的改动只影响草稿，发布后才对读者可见。",
    tone: "plain",
    action: "发布",
  },
  changed: {
    label: "待发布更新",
    desc: "线上还是上一版，草稿里的改动要发布后才生效。",
    tone: "warn",
    action: "更新发布",
  },
  published: {
    label: "已发布",
    desc: "草稿与公开版本一致，读者看到的就是最新内容。",
    tone: "ok",
    action: "查看公开页",
  },
  withdrawn: {
    label: "已撤回",
    desc: "已从公开站下线，原链接不再对外访问。可以随时重新发布。",
    tone: "plain",
    action: "重新发布",
  },
};

/**
 * 列表分段筛选的顺序。
 * 顺序按"作者下一步要处理什么"排，不按字母排：
 * 待发布的排前面，已发布的沉到后面。
 */
export const CONTENT_STATUS_FILTERS: {
  key: ContentStatus | "all";
  label: string;
}[] = [
  { key: "all", label: "全部" },
  { key: "draft", label: "草稿" },
  { key: "changed", label: "待发布更新" },
  { key: "published", label: "已发布" },
  { key: "withdrawn", label: "已撤回" },
];

/** 判定一篇文章当前属于哪种状态。 */
export function resolveContentStatus(input: {
  isPublished: boolean;
  hasDraftChanges?: boolean;
  revision?: number;
}): ContentStatus {
  if (input.isPublished)
    return input.hasDraftChanges ? "changed" : "published";
  // 从未公开过（revision 为 0）是草稿；公开过又下线的是撤回。
  return (input.revision ?? 0) > 0 ? "withdrawn" : "draft";
}

/** 变更字段 → 中文。列表、工作台、发布检查共用同一套叫法。 */
export const CHANGE_FIELD_LABELS: Record<string, string> = {
  title: "标题",
  summary: "摘要",
  content: "正文",
  type: "内容类型",
  cover: "封面",
  seo: "SEO",
  tags: "公开标签",
};

/** 把变更字段列表拼成一句话：「正文、摘要已修改」。 */
export function describeChanges(changes: string[] | undefined | null) {
  if (!changes?.length) return "";
  return changes.map((key) => CHANGE_FIELD_LABELS[key] ?? key).join("、");
}

/**
 * 文章标题。
 *
 * 公开标题优先；没设就用正文里第一行当标题。
 * 列表、详情页、发布检查、发布向导各写了一份一模一样的实现，
 * 结果同一个文章在不同页面显示不同标题 —— 这里收口。
 */
export function contentTitle(content: string, explicit = "") {
  if (explicit.trim()) return explicit.trim();
  return (
    (content || "")
      .replace(/<\/(?:p|div|h[1-6])>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line)
      ?.replace(/^#{1,6}\s*/, "")
      .trim()
      .slice(0, 100) || "无标题"
  );
}
