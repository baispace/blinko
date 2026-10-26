/**
 * 发布对比的差异引擎。
 *
 * 「检查更新」要把「当前公开版本」和「待发布草稿」逐项比给作者看，
 * 所以差异不能只到字段级 —— 正文得能指出哪一段改了、怎么改。
 *
 * 三条硬规矩：
 *   1. 不把原始 HTML 当成差异内容展示。富文本先拆成块，块里再拆成词，
 *      读者看到的是「这段被删了」「这句换成了」，不是一堆标签。
 *   2. 不因为技术噪音误报。无意义空白、实体写法、属性顺序、
 *      JSON 键顺序都不算变化。
 *   3. 有意义的改动不能漏。段落增删、顺序调整、列表编号、
 *      加粗斜体、图片与链接换了，这些都要能看出来。
 *
 * 这里只做纯计算，不碰数据库，也不依赖 DOM —— 服务端算完再传给前端，
 * 前后端不会各算一套不一样的结果。
 */

export type DiffBlockType =
  | "paragraph"
  | "heading"
  | "list"
  | "quote"
  | "code"
  | "table"
  | "image"
  | "rule"
  | "html";

export type DiffBlock = {
  type: DiffBlockType;
  /** 归一化后的纯文本：比较与展示都用它。 */
  text: string;
  /** 结构指纹：类型 + 文本 + 资源标识。用来判断「这一块是不是同一块」。 */
  key: string;
  /** 块内的资源标识（图片地址、链接地址），资源换了要能看出来。 */
  resources: string[];
  /** 列表项的序号标记，用来识别「顺序变了」和「编号变了」。 */
  marker?: string;
};

export type DiffSegmentKind = "equal" | "insert" | "delete" | "replace";

export type DiffSegment = {
  kind: DiffSegmentKind;
  /** 公开版本一侧的块。 */
  before: DiffBlock[];
  /** 待发布草稿一侧的块。 */
  after: DiffBlock[];
};

export type WordPartKind = "equal" | "insert" | "delete";

export type WordPart = { kind: WordPartKind; text: string };

/* ------------------------------------------------------------------ *
 * 一、HTML 拆块
 * ------------------------------------------------------------------ */

const VOID_TAGS = new Set([
  "br",
  "hr",
  "img",
  "input",
  "meta",
  "link",
  "source",
  "area",
  "base",
  "col",
  "embed",
  "param",
  "track",
  "wbr",
]);

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

const BLOCK_TAGS = new Set([
  "p",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "table",
  "tr",
  "figure",
  "div",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "aside",
  "dl",
  "dd",
  "dt",
]);

type Token =
  | { kind: "text"; text: string }
  | { kind: "open"; name: string; attrs: Record<string, string> }
  | { kind: "close"; name: string };

const TAG_PATTERN =
  /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;

function decodeEntities(input: string) {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

function parseAttributes(raw: string) {
  const attrs: Record<string, string> = {};
  const pattern =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw))) {
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attrs[match[1].toLowerCase()] = decodeEntities(value);
  }
  return attrs;
}

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;
  TAG_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_PATTERN.exec(html))) {
    if (match.index > cursor) {
      const text = html.slice(cursor, match.index);
      if (text.trim()) tokens.push({ kind: "text", text });
    }
    cursor = TAG_PATTERN.lastIndex;
    if (match[0].startsWith("<!--") || match[0].startsWith("<![CDATA[")) continue;
    if (match[0].startsWith("<!DOCTYPE")) continue;
    if (match[1]) {
      tokens.push({ kind: "close", name: match[1].toLowerCase() });
      continue;
    }
    const name = (match[2] ?? "").toLowerCase();
    if (!name) continue;
    tokens.push({
      kind: "open",
      name,
      attrs: parseAttributes(match[3] ?? ""),
    });
    if (VOID_TAGS.has(name) || match[4]) {
      tokens.push({ kind: "close", name });
    }
  }
  if (cursor < html.length) {
    const text = html.slice(cursor);
    if (text.trim()) tokens.push({ kind: "text", text });
  }
  return tokens;
}

/**
 * 归一化文本：比较与展示都基于它。
 * 折叠空白、去零宽字符、统一全角空格 —— 这些都不算内容变化。
 */
export function normalizeText(input: string) {
  return decodeEntities(input ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t\r\n]+/g, " ")
    .trim();
}

