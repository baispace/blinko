import { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { Agent } from "@mastra/core";
import { z } from "zod";
import { stripThinkText } from "./aiText";
import { publicText } from "./publicBlog";
import { contentVersion } from "./publication";
import { readDraftBody } from "./blogPublishCheck";
import { normalizePublicTags, PUBLIC_TAG_LIMIT } from "./blogPublicTags";
import { persistAiCopy, type AiCopyField } from "./blogAiCandidates";

/**
 * AI 文案生成：一次调用产出四份文案。
 *
 *   title          正文标题（进 notes.metadata.title）
 *   summary        文章摘要（进 notes.metadata.summary，发布时冻结进公开快照）
 *   coverTitle     封面主标题（进 composeBlogCover 的排版）
 *   coverSubtitle  封面副标题
 *
 * 封面标题与副标题必须一起出：分开两次调用，模型给出的标题和副标题会对不上
 * 主题（一个讲召回一个讲性能），拼在一张封面上非常别扭。
 */

/** 各字段的长度上限，和 composeBlogCover / publicationTitle 的限制对齐。 */
export const COPY_LIMITS = {
  title: 40,
  summary: 200,
  coverTitle: 24,
  coverSubtitle: 40,
} as const;

export type BlogCopy = {
  title: string;
  summary: string;
  coverTitle: string;
  coverSubtitle: string;
  /** 候选按哪一版正文生成：应用时校验，正文改过就得重新生成。 */
  contentVersion?: string;
};

/**
 * 生成范围。
 *
 * all      一次出四份（原有行为）
 * title    只出正文标题 —— 列表行里的「标题优化」用
 * summary  只出文章摘要 —— 列表行里的「AI 概览」用
 * cover    只出封面标题与副标题 —— 这两份必须同一次调用出来
 */
export type CopyKind = "all" | "title" | "summary" | "cover";

/** 单项生成会覆盖哪几项候选（整组一次出齐四项里的三份文案）。 */
const COPY_KIND_FIELDS: Record<CopyKind, AiCopyField[]> = {
  all: ["title", "summary", "cover"],
  title: ["title"],
  summary: ["summary"],
  cover: ["cover"],
};

export const copyInstructions = `你是一位中文技术博客的编辑。根据给定的文章内容，输出一段 JSON。

输出格式（只输出 JSON，不要解释，不要 Markdown 代码块，不要思考过程）：
{
  "title": "正文标题",
  "summary": "文章摘要",
  "coverTitle": "封面主标题",
  "coverSubtitle": "封面副标题"
}

规则：
1. title —— 正文标题，12–24 字，一句话说清文章讲什么。不要「浅谈」「随笔」「的一些思考」这类空词，不要以标点结尾。
2. summary —— 文章摘要，80–160 字。写清楚这篇文章讲了什么、结论是什么，不要空话套话，不要复述标题。
3. coverTitle —— 封面主标题，4–6 字，短而有力度，不要出现换行符。
4. coverSubtitle —— 封面副标题，8–20 字，补充主标题；确实想不出可以给空字符串。
5. coverTitle 与 coverSubtitle 必须讲同一件事，不能各说各话。
6. 全部使用与文章相同的语言。
7. 严格输出上面那四个字段，不要增加其它字段。`;

/**
 * 单字段生成时的指令：只要求一个（至多两个）字段，模型少吐字段，解析更稳。
 *
 * `hint` 是作者当前的标题 —— 有它就是「优化这个标题」，没有就是「起一个标题」。
 */
export function copyInstructionsFor(kind: CopyKind, hint?: string): string {
  const existing = hint?.trim();
  if (kind === "title")
    return `你是一位中文技术博客的编辑。根据给定的文章内容，优化或写出一个正文标题。只输出 JSON，不要解释，不要思考过程：
{
  "title": "正文标题"
}
规则：
1. 标题 12–24 字，一句话说清文章讲什么，不要「浅谈」「随笔」「的一些思考」这类空词，不要以标点结尾。
${
  existing
    ? `2. 有一版现有标题：「${existing}」。在保留原意的前提下改写得更准确具体、更抓人；不要推翻主题，不要加与原文无关的信息。`
    : `2. 直接根据正文写一个标题。`
}
3. 全部使用与文章相同的语言。
4. 严格只输出 title 这一个字段。`;
  if (kind === "summary")
    return `你是一位中文技术博客的编辑。根据给定的文章内容，写一段文章摘要。只输出 JSON，不要解释，不要思考过程：
{
  "summary": "文章摘要"
}
规则：
1. 摘要 80–160 字，写清楚这篇文章讲了什么、结论是什么，不要空话套话，不要复述标题。
2. 全部使用与文章相同的语言。
3. 严格只输出 summary 这一个字段。`;
  if (kind === "cover")
    return `你是一位中文技术博客的封面编辑。根据给定的文章内容，写一组封面文案。只输出 JSON，不要解释，不要思考过程：
{
  "coverTitle": "封面主标题",
  "coverSubtitle": "封面副标题"
}
规则：
1. coverTitle —— 封面主标题，4–6 字，短而有力度，不要出现换行符。
2. coverSubtitle —— 封面副标题，8–20 字，补充主标题；确实想不出可以给空字符串。
3. 两份必须讲同一件事，不能各说各话。
4. 全部使用与文章相同的语言。
5. 严格只输出这两个字段，不要输出 title 和 summary。`;
  return copyInstructions;
}

/** 清掉模型爱加的引号、markdown 强调、句末标点和多余空白。 */
export function cleanCopyText(input: string, limit: number) {
  const flat = String(input ?? "")
    .replace(/```[a-z]*|```/gi, "")
    .replace(/[*_`#]+/g, "")
    .replace(/^["“”'‘’\s]+|["“”'‘’\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const trimmed = flat.replace(/[，。、；：,.;:\s]+$/u, "").trim();
  const value = trimmed || flat;
  return [...value].slice(0, limit).join("");
}

/**
 * 从模型输出里取出第一个完整的 JSON 对象。
 *
 * 不能用 indexOf("{") / lastIndexOf("}") —— 标题里带花括号、字符串里有转义引号时，
 * 那种切法会截出半截 JSON。这里按括号配对扫描，跳过字符串内部的内容。
 */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * 从模型输出里取出四份文案。模型经常在 JSON 外面裹一层解释或 ```json 围栏，
 * 所以先剥思考块，再截取最外层的花括号。
 */
export function parseBlogCopy(raw: string, kind: CopyKind = "all"): BlogCopy {
  const text = stripThinkText(raw);
  const json = extractJsonObject(text);
  if (!json)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "模型没有返回可解析的文案，请重试或换一个模型。",
    });
  let data: any;
  try {
    data = JSON.parse(json);
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "模型返回的文案不是合法 JSON，请重试或换一个模型。",
    });
  }
  const pick = (value: unknown) => (typeof value === "string" ? value : "");
  const copy: BlogCopy = {
    title: cleanCopyText(pick(data.title), COPY_LIMITS.title),
    summary: cleanCopyText(pick(data.summary), COPY_LIMITS.summary),
    coverTitle: cleanCopyText(
      pick(data.coverTitle ?? data.cover_title),
      COPY_LIMITS.coverTitle,
    ),
    coverSubtitle: cleanCopyText(
      pick(data.coverSubtitle ?? data.cover_subtitle),
      COPY_LIMITS.coverSubtitle,
    ),
  };
  const missing = (message: string) =>
    new TRPCError({ code: "BAD_REQUEST", message });
  if (kind === "title" && !copy.title)
    throw missing("模型没有返回标题，请重试或换一个模型。");
  if (kind === "summary" && !copy.summary)
    throw missing("模型没有返回摘要，请重试或换一个模型。");
  if (kind === "cover" && !copy.coverTitle)
    throw missing("模型没有返回封面标题，请重试或换一个模型。");
  if (kind === "all" && !copy.title && !copy.summary)
    throw missing("模型没有返回标题或摘要，请重试或换一个模型。");
  return copy;
}

