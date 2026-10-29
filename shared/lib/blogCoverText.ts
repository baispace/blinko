/**
 * 封面文字层：一套按「真实容器尺寸」算排版的规则。
 *
 * 封面现在分三层：
 *   1. 底图层 —— 一张 1600×900 的无字 AI 图，所有展示位共用；
 *   2. 文字层 —— 短标题 / 副标题，由系统排版（页面上是真文字，分享图是合成文字）；
 *   3. 状态层 —— 置顶角标、轮播控件，由页面自己画，不进图片。
 *
 * 这份文件只放「怎么排」的数学：字号、断行、避让、什么时候该藏副标题。
 * 前台渲染文字层、服务端合成分享图都读它，两边才不会各排各的。
 *
 * 关键约束：排版依据是**容器实际像素尺寸**，不是「桌面 / 手机」两档断点。
 * 同一个短标题在 640×229 的头条大图和 150×94 的列表缩略图里，
 * 字号、行数、是否留副标题都应不同。
 */

/** 排版模板版本：规则变了就往上加一位，公开快照里记着用的是哪一版。 */
export const COVER_TEMPLATE_VERSION = "v2";

/**
 * 封面模式：
 *   overlay 底图 + 系统文字（无字底图走这条）
 *   full    完整图片封面（历史封面自带文字，不能再叠一层）
 */
export type CoverTextMode = "overlay" | "full";

export type CoverTextAlign = "left" | "center" | "right";

/** 排版场景：与公开站实际用到的展示位一一对应。 */
export type CoverSceneKey = "double" | "single" | "banner" | "share";

export type CoverTextConfig = {
  mode: CoverTextMode;
  templateVersion: string;
  /** 短标题：建议 4–8 个中文字符。 */
  title: string;
  /** 副标题：可选，空间不够时自动隐藏。 */
  subtitle: string;
  align: CoverTextAlign;
  /** 字号微调：0.8–1.2，只在自动适配不理想时才动。 */
  sizeScale: number;
  /** 主题色：文字遮罩用，预设名或 #rrggbb。 */
  palette: string;
};

export const defaultCoverTextConfig: CoverTextConfig = {
  mode: "overlay",
  templateVersion: COVER_TEMPLATE_VERSION,
  title: "",
  subtitle: "",
  align: "left",
  sizeScale: 1,
  palette: "violet",
};

export const COVER_TITLE_MAX = 24;
export const COVER_SUBTITLE_MAX = 40;

/* ------------------------------------------------------------------ *
 * 中文排版基础件（原先在 server/lib/blogCoverComposition.ts 里，
 * 现在提到 shared：页面上的文字层要用同一套断行，分享图才能对得上）
 * ------------------------------------------------------------------ */

/** 字距（em）。参考封面的标题字距很紧，接近贴住；0.04 会显得松垮。 */
const TRACKING = -0.02;

/**
 * 标题的横向压缩系数。
 *
 * 参考封面的标题是窄体：量下来每字宽高比约 0.83（Noto Sans SC 原生约 1.0），
 * 笔画密度 0.63（原生 Black 约 0.40）。压窄之后密度自然上来，
 * 字形才和参考图对得上。
 *
 * 页面用 CSS transform: scaleX()，服务端用 SVG 路径缩放，两边同一个系数。
 */
export const COVER_TITLE_SCALE_X = 0.84;

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new (Intl as unknown as {
        Segmenter: new (
          locales: string,
          options: { granularity: "word" },
        ) => { segment(input: string): Iterable<{ segment: string }> };
      }).Segmenter("zh-Hans", { granularity: "word" })
    : null;

/** 避头：虚词、连词、介词与收尾标点不能出现在行首。 */
const NO_LINE_START = new Set(
  "的了着吗呢吧啊呀和与及或而但就都也还又再很最更不没无非把被让使给对跟同比等之于为以因由从到在往上里外前后中将已曾虽故所如若则即却唯光".split(
    "",
  ),
);
/** 避尾：开引号、开括号不能出现在行尾。 */
const NO_LINE_END = new Set("（【《「『〔〖".split(""));