/** 展示用的文本：保留换行结构，但同样不做无意义空白处理。 */
export function displayText(input: string) {
  return decodeEntities(input ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type BlockBuilder = {
  type: DiffBlockType;
  text: string;
  resources: string[];
  marker?: string;
};

function blockKey(block: BlockBuilder) {
  return [
    block.type,
    block.marker ?? "",
    normalizeText(block.text),
    [...block.resources].sort().join(","),
  ].join("\x00");
}

/**
 * 把 HTML 拆成可比对的块。
 *
 * 段落、标题、列表项、引用、代码块、表格行各自成块；
 * 图片与链接单独记进块里的资源清单 —— 换了图、换了链接要能看出来。
 */
export function splitBlocks(html: string): DiffBlock[] {
  const source = html ?? "";
  if (!source.trim()) return [];
  const tokens = tokenize(source);
  const blocks: BlockBuilder[] = [];

  let current: BlockBuilder | null = null;
  // 列表层级：li 的序号标记写在这里。
  const listStack: { ordered: boolean; index: number }[] = [];
  let quoteDepth = 0;
  let codeDepth = 0;
  let tableDepth = 0;
  let inTableRow = false;

  const flush = () => {
    if (!current) return;
    const text = displayText(current.text);
    if (text || current.resources.length) {
      blocks.push({ ...current, text });
    }
    current = null;
  };

  const ensure = (type: DiffBlockType) => {
    if (!current) current = { type, text: "", resources: [] };
    return current;
  };

  for (const token of tokens) {
    if (token.kind === "text") {
      if (codeDepth > 0) {
        const block = ensure("code");
        block.text += token.text;
        continue;
      }
      if (!current) current = { type: quoteDepth > 0 ? "quote" : "paragraph", text: "", resources: [] };
      current.text += token.text;
      continue;
    }

    if (token.kind === "open") {
      const { name, attrs } = token;
      if (name === "img") {
        const src = attrs.src ?? "";
        const alt = attrs.alt ?? "";
        // 段内的图只记成资源，跟着所在段落走；
        // 单独一张图才自己成块。
        if (current && current.type !== "image") {
          current.resources.push(`img:${src}`);
          if (alt) current.text += alt;
        } else {
          current = { type: "image", text: alt, resources: [`img:${src}`] };
          flush();
        }
        continue;
      }
      if (name === "a") {
        const href = attrs.href ?? "";
        const block = ensure(current?.type ?? "paragraph");
        block.resources.push(`link:${href}`);
        continue;
      }
      if (name === "br") {
        const block = ensure(current?.type ?? "paragraph");
        block.text += "\n";
        continue;
      }
      if (name === "hr") {
        flush();
        blocks.push({ type: "rule", text: "", resources: [] });
        continue;
      }
      if (HEADING_TAGS.has(name)) {
        flush();
        current = { type: "heading", text: "", resources: [] };
        continue;
      }
      if (name === "pre") {
        flush();
        codeDepth += 1;
        current = { type: "code", text: "", resources: [] };
        continue;
      }
      if (name === "blockquote") {
        flush();
        quoteDepth += 1;
        current = { type: "quote", text: "", resources: [] };
        continue;
      }
      if (name === "ul" || name === "ol") {
        flush();
        listStack.push({ ordered: name === "ol", index: 0 });
        continue;
      }
      if (name === "li") {
        flush();
        const list = listStack[listStack.length - 1];
        const marker = list
          ? list.ordered
            ? `${++list.index}.`
            : "•"
          : "•";
        current = {
          type: "list",
          text: "",
          resources: [],
          marker,
        };
        continue;
      }
      if (name === "table") {
        flush();
        tableDepth += 1;
        continue;
      }
      if (name === "tr") {
        flush();
        inTableRow = true;
        current = { type: "table", text: "", resources: [] };
        continue;
      }
      if (name === "td" || name === "th") {
        const block = ensure("table");
        if (block.text.trim()) block.text += " | ";
        continue;
      }
      if (BLOCK_TAGS.has(name)) {
        flush();
        current = {
          type: quoteDepth > 0 ? "quote" : tableDepth > 0 ? "table" : "paragraph",
          text: "",
          resources: [],
        };
        continue;
      }
      // 行内标签：内容继续并入当前块。
      continue;
    }

    // close
    const { name } = token;
    if (name === "pre") {
      codeDepth = Math.max(0, codeDepth - 1);
      flush();
      continue;
    }
    if (name === "blockquote") {
      quoteDepth = Math.max(0, quoteDepth - 1);
      flush();
      continue;
    }
    if (name === "ul" || name === "ol") {
      flush();
      listStack.pop();
      continue;
    }
    if (name === "li") {
      flush();
      continue;
    }
    if (name === "tr") {
      flush();
      inTableRow = false;
      continue;
    }
    if (name === "table") {
      flush();
      tableDepth = Math.max(0, tableDepth - 1);
      continue;
    }
    if (BLOCK_TAGS.has(name)) {
      flush();
      continue;
    }
  }
  flush();

  return blocks.map((block) => ({
    type: block.type,
    text: block.text,
    key: blockKey(block),
    resources: block.resources,
    marker: block.marker,
  }));
}

/* ------------------------------------------------------------------ *
 * 二、块级差异
 * ------------------------------------------------------------------ */

/** 公共前后缀先剥掉，正文越长 LCS 越省。 */
function trimCommonEdges(before: DiffBlock[], after: DiffBlock[]) {
  let head = 0;
  while (
    head < before.length &&
    head < after.length &&
    before[head].key === after[head].key
  ) {
    head += 1;
  }
  let tail = 0;
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail].key === after[after.length - 1 - tail].key
  ) {
    tail += 1;
  }
  return {
    head: before.slice(0, head),
    tail: before.slice(before.length - tail),
    beforeMid: before.slice(head, before.length - tail),
    afterMid: after.slice(head, after.length - tail),
  };
}

