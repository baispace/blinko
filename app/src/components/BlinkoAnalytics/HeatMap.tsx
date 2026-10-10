import { useMemo } from "react"
import dayjs from "dayjs"
import { useTranslation } from "react-i18next"
import { useTheme } from "next-themes"
import { useNavigate } from "react-router-dom"

interface HeatMapProps {
  data: Array<[string, number]>
  title?: string
  description?: string
  range?: "6m" | "1y" | "all"
  metric?: "count" | "words"
  onCellClick?: (date: string) => void
}

const CELL_MIN_PX = 14
const CELL_GAP = 3
const MONTH_LABEL_PX = 40

export const HeatMap = ({
  data,
  title,
  description,
  range = "6m",
  metric: _metric = "count",
  onCellClick,
}: HeatMapProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const navigate = useNavigate()

  const isDark = theme === "dark"
  const muted = isDark ? "#9aa0aa" : "#7c7a72"
  const cellEmpty = isDark ? "rgba(255,255,255,0.06)" : "#ebedf0"
  const weekendOutline = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"

  const palette = isDark
    ? [cellEmpty, "#0e4429", "#006d32", "#26a641", "#39d353"]
    : [cellEmpty, "#9be9a8", "#40c463", "#30a14e", "#216e39"]

  const { months, activeDays, totalCount, max } = useMemo(() => {
    const now = dayjs().startOf("day")
    const earliestData =
      data.length > 0
        ? dayjs(data.reduce((min, [d]) => (d < min ? d : min), data[0]![0])).startOf("day")
        : now.subtract(1, "year")
    const cutoff =
      range === "6m"
        ? now.subtract(6, "month").startOf("day")
        : range === "all"
          ? earliestData
          : now.subtract(1, "year").startOf("day")

    const filtered = data.filter(([d]) => {
      const dd = dayjs(d)
      return (
        (dd.isAfter(cutoff) || dd.isSame(cutoff, "day")) &&
        (dd.isBefore(now) || dd.isSame(now, "day"))
      )
    })

    const dataMap = new Map(filtered)
    const monthsArr: Array<{
      label: string
      yearMonth: string
      days: Array<{ date: string; count: number; isFuture: boolean; weekday: number }>
    }> = []

    let cur = cutoff.clone().startOf("month")
    const end = now.startOf("month")
    while (cur.isBefore(end) || cur.isSame(end, "month")) {
      const daysInMonth = cur.daysInMonth()
      const yearMonth = cur.format("YYYY-MM")
      const monthLabel = cur.format("M月")
      const days: Array<{ date: string; count: number; isFuture: boolean; weekday: number }> = []
      for (let d = 1; d <= daysInMonth; d++) {
        const day = cur.date(d)
        const isFuture = day.isAfter(now, "day")
        const ds = day.format("YYYY-MM-DD")
        days.push({
          date: ds,
          count: isFuture ? -1 : dataMap.get(ds) || 0,
          isFuture,
          weekday: day.day(),
        })
      }
      monthsArr.push({ label: monthLabel, yearMonth, days })
      cur = cur.add(1, "month")
    }

    const activeDays = filtered.length
    const totalCount = filtered.reduce((s, [, v]) => s + v, 0)
    const max = Math.max(1, ...filtered.map(([, v]) => v))

    return { months: monthsArr, activeDays, totalCount, max }
  }, [data, range])

  const getColor = (count: number): string => {
    if (count <= 0) return cellEmpty
    if (max <= 1) return palette[2]
    const ratio = count / max
    if (ratio < 0.25) return palette[1]
    if (ratio < 0.5) return palette[2]
    if (ratio < 0.75) return palette[3]
    return palette[4]
  }

  const handleCellClick = (date: string, count: number) => {
    if (count <= 0) return
    if (onCellClick) onCellClick(date)
    else navigate(`/?path=notes&from=${date}&to=${date}`)
  }

  // 控制容器高度：超过 12 行（约 360px）后内部滚动
  const maxRows = 12
  const visibleMonths = months.length > maxRows ? months.slice(-maxRows) : months
  const isScrollable = months.length > maxRows

  return (
    <div className="bg-card border border-default-200 rounded-lg p-5 ">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {description && <p className="text-xs text-default-500 mt-0.5">{description}</p>}
        </div>
        {activeDays > 0 ? (
          <div className="text-xs text-default-500 shrink-0">
            <span className="font-semibold text-foreground">{activeDays}</span> 个活跃日 · {totalCount} 条
          </div>
        ) : (
          <div className="text-xs text-default-400 shrink-0">{t("no-data")}</div>
        )}
      </div>

      <div
        className="overflow-y-auto"
        style={{
          maxHeight: isScrollable ? 360 : undefined,
        }}
      >
        <div className="pb-2">
          <div className="flex flex-col gap-1.5">
            {visibleMonths.map((month) => (
              <div key={month.yearMonth} className="flex items-center gap-2">
                <div
                  className="text-xs shrink-0 text-right"
                  style={{ color: muted, width: MONTH_LABEL_PX - 8, paddingRight: 8 }}
                >
                  {month.label}
                </div>
                <div
                  className="grid flex-1 min-w-0"
                  style={{
                    gridTemplateColumns: `repeat(${month.days.length}, minmax(${CELL_MIN_PX}px, 1fr))`,
                    gap: CELL_GAP,
                  }}
                >
                  {month.days.map(({ date, count, isFuture, weekday }) => {
                    const isWeekend = weekday === 0 || weekday === 6
                    const tooltipText =
                      count > 0
                        ? `${date} ${isWeekend ? "(周末)" : ""} · ${count} ${t("notes")}`
                        : isFuture
                          ? `${date} · ${t("no-data")}`
                          : `${date} · ${t("no-data")}`
                    return (
                      <button
                        key={date}
                        type="button"
                        onClick={() => handleCellClick(date, count)}
                        disabled={count <= 0}
                        title={tooltipText}
                        aria-label={tooltipText}
                        className="w-full aspect-square rounded-sm transition-transform hover:scale-150 focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-default"
                        style={{
                          background: isFuture ? "transparent" : getColor(count),
                          border: isWeekend && !isFuture ? `1px dashed ${weekendOutline}` : "1px solid transparent",
                          opacity: count === 0 ? 0.45 : 1,
                          cursor: count > 0 ? "pointer" : "default",
                          minWidth: CELL_MIN_PX,
                          minHeight: CELL_MIN_PX,
                        }}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-3">
        <div className="text-[10px] text-default-400">
          {isScrollable && (
            <span>
              显示最近 {visibleMonths.length} / {months.length} 个月，向上滚动查看更早
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-default-500">
          <span>少</span>
          <div className="flex gap-0.5">
            {palette.map((c, i) => (
              <span key={i} className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />
            ))}
          </div>
          <span>多</span>
        </div>
      </div>
    </div>
  )
}
