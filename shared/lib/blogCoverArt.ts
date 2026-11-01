/**
 * 封面美术方案：只出文字，不出图。
 *
 * 这一层负责两件事：
 *   1. 从站点内容（标题 + 正文）推出「画什么」—— 主题、图标、配色；
 *   2. 用一份共享的风格契约约束「怎么画」—— 所有主题同一套画法。
 *
 * 第三版封面把「内容生成」和「视觉编排」拆开：
 * 模型只生成一枚无字、可分离的浅立体图标砖；程序负责渐变背景、
 * 背景大字和不同展示位的排版。这样避免生图模型写错中文，
 * 同一个素材也能稳定复用在卡片、列表和 Banner 中。
 *
 * 为什么这么切：
 *   - 参考封面风格统一、识别度高，适合作为博客封面标准；
 *   - 图标被压进一枚固定大小的白色圆角方块里，构图稳定；
 *   - 主题词库从「一组插画元素」缩成「一枚图标」，提示词短了一截，
 *     硬约束更容易完整送达模型。
 *
 * 版式（图标砖、背景大字、各场景大小位置）由 shared/lib/blogCoverText.ts 负责，
 * 这里只管画面的「风格层」，两者互不越界。
 */
export const COVER_ART_VERSION = "isolated-icon-v4";
export type CoverArtStyle = "ink";

/**
 * 风格契约：所有主题共用一套画法，只换主体与配色。
 *
 * 模型只负责可分离的图形素材，不负责封面排版。
 */
export const COVER_ART_TREATMENT =
  "Digital app-icon graphic with softly embossed highlights. STRICT ORTHOGRAPHIC FRONT VIEW, face parallel to canvas, upright, zero rotation, no tilted perspective. One ivory rounded-square tile, one bold colored symbol DIRECTLY on its face, occupying 65% of tile. Shallow beveled rim, smooth button surface, subtle inner shading only. No nested tile, second slab, outer frame, pedestal, realistic scene, or cast shadow.";

/**
 * 构图契约必须在提示词的开头和结尾各出现一次。
 * 生图结果要能被后处理稳定抠出，因此只允许一枚居中图形和透明/纯白背景。
 */
export const COVER_ART_COMPOSITION =
  "Layout rule: FRONT-FACING square app icon, no scene. Create exactly one isolated app-icon symbol on a rounded-square tile, centered and fully visible, occupying about 68% of the canvas. Leave at least 14% empty margin on every side. Use a perfectly flat solid magenta (#FF00FF) background for removal, no gradients or shadows outside the tile. Never white background.";

/**
 * 收尾时的构图重申。
 */
export const COVER_ART_COMPOSITION_REMINDER =
  "Layout rule again: exactly one centered glyph, fully visible with generous empty margins, on flat solid magenta (#FF00FF), no white background.";

const subjects = [
  {
    key: "retrieval",
    label: "搜索与推荐",
    words: /推荐|召回|排序|搜索|retrieval|ranking|search/gi,
    subject: "one magnifying glass icon with a circular lens and angled handle",
    palette: "emerald green",
  },
  {
    key: "review",
    label: "复盘与计划",
    words: /复盘|周报|总结|review/gi,
    subject: "one clipboard icon with three horizontal lines and check marks",
    palette: "charcoal grey",
  },
  {
    key: "reading",
    label: "阅读与知识",
    words: /阅读|读书|书籍|知识|笔记|reading|book/gi,
    subject: "one simple open book icon with two solid page shapes and a center fold",
    palette: "warm amber",
  },
  {
    key: "ai",
    label: "AI 与工作流",
    words: /人工智能|大模型|模型|智能体|工具|\bAI\b|agent/gi,
    subject: "one four-point sparkle star icon with clean geometric lines",
    palette: "violet",
  },
  {
    key: "workflow",
    label: "效率与执行",
    words: /计划|待办|流程|工作流|效率|planning|task|workflow/gi,
    subject: "one rounded square icon with a bold check mark inside",
    palette: "teal",
  },
  {
    key: "data",
    label: "数据与实验",
    words: /数据|指标|分析|实验|埋点|统计|data|metric|experiment/gi,
    subject: "one bar chart icon with three bars and a rising trend line",
    palette: "cobalt blue",
  },
  {
    key: "product",
    label: "产品与方法",
    words: /产品|需求|设计|方法|方案|product|design/gi,
    subject: "one document sheet icon with folded corner and three horizontal lines",
    palette: "azure blue",
  },
] as const;

export function coverArtPlan(
  title: string,
  content: string,
  _style: CoverArtStyle = "ink",
) {
  title = title.replace(/\s+/g, " ").slice(0, 80);
  content = content.replace(/\s+/g, " ");
  // Titles carry more intent than incidental terms in a long article.
  const score = (words: RegExp) =>
    Math.min(4, (title.match(words) || []).length) * 5 +
    Math.min(4, (content.slice(0, 1600).match(words) || []).length);
  let selected: (typeof subjects)[number] = subjects[subjects.length - 1];
  let best = 0;
  for (const item of subjects) {
    const value = score(item.words);
    if (value > best) {
      selected = item;
      best = value;
    }
  }
  return {
    version: COVER_ART_VERSION,
    theme: selected.key,
    label: selected.label,
    subject: selected.subject,
    palette: selected.palette,
    overlayPalette:
      selected.key === "review"
        ? ("slate" as const)
        : selected.key === "workflow"
          ? ("teal" as const)
          : selected.key === "ai"
            ? ("violet" as const)
            : selected.key === "reading"
              ? ("orange" as const)
              : selected.key === "retrieval"
                ? ("green" as const)
                : ("blue" as const),
    treatment: COVER_ART_TREATMENT,
    composition: COVER_ART_COMPOSITION,
    compositionReminder: COVER_ART_COMPOSITION_REMINDER,
  };
}

/** Standard model first, then configured order; no claim of universal quality ranking. */
export function preferCoverModels<T extends { modelKey: string }>(models: T[]): T[] {
  return [...models].sort((a, b) =>
    Number(/^image-01$/i.test(b.modelKey.trim())) - Number(/^image-01$/i.test(a.modelKey.trim())),
  );
}
