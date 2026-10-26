/**
 * 专题展示方式。
 *
 * topic —— 专题模式：专题介绍 + 文章列表（原有行为）。
 * doc   —— 文档模式：章节目录 + 连续阅读，适合系列教程、手册。
 *
 * 两种模式共用同一套专题、章节、文章与排序 —— 展示方式只决定「怎么排版」，
 * 不决定「有什么内容」。所以切换模式不需要迁移任何文章关系。
 */
export const TOPIC_DISPLAY_MODES = ["topic", "doc"] as const;

export type TopicDisplayMode = (typeof TOPIC_DISPLAY_MODES)[number];

/** 老数据、老接口没给值时的兜底：专题模式。 */
export const DEFAULT_TOPIC_DISPLAY_MODE: TopicDisplayMode = "topic";

/**
 * 把任意来源的值收敛成合法模式。
 *
 * 服务端不信任前端传值：老客户端可能传空串或乱写的字符串，
 * 一律退回专题模式，绝不因为一个脏值把整个专题页弄挂。
 */
export function normalizeTopicDisplayMode(value: unknown): TopicDisplayMode {
  return value === "doc" ? "doc" : DEFAULT_TOPIC_DISPLAY_MODE;
}

/** 是不是文档模式。 */
export function isDocTopicMode(value: unknown): boolean {
  return normalizeTopicDisplayMode(value) === "doc";
}

/**
 * 文档模式的「默认打开文章」。
 *
 * 留空（null）= 自动：打开编排中的第一篇有效公开文章。
 * 指定 = 打开作者指定的那一篇（仍要过一遍公开有效性校验）。
 *
 * 存的是私有笔记 id（notes.id），不是公开地址 publishId ——
 * 文章重新发布后地址会变，笔记 id 不会。
 */
export const TOPIC_DEFAULT_ARTICLE_AUTO = "auto";

/**
 * 把任意来源的值收敛成「默认文章 id 或 null」。
 *
 * 非法值（0、负数、小数、字符串）一律当成「没指定」——
 * 前台读到的默认文章永远是可以回退的状态，不会卡住页面。
 */
export function normalizeTopicDefaultNoteId(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const id = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}
