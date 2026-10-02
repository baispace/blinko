// 开发期控制台噪音过滤。
//
// 背景：项目里有几个**已停止维护**的依赖仍在「函数组件 / memo 组件」上用 defaultProps，
// React 18.3+ 会对每个这样的组件刷一条告警：
//   - rctx-contextmenu@1.4.1（最后发布 2023-03）  → ContextMenu / ContextMenuTrigger
//   - react-beautiful-dnd-next@11.0.5（2022-05）  → Connect(Droppable)，该组件在库内部
//     由 connect() 创建，**不对外导出**，所以无法在我们这边包一层修掉
//
// 这类校验只存在于 React 的 development 构建（生产构建不输出），因此仅为本地开发体验做过滤，
// 不做真实的库级修改——改这两个库相当于 vendor 一份压缩产物，维护成本远大于收益。
//
// 过滤范围被刻意收窄：只丢弃下面 NOISE_PATTERNS 命中的消息，其余 error/warn 原样透传。

const NOISE_PATTERNS: RegExp[] = [
  // React: defaultProps 将在未来版本从函数/memo 组件移除
  /Support for defaultProps will be removed/i,
];

export function silenceKnownDevNoise() {
  // 只在 Vite dev 下生效；生产构建里 DEV 被替换为 false，函数直接 return，不替换 console
  if (!import.meta.env.DEV) return;

  const rawError = console.error;
  const rawWarn = console.warn;

  const isNoise = (args: unknown[]) =>
    typeof args[0] === 'string' && NOISE_PATTERNS.some((re) => re.test(args[0] as string));

  console.error = (...args: unknown[]) => {
    if (isNoise(args)) return;
    rawError.apply(console, args as never);
  };
  console.warn = (...args: unknown[]) => {
    if (isNoise(args)) return;
    rawWarn.apply(console, args as never);
  };
}