/** 供生成用的正文：优先草稿（作者正在改的那版），草稿空了就用已发布版本。 */
export function copySourceText(content: string, published?: string | null) {
  return publicText(content || published || "").trim();
}

export async function generateBlogCopy(
  db: PrismaClient,
  accountId: number,
  input: { noteId: number; modelId?: number; kind?: CopyKind; hint?: string },
): Promise<BlogCopy> {
  const kind = input.kind ?? "all";
  const note = await db.notes.findFirst({
    where: { id: input.noteId, accountId, isRecycle: false },
    select: {
      id: true,
      content: true,
      type: true,
      // 草稿正文可能已经从原笔记分叉，AI 文案要按草稿那份生成。
      metadata: true,
      publication: { select: { content: true } },
    },
  });
  if (!note)
    throw new TRPCError({ code: "NOT_FOUND", message: "文章不存在或无权访问" });
  // AI 文案按「将要发布的正文」生成：草稿分叉之后按草稿那份走。
  const source = copySourceText(
    readDraftBody(note.metadata, note.content).content,
    note.publication?.content,
  );
  if (source.length < 40)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "正文太短，写不出标题和摘要，先补充一些内容再试。",
    });

  let agent: Agent;
  try {
    // 动态导入：aiModelFactory → AI 工具 → routerTrpc/_app → 业务 router，
    // 静态导入会绕回本文件形成循环依赖（ESM 下表现为导出未定义）。
    const { AiModelFactory } = await import("../aiServer/aiModelFactory");
    const provider = await AiModelFactory.GetProvider(input.modelId);
    if (!provider?.LLM)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "没有可用的对话模型，请先在模型设置里配置。",
      });
    agent = new Agent({
      name: "Blinko Blog Copy Agent",
      instructions: copyInstructionsFor(kind, input.hint),
      model: provider.LLM,
    });
  } catch (error: any) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `对话模型不可用：${error?.message || "请检查模型设置"}`,
    });
  }

  const result = await agent.generate([
    {
      role: "user",
      content: `文章内容：\n${source.slice(0, 4000)}`,
    },
  ]);
  const copy: BlogCopy = {
    ...parseBlogCopy(result?.text ?? "", kind),
    // 候选按哪一版正文生成的：应用时要对上，正文改过就得重新生成。
    contentVersion: contentVersion(
      readDraftBody(note.metadata, note.content).content,
      note.type,
    ),
  };
  // 存成候选：下次点开直接展示，不用再烧一次模型。
  await persistAiCopy(db, accountId, input.noteId, {
    fields: COPY_KIND_FIELDS[kind],
    title: copy.title,
    summary: copy.summary,
    coverTitle: copy.coverTitle,
    coverSubtitle: copy.coverSubtitle,
    version: copy.contentVersion ?? "",
  }).catch(() => null);
  return copy;
}

