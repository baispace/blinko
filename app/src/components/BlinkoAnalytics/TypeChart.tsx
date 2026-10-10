import React, { useEffect, useRef } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { useTheme } from "next-themes"
import * as echarts from "echarts"

interface TypeChartProps {
  noteByMonth: Array<{ month: string; note: number; flash: number; todo: number }>
  mode?: "stack" | "group" | "100"
  onModeChange?: (m: "stack" | "group" | "100") => void
}

export const TypeChart = observer(({ noteByMonth, mode = "stack", onModeChange }: TypeChartProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const ref = useRef<HTMLDivElement>(null)
  const inst = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!ref.current) return
    if (!inst.current) inst.current = echarts.init(ref.current, undefined, { renderer: "canvas" })
    const isDark = theme === "dark"
    const muted = isDark ? "#9aa0aa" : "#7c7a72"
    const months = noteByMonth.map(d => d.month)
    const series = [
      { name: t("type-notes"), color: "#3b82f6", data: noteByMonth.map(d => d.note) },
      { name: t("type-flash"), color: "#10b981", data: noteByMonth.map(d => d.flash) },
      { name: t("type-todo"), color: "#f59e0b", data: noteByMonth.map(d => d.todo) },
    ]
    const stack = mode === "100" ? "pct" : mode === "group" ? undefined : "a"
    const formatter = mode === "100"
      ? (p: any) => `${p.seriesName} ${Math.round(p.value)}%`
      : undefined
    inst.current.setOption({
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (p: any) => {
          const total = p.reduce((s: number, x: any) => s + (x.value || 0), 0)
          return `${p[0].axisValue}<br/>${p.map((x: any) => `${x.marker}${x.seriesName} <strong>${x.value}</strong>`).join("<br/>")}<br/><span style="color:#9aa0aa">合计 ${total}</span>`
        },
      },
      grid: { top: 16, right: 16, bottom: 24, left: 36, containLabel: true },
      xAxis: {
        type: "category",
        data: months,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: muted, fontSize: 10, formatter: (v: string) => v.slice(5) },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" } },
        axisLabel: { color: muted, fontSize: 10 },
        max: mode === "100" ? 100 : undefined,
      },
      series: series.map(s => ({
        name: s.name,
        type: "bar",
        stack: mode === "group" ? undefined : stack,
        data: s.data,
        itemStyle: { color: s.color, borderRadius: mode === "group" ? [4, 4, 0, 0] : 0 },
        barGap: mode === "group" ? "20%" : undefined,
        barCategoryGap: mode === "group" ? "40%" : "30%",
        label: mode === "100" ? { show: true, position: "inside", formatter, color: "#fff", fontSize: 10 } : undefined,
      })),
    }, true)
  }, [noteByMonth, mode, theme, t])

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
    <div className="bg-card border border-default-200 rounded-lg p-5 ">
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-default-500"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          类型构成（按月）
        </span>
        {onModeChange && (
          <div className="inline-flex bg-default-100 rounded-md p-0.5">
            {(["stack", "group", "100"] as const).map(m => (
              <button
                key={m}
                onClick={() => onModeChange(m)}
                className={`px-2.5 py-0.5 text-[11px] rounded ${
                  mode === m ? "bg-card " : "text-default-500"
                }`}
              >
                {m === "stack" ? "堆叠" : m === "group" ? "分组" : "100%"}
              </button>
            ))}
          </div>
        )}
      </div>
      <div ref={ref} style={{ height: 220 }} />
      <div className="flex flex-wrap gap-2 mt-2">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-default-50 text-[11px]"><span className="w-1.5 h-1.5 rounded-full" style={{ background: "#3b82f6" }}></span>{t("type-notes")}</span>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-default-50 text-[11px]"><span className="w-1.5 h-1.5 rounded-full" style={{ background: "#10b981" }}></span>{t("type-flash")}</span>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-default-50 text-[11px]"><span className="w-1.5 h-1.5 rounded-full" style={{ background: "#f59e0b" }}></span>{t("type-todo")}</span>
      </div>
    </div>
  )
})
