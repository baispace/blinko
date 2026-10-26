import { z } from "zod";

/**
 * 动态（moments）的共享契约。
 *
 * 动态不是独立实体：它就是「被公开的闪念」。
 * 所以这里只剩「公开动态流」这一层需要的约定 —— 筛选口径、翻页游标。
 * 内容长度、图片数量、标签数量都不在这里限制：那些是闪念自己的规则，
 * 由笔记侧决定，动态不再另立一套。
 */

/**
 * 筛选口径：
 *   all   所有公开动态
 *   media 含图片的公开动态
 *   note  不含图片的公开动态
 */
export const MOMENT_FILTERS = ["all", "media", "note"] as const;
export type MomentFilter = (typeof MOMENT_FILTERS)[number];

export const MOMENT_FILTER_LABEL: Record<MomentFilter, string> = {
  all: "全部",
  media: "图文",
  note: "随记",
};

export function isMomentFilter(value: unknown): value is MomentFilter {
  return typeof value === "string" && (MOMENT_FILTERS as readonly string[]).includes(value);
}

/** 游标：按「公开时间 + id」定位下一页，避免同秒公开的两条互相吞掉。 */
export const momentCursorSchema = z.object({
  publishedAt: z.coerce.date(),
  id: z.number().int().positive(),
});
export type MomentCursor = z.infer<typeof momentCursorSchema>;