/* ------------------------------------------------------------------ *
 * 整组生成：一次请求出齐标题、短标题、副标题、概要、公开标签与归属建议
 * ------------------------------------------------------------------ */

/** 一次生成所需的上下文：账号已有的公开标签、专题与章节。 */
export type CopyGroupContext = {
  publicTags: string[];
  topics: { name: string; sections: { name: string; desc: string }[] }[];
};

export type CopyGroupTopicSuggestion = {
  /** 专题名：一定是账号已有的专题。 */
  topic: string;
  /** 章节名：该专题下已有的章节；为空表示只归到专题、不进章节。 */
  section: string;
};

export type BlogCopyGroup = {
  title: string;
  summary: string;
  coverTitle: string;
  coverSubtitle: string;
  publicTags: string[];
  topicSuggestions: CopyGroupTopicSuggestion[];
  /** 缺了什么、丢了什么：逐条告诉用户，不清空原有内容。 */
  issues: string[];
  /** 生成时用的正文版本指纹：应用时要对上，正文改过就得重新生成。 */
  contentVersion: string;
};

const groupSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  coverTitle: z.string().optional(),
  coverSubtitle: z.string().optional(),
  publicTags: z.array(z.unknown()).optional(),
  topicSuggestions: z
    .array(
      z
        .object({
          topic: z.string().optional(),
          section: z.string().optional(),
        })
        .passthrough(),
    )
    .optional(),
});

