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
  timeZone: z.string().default("Asia/Shanghai"),
  at: z.string().datetime().optional(),
  group: z.string().optional(),
  search: z.string().max(200).default(""),
});
export async function getAggregationPage(
  accountId: number,
  input: z.infer<typeof aggregationPageSchema>,
) {
  const rules = await readAggregationRules(accountId, input.type);
  const notes = await prisma.notes.findMany({
    where: { accountId, type: input.type, isRecycle: false, isArchived: false },
    orderBy: [{ isTop: "desc" }, { [input.sort]: "desc" }, { id: "desc" }],
    include: {
      tags: { include: { tag: true } },
      attachments: true,
      comments: {
        include: {
          account: { select: { image: true, nickname: true, name: true } },
        },
      },
      references: { include: { toNote: true } },
      referencedBy: { include: { fromNote: true } },
      _count: { select: { comments: true, histories: true } },
      internalShares: true,
    },
  });
  const now = input.at ? new Date(input.at) : new Date();
  let items = aggregateNotes(
    notes,
    rules,
    input.timeZone,
    now,
    input.style,
    !!input.group,
  );
  if (input.group) {
    const group = items.find(
      (item) => item.kind === "group" && item.key === input.group,
    );
    const members = group?.kind === "group" ? group.notes : [];
    const matching = members.filter(
      (note) =>
        !input.search ||
        note.content.toLowerCase().includes(input.search.toLowerCase()),
    );
    return {
      active: true,
      total: matching.length,
      noteCount: members.length,
      items: matching
        .slice((input.page - 1) * 24, input.page * 24)
        .map((note) => ({ kind: "note" as const, note })),
      at: now.toISOString(),
      groupName: group?.kind === "group" ? group.rule.name : "",
      groupDescription:
        group?.kind === "group"
          ? `${group.notes[0]?.tags
              .filter((tag) => group.rule.tagIds.includes(tag.tagId))
              .map((tag) => tag.tag.name)
              .join(
                "、",
              )} · ${group.rule.dateField === "createdAt" ? "创建时间" : "更新时间"} · ${
              group.key
                .split(":")
                .slice(1)
                .filter((value) => value !== "all" && value)
                .join(" / ") ||
              {
                all: "不限日期",
                "24hours": "最近24小时",
                "7days": "最近7天",
                today: "今天",
                thisWeek: "本自然周",
                thisMonth: "本自然月",
                eachWeek: "每自然周",
                eachMonth: "每自然月",
                range: `${group.rule.rangeStart}—${group.rule.rangeEnd}`,
              }[group.rule.period]
            }`
          : "",
    };
  }
  return {
    active: rules.some((rule) => rule.enabled && rule.display === "grouped"),
    total: items.length,
    noteCount: notes.length,
    items: items.slice((input.page - 1) * 24, input.page * 24),
    at: now.toISOString(),
    groupName: "",
    groupDescription: "",
  };
}