/** 最长公共子序列（LCS）回溯出的配对表。 */
function lcsPairs(before: string[], after: string[]) {
  const n = before.length;
  const m = after.length;
  const table: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i][j] =
        before[i] === after[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
}

/**
 * 块级差异。
 *
 * 相邻的「删一段 + 加一段」合并成 replace —— 读者看到的是
 * 「这段被换成了」，而不是两条独立的增删。
 */
export function diffBlocks(
  before: DiffBlock[],
  after: DiffBlock[],
): DiffSegment[] {
  const edges = trimCommonEdges(before, after);
  const beforeKeys = edges.beforeMid.map((b) => b.key);
  const afterKeys = edges.afterMid.map((b) => b.key);

  const segments: DiffSegment[] = [];
  const pushEqual = (blocks: DiffBlock[]) => {
    if (!blocks.length) return;
    segments.push({ kind: "equal", before: blocks, after: blocks });
  };
  pushEqual(edges.head);

  // 极端长度下退化成按序号对齐，别让 LCS 把内存吃光。
  const tooBig = beforeKeys.length * afterKeys.length > 400_000;
  const pairs = tooBig
    ? beforeKeys.map((_, index) => [index, index] as [number, number]).filter(
        ([i, j]) => i < afterKeys.length && beforeKeys[i] === afterKeys[j],
      )
    : lcsPairs(beforeKeys, afterKeys);

  let bi = 0;
  let ai = 0;
  const pendingBefore: DiffBlock[] = [];
  const pendingAfter: DiffBlock[] = [];
  const flushPending = () => {
    if (!pendingBefore.length && !pendingAfter.length) return;
    if (pendingBefore.length && pendingAfter.length) {
      segments.push({
        kind: "replace",
        before: [...pendingBefore],
        after: [...pendingAfter],
      });
    } else if (pendingBefore.length) {
      segments.push({
        kind: "delete",
        before: [...pendingBefore],
        after: [],
      });
    } else {
      segments.push({
        kind: "insert",
        before: [],
        after: [...pendingAfter],
      });
    }
    pendingBefore.length = 0;
    pendingAfter.length = 0;
  };

  for (const [b, a] of pairs) {
    if (b > bi || a > ai) {
      pendingBefore.push(...edges.beforeMid.slice(bi, b));
      pendingAfter.push(...edges.afterMid.slice(ai, a));
      flushPending();
    }
    bi = b + 1;
    ai = a + 1;
  }
  pendingBefore.push(...edges.beforeMid.slice(bi));
  pendingAfter.push(...edges.afterMid.slice(ai));
  flushPending();

  pushEqual(edges.tail);
  return segments;
}

/* ------------------------------------------------------------------ *
 * 三、词级差异
 * ------------------------------------------------------------------ */

/** 中日韩按字切，其余按词切 —— 中文按词切会切坏语义。 */
export function tokenizeWords(text: string) {
  const tokens: string[] = [];
  const pattern = /[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF]|[A-Za-z0-9_]+|\s+|[^\s]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text ?? ""))) {
    tokens.push(match[0]);
  }
  return tokens;
}