export function groupInstructions(context: CopyGroupContext) {
  const tags = context.publicTags.length
    ? context.publicTags.join("、")
    : "（还没有用过公开标签）";
  const topics = context.topics.length
    ? context.topics
        .map((t) =>
          t.sections.length
            ? `${t.name}（章节：${t.sections.map((s) => s.name).join("、")}）`
            : t.name,
        )
        .join("；")
    : "（还没有专题）";
  return `你是一位中文技术博客的编辑。根据给定的文章内容，一次生成一整套发布信息。只输出 JSON，不要解释，不要 Markdown 代码块，不要思考过程：
{
  "title": "公开标题",
  "summary": "文章概要",
  "coverTitle": "封面短标题",
  "coverSubtitle": "封面副标题",
  "publicTags": ["公开标签一", "公开标签二"],
  "topicSuggestions": [{ "topic": "已有专题名", "section": "已有章节名" }]
}

规则：
1. title —— 公开标题，12–24 字，一句话说清文章讲什么。不要「浅谈」「随笔」这类空词，不要以标点结尾。
2. summary —— 文章概要，80–200 字。写清楚这篇文章讲了什么、结论是什么，不要复述标题，不要空话套话。
3. coverTitle —— 封面短标题，4–6 字，短而有力度，不要换行。
4. coverSubtitle —— 封面副标题，8–20 字，补充主标题；想不出就给空字符串。
5. coverTitle 与 coverSubtitle 必须讲同一件事。
6. publicTags —— 2–5 个公开标签，每个 2–8 字。优先从下面这份「已有公开标签」里挑；确实没有合适的才提新标签。
   已有公开标签：${tags}
7. topicSuggestions —— 归属建议，最多 2 条。topic 只能填下面「已有专题」里的名字，section 只能填该专题下「已有章节」的名字；拿不准就给空字符串。
   已有专题与章节：${topics}
8. 只能使用文章里真实出现的内容。不要编造原文没有的事实、成果或数据。
9. 全部使用与文章相同的语言。
10. 严格只输出上面这些字段。`;
}

/**
 * 解析整组结果。
 *
 * 缺字段不抛错 —— 返回能用的部分 + issues，让界面提示「缺了什么」，
 * 而不是把作者已经写好的内容清空。专题建议只保留能对上已有专题/章节的。
 */
export function parseBlogCopyGroup(
  raw: string,
  context: CopyGroupContext,
  version: string,
): BlogCopyGroup {
  const issues: string[] = [];
  const text = stripThinkText(raw);
  const json = extractJsonObject(text);
  if (!json) {
    return {
      title: "",
      summary: "",
      coverTitle: "",
      coverSubtitle: "",
      publicTags: [],
      topicSuggestions: [],
      issues: ["模型没有返回可解析的 JSON，请重试或换一个模型。"],
      contentVersion: version,
    };
  }
  let rawData: unknown;
  try {
    rawData = JSON.parse(json);
  } catch {
    return {
      title: "",
      summary: "",
      coverTitle: "",
      coverSubtitle: "",
      publicTags: [],
      topicSuggestions: [],
      issues: ["模型返回的内容不是合法 JSON，请重试或换一个模型。"],
      contentVersion: version,
    };
  }
  const parsed = groupSchema.safeParse(rawData);
  if (!parsed.success)
    return {
      title: "",
      summary: "",
      coverTitle: "",
      coverSubtitle: "",
      publicTags: [],
      topicSuggestions: [],
      issues: ["模型返回的字段结构不符合约定，请重试或换一个模型。"],
      contentVersion: version,
    };
  const data = parsed.data;
  const title = cleanCopyText(data.title ?? "", COPY_LIMITS.title);
  const summary = cleanCopyText(data.summary ?? "", COPY_LIMITS.summary);
  const coverTitle = cleanCopyText(data.coverTitle ?? "", COPY_LIMITS.coverTitle);
  const coverSubtitle = cleanCopyText(
    data.coverSubtitle ?? "",
    COPY_LIMITS.coverSubtitle,
  );
  if (!title) issues.push("模型没有给出公开标题。");
  if (!summary) issues.push("模型没有给出文章概要。");
  if (!coverTitle) issues.push("模型没有给出封面短标题。");

  // 公开标签：先在已有池子里找同名的，找到就用池子里的规范写法。
  const pool = new Map(context.publicTags.map((t) => [t.toLowerCase(), t]));
  const rawTags = (data.publicTags ?? [])
    .map((t) => (typeof t === "string" ? t : ""))
    .filter(Boolean);
  const publicTags = normalizePublicTags(
    rawTags.map((t) => pool.get(t.trim().toLowerCase()) ?? t),
  );
  if (!publicTags.length) issues.push("模型没有给出公开标签。");
  if (rawTags.length > PUBLIC_TAG_LIMIT)
    issues.push(`模型给出了超过 ${PUBLIC_TAG_LIMIT} 个标签，已按上限保留前 ${PUBLIC_TAG_LIMIT} 个。`);

  // 归属建议：只认账号里真实存在的专题与章节，AI 不能凭空建议一个不存在的专题。
  const topicSuggestions: CopyGroupTopicSuggestion[] = [];
  for (const suggestion of data.topicSuggestions ?? []) {
    const topicName = (suggestion.topic ?? "").trim();
    if (!topicName) continue;
    const topic = context.topics.find(
      (t) => t.name.toLowerCase() === topicName.toLowerCase(),
    );
    if (!topic) {
      issues.push(`模型建议的专题「${topicName}」不存在，已忽略。`);
      continue;
    }
    const sectionName = (suggestion.section ?? "").trim();
    let section = "";
    if (sectionName) {
      const found = topic.sections.find(
        (s) => s.name.toLowerCase() === sectionName.toLowerCase(),
      );
      if (!found) {
        issues.push(`专题「${topic.name}」下没有章节「${sectionName}」，已忽略章节。`);
      } else {
        section = found.name;
      }
    }
    if (
      topicSuggestions.some(
        (s) => s.topic === topic.name && s.section === section,
      )
    )
      continue;
    topicSuggestions.push({ topic: topic.name, section });
  }
  if (topicSuggestions.length > 2)
    issues.push("模型给出了超过 2 条归属建议，只保留前 2 条。");
  return {
    title,
    summary,
    coverTitle,
    coverSubtitle,
    publicTags,
    topicSuggestions: topicSuggestions.slice(0, 2),
    issues,
    contentVersion: version,
  };
}

