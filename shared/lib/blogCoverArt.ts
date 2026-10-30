/**
 * 封面美术方案：只出文字，不出图。
 *
 * 这一层负责两件事：
 *   1. 从站点内容（标题 + 正文）推出「画什么」—— 主题、主体、配色；
 *   2. 用一份共享的风格契约约束「怎么画」—— 所有主题同一套画法。
 *
 * 风格抽象自站内五张参考封面（AI 工作流 / 产品方法 / 复盘笔记 / AI 工具箱 / 高效工作流）。
 * 把参考图放大逐项比对后，它们的共同语言是「干净的 3D 图标营销插画」：
 *   - 底色是饱和渐变（紫蓝 / 亮蓝 / 浅薰衣草 / 青绿 / 炭灰），
 *     后面浮着几块大号半透明圆角面板，压得极低几乎看不见；
 *   - 主体是**后仰 8–12 度的**圆角方块（App 图标）与白色界面面板，
 *     带一层薄侧面厚度，边缘有一道柔亮边光 —— 这是「有设计感」的关键；
 *   - 元素少而大，界面是纯白与浅灰蓝，只用一个品牌色点睛；
 *   - 主体横跨画面右半边，被画框的右边缘裁掉；左边 38% 是空的底色，
 *     站点就把标题压在那块留白上（整幅铺满，不再另开一块插画区）。
 *
 * 「塑料味」和「高级感」的区别不在有没有 3D，而在材质：
 *   - 廉价塑料 = 霓虹轮廓光 + 糖果色 + 重泛光 + 厚重景深 + 正面呆板；
 *   - 高级 3D  = 哑光白面 + 单侧柔光 + 薄侧面 + 短促软阴影 + 轻微景深。
 * 所以这两版只差在材质约束，3D 的倾斜与厚度不能删。
 *
 * 版式（图文分栏、裁切安全区）由 shared/lib/blogCover.ts 与 shared/lib/blogCoverText.ts 负责，
 * 这里只管画面的「风格层」，两者互不越界。
 */
export const COVER_ART_VERSION = "clean-3d-icon-v11";
export type CoverArtStyle = "ink";

/**
 * 风格契约：所有主题共用一套画法，只换主体与配色。
 *
 * 写成一段连续描述是有意的 —— 生图模型对碎片化的关键词列表理解更差，
 * 句子越完整，风格越稳。
 */
export const COVER_ART_TREATMENT =
  "Clean 3D app-icon illustration: large rounded tiles and matte white UI panels tilted 8-12 degrees, thin extruded side face, one soft light from the top left, soft edge light, short soft shadows. 产品功能发布封面。";

/**
 * 构图契约：主体压在右侧，左边留干净底色给站点叠标题。
 *
 * 参考封面就是这么排的 —— 插画组被画框的右边缘裁掉，标题落在左侧的空底色上。
 * 站点现在整幅铺满底图、标题压在留白上，所以底图必须自己把「左空右满」画出来；
 * 否则整幅铺满之后，插画会跑到标题底下。
 *
 * 这段措辞是**量出来的**，不是凭感觉写的。同一模型、同一提示词结构下：
 * 旧措辞（"anchored to the RIGHT ... the LEFT 38% is plain empty"）只有约 1/4 的
 * 采样把主体推到右侧（主体水平中心 36%–72%，波动极大），整幅铺满之后插画经常
 * 跑到标题底下、看起来「偏中间」。
 *
 * 换成现在的措辞（"pushed to the RIGHT EDGE ... cropped by it, so part of the
 * group continues outside the picture"）之后，同一位置下合格率升到约 2/3。
 * 差异有三处：
 *   1. "pushed to the RIGHT EDGE" —— 用「推」而不是「锚定」，模型不再把主体
 *      摆在画框中央再对齐；
 *   2. "so part of the group continues outside the picture" —— 明确说出「有一块
 *      在画外」，比 "cropped by the right edge" 更像真的溢出，模型愿意多给主体；
 *   3. "The LEFT HALF ... completely empty" —— 空区从 38% 放宽到一半，
 *      给了标题更宽的落字区。
 *
 * 措辞之外的另一半功劳在**位置**（见 COVER_ART_COMPOSITION_REMINDER）：
 * 同一段措辞放在契约中段合格率 1/3，提到最前面 2/3。
 *
 * 只改措辞与位置、不改画法（treatment/subject/palette 都不动），所以画面质感不会退化。
 */
export const COVER_ART_COMPOSITION =
  "Layout rule: the illustration group is pushed to the RIGHT EDGE of the frame and cropped by it, so part of the group continues outside the picture. The LEFT HALF of the frame is completely empty background — no objects, no panels, no shapes.";

/**
 * 收尾时的构图重申 —— 同一句规则，用更短的措辞再说一遍。
 *
 * 为什么要在提示词里说两遍：生图模型对提示词**位置**极其敏感。同一条规则放在
 * 契约中段（风格、配色、主体之后）时，构图合格率只有 1/3；提到最前面变成 2/3；
 * 前面一次、收尾再重申一次，3/3 全中，主体水平中心也从 58% 推到 74%。
 *
 * 收尾那句必须短 —— 提示词整体卡在 1500 字符（服务商硬上限，超了是静默截断，
 * 砍掉的往往正是末尾的硬约束）。所以这里是压缩过的重申，不是整句复制。
 */
export const COVER_ART_COMPOSITION_REMINDER =
  "Layout rule again: the illustration group is pushed to the RIGHT EDGE and cropped by it; the LEFT HALF of the frame stays completely empty.";

const subjects = [
  {
    key: "retrieval",
    label: "搜索与推荐",
    words: /推荐|召回|排序|搜索|retrieval|ranking|search/gi,
    subject:
      "one large tilted white results panel with three ranked rows and one vivid blue pill badge",
    palette: "royal blue to indigo",
  },
  {
    key: "review",
    label: "复盘与计划",
    words: /复盘|周报|总结|review/gi,
    subject:
      "one dark clipboard panel behind a white checklist card with four rows of a small round dot and a pale lavender line, a slim pen with a soft orange tip, one pale mint disc, three muted orange bars",
    palette: "charcoal grey to dark slate, neutral and muted",
  },
  {
    key: "reading",
    label: "阅读与知识",
    words: /阅读|读书|书籍|知识|笔记|reading|book/gi,
    subject:
      "one open white book with thick curved pages and one soft lilac bookmark, tilted 8-12 degrees",
    palette: "bright blue to cyan",
  },
  {
    key: "ai",
    label: "AI 与工作流",
    words: /人工智能|大模型|模型|智能体|工具|\bAI\b|agent/gi,
    subject:
      "exactly one large translucent rounded workflow window panel behind, plus three rounded app tiles with flat 2D line-art glyphs on their faces, linked by thin white curved connector lines with small arrowheads",
    palette: "violet to electric blue",
  },
  {
    key: "workflow",
    label: "效率与执行",
    words: /计划|待办|流程|工作流|效率|planning|task|workflow/gi,
    subject:
      "one large tilted white task card with a vivid blue check badge, one smaller status tile and three small colored dots",
    palette: "teal to emerald",
  },
  {
    key: "data",
    label: "数据与实验",
    words: /数据|指标|分析|实验|埋点|统计|data|metric|experiment/gi,
    subject:
      "one tilted white analytics panel with a rising line and three small bars",
    palette: "cobalt blue to azure",
  },
  {
    key: "product",
    label: "产品与方法",
    words: /产品|需求|设计|方法|方案|product|design/gi,
    subject:
      "one large tilted white interface document with a blue tile, a dark cursor arrow and one smaller card",
    palette: "azure to bright blue",
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
