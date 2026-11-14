import { z } from "zod";
import { prisma } from "../prisma";
import {
  aggregateNotes,
  aggregationRulesSchema,
} from "../../shared/lib/noteAggregation";
export const aggregationSettingsSchema = z.object({
  type: z.number().int().min(0).max(1),
  rules: aggregationRulesSchema,
});
export async function readAggregationRules(accountId: number, type: number) {
  const row = await prisma.config.findFirst({
    where: { userId: accountId, key: `noteAggregation:${type}` },
    orderBy: { id: "desc" },
  });
  const parsed = aggregationRulesSchema.safeParse(row?.config);
  return parsed.success ? parsed.data : [];
}
export async function saveAggregationRules(
  accountId: number,
  input: z.infer<typeof aggregationSettingsSchema>,
) {
  const tags = await prisma.tag.count({
    where: {
      accountId,
      id: { in: [...new Set(input.rules.flatMap((r) => r.tagIds))] },
    },
  });
  if (tags !== new Set(input.rules.flatMap((r) => r.tagIds)).size)
    throw new Error("标签不存在或无权使用");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${accountId}::integer, ${700 + input.type}::integer)`;
    await tx.config.deleteMany({
      where: { userId: accountId, key: `noteAggregation:${input.type}` },
    });
    await tx.config.create({
      data: {
        userId: accountId,
        key: `noteAggregation:${input.type}`,
        config: input.rules,
      },
    });
    return input.rules;
  });
}
export const aggregationPageSchema = z.object({
  type: z.number().int().min(0).max(1),
  page: z.number().int().positive().default(1),
  sort: z.enum(["createdAt", "updatedAt"]).default("updatedAt"),
  style: z.enum(["continuous", "byDay", "byWeek"]).default("continuous"),
  timeZone: z.string().refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, '请选择有效时区').default("Asia/Shanghai"),
  previewRules: aggregationRulesSchema.optional(),
  at: z.string().datetime().optional(),
  group: z.string().optional(),
  search: z.string().max(200).default(""),
});
const noteRelations = {
  tags: { include: { tag: true } },
  attachments: true,
  comments: { include: { account: { select: { image: true, nickname: true, name: true } } } },
  references: { include: { toNote: true } },
  referencedBy: { include: { fromNote: true } },
  _count: { select: { comments: true, histories: true } },
  internalShares: true,
} as const;

const periodLabels = {
  all: "不限日期", "24hours": "最近24小时", "7days": "最近7天",
  today: "今天", thisWeek: "本自然周", thisMonth: "本自然月",
  eachWeek: "每自然周", eachMonth: "每自然月", range: "指定日期范围",
};

export async function getAggregationPage(
  accountId: number,
  input: z.infer<typeof aggregationPageSchema>,
) {
  const rules = input.previewRules ?? await readAggregationRules(accountId, input.type);
  const active = rules.some((rule) => rule.enabled && rule.display === "grouped");
  const now = input.at ? new Date(input.at) : new Date();
  const base = { active, at: now.toISOString(), groupName: "", groupDescription: "", page: 1, ruleStats: [] as { ruleId: string; groups: number; noteCount: number }[] };
  if (!active && !input.group && !input.previewRules) {
    return { ...base, total: 0, noteCount: 0, items: [] };
  }
  const where = { accountId, type: input.type, isRecycle: false, isArchived: false };
  const orderBy = [{ isTop: "desc" as const }, { [input.sort]: "desc" as const }, { id: "desc" as const }];
  // Group the complete index before pagination. Load full content only for the visible page.
  const index = await prisma.notes.findMany({
    where, orderBy,
    select: { id: true, createdAt: true, updatedAt: true, isTop: true, tags: { select: { tagId: true } } },
  });
  const items = aggregateNotes(index, rules, input.timeZone, now, input.style, !!input.group);
  if (input.group) {
    const group = items.find((item) => item.kind === "group" && item.key === input.group);
    const members = group?.kind === "group" ? group.notes : [];
    const memberWhere = {
      ...where, id: { in: members.map((note) => note.id) },
      ...(input.search ? { content: { contains: input.search, mode: "insensitive" as const } } : {}),
    };
    const total = await prisma.notes.count({ where: memberWhere });
    const page = Math.min(input.page, Math.max(1, Math.ceil(total / 24)));
    const notes = await prisma.notes.findMany({ where: memberWhere, orderBy, skip: (page - 1) * 24, take: 24, include: noteRelations });
    const description = group?.kind === "group"
      ? [periodLabels[group.rule.period], group.key.slice(group.rule.id.length + 1).split(":").filter((part) => part && part !== "all").join(" / "), group.rule.dateField === "createdAt" ? "按创建时间匹配" : "按更新时间匹配"].filter(Boolean).join(" · ")
      : "该分组已发生变化，请返回列表查看最新结果";
    return {
      ...base, active: true, total, noteCount: members.length, page,
      items: notes.map((note) => ({ kind: "note" as const, note })),
      groupName: group?.kind === "group" ? group.rule.name : "聚合结果",
      groupDescription: description,
    };
  }
  const page = Math.min(input.page, Math.max(1, Math.ceil(items.length / 24)));
  const visible = items.slice((page - 1) * 24, page * 24);
  const ids = visible.flatMap((item) => item.kind === "note" ? [item.note.id] : item.notes.slice(0, 3).map((note) => note.id));
  const notes = await prisma.notes.findMany({ where: { ...where, id: { in: ids } }, include: noteRelations });
  const byId = new Map(notes.map((note) => [note.id, note]));
  const result = visible.flatMap((item): Array<
    | { kind: "note"; note: (typeof notes)[number] }
    | { kind: "group"; key: string; rule: (typeof rules)[number]; count: number; notes: typeof notes }
  > => {
    if (item.kind === "note") {
      const note = byId.get(item.note.id);
      return note ? [{ kind: "note", note }] : [];
    }
    return [{
      kind: "group", key: item.key, rule: item.rule, count: item.notes.length,
      notes: item.notes.slice(0, 3).flatMap((note) => {
        const full = byId.get(note.id);
        return full ? [full] : [];
      }),
    }];
  });
  const ruleStats = rules.map((rule) => {
    const groups = items.filter((item) => item.kind === "group" && item.rule.id === rule.id);
    return { ruleId: rule.id, groups: groups.length, noteCount: groups.reduce((total, item) => total + (item.kind === "group" ? item.notes.length : 0), 0) };
  });
  return { ...base, total: items.length, noteCount: index.length, page, items: result, ruleStats };
}
