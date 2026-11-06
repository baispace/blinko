import { z } from "zod";
import dayjs from "./dayjs";

export const aggregationRuleSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(80),
    enabled: z.boolean().default(true),
    display: z.enum(["grouped", "individual"]).default("grouped"),
    tagIds: z.array(z.number().int().positive()).min(1),
    tagMatch: z.enum(["any", "all"]).default("any"),
    dateField: z.enum(["createdAt", "updatedAt"]).default("createdAt"),
    period: z.enum([
      "all",
      "24hours",
      "7days",
      "today",
      "thisWeek",
      "thisMonth",
      "eachWeek",
      "eachMonth",
      "range",
    ]),
    rangeStart: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    rangeEnd: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .refine(
    (rule) =>
      rule.period !== "range" ||
      (!!rule.rangeStart &&
        !!rule.rangeEnd &&
        rule.rangeStart <= rule.rangeEnd),
    "请填写有效的起止日期",
  );
export const aggregationRulesSchema = z
  .array(aggregationRuleSchema)
  .max(30)
  .refine(
    (rules) => new Set(rules.map((rule) => rule.id)).size === rules.length,
    "规则标识不能重复",
  );
export type AggregationRule = z.infer<typeof aggregationRuleSchema>;
export type AggregatableNote = {
  id: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  isTop: boolean;
  tags: { tagId: number }[];
};
export type AggregationItem<T> =
  | { kind: "note"; note: T }
  | { kind: "group"; key: string; rule: AggregationRule; notes: T[] };

/** Input must contain the full filtered set in display order, before pagination. */
export function aggregateNotes<T extends AggregatableNote>(
  notes: T[],
  rules: AggregationRule[],
  timeZone: string,
  now = new Date(),
  style: "continuous" | "byDay" | "byWeek" = "continuous",
  includeSingletonGroups = false,
): AggregationItem<T>[] {
  const current = dayjs(now).tz(timeZone);
  const weekStart = (date: typeof current) =>
    date.startOf("day").subtract((date.day() + 6) % 7, "day");
  const candidates = new Map<string, { rule: AggregationRule; notes: T[] }>();
  const membership = new Map<number, string>();
  for (const note of notes) {
    if (note.isTop) continue;
    const tags = new Set(note.tags.map((tag) => tag.tagId));
    for (const rule of rules) {
      if (!rule.enabled || rule.display !== "grouped") continue;
      const matches =
        rule.tagMatch === "all"
          ? rule.tagIds.every((id) => tags.has(id))
          : rule.tagIds.some((id) => tags.has(id));
      if (!matches) continue;
      const date = dayjs(note[rule.dateField]).tz(timeZone);
      if (!date.isValid()) continue;
      let bucket = "all";
      switch (rule.period) {
        case "24hours":
        case "7days": {
          const duration = rule.period === "24hours" ? 86400000 : 7 * 86400000;
          if (
            date.valueOf() < now.getTime() - duration ||
            date.valueOf() > now.getTime()
          )
            continue;
          break;
        }
        case "today":
          if (date.format("YYYY-MM-DD") !== current.format("YYYY-MM-DD"))
            continue;
          break;
        case "thisWeek":
          if (
            weekStart(date).format("YYYY-MM-DD") !==
            weekStart(current).format("YYYY-MM-DD")
          )
            continue;
          break;
        case "thisMonth":
          if (date.format("YYYY-MM") !== current.format("YYYY-MM")) continue;
          break;
        case "range":
          if (
            !rule.rangeStart ||
            !rule.rangeEnd ||
            date.format("YYYY-MM-DD") < rule.rangeStart ||
            date.format("YYYY-MM-DD") > rule.rangeEnd
          )
            continue;
          break;
        case "eachWeek":
          bucket = weekStart(date).format("YYYY-MM-DD");
          break;
        case "eachMonth":
          bucket = date.format("YYYY-MM");
          break;
      }
      const slice =
        style === "byDay"
          ? date.format("YYYY-MM-DD")
          : style === "byWeek"
            ? weekStart(date).format("YYYY-MM-DD")
            : "";
      const key = `${rule.id}:${bucket}:${slice}`;
      const group = candidates.get(key) ?? { rule, notes: [] };
      group.notes.push(note);
      candidates.set(key, group);
      membership.set(note.id, key);
      break;
    }
  }
  const emitted = new Set<string>();
  const result: AggregationItem<T>[] = [];
  for (const note of notes) {
    const key = membership.get(note.id);
    const group = key ? candidates.get(key) : undefined;
    if (!key || !group || (group.notes.length < 2 && !includeSingletonGroups)) {
      result.push({ kind: "note", note });
    } else if (!emitted.has(key)) {
      emitted.add(key);
      result.push({ kind: "group", key, ...group });
    }
  }
  return result;
}