/**
 * 估算一段文字的宽度（单位 em）。
 *
 * 中文按 1em、拉丁按经验值算 —— 排版要在渲染之前就知道「放不放得下」，
 * 不能等浏览器量完再决定放哪。
 *
 * scale 是横向压缩系数：标题压窄后占的宽度比字面宽度小，
 * 排版必须按压窄后的实际宽度算，否则会选过大的字号。
 */
export function coverTextEmWidth(text: string, scale = 1): number {
  let w = 0;
  for (const ch of text) {
    if (/[⺀-鿿豈-﫿︰-﹏＀-｠￠-￦]/.test(ch)) w += 1;
    else if (ch === " ") w += 0.3;
    else if (/[A-Z0-9]/.test(ch)) w += 0.66;
    else if (/[ilj.,:;'!|]/.test(ch)) w += 0.3;
    else w += 0.56;
  }
  const chars = [...text].length;
  return (w + TRACKING * Math.max(0, chars - 1)) * scale;
}

type Token = { text: string; space: boolean };

function tokenize(text: string): Token[] {
  const raw = segmenter
    ? [...segmenter.segment(text)].map((s) => s.segment)
    : [...text];
  return raw
    .filter((s) => s.length > 0)
    .map((s) => ({ text: s, space: /^\s+$/.test(s) }));
}

/**
 * 选断点：必须落在词边界，且下一行不能以虚词/收尾标点开头（避头），
 * 上一行不能以开引号结尾（避尾）。两行长度尽量接近，末行不留单个字。
 */
function chooseBreak(tokens: Token[]): number {
  let best = -1;
  let bestScore = Infinity;
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i].space || tokens[i - 1].space) continue;
    const next = tokens[i].text;
    if (NO_LINE_START.has(next[0])) continue;
    const prev = tokens[i - 1].text;
    if (NO_LINE_END.has(prev[prev.length - 1])) continue;
    const line1 = tokens
      .slice(0, i)
      .map((t) => t.text)
      .join("");
    const line2 = tokens
      .slice(i)
      .map((t) => t.text)
      .join("");
    const w1 = coverTextEmWidth(line1);
    const w2 = coverTextEmWidth(line2);
    let score = Math.abs(w1 - w2);
    if ([...line2].length <= 1) score += 100;
    if (w1 < 0.8) score += 100;
    // 同分时取靠后的断点：首行排满、末行收短，视觉上更像海报标题。
    if (score <= bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** 把一段文字断成 1–2 行；断不开就按字符均分（仍然不劈词）。 */
export function coverTextLines(text: string, maxLines: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (maxLines <= 1) return [trimmed];
  const tokens = tokenize(trimmed);
  const cut = chooseBreak(tokens);
  if (cut < 0) {
    const chars = [...trimmed];
    const mid = Math.ceil(chars.length / 2);
    return [chars.slice(0, mid).join(""), chars.slice(mid).join("")];
  }
  return [
    tokens
      .slice(0, cut)
      .map((t) => t.text)
      .join(""),
    tokens
      .slice(cut)
      .map((t) => t.text)
      .join(""),
  ];
}

/* ------------------------------------------------------------------ *
 * 场景规则
 * ------------------------------------------------------------------ */

type SceneRule = {
  /** 文字列占容器宽度的比例：左文右图，右侧留给插画主体。 */
  columnRatio: number;
  /** 标题字号上限（相对容器高度）。 */
  maxFontRatio: number;
  /** 标题字号下限（相对容器高度）：低于这条就「读不动了」，改为提示缩短短标题。 */
  minFontRatio: number;
  /** 最多几行。 */
  maxLines: number;
  /** 副标题字号 / 标题字号。 */
  subtitleRatio: number;
  /** 这个场景允不允许出现副标题。 */
  allowSubtitle: boolean;
  /** 左上角角标预留高度（相对容器高度）。 */
  badgeReserve: number;
  /** 底部控件预留高度（相对容器高度），给轮播箭头 / 分页点让位。 */
  controlsReserve: number;
  /** 底部状态行预留高度（相对容器高度）：角标行那一条。 */
  footerReserveRatio: number;
  /** 状态行预留的最小像素：窄屏按比例会不够用，用这条兜底。 */
  footerReserveMinPx: number;
  /** 文字块落位：默认在可用带里居中；「标题贴底」的场景用 bottom。 */
  anchor: "center" | "bottom";
  /** 左右内边距（相对容器宽度）。 */
  padXRatio: number;
  /** 上下内边距（相对容器高度）。 */
  padYRatio: number;
};

export const coverSceneRules: Record<CoverSceneKey, SceneRule> = {
  // 双栏头条大图 2.8:1：宽而扁，字号可以放大，副标题看空间。
  double: {
    columnRatio: 0.32,
    maxFontRatio: 0.34,
    minFontRatio: 0.15,
    maxLines: 2,
    subtitleRatio: 0.4,
    allowSubtitle: true,
    badgeReserve: 0.26,
    controlsReserve: 0,
    footerReserveRatio: 0,
    footerReserveMinPx: 0,
    anchor: "center",
    padXRatio: 0.075,
    padYRatio: 0.09,
  },
  // 单栏缩略图 16:9：小尺寸，只留短标题，允许两行。
  single: {
    columnRatio: 0.34,
    maxFontRatio: 0.3,
    minFontRatio: 0.13,
    maxLines: 2,
    subtitleRatio: 0.42,
    allowSubtitle: false,
    badgeReserve: 0.24,
    controlsReserve: 0,
    footerReserveRatio: 0,
    footerReserveMinPx: 0,
    anchor: "center",
    padXRatio: 0.075,
    padYRatio: 0.09,
  },
  /*
   * 首页 Banner 2.9:1。
   *
   * 版式照着参考稿来：标题贴左下角，底下一行状态角标（★ 全站推荐 + 圆点），
   * 轮播箭头在右下角。于是：
   *   - 文字块贴底（anchor: bottom），不再垂直居中；
   *   - 底部给状态行让出高度（footerReserve），标题就落在它上面；
   *   - 箭头在右下、标题在左下，各占一边 —— 箭头不再需要占文字的宽度，
   *     controlsReserve 归零，字号也收一档（maxFontRatio），画面不再被字塞满。
   */
  banner: {
    columnRatio: 0.33,
    maxFontRatio: 0.2,
    minFontRatio: 0.12,
    maxLines: 2,
    subtitleRatio: 0.4,
    allowSubtitle: true,
    badgeReserve: 0,
    controlsReserve: 0,
    footerReserveRatio: 0.16,
    footerReserveMinPx: 34,
    anchor: "bottom",
    padXRatio: 0.075,
    padYRatio: 0.09,
  },
  // 社交分享图 1200×630。
  share: {
    columnRatio: 0.34,
    maxFontRatio: 0.24,
    minFontRatio: 0.11,
    maxLines: 2,
    subtitleRatio: 0.38,
    allowSubtitle: true,
    badgeReserve: 0,
    controlsReserve: 0,
    footerReserveRatio: 0,
    footerReserveMinPx: 0,
    anchor: "center",
    padXRatio: 0.075,
    padYRatio: 0.09,
  },
};

/**
 * 标题字号的绝对上限（px）。
 *
 * 场景规则已经用「容器高度的百分比」限住了字号，这条只是防呆：
 * 容器特别高时（比如整屏宽的大图）不至于算出几百像素的标题。
 */
export const COVER_TITLE_MAX_PX = 240;

/**
 * 标题安全区：标题列最右只能到容器宽度的这个比例。
 *
 * 底图左 38% 是留给标题的干净底色，插画从右边压过来。
 * 标题列越过这条线就可能压到插画上 —— 排版时用 columnRatio + padXRatio 卡住。
 */
export const COVER_TEXT_SAFE_RATIO = 0.42;

export type CoverArtworkRect = { left: number; top: number; width: number; height: number };

/**
 * 插画区：整幅铺满封面。
 *
 * 底图本身就是一张完整构图 —— 左侧留干净底色给标题，右侧那组插画被画框裁掉，
 * 和参考封面的做法一样。所以铺字时不再切一块独立的「插画槽位」：
 * 标题直接压在底图的留白上，插画也不会因为换展示位而左右跑位。
 */
export function coverArtworkRect(
  width: number,
  height: number,
  _placement: CoverSceneKey,
  _align: CoverTextAlign = "left",
): CoverArtworkRect {
  return {
    left: 0,
    top: 0,
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

export type CoverTextLayout = {
  artwork: CoverArtworkRect;
  /** 标题字号（px）。 */
  fontSize: number;
  /** 副标题字号（px）。 */
  subtitleSize: number;
  titleLineHeight: number;
  subtitleLineHeight: number;
  /** 文字列最大宽度（px）。 */
  maxWidth: number;
  /** 标题断行结果。 */
  titleLines: string[];
  /** 副标题断行结果（为空表示这次不显示副标题）。 */
  subtitleLines: string[];
  /** 标题与副标题之间的间距（px）。 */
  subtitleGap: number;
  /** 文字块左上角坐标（px，相对容器）。 */
  left: number;
  top: number;
  /** 文字块整体高度（px）。 */
  blockHeight: number;
  /** 标题太长、已经到可读下限仍放不下 —— 需要提示作者缩短短标题。 */
  overflow: boolean;
  /** 副标题因为空间不够被藏起来了。 */
  subtitleHidden: boolean;
  align: CoverTextAlign;
  paddingX: number;
  paddingY: number;
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * 按容器实际尺寸算排版。
 *
 * 返回的 titleLines / subtitleLines 就是最终要渲染的文字 ——
 * 页面把它们一行一个 <span> 画出来，服务端把同样的行交给 sharp 画，
 * 两边的换行才会一致。
 */
export function computeCoverTextLayout(input: {
  containerWidth: number;
  containerHeight: number;
  placement: CoverSceneKey;
  title: string;
  subtitle?: string;
  align?: CoverTextAlign;
  sizeScale?: number;
  /** 左上角是否有「置顶」角标。 */
  badge?: boolean;
  /** 底部是否有轮播 / 分页控件。 */
  controls?: boolean;
}): CoverTextLayout {
  const rules = coverSceneRules[input.placement];
  const w = Math.max(1, Math.round(input.containerWidth));
  const h = Math.max(1, Math.round(input.containerHeight));
  const align = input.align ?? "left";
  const scale = clamp(input.sizeScale ?? 1, 0.8, 1.25);
  const title = (input.title ?? "").trim();
  const subtitle = (input.subtitle ?? "").trim();

  const paddingX = Math.round(w * rules.padXRatio);
  const paddingY = Math.round(h * rules.padYRatio);
  const maxWidth = Math.max(24, Math.round(w * (align === "center" ? 0.8 : rules.columnRatio)));
  const topInset = input.badge
    ? Math.round(h * rules.badgeReserve)
    : 0;
  /*
   * 底部让位：轮播控件与页面状态行都占底部那条带子，取更宽的一条。
   * 状态行按比例算，窄屏按比例会不够 —— 再用最小像素兜底。
   */
  const bottomInset = Math.max(
    input.controls ? Math.round(h * rules.controlsReserve) : 0,
    Math.max(Math.round(h * rules.footerReserveRatio), rules.footerReserveMinPx),
  );

  const minFont = Math.max(11, Math.min(h * rules.minFontRatio, w * 0.045));
  const maxFont = Math.max(minFont, h * rules.maxFontRatio);

  // 可用高度：扣掉上下内边距，以及角标 / 轮播控件让出来的位置。
  const bandTop = Math.max(paddingY + topInset, align === "center" ? Math.round(h * 0.44) : 0);
  // 贴底排版时，底边距由状态行决定，不再另留一层 padding。
  const bandBottom =
    rules.anchor === "bottom" ? h - bottomInset : h - paddingY - bottomInset;
  const bandHeight = Math.max(0, bandBottom - bandTop);

  /*
   * 从大到小试字号：先保证放得下，再谈好看。
   *
   * 两轮：
   *   1. 标题单独放得下的最大字号 —— 这就是参考封面那种「大字占满左半边」的排法；
   *   2. 如果作者写了副标题，再找一个标题与副标题都放得下的字号。
   *      两轮都成立时用第 2 轮（标题让一让，副标题保住）——
   *      作者特意写的小字不该被悄悄丢掉；标题缩小一档仍然是醒目的大字。
   */
  const steps = 24;
  const sizeAt = (i: number) =>
    Math.min(
      COVER_TITLE_MAX_PX,
      (maxFont - ((maxFont - minFont) * i) / steps) * scale,
    );
  const titleLayoutAt = (i: number) => {
    const size = sizeAt(i);
    const lines = fitLines(
      title,
      maxWidth,
      size,
      rules.maxLines,
      COVER_TITLE_SCALE_X,
    );
    if (!lines) return null;
    /*
     * 宽度放得下还不够：宽扁的容器（2.8:1 的双栏大图）里，
     * 按宽度选出来的字号排成两行后可能比画布还高 ——
     * 再加上左上角的置顶角标让出 26% 高度，更容易顶出画布被裁掉。
     * 高度也放不下就继续试更小的字号。
     */
    const lineHeight = Math.round(size * 1.22);
    if (lines.lines.length * lineHeight > bandHeight) return null;
    return { size, lines: lines.lines, lineHeight };
  };

  let chosen: {
    size: number;
    lines: string[];
    overflow: boolean;
  } | null = null;
  let chosenSubtitle: { lines: string[]; size: number } | null = null;
  for (let i = 0; i <= steps; i++) {
    const candidate = titleLayoutAt(i);
    if (!candidate) continue;
    chosen = { size: candidate.size, lines: candidate.lines, overflow: false };
    break;
  }
  if (chosen && subtitle && rules.allowSubtitle) {
    for (let i = 0; i <= steps; i++) {
      const candidate = titleLayoutAt(i);
      if (!candidate) continue;
      const subSize = Math.round(clamp(candidate.size * rules.subtitleRatio, 10, 64));
      const sub = fitLines(subtitle, maxWidth, subSize, 2, 1, true);
      if (!sub) break;
      const gap = Math.round(candidate.size * 0.3);
      const subHeight = sub.lines.length * Math.round(subSize * 1.35);
      if (candidate.lines.length * candidate.lineHeight + gap + subHeight > bandHeight)
        continue;
      chosen = { size: candidate.size, lines: candidate.lines, overflow: false };
      chosenSubtitle = { lines: sub.lines, size: subSize };
      break;
    }
  }
  if (!chosen) {
    // 到可读下限了还是放不下：不硬缩，标记出来让作者改文案。
    const lines = coverTextLines(title, rules.maxLines);
    chosen = {
      size: minFont,
      lines: lines.length ? lines : [title],
      overflow: true,
    };
  }

  const fontSize = Math.floor(clamp(chosen.size, 11, COVER_TITLE_MAX_PX));
  const titleLines = chosen.lines;
  const titleLineHeight = Math.round(fontSize * 1.22);
  const titleHeight = titleLines.length * titleLineHeight;

  const subtitleSize = chosenSubtitle?.size ?? Math.round(clamp(fontSize * rules.subtitleRatio, 10, 64));
  const subtitleLineHeight = Math.round(subtitleSize * 1.35);

  // 副标题：先按「能放下」判断，放不下就藏起来（它可以自动隐藏，短标题不行）。
  let subtitleLines: string[] = chosenSubtitle?.lines ?? [];
  let subtitleGap = 0;
  let subtitleHidden = false;
  const subtitleGapBase = Math.round(fontSize * 0.3);
  if (subtitleLines.length) {
    subtitleGap = subtitleGapBase;
  } else if (subtitle) {
    subtitleHidden = true;
  }

  const blockHeight =
    titleHeight + (subtitleLines.length ? subtitleGap + subtitleLines.length * subtitleLineHeight : 0);

  let top =
    rules.anchor === "bottom"
      ? Math.max(bandTop, bandBottom - blockHeight)
      : bandTop + Math.max(0, (bandHeight - blockHeight) / 2);
  if (blockHeight > bandHeight) {
    // 文字比可用高度还高：贴着上沿放，别让它跑到画布外。
    top = bandTop;
  }

  let left = paddingX;
  if (align === "center") left = Math.round((w - maxWidth) / 2);
  else if (align === "right") left = Math.max(paddingX, w - paddingX - maxWidth);

  return {
    artwork: coverArtworkRect(w, h, input.placement, align),
    fontSize,
    subtitleSize,
    titleLineHeight,
    subtitleLineHeight,
    maxWidth,
    titleLines,
    subtitleLines,
    subtitleGap,
    left,
    top: Math.round(top),
    blockHeight,
    overflow: chosen.overflow,
    subtitleHidden,
    align,
    paddingX,
    paddingY,
  };
}

/**
 * 给定字号，看文字能不能排进 maxWidth / maxLines。
 *
 * 放得下返回断好的行，放不下返回 null（调用方继续试更小的字号）。
 *
 * scale 是横向压缩系数：标题压窄，按压窄后的宽度算。
 *
 * preferSingle 是给小字用的：小字优先排成一行（放得下就别断行），
 * 标题相反 —— 海报标题宁可两行均分，也不要一行小字。
 */
function fitLines(
  text: string,
  maxWidth: number,
  size: number,
  maxLines: number,
  scale = 1,
  preferSingle = false,
): { lines: string[] } | null {
  const trimmed = text.trim();
  if (!trimmed) return { lines: [] };
  if (preferSingle) {
    const single = coverTextEmWidth(trimmed, scale) * size;
    if (single <= maxWidth) return { lines: [trimmed] };
  }
  /*
   * 短标题优先排成两行均分（参考封面：「复盘 / 笔记」「高效 / 工作流」）。
   * 两行的视觉重心比一行小字稳，也更像海报标题；
   * 只有放不下时才退回单行。
   */
  if (maxLines >= 2) {
    const balanced = coverTextLines(trimmed, 2);
    if (
      balanced.length === 2 &&
      balanced.every((l) => coverTextEmWidth(l, scale) * size <= maxWidth * 0.98)
    )
      return { lines: balanced };
  }
  const single = coverTextEmWidth(trimmed, scale) * size;
  if (single <= maxWidth) return { lines: [trimmed] };
  if (maxLines < 2) return null;
  const lines = coverTextLines(trimmed, 2);
  if (lines.length < 2) return null;
  // 每行都要放得下；留 2% 余量给字体度量误差。
  if (lines.every((l) => coverTextEmWidth(l, scale) * size <= maxWidth * 0.98))
    return { lines };
  return null;
}

/* ------------------------------------------------------------------ *
 * 配置的读写
 * ------------------------------------------------------------------ */

/** 从任意 JSON 里读出封面文字配置；脏数据一律回落到默认值。 */
export function normalizeCoverTextConfig(
  value: unknown,
): CoverTextConfig {
  const raw = (value ?? {}) as Partial<CoverTextConfig>;
  const mode: CoverTextMode = raw.mode === "full" ? "full" : "overlay";
  const align: CoverTextAlign =
    raw.align === "center" || raw.align === "right" ? raw.align : "left";
  return {
    mode,
    templateVersion:
      typeof raw.templateVersion === "string" && raw.templateVersion
        ? raw.templateVersion
        : COVER_TEMPLATE_VERSION,
    title: typeof raw.title === "string" ? raw.title.trim().slice(0, COVER_TITLE_MAX) : "",
    subtitle:
      typeof raw.subtitle === "string"
        ? raw.subtitle.trim().slice(0, COVER_SUBTITLE_MAX)
        : "",
    align,
    sizeScale: clamp(Number(raw.sizeScale) || 1, 0.8, 1.25),
    palette: typeof raw.palette === "string" && raw.palette ? raw.palette : "violet",
  };
}

/** 两份配置是否等价（忽略排版模板版本之外的字段顺序）。 */
export function coverTextConfigEqual(
  a: CoverTextConfig | null | undefined,
  b: CoverTextConfig | null | undefined,
) {
  const x = normalizeCoverTextConfig(a);
  const y = normalizeCoverTextConfig(b);
  return (
    x.mode === y.mode &&
    x.title === y.title &&
    x.subtitle === y.subtitle &&
    x.align === y.align &&
    Math.abs(x.sizeScale - y.sizeScale) < 0.001 &&
    x.palette === y.palette
  );
}

/** 文字层是否要显示（完整图片封面不叠字）。 */
export function coverHasTextLayer(config: CoverTextConfig | null | undefined) {
  const c = normalizeCoverTextConfig(config);
  return c.mode === "overlay" && !!c.title.trim();
}

/* ------------------------------------------------------------------ *
 * 主题色与文字遮罩
 *
 * 底图是 AI 画的，亮暗不固定；文字压在上面必须有足够对比度。
 * 做法是在文字列一侧铺一层同色系渐变遮罩 —— 页面用 CSS 渐变，
 * 分享图用同样参数的 SVG 渐变，两边看起来一致。
 * ------------------------------------------------------------------ */

export const coverPalettePresets: Record<string, string> = {
  violet: "#4930e8",
  blue: "#0862df",
  slate: "#202735",
  teal: "#087d85",
};

/** 归一化 #rgb / #rrggbb；不是合法颜色返回 null。 */
export function normalizeHexColor(value: string): string | null {
  const v = String(value ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v))
    return (
      "#" +
      v
        .slice(1)
        .split("")
        .map((c) => c + c)
        .join("")
        .toLowerCase()
    );
  return null;
}

/** 取主题色：预设名走内置色板，自定义走 hex，都不合法就回落到紫蓝。 */
export function coverPaletteColor(palette: string): string {
  const preset = coverPalettePresets[palette];
  if (preset) return preset;
  return normalizeHexColor(palette) ?? coverPalettePresets.violet;
}

export function hexToRgb(hex: string): [number, number, number] {
  const v = normalizeHexColor(hex) ?? coverPalettePresets.violet;
  const n = parseInt(v.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export type CoverScrimStop = { offset: number; alpha: number };

/**
 * 遮罩的渐变节点：按文字对齐方向决定从哪一侧压暗。
 *
 * 左对齐时整幅底图铺满，标题就压在底图的左半边 ——
 * 所以渐变要一直铺到标题列的右边缘（约 40% 处）才收干净，
 * 否则底图偏亮时，标题右侧那几个字会发飘。
 */
export function coverScrimStops(align: CoverTextAlign): CoverScrimStop[] {
  if (align === "center")
    return [
      { offset: 0, alpha: 0.3 },
      { offset: 0.5, alpha: 0.14 },
      { offset: 1, alpha: 0.3 },
    ];
  if (align === "right")
    return [
      { offset: 0, alpha: 0 },
      { offset: 0.5, alpha: 0.26 },
      { offset: 1, alpha: 0.6 },
    ];
  return [
    { offset: 0, alpha: 0.62 },
    { offset: 0.3, alpha: 0.38 },
    { offset: 0.44, alpha: 0.16 },
    { offset: 0.58, alpha: 0 },
  ];
}

/** 页面用的遮罩 CSS：与分享图的 SVG 渐变同参数。 */
export function coverScrimCss(palette: string, align: CoverTextAlign): string {
  const [r, g, b] = hexToRgb(coverPaletteColor(palette));
  const stops = coverScrimStops(align)
    .map(
      (s) =>
        `rgba(${r},${g},${b},${s.alpha}) ${Math.round(s.offset * 100)}%`,
    )
    .join(",");
  return `linear-gradient(to right, ${stops})`;
}


/** 页面与导出共用背景，单张插画以 contain 放入独立区域，不再裁切核心主体。 */
export function coverBackdropColors(palette: string) {
  const rgb = hexToRgb(coverPaletteColor(palette));
  const hex = (values: number[]) => "#" + values.map(v => Math.round(v).toString(16).padStart(2, "0")).join("");
  return { left: hex(rgb.map(v => v * 0.88)), right: hex(rgb.map(v => v + (255 - v) * 0.18)) };
}
export function coverBackdropCss(palette: string) {
  const colors = coverBackdropColors(palette);
  return `linear-gradient(to right, ${colors.left}, ${colors.right})`;
}
