import { z } from "zod"
import dayjs from "@shared/lib/dayjs"

import { router, authProcedure } from "../middleware"
import { prisma } from "../prisma"

// ────────────────────────────────────────────────────────────────────────────
// Period: discriminated union, resolved server-side to { start, end, prev }
// ────────────────────────────────────────────────────────────────────────────
const periodSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("week") }),
  z.object({ type: z.literal("month"), value: z.string().regex(/^\d{4}-\d{2}$/) }),
  z.object({ type: z.literal("30d") }),
  z.object({ type: z.literal("90d") }),
  z.object({ type: z.literal("year") }),
  z.object({ type: z.literal("all") }),
  z.object({ type: z.literal("custom"), from: z.string(), to: z.string() }),
])

type Period = z.infer<typeof periodSchema>

interface ResolvedPeriod {
  start: Date
  end: Date
  prevStart: Date | null
  prevEnd: Date | null
  label: string
}

function resolvePeriod(period: Period, now: dayjs.Dayjs = dayjs()): ResolvedPeriod {
  switch (period.type) {
    case "week": {
      const start = now.subtract(6, "day").startOf("day")
      const end = now.endOf("day")
      return {
        start: start.toDate(),
        end: end.toDate(),
        prevStart: start.subtract(7, "day").toDate(),
        prevEnd: start.subtract(1, "day").endOf("day").toDate(),
        label: `${start.format("YYYY-MM-DD")} → ${end.format("YYYY-MM-DD")}`,
      }
    }
    case "month": {
      const m = dayjs(period.value + "-01")
      const start = m.startOf("month")
      const end = m.endOf("month")
      const prev = m.subtract(1, "month")
      return {
        start: start.toDate(),
        end: end.toDate(),
        prevStart: prev.startOf("month").toDate(),
        prevEnd: prev.endOf("month").toDate(),
        label: m.format("YYYY-MM"),
      }
    }
    case "30d": {
      const end = now.endOf("day")
      const start = end.subtract(29, "day").startOf("day")
      return {
        start: start.toDate(),
        end: end.toDate(),
        prevStart: start.subtract(30, "day").toDate(),
        prevEnd: start.subtract(1, "day").endOf("day").toDate(),
        label: `近 30 天`,
      }
    }
    case "90d": {
      const end = now.endOf("day")
      const start = end.subtract(89, "day").startOf("day")
      return {
        start: start.toDate(),
        end: end.toDate(),
        prevStart: start.subtract(90, "day").toDate(),
        prevEnd: start.subtract(1, "day").endOf("day").toDate(),
        label: `近 90 天`,
      }
    }
    case "year": {
      const start = now.startOf("year")
      const end = now.endOf("year")
      return {
        start: start.toDate(),
        end: end.toDate(),
        prevStart: start.subtract(1, "year").toDate(),
        prevEnd: start.subtract(1, "year").endOf("year").toDate(),
        label: `${now.format("YYYY")} 年`,
      }
    }
    case "all": {
      return {
        start: new Date(0),
        end: now.endOf("day").toDate(),
        prevStart: null,
        prevEnd: null,
        label: "全部时间",
      }
    }
    case "custom": {
      const start = dayjs(period.from).startOf("day")
      const end = dayjs(period.to).endOf("day")
      const days = end.diff(start, "day") + 1
      return {
        start: start.toDate(),
        end: end.toDate(),
        prevStart: start.subtract(days, "day").toDate(),
        prevEnd: start.subtract(1, "day").endOf("day").toDate(),
        label: `${start.format("YYYY-MM-DD")} → ${end.format("YYYY-MM-DD")}`,
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Markdown → plain text (for accurate word/char count)
// ────────────────────────────────────────────────────────────────────────────
export function cleanMarkdown(md: string): string {
  if (!md) return ""
  return md
    .replace(/```[\s\S]*?```/g, " ")                 // fenced code blocks
    .replace(/`[^`\n]+`/g, " ")                       // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")            // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")          // links → text
    .replace(/^#+\s+/gm, "")                          // ATX headings
    .replace(/^[*+-]\s+/gm, "")                       // list markers
    .replace(/^>\s+/gm, "")                           // blockquote
    .replace(/^[-*_]{3,}\s*$/gm, "")                  // hr
    .replace(/^[\s]*\|.*\|[\s]*$/gm, m => m.replace(/\|/g, " ").replace(/[-:]+/g, " ")) // table rows
    .replace(/<[^>]+>/g, " ")                         // HTML tags (callouts, etc)
    .replace(/&[a-z]+;/g, " ")                        // HTML entities
    .replace(/\*\*([^*]+)\*\*/g, "$1")                // bold
    .replace(/__([^_]+)__/g, "$1")                    // bold underscore
    .replace(/(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g, "$1") // italic asterisk
    .replace(/(?<!_)_(?!_)([^_\n]+?)(?<!_)_(?!_)/g, "$1")         // italic underscore
    .replace(/~~([^~]+)~~/g, "$1")                    // strike
    .replace(/\s+/g, " ")
    .trim()
}

export function extractTitle(content: string): string {
  if (!content) return "(无标题)"
  const lines = content.split("\n").map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return "(无标题)"

  // 启发式：跳过像 tag 的标题（无空格、单词/标点），优先取像样的 heading
  const isLikelyTag = (s: string) => /^[A-Za-z0-9_\-\*\u4e00-\u9fa5]{1,12}$/.test(s) && !/\s/.test(s)
  const chineseCount = (s: string) => (s.match(/[\u4e00-\u9fa5]/g) || []).length
  const isSubstantive = (s: string) =>
    chineseCount(s) >= 1 || (s.length >= 8 && /\s/.test(s))

  // 1) 找第一个像样的 heading
  for (const line of lines) {
    if (line.startsWith("#")) {
      const text = line.replace(/^#+\s+/, "").trim()
      if (text && !isLikelyTag(text) && isSubstantive(text)) {
        return text.slice(0, 60)
      }
    }
  }
  // 2) 第一个 heading 即便短也用（兜底）
  for (const line of lines) {
    if (line.startsWith("#")) {
      const text = line.replace(/^#+\s+/, "").trim()
      if (text) return text.slice(0, 60)
    }
  }
  // 3) 第一行非空内容
  for (const line of lines) {
    if (line.startsWith("!") || line.startsWith("```") || line.startsWith("|") || line.startsWith(">") || line.startsWith("<")) continue
    return line.slice(0, 60)
  }
  return lines[0]!.slice(0, 60)
}

// ────────────────────────────────────────────────────────────────────────────
// Router
// ────────────────────────────────────────────────────────────────────────────
export const analyticsRouter = router({
  // ──── One big snapshot for a given period ────
  snapshot: authProcedure
    .meta({ openapi: { method: "POST", path: "/v1/analytics/snapshot", summary: "Get analytics snapshot for a period", protect: true, tags: ["Analytics"] } })
    .input(z.object({ period: periodSchema }))
    .output(z.any())
    .mutation(async function ({ ctx, input }) {
      const accountId = parseInt(ctx.id)
      const r = resolvePeriod(input.period)

      // Parallel queries
      const [
        current,
        prevRange,
        dailyCountsRows,
        hourly,
        tagActivityRows,
        wordDistRows,
        longestNoteRows,
        todoStatsRows,
        newTagNames,
        earliestDateRow,
        typeByMonthRows,
      ] = await Promise.all([
        // 1) current period: per-note cleaned length + type + createdAt (for median + buckets + longest + type counts)
        prisma.notes.findMany({
          where: { accountId, isRecycle: false, isArchived: false, createdAt: { gte: r.start, lte: r.end } },
          select: { id: true, type: true, content: true, createdAt: true },
        }),
        // 2) previous period: counts only (light)
        r.prevStart && r.prevEnd
          ? prisma.notes.findMany({
              where: { accountId, isRecycle: false, isArchived: false, createdAt: { gte: r.prevStart, lte: r.prevEnd } },
              select: { id: true, type: true, content: true, createdAt: true },
            })
          : Promise.resolve([] as Array<{ id: number; type: number; content: string; createdAt: Date }>),
        // 3) daily counts for past year (heatmap uses ~365 days regardless of period)
        prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
          SELECT to_char("createdAt"::date, 'YYYY-MM-DD') as date, COUNT(*) as count
          FROM "notes"
          WHERE "accountId" = ${accountId}
            AND "isRecycle" = false
            AND "isArchived" = false
            AND "createdAt" >= NOW() - INTERVAL '1 year'
          GROUP BY "createdAt"::date
          ORDER BY "createdAt"::date ASC
        `,
        // 4) 24h active distribution (current period)
        prisma.$queryRaw<Array<{ h: number; count: bigint }>>`
          SELECT EXTRACT(HOUR FROM "createdAt")::int as h, COUNT(*) as count
          FROM "notes"
          WHERE "accountId" = ${accountId}
            AND "isRecycle" = false
            AND "isArchived" = false
            AND "createdAt" >= ${r.start} AND "createdAt" <= ${r.end}
          GROUP BY h ORDER BY h
        `,
        // 5) tag × month for past 12 months (top tags only, limited)
        prisma.$queryRaw<Array<{ tag_id: number; tag_name: string; month: string; count: bigint }>>`
          SELECT t.id as tag_id, t.name as tag_name, to_char(n."createdAt", 'YYYY-MM') as month, COUNT(*) as count
          FROM "tagsToNote" t2n
          JOIN "tag" t ON t.id = t2n."tagId"
          JOIN "notes" n ON n.id = t2n."noteId"
          WHERE t."accountId" = ${accountId}
            AND n."isRecycle" = false AND n."isArchived" = false
            AND n."createdAt" >= NOW() - INTERVAL '12 months'
          GROUP BY t.id, t.name, month
          ORDER BY month ASC
        `,
        // 6) word distribution buckets (current period)
        prisma.$queryRaw<Array<{ bucket: number; count: bigint }>>`
          WITH cleaned AS (
            SELECT
              CASE
                WHEN LENGTH(REGEXP_REPLACE(REGEXP_REPLACE(content, $$#+\s+$$, '', 'gm'), '\s+', ' ', 'g')) < 50 THEN 0
                WHEN LENGTH(REGEXP_REPLACE(REGEXP_REPLACE(content, $$#+\s+$$, '', 'gm'), '\s+', ' ', 'g')) < 200 THEN 1
                WHEN LENGTH(REGEXP_REPLACE(REGEXP_REPLACE(content, $$#+\s+$$, '', 'gm'), '\s+', ' ', 'g')) < 500 THEN 2
                WHEN LENGTH(REGEXP_REPLACE(REGEXP_REPLACE(content, $$#+\s+$$, '', 'gm'), '\s+', ' ', 'g')) < 1000 THEN 3
                ELSE 4
              END as bucket
            FROM "notes"
            WHERE "accountId" = ${accountId}
              AND "isRecycle" = false AND "isArchived" = false
              AND "createdAt" >= ${r.start} AND "createdAt" <= ${r.end}
          )
          SELECT bucket, COUNT(*) as count FROM cleaned GROUP BY bucket ORDER BY bucket
        `,
        // 7) longest note in current period (by raw length, but we'll re-rank by cleaned)
        prisma.notes.findMany({
          where: { accountId, isRecycle: false, isArchived: false, createdAt: { gte: r.start, lte: r.end } },
          orderBy: { content: "desc" },
          take: 5,
          select: { id: true, content: true, createdAt: true },
        }),
        // 8) todo completion in current period (todos = type=2)
        prisma.notes.findMany({
          where: { accountId, type: 2, createdAt: { gte: r.start, lte: r.end } },
          select: { id: true, isReviewed: true, updatedAt: true },
        }),
        // 9) new tags in current period (tags that first appeared in this period)
        prisma.tag.findMany({
          where: { accountId, createdAt: { gte: r.start, lte: r.end } },
          select: { name: true, _count: { select: { tagsToNote: true } } },
        }),
        // 10) earliest note date (for "all" period)
        prisma.notes.findFirst({
          where: { accountId },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
        // 11) type by month for last 12 months (independent of selected period)
        prisma.$queryRaw<Array<{ month: string; type: number; count: bigint }>>`
          SELECT to_char("createdAt", 'YYYY-MM') as month, type, COUNT(*) as count
          FROM "notes"
          WHERE "accountId" = ${accountId}
            AND "isRecycle" = false AND "isArchived" = false
            AND "createdAt" >= NOW() - INTERVAL '12 months'
          GROUP BY month, type
          ORDER BY month ASC
        `,
      ])

      // ── Process current period ──
      const currentNoteLengths: number[] = []
      let currentRawTotal = 0
      let currentCleanTotal = 0
      let currentActiveDays = 0
      const daySet = new Set<string>()
      const typeBreakdown = { total: 0, note: 0, flash: 0, todo: 0 }
      let longestNote: { id: number; title: string; length: number; createdAt: string } | null = null

      for (const n of current) {
        const cleaned = cleanMarkdown(n.content)
        const len = cleaned.length
        const rawLen = (n.content || "").length
        currentNoteLengths.push(len)
        currentRawTotal += rawLen
        currentCleanTotal += len
        daySet.add(dayjs(n.createdAt).format("YYYY-MM-DD"))
        typeBreakdown.total++
        if (n.type === 0) typeBreakdown.flash++
        else if (n.type === 1) typeBreakdown.note++
        else if (n.type === 2) typeBreakdown.todo++
        if (!longestNote || len > longestNote.length) {
          longestNote = {
            id: n.id,
            title: extractTitle(n.content),
            length: len,
            createdAt: dayjs(n.createdAt).toISOString(),
          }
        }
      }
      currentActiveDays = daySet.size

      // Median
      const sorted = [...currentNoteLengths].sort((a, b) => a - b)
      const median = sorted.length === 0
        ? 0
        : sorted.length % 2 === 0
          ? Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
          : sorted[Math.floor(sorted.length / 2)]

      // ── Type by month (12 months) ──
      const typeByMonthMap = new Map<string, { note: number; flash: number; todo: number }>()
      for (const row of typeByMonthRows) {
        if (!typeByMonthMap.has(row.month)) {
          typeByMonthMap.set(row.month, { note: 0, flash: 0, todo: 0 })
        }
        const entry = typeByMonthMap.get(row.month)!
        if (row.type === 0) entry.flash = Number(row.count)
        else if (row.type === 1) entry.note = Number(row.count)
        else if (row.type === 2) entry.todo = Number(row.count)
      }
      const typeByMonth = [...typeByMonthMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, v]) => ({ month, ...v }))

      // ── Process previous period ──
      const prevNoteLengths: number[] = []
      let prevRawTotal = 0
      let prevCleanTotal = 0
      let prevActiveDays = 0
      const prevDaySet = new Set<string>()
      const prevTypeBreakdown = { total: 0, note: 0, flash: 0, todo: 0 }
      for (const n of prevRange) {
        const len = cleanMarkdown(n.content).length
        const rawLen = (n.content || "").length
        prevNoteLengths.push(len)
        prevRawTotal += rawLen
        prevCleanTotal += len
        prevDaySet.add(dayjs(n.createdAt).format("YYYY-MM-DD"))
        prevTypeBreakdown.total++
        if (n.type === 0) prevTypeBreakdown.flash++
        else if (n.type === 1) prevTypeBreakdown.note++
        else if (n.type === 2) prevTypeBreakdown.todo++
      }
      prevActiveDays = prevDaySet.size

      const hasPrev = r.prevStart !== null && prevRange.length >= 0

      // ── Daily counts (for heatmap) ──
      const dailyCount: Array<[string, number]> = dailyCountsRows.map(r => [r.date, Number(r.count)])

      // ── 24h active distribution ──
      const activeHours: number[] = new Array(24).fill(0)
      for (const row of hourly) {
        activeHours[Number(row.h)] = Number(row.count)
      }

      // ── Tag activity (12 months × top tags) ──
      // First pick top tags by total count
      const tagTotals = new Map<string, number>()
      for (const row of tagActivityRows) {
        tagTotals.set(row.tag_name, (tagTotals.get(row.tag_name) || 0) + Number(row.count))
      }
      const topTagNames = [...tagTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(e => e[0])
      // Build 12-month window
      const monthList: string[] = []
      for (let i = 11; i >= 0; i--) {
        monthList.push(dayjs().subtract(i, "month").format("YYYY-MM"))
      }
      const tagActivity = topTagNames.map(tag => {
        const monthMap = new Map<string, number>()
        let tagId = 0
        for (const row of tagActivityRows) {
          if (row.tag_name === tag) {
            monthMap.set(row.month, Number(row.count))
            tagId = row.tag_id
          }
        }
        return { tag, id: tagId, data: monthList.map(m => monthMap.get(m) || 0) }
      })

      // ── Tag cloud (all-time, with hierarchy from "/" in name) ──
      const allTagsData: Array<{ name: string; id: number; count: number }> = []
      const seenTag = new Set<string>()
      for (const row of tagActivityRows) {
        const n = row.tag_name
        // Sum across all months for the tag's all-time count
        if (!seenTag.has(n)) {
          seenTag.add(n)
          allTagsData.push({ name: n, id: row.tag_id, count: tagTotals.get(n) || 0 })
        }
      }
      // Build hierarchy: split on "/"
      type CloudNode = { name: string; id?: number; value: number; children?: CloudNode[] }
      const rootChildren: CloudNode[] = []
      for (const t of allTagsData) {
        const parts = t.name.split("/")
        if (parts.length === 1) {
          rootChildren.push({ name: t.name, id: t.id, value: t.count })
        } else {
          // For simplicity in mock: keep flat (no nested) — the treemap library handles nesting via children
          // Find or create parent
          const parentName = parts[0]
          let parent = rootChildren.find(c => c.name === parentName)
          if (!parent) {
            parent = { name: parentName, value: 0, children: [] }
            rootChildren.push(parent)
          }
          parent.children!.push({ name: t.name, id: t.id, value: t.count })
          parent.value += t.count
        }
      }
      // Sort by value desc
      rootChildren.sort((a, b) => b.value - a.value)

      // ── Top tags (current period) ──
      const currentTopTags = new Map<string, number>()
      for (const n of current) {
        // We need tags per note; get from join or use a separate query
        // Simpler: a quick query for top tags in current period
      }
      // Run the top-tags-for-period query (could parallelize, but we already have current)
      const topTagsRows = await prisma.$queryRaw<Array<{ tag_id: number; tag_name: string; count: bigint }>>`
        SELECT t.id as tag_id, t.name as tag_name, COUNT(*) as count
        FROM "tagsToNote" t2n
        JOIN "tag" t ON t.id = t2n."tagId"
        JOIN "notes" n ON n.id = t2n."noteId"
        WHERE t."accountId" = ${accountId}
          AND n."isRecycle" = false AND n."isArchived" = false
          AND n."createdAt" >= ${r.start} AND n."createdAt" <= ${r.end}
        GROUP BY t.id, t.name
        ORDER BY count DESC
        LIMIT 10
      `
      const topTags = topTagsRows.map(r => ({ id: r.tag_id, name: r.tag_name, count: Number(r.count) }))

      // ── Word distribution ──
      const distMap = new Map<number, number>()
      for (const row of wordDistRows) distMap.set(Number(row.bucket), Number(row.count))
      const wordDistribution = [
        { bucket: "<50", count: distMap.get(0) || 0 },
        { bucket: "50-200", count: distMap.get(1) || 0 },
        { bucket: "200-500", count: distMap.get(2) || 0 },
        { bucket: "500-1000", count: distMap.get(3) || 0 },
        { bucket: ">1000", count: distMap.get(4) || 0 },
      ]

      // ── Todo completion ──
      const todoTotal = todoStatsRows.length
      const todoCompleted = todoStatsRows.filter(t => t.isReviewed).length
      // Overdue = not completed and updatedAt (last activity) is before start (loose heuristic)
      const todoOverdue = todoStatsRows.filter(t => !t.isReviewed && dayjs(t.updatedAt).isBefore(dayjs(r.end).subtract(7, "day"))).length

      // ── New tags in period ──
      const newTags = newTagNames.map(t => ({ name: t.name, count: t._count.tagsToNote }))

      // ── Active hour peak ──
      const activeHourPeak = (() => {
        let maxIdx = 0
        let maxVal = 0
        activeHours.forEach((v, i) => { if (v > maxVal) { maxVal = v; maxIdx = i } })
        return { hour: maxIdx, count: maxVal }
      })()

      // ── Streak (current + longest in last 365 days) ──
      // Use the dailyCount rows for dates that have count > 0
      const activeDates = dailyCountsRows
        .filter(r => Number(r.count) > 0)
        .map(r => dayjs(r.date))
        .sort((a, b) => a.valueOf() - b.valueOf())
      let streakCurrent = 0
      let streakLongest = 0
      let streakLongestMonth: string | null = null
      let run = 0
      let runStart: dayjs.Dayjs | null = null
      let bestRun = 0
      let bestRunStart: dayjs.Dayjs | null = null
      let bestRunEnd: dayjs.Dayjs | null = null
      // Current streak: starting from today (or yesterday if today not yet active) going back
      const today = dayjs().startOf("day")
      const yesterday = today.subtract(1, "day")
      // Find first index that is today or yesterday
      let currentRun = 0
      for (let i = activeDates.length - 1; i >= 0; i--) {
        const d = activeDates[i]
        if (d.isSame(today) || d.isSame(yesterday)) {
          if (currentRun === 0) currentRun = 1
          else if (d.isSame(activeDates[i + 1].subtract(1, "day"))) currentRun++
          else break
        } else if (currentRun === 0 && d.isBefore(yesterday)) {
          break
        }
      }
      streakCurrent = currentRun
      // Longest: scan all
      for (let i = 0; i < activeDates.length; i++) {
        if (i === 0) { run = 1; runStart = activeDates[0] }
        else {
          const prev = activeDates[i - 1]
          const cur = activeDates[i]
          if (cur.diff(prev, "day") === 1) {
            run++
          } else {
            if (run > bestRun) {
              bestRun = run
              bestRunStart = runStart
              bestRunEnd = prev
            }
            run = 1
            runStart = cur
          }
        }
      }
      if (run > bestRun) { bestRun = run; bestRunStart = runStart; bestRunEnd = activeDates[activeDates.length - 1] }
      streakLongest = bestRun
      if (bestRunStart && bestRunEnd) {
        streakLongestMonth = bestRunStart.format("YYYY-MM")
      }

      // ── Build response ──
      return {
        range: {
          type: input.period.type,
          label: r.label,
          start: r.start.toISOString(),
          end: r.end.toISOString(),
          hasPrev,
        },
        typeBreakdown: {
          ...typeBreakdown,
          prev: hasPrev ? prevTypeBreakdown : null,
        },
        wordStats: {
          rawTotal: currentRawTotal,
          total: currentCleanTotal,
          avgPerActiveDay: currentActiveDays > 0 ? Math.round(currentCleanTotal / currentActiveDays) : 0,
          median,
          activeDays: currentActiveDays,
          longestNote,
          prev: hasPrev ? {
            rawTotal: prevRawTotal,
            total: prevCleanTotal,
            avgPerActiveDay: prevActiveDays > 0 ? Math.round(prevCleanTotal / prevActiveDays) : 0,
            activeDays: prevActiveDays,
          } : null,
        },
        dailyCount,
        activeHours,
        activeHourPeak,
        streak: {
          current: streakCurrent,
          longest: streakLongest,
          longestMonth: streakLongestMonth,
        },
        tagCloud: rootChildren,
        topTags,
        tagActivity: { months: monthList, tags: tagActivity },
        wordDistribution,
        review: {
          longestNote,
          newTags,
          todoCompletion: { total: todoTotal, completed: todoCompleted, overdue: todoOverdue },
          activeHourPeak,
        },
        allTimeRange: {
          earliest: earliestDateRow?.createdAt?.toISOString() || null,
        },
        typeByMonth,
      }
    }),

  // ──── Legacy endpoints (kept for backward compat) ────
  dailyNoteCount: authProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/analytics/daily-note-count', summary: 'Query daily note count', protect: true, tags: ['Analytics'] } })
    .input(z.void())
    .output(z.array(z.object({ date: z.string(), count: z.number() })))
    .mutation(async function ({ ctx }) {
      const rows = await prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
        SELECT to_char("createdAt"::date, 'YYYY-MM-DD') as date, COUNT(*) as count
        FROM "notes"
        WHERE "accountId" = ${parseInt(ctx.id)}
          AND "isRecycle" = false AND "isArchived" = false
          AND "createdAt" >= NOW() - INTERVAL '1 year'
        GROUP BY "createdAt"::date
        ORDER BY "createdAt"::date ASC
      `
      return rows.map(r => ({ date: r.date, count: Number(r.count) }))
    }),

  monthlyStats: authProcedure
    .meta({ openapi: { method: 'POST', path: '/v1/analytics/monthly-stats', summary: 'Query monthly statistics', protect: true, tags: ['Analytics'] } })
    .input(z.object({ month: z.string() }))
    .output(z.any())
    .mutation(async function ({ ctx, input }) {
      // Delegate to the new snapshot endpoint with month period
      const r = resolvePeriod({ type: "month", value: input.month })
      const accountId = parseInt(ctx.id)
      const [count, wordStats, tagStats] = await Promise.all([
        prisma.notes.count({
          where: {
            accountId,
            isRecycle: false, isArchived: false,
            createdAt: { gte: r.start, lte: r.end }
          }
        }),
        prisma.$queryRaw<Array<{ date: string; words: bigint }>>`
          SELECT to_char("createdAt"::date, 'YYYY-MM-DD') as date, SUM(LENGTH(content)) as words
          FROM "notes"
          WHERE "accountId" = ${accountId}
            AND "isRecycle" = false AND "isArchived" = false
            AND "createdAt" >= ${r.start} AND "createdAt" <= ${r.end}
          GROUP BY "createdAt"::date
          ORDER BY words DESC
        `,
        prisma.tag.findMany({
          where: { accountId },
          select: { name: true, _count: { select: { tagsToNote: true } } },
          orderBy: { tagsToNote: { _count: 'desc' } }
        }),
      ])
      const totalWords = wordStats.reduce((sum, stat) => sum + Number(stat.words), 0)
      const maxDailyWords = wordStats.length > 0 ? Number(wordStats[0]!.words) : 0
      const activeDays = wordStats.length
      const validTags = tagStats.filter(t => t._count.tagsToNote > 0)
      return { noteCount: count, totalWords, maxDailyWords, activeDays, tagStats: validTags.map(t => ({ tagName: t.name, count: t._count.tagsToNote })) }
    }),
})
