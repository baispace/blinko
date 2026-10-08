import * as echarts from "echarts"
import { useEffect, useRef } from "react"
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

export const HeatMap = ({ data, title, description, range = "1y", metric = "count", onCellClick }: HeatMapProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const inst = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!ref.current) return
    if (!inst.current) inst.current = echarts.init(ref.current, undefined, { renderer: "canvas" })
    const isDark = theme === "dark"
    const fg = isDark ? "#e9eaee" : "#14171e"
    const muted = isDark ? "#9aa0aa" : "#7c7a72"
    const bg = isDark ? "#181c23" : "#ffffff"
    const cellEmpty = isDark ? "rgba(255,255,255,0.05)" : "#ebedf0"

    // Filter data by range
    const now = dayjs()
    // "all" 模式：以数据最早一天为起点（最多回看 5 年）避免 2 万格卡死
    const maxLookbackDays = 365 * 5
    const earliestData = data.length > 0
      ? dayjs(data.reduce((min, [d]) => d < min ? d : min, data[0]![0]))
      : now.subtract(1, "year")
    const rawCutoff: dayjs.Dayjs = range === "6m" ? now.subtract(6, "month")
      : range === "all" ? earliestData
      : now.subtract(1, "year")
    const cutoff = rawCutoff.isAfter(now.subtract(maxLookbackDays, "day"))
      ? rawCutoff
      : now.subtract(maxLookbackDays, "day")
    const filtered = data.filter(([d]) => {
      const dd = dayjs(d)
      return dd.isAfter(cutoff) || dd.isSame(cutoff, "day")
    })

    // Build full date range (capped at maxLookbackDays)
    const dates: string[] = []
    const cur = cutoff.clone().startOf("day")
    const end = now.startOf("day")
    let safety = 0
    while ((cur.isBefore(end) || cur.isSame(end, "day")) && safety < maxLookbackDays) {
      dates.push(cur.format("YYYY-MM-DD"))
      cur.add(1, "day")
      safety++
    }
    const dataMap = new Map(filtered)
    const cells: Array<[string, number]> = dates.map(d => [d, dataMap.get(d) || 0])
    const max = Math.max(1, ...cells.map(c => c[1]))

    inst.current.setOption({
      tooltip: {
        formatter: (p: any) => {
          const v = p.value[1]
          if (v === 0) return `${p.value[0]}<br/><span style="color:#9aa0aa">${t("no-data")}</span>`
          return `${p.value[0]}<br/><strong>${v}</strong> ${t("notes")}`
        },
      },
      visualMap: {
        show: false,
        min: 0,
        max: Math.max(3, max),
        inRange: {
          color: isDark
            ? [cellEmpty, "#0e4429", "#006d32", "#26a641", "#39d353"]
            : [cellEmpty, "#9be9a8", "#40c463", "#30a14e", "#216e39"],
        },
      },
      calendar: {
        top: 24,
        left: 30,
        right: 8,
        cellSize: ["auto", 14],
        range: [cutoff.format("YYYY-MM-DD"), end.format("YYYY-MM-DD")],
        itemStyle: { borderColor: bg, borderWidth: 2, borderRadius: 3, color: cellEmpty },
        yearLabel: { show: false },
        dayLabel: { show: false },
        monthLabel: { color: muted, fontSize: 10, margin: 8 },
        splitLine: { show: false },
      },
      series: [{ type: "heatmap", coordinateSystem: "calendar", data: cells, animation: false }],
    }, true)
    inst.current.on("click", (params: any) => {
      if (params.value && Array.isArray(params.value) && params.value[0]) {
        const date = params.value[0] as string
        if (onCellClick) onCellClick(date)
        else navigate(`/?path=notes&from=${date}&to=${date}`)
      }
    })
  }, [data, theme, range, metric, t, navigate, onCellClick])

  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(() => inst.current?.resize())
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => () => {
    inst.current?.dispose()
    inst.current = null
  }, [])

  return (
    <div className="bg-content1 border border-default-200 rounded-2xl p-5 shadow-sm">
      {(title || description) && (
        <div className="mb-3">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {description && <p className="text-xs text-default-500 mt-0.5">{description}</p>}
        </div>
      )}
      <div className="overflow-x-auto">
        <div ref={ref} className="w-full" style={{ height: 180, minWidth: 720 }} />
      </div>
      <div className="flex items-center justify-end gap-2 text-[10px] text-default-500 mt-2">
        <span>少</span>
        <div className="flex gap-0.5">
          {["rgba(0,0,0,0.04)", "#9be9a8", "#40c463", "#30a14e", "#216e39"].map((c, i) => (
            <span key={i} className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />
          ))}
        </div>
        <span>多</span>
      </div>
    </div>
  )
}