/**
 * 整组生成：读一次已保存正文，发一次请求，出齐六组字段。
 *
 * 结果是「候选」，不落库 —— 由用户挑字段后再应用到草稿。
 */
export async function generateBlogCopyGroup(
  db: PrismaClient,
  accountId: number,
  input: { noteId: number; modelId?: number },
): Promise<BlogCopyGroup> {
  const note = await db.notes.findFirst({
    where: { id: input.noteId, accountId, isRecycle: false },
    select: {
      id: true,
      content: true,
      type: true,
      // 草稿正文可能已经从原笔记分叉，AI 文案要按草稿那份生成。
      metadata: true,
      publication: { select: { content: true } },
    },
  });
  if (!note)
    throw new TRPCError({ code: "NOT_FOUND", message: "文章不存在或无权访问" });
  // AI 文案按「将要发布的正文」生成：草稿分叉之后按草稿那份走。
  const source = copySourceText(
    readDraftBody(note.metadata, note.content).content,
    note.publication?.content,
  );
  if (source.length < 40)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "正文太短，写不出标题和概要，先补充一些内容再试。",
    });

  const [tags, topics] = await Promise.all([
    db.blogPublicTag.findMany({
      where: { accountId },
      orderBy: [{ name: "asc" }],
      select: { name: true },
    }),
    db.blogTopic.findMany({
      where: { accountId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: {
        name: true,
        sections: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: { name: true, desc: true },
        },
      },
    }),
  ]);
  const context: CopyGroupContext = {
    publicTags: tags.map((t) => t.name),
    topics: topics.map((t) => ({
      name: t.name,
      sections: t.sections.map((s) => ({ name: s.name, desc: s.desc })),
    })),
  };

  let agent: Agent;
  try {
    const { AiModelFactory } = await import("../aiServer/aiModelFactory");
    const provider = await AiModelFactory.GetProvider(input.modelId);
    if (!provider?.LLM)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "没有可用的对话模型，请先在模型设置里配置。",
      });
    agent = new Agent({
      name: "Blinko Blog Copy Group Agent",
      instructions: groupInstructions(context),
      model: provider.LLM,
    });
  } catch (error: any) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `对话模型不可用：${error?.message || "请检查模型设置"}`,
    });
  }

  const result = await agent.generate([
    { role: "user", content: `文章内容：\n${source.slice(0, 4000)}` },
  ]);
  const group = parseBlogCopyGroup(
    result?.text ?? "",
    context,
    contentVersion(
      readDraftBody(note.metadata, note.content).content,
      note.type,
    ),
  );
  // 整组结果存成候选：标签与归属建议只有整组生成才有，一并留下来。
  await persistAiCopy(db, accountId, input.noteId, {
    fields: ["title", "summary", "cover", "tags", "topics"],
    title: group.title,
    summary: group.summary,
    coverTitle: group.coverTitle,
    coverSubtitle: group.coverSubtitle,
    publicTags: group.publicTags,
    topicSuggestions: group.topicSuggestions,
    issues: group.issues,
    version: group.contentVersion,
  }).catch(() => null);
  return group;
}
