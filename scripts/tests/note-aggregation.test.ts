import { expect, test } from "bun:test";
import {
  aggregateNotes,
  aggregationRuleSchema,
} from "../../shared/lib/noteAggregation";
const now = new Date("2026-11-06T12:00:00+08:00");
const rule = aggregationRuleSchema.parse({
  id: "training",
  name: "训练",
  tagIds: [1],
  period: "eachWeek",
});
const note = (id: number, date: string, isTop = false) => ({
  id,
  createdAt: date,
  updatedAt: date,
  isTop,
  tags: [{ tagId: 1 }],
});
test("natural weeks are separate, pinned notes and singleton groups remain individual", () => {
  const items = aggregateNotes(
    [
      note(1, "2026-11-06"),
      note(2, "2026-11-05"),
      note(3, "2026-10-30"),
      note(4, "2026-11-05", true),
    ],
    [rule],
    "Asia/Shanghai",
    now,
  );
  expect(items.map((item) => item.kind)).toEqual(["group", "note", "note"]);
  expect(items[0].kind === "group" && items[0].notes.map((n) => n.id)).toEqual([
    1, 2,
  ]);
});
test("overlapping rules assign a note only once and retain input order", () => {
  const items = aggregateNotes(
    [note(1, "2026-11-06"), note(2, "2026-11-05")],
    [rule, { ...rule, id: "other" }],
    "Asia/Shanghai",
    now,
  );
  expect(items).toHaveLength(1);
  expect(items[0].kind === "group" && items[0].rule.id).toBe("training");
});
test("rolling window excludes old and future records", () => {
  const items = aggregateNotes(
    [
      note(1, "2026-11-06T04:00:00Z"),
      note(2, "2026-11-05T04:00:00Z"),
      note(3, "2026-11-05T03:59:59Z"),
      note(4, "2026-11-06T04:00:01Z"),
    ],
    [{ ...rule, period: "24hours" }],
    "Asia/Shanghai",
    now,
  );
  expect(items.map((item) => item.kind)).toEqual(["group", "note", "note"]);
});

test('date view partitions an all-time group by day before pagination',()=>{
 const items=aggregateNotes([note(1,'2026-11-06T01:00:00Z'),note(2,'2026-11-06T02:00:00Z'),note(3,'2026-11-05T01:00:00Z')],[{...rule,period:'all'}],'Asia/Shanghai',now,'byDay');
 expect(items.map(item=>item.kind)).toEqual(['group','note']);
});
test('custom ranges are inclusive and disabling grouping restores all notes',()=>{
 const notes=[note(1,'2026-11-05'),note(2,'2026-11-06'),note(3,'2026-11-04')];
 const selected={...rule,period:'range' as const,rangeStart:'2026-11-05',rangeEnd:'2026-11-06'};
 expect(aggregateNotes(notes,[selected],'Asia/Shanghai',now).map(item=>item.kind)).toEqual(['group','note']);
 expect(aggregateNotes(notes,[{...selected,enabled:false}],'Asia/Shanghai',now).map(item=>item.kind)).toEqual(['note','note','note']);
});
