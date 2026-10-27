import { Prisma, type PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { readDraftBody } from "./blogPublishCheck";
import { contentVersion } from "./publication";
import { normalizePublicTags } from "./blogPublicTags";
// 只取类型：blogAiCopy 反过来要 import 本文件的 persistAiCopy，
// 值导入会绕成循环依赖。
import type { CopyGroupTopicSuggestion } from "./blogAiCopy";

/**
 * AI 整理出来的发布信息候选。
 *
 * 存在 notePublication.aiCopy —— 草稿侧的一份工作缓存：
 * 生成过一次就一直留着，再次点开直接看，不必重复调用模型；
 * 正文改过不算失效，只标记过期，等作者自己决定要不要重新生成。
 *
 * 不进公开快照：候选是「还没决定要不要用」的中间产物，
 * 被应用的字段由 saveCopy / saveDraftCoverText 写进草稿。
 */
export type AiCopyCandidates = {
  title: string;
  summary: string;
  coverTitle: string;
  coverSubtitle: string;
  publicTags: string[];
  topicSuggestions: CopyGroupTopicSuggestion[];
  /** 最近一次生成缺了什么：逐条告诉用户，不清空已有候选。 */
  issues: string[];
  fields: Partial<Record<AiCopyField, AiCopyFieldState>>;
  /** 最近一次生成的时刻（ISO）。 */
  generatedAt: string;
};

/** 候选的五个字段，与「发布内容」页签里的设置项一一对应。 */
export type AiCopyField = "title" | "summary" | "cover" | "tags" | "topics";

export type AiCopyFieldState = {
  /** 生成时刻（ISO）：列表上显示「已整理 · 3 小时前」。 */
  at: string;
  /** 这一份候选是按哪一版正文生成的：正文改过就过期。 */
  version: string;
};

const AI_COPY_FIELDS: AiCopyField[] = [
  "title",
  "summary",
  "cover",
  "tags",
  "topics",
];

/** 单次生成要写进候选的内容。fields 说明这次覆盖哪几项。 */
export type AiCopyPatch = {
  fields: AiCopyField[];
  title?: string;
  summary?: string;
  coverTitle?: string;
  coverSubtitle?: string;
  publicTags?: string[];
  topicSuggestions?: CopyGroupTopicSuggestion[];
  issues?: string[];
  version: string;
  at?: string;
};

const str = (value: unknown) => (typeof value === "string" ? value : "");
const list = (value: unknown) =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

/**
 * 归一化数据库里的候选。
 *
 * 完全没有字段记录的脏数据当作「没生成过」—— 返回 null，
 * 界面上就会走「先生成再展示」那条路。
 */
export function normalizeAiCopyCandidates(
  value: unknown,
): AiCopyCandidates | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const rawFields =
    raw.fields && typeof raw.fields === "object" && !Array.isArray(raw.fields)
      ? (raw.fields as Record<string, unknown>)
      : {};
  const fields: Partial<Record<AiCopyField, AiCopyFieldState>> = {};
  for (const key of AI_COPY_FIELDS) {
    const entry = rawFields[key];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const at = str((entry as Record<string, unknown>).at);
    const version = str((entry as Record<string, unknown>).version);
    if (!at || !version) continue;
    fields[key] = { at, version };
  }
  if (!Object.keys(fields).length) return null;
  const suggestions = Array.isArray(raw.topicSuggestions)
    ? raw.topicSuggestions
        .filter((s) => s && typeof s === "object" && !Array.isArray(s))
        .map((s) => ({
          topic: str((s as Record<string, unknown>).topic).slice(0, 60),
          section: str((s as Record<string, unknown>).section).slice(0, 60),
        }))
        .filter((s) => s.topic)
    : [];
  return {
    title: str(raw.title),
    summary: str(raw.summary),
    coverTitle: str(raw.coverTitle),
    coverSubtitle: str(raw.coverSubtitle),
    publicTags: normalizePublicTags(list(raw.publicTags)),
    topicSuggestions: suggestions.slice(0, 2),
    issues: list(raw.issues).slice(0, 8),
    fields,
    generatedAt: str(raw.generatedAt),
  };
}

export function readAiCopyCandidates(value: unknown) {
  return normalizeAiCopyCandidates(value);
}