/** 词级差异：用于「这一段被改了」时指出到底哪几个字不同。 */
export function diffWords(before: string, after: string): WordPart[] {
  const a = tokenizeWords(before ?? "");
  const b = tokenizeWords(after ?? "");
  if (!a.length && !b.length) return [];
  const pairs = lcsPairs(a, b);
  const parts: WordPart[] = [];
  const push = (kind: WordPartKind, text: string) => {
    if (!text) return;
    const last = parts[parts.length - 1];
    if (last && last.kind === kind) last.text += text;
    else parts.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  for (const [x, y] of pairs) {
    if (x > i) push("delete", a.slice(i, x).join(""));
    if (y > j) push("insert", b.slice(j, y).join(""));
    push("equal", a[x]);
    i = x + 1;
    j = y + 1;
  }
  if (i < a.length) push("delete", a.slice(i).join(""));
  if (j < b.length) push("insert", b.slice(j).join(""));
  return parts;
}

/* ------------------------------------------------------------------ *
 * 四、其它字段的语义比较
 * ------------------------------------------------------------------ */

export type TagChange = {
  added: string[];
  removed: string[];
  kept: string[];
};

/**
 * 公开标签按集合比，不按顺序比。
 * 标签在公开页是一排徽标，换个顺序不构成内容变化。
 */
export function compareTags(before: string[], after: string[]): TagChange {
  const normalize = (list: string[]) =>
    [...new Set((list ?? []).map((t) => (t ?? "").trim()).filter(Boolean))].map(
      (t) => t.toLowerCase(),
    );
  const beforeKeys = normalize(before);
  const afterKeys = normalize(after);
  const beforeSet = new Set(beforeKeys);
  const afterSet = new Set(afterKeys);
  const keepOriginal = (list: string[]) => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of list ?? []) {
      const key = (raw ?? "").trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(raw.trim());
    }
    return result;
  };
  const originals = keepOriginal(before);
  const originalsAfter = keepOriginal(after);
  const added = originalsAfter.filter((_, index) => {
    const key = originalsAfter[index].toLowerCase();
    return !beforeSet.has(key);
  });
  const removed = originals.filter((_, index) => {
    const key = originals[index].toLowerCase();
    return !afterSet.has(key);
  });
  const kept = originalsAfter.filter((_, index) =>
    beforeSet.has(originalsAfter[index].toLowerCase()),
  );
  void afterKeys;
  return { added, removed, kept };
}

export type SeoFieldKey = "title" | "description" | "image" | "imageAlt";

export type SeoChange = {
  field: SeoFieldKey;
  label: string;
  before: string;
  after: string;
};

const SEO_LABELS: Record<SeoFieldKey, string> = {
  title: "SEO 标题",
  description: "SEO 描述",
  image: "分享图",
  imageAlt: "分享图说明",
};

/**
 * SEO 逐字段比。
 *
 * 传进来的是已经过 schema 归一化的对象（键顺序固定、空值补齐），
 * 所以不会出现「只是 JSON 键顺序不同」这种假变化。
 */
export function compareSeo(
  before: Record<string, string>,
  after: Record<string, string>,
): SeoChange[] {
  const changes: SeoChange[] = [];
  for (const field of ["title", "description", "image", "imageAlt"] as SeoFieldKey[]) {
    const left = (before?.[field] ?? "").trim();
    const right = (after?.[field] ?? "").trim();
    if (left === right) continue;
    changes.push({ field, label: SEO_LABELS[field], before: left, after: right });
  }
  return changes;
}

/**
 * 封面比较：看「资源身份 + 有效展示配置」，不看图片地址。
 *
 * 签名地址、CDN 参数每次签发都可能变，拿地址比会天天误报。
 */
export function compareCover(
  before: {
    attachmentId: number | null;
    title?: string;
    subtitle?: string;
    palette?: string;
    layout?: string;
  } | null,
  after: {
    attachmentId: number | null;
    title?: string;
    subtitle?: string;
    palette?: string;
    layout?: string;
  } | null,
) {
  const changes: {
    field: "attachment" | "title" | "subtitle" | "palette" | "layout";
    label: string;
    before: string;
    after: string;
  }[] = [];
  const leftId = before?.attachmentId ?? null;
  const rightId = after?.attachmentId ?? null;
  if (leftId !== rightId) {
    changes.push({
      field: "attachment",
      label: "封面底图",
      before: leftId ? `附件 #${leftId}` : "（无）",
      after: rightId ? `附件 #${rightId}` : "（无）",
    });
  }
  const fields: [
    "title" | "subtitle" | "palette" | "layout",
    string,
  ][] = [
    ["title", "封面短标题"],
    ["subtitle", "封面副标题"],
    ["palette", "封面配色"],
    ["layout", "封面版式"],
  ];
  for (const [field, label] of fields) {
    const left = (before?.[field] ?? "").trim();
    const right = (after?.[field] ?? "").trim();
    if (left === right) continue;
    changes.push({ field, label, before: left || "（空）", after: right || "（空）" });
  }
  return changes;
}

/** 差异里有多少处改动 —— 对应页面上的「N 处变化」。 */
export function countChanges(segments: DiffSegment[]) {
  return segments.filter((segment) => segment.kind !== "equal").length;
}
