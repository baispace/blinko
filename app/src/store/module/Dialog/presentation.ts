/**
 * 弹窗表现层默认值与解析。
 *
 * 纯逻辑，不依赖 React / store / DOM —— 这样它能被单测直接覆盖，
 * 而不用把整条 app store 依赖链（trpc、i18next、goober…）拖进测试环境。
 */

/**
 * 表现层默认值。
 *
 * 嵌套弹窗必须回到这些默认值：外层（设置面板、AI 聊天面板）是用 onlyContent
 * 打开的 —— 头部和内边距由弹窗内容自己负责。内层再调 setData 时 store 仍处于
 * isOpen 状态，历史上「只在关闭时重置」的逻辑不会执行，onlyContent / noPadding /
 * size 就被内层继承：内层弹窗没有标题、没有内边距，表单直接贴到弹窗边缘，
 * HeroUI 的关闭按钮也不会渲染。
 */
export const PRESENTATION_DEFAULTS = {
  preventClose: false,
  animated: false,
  hideCloseButton: false,
  noPadding: false,
  transparent: false,
  className: '',
  classNames: undefined,
  placement: 'auto',
  theme: 'default',
  size: 'md',
  isDismissable: true,
  onlyContent: false,
  showOnlyContentCloseButton: false,
} as const;

export type PresentationKey = keyof typeof PRESENTATION_DEFAULTS;

export const PRESENTATION_KEYS = Object.keys(PRESENTATION_DEFAULTS) as PresentationKey[];

/**
 * 算出「该回到默认值的字段」。
 *
 * 调用点显式给出的字段以调用点为准，其余一律回到默认值 —— 这正是嵌套弹窗
 * 不继承外层表现层标志的那条规则。
 */
export function resolvePresentation(
  explicit: Partial<Record<PresentationKey, unknown>>,
): Partial<Record<PresentationKey, unknown>> {
  const reset: Record<string, unknown> = {};
  for (const key of PRESENTATION_KEYS) {
    if (!(key in explicit)) reset[key] = PRESENTATION_DEFAULTS[key];
  }
  return reset;
}