export function emptyAiCopyCandidates(): AiCopyCandidates {
  return {
    title: "",
    summary: "",
    coverTitle: "",
    coverSubtitle: "",
    publicTags: [],
    topicSuggestions: [],
    issues: [],
    fields: {},
    generatedAt: "",
  };
}

/**
 * 把一次生成结果并进已有候选。
 *
 * 只覆盖这次真产出内容的字段：模型这次没给出标题（issues 里会写明），
 * 就保留上一版候选，不能拿一次半吊子的结果把作者已经挑好的文案顶掉。
 */
export function mergeAiCopyCandidates(
  previous: AiCopyCandidates | null,
  patch: AiCopyPatch,
): AiCopyCandidates {
  const base = previous ?? emptyAiCopyCandidates();
  const next: AiCopyCandidates = {
    ...base,
    issues: patch.issues ?? [],
    generatedAt: patch.at ?? new Date().toISOString(),
    fields: { ...base.fields },
  };
  const coverTitle = (patch.coverTitle ?? "").trim();
  const publicTags = patch.publicTags ?? [];
  const values: Record<AiCopyField, string | string[]> = {
    title: (patch.title ?? "").trim(),
    summary: (patch.summary ?? "").trim(),
    cover: coverTitle,
    tags: normalizePublicTags(publicTags),
    topics: "",
  };
  // 只有这次真的产出内容的字段才写回去：
  // 字段状态里还留着上一版，不代表这次的内容也要跟着换掉。
  const written = new Set<AiCopyField>();
  for (const key of patch.fields) {
    // 没有产出的字段不覆盖：保留上一版，issues 已经说明了缺什么。
    // 空数组也算没产出 —— 模型给了个空标签列表，等于没给。
    const value = values[key];
    const empty = Array.isArray(value) ? !value.length : !value;
    if (key !== "topics" && empty) continue;
    written.add(key);
    next.fields[key] = {
      at: patch.at ?? new Date().toISOString(),
      version: patch.version,
    };
  }
  if (written.has("title")) next.title = values.title as string;
  if (written.has("summary")) next.summary = values.summary as string;
  if (written.has("cover")) {
    next.coverTitle = coverTitle;
    // 副标题跟着主标题一起覆盖：模型想不出副标题时会明确给空串，
    // 那也是作者要的答案，不能留着上一版。
    next.coverSubtitle = (patch.coverSubtitle ?? "").trim();
  }
  if (written.has("tags")) next.publicTags = values.tags as string[];
  if (written.has("topics"))
    next.topicSuggestions = (patch.topicSuggestions ?? []).slice(0, 2);
  return next;
}

export function aiCopyToJson(value: AiCopyCandidates): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

/**
 * 生成成功后把候选存下来。
 *
 * 写失败不影响本次生成的结果 —— 候选只是缓存，丢了顶多下次重新生成。
 */
export async function persistAiCopy(
  db: PrismaClient,
  accountId: number,
  noteId: number,
  patch: AiCopyPatch,
) {
  const note = await db.notes.findFirst({
    where: { id: noteId, accountId, isRecycle: false },
    select: { publication: { select: { aiCopy: true } } },
  });
  if (!note?.publication) return null;
  const next = mergeAiCopyCandidates(readAiCopyCandidates(note.publication.aiCopy), patch);
  await db.notePublication.update({
    where: { noteId },
    data: { aiCopy: aiCopyToJson(next) },
  });
  return next;
}

/**
 * 候选状态 + 当前正文指纹。
 *
 * 两者一起给，界面才能判断某一项是不是「按旧正文生成的」——
 * 只看候选自己存的版本号是没法发现正文变了的。
 */
export async function readAiCopyState(
  db: PrismaClient,
  accountId: number,
  noteId: number,
) {
  const note = await db.notes.findFirst({
    where: { id: noteId, accountId, isRecycle: false },
    select: {
      content: true,
      type: true,
      metadata: true,
      publication: { select: { aiCopy: true } },
    },
  });
  if (!note)
    throw new TRPCError({ code: "NOT_FOUND", message: "文章不存在或无权访问" });
  return {
    candidates: readAiCopyCandidates(note.publication?.aiCopy ?? null),
    contentVersion: contentVersion(
      readDraftBody(note.metadata, note.content).content,
      note.type,
    ),
  };
}