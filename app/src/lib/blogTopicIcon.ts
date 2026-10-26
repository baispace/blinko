// 专题图标：按专题名里的关键词挑一个本地 tabler 图标。
//
// 为什么不存进 DB：blogTopic 没有 icon 字段，为了一个装饰性图标去加列 + 迁移 +
// 后台编辑项并不划算；按名字推导则改专题名也不用动数据库。
// 图标名必须在 app/src/components/Common/Iconify/icons.tsx 的本地白名单里，
// 否则 Icon 会渲染成空。
const RULES: Array<[RegExp, string]> = [
  [/AI|大模型|LLM|智能体|机器学习|深度学习|GPT/i, "tabler:robot"],
  [/推荐|排序|算法|搜索|召回|检索/i, "tabler:adjustments"],
  [/数据|指标|数仓|埋点|分析|存储/i, "tabler:table"],
  [/产品|需求|设计|体验|用户/i, "tabler:file-text"],
  [/阅读|读书|书|笔记/i, "tabler:book"],
  [/复盘|总结|回顾|沉淀|思考/i, "tabler:notes"],
  [/工程|效率|工具|开发|代码|架构|运维/i, "tabler:code"],
];

/** 专题对应的图标名（tabler:*）。 */
export function topicIcon(name?: string): string {
  const text = (name || "").trim();
  for (const [re, icon] of RULES) {
    if (re.test(text)) return icon;
  }
  return "tabler:notes";
}

/** 专题色的淡底色（16 进制尾缀 = alpha），拿不到合法颜色就退回主题 tint。 */
export function topicTint(color?: string): string {
  const c = (color || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return `${c}1f`;
  if (/^#[0-9a-f]{3}$/i.test(c)) {
    const [r, g, b] = [c[1], c[2], c[3]];
    return `#${r}${r}${g}${g}${b}${b}1f`;
  }
  return "var(--ink-tint)";
}
