import React, { useEffect, useRef } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { useTheme } from "next-themes"
import * as echarts from "echarts"

interface WordDistributionProps {
  data: Array<{ bucket: string; count: number }>
  median?: number
  avg?: number
}

export const WordDistribution = observer(({ data, median, avg }: WordDistributionProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const ref = useRef<HTMLDivElement>(null)
  const inst = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!ref.current) return
    if (!inst.current) inst.current = echarts.init(ref.current, undefined, { renderer: "canvas" })
    const isDark = theme === "dark"
    const muted = isDark ? "#9aa0aa" : "#7c7a72"
    const empty = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"
    const COLORS = ["#10b981", "#3b82f6", "#6366f1", "#f59e0b", "#f43f5e"]
    const buckets = data.length > 0 ? data : [
      { bucket: "<50", count: 0 },
      { bucket: "50-200", count: 0 },
      { bucket: "200-500", count: 0 },
      { bucket: "500-1000", count: 0 },
      { bucket: ">1000", count: 0 },
    ]
    const total = buckets.reduce((s, b) => s + b.count, 0)
    inst.current.setOption({
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (p: any) => `${p[0].name} 字<br/><strong>${p[0].value}</strong> 条${total > 0 ? ` (${Math.round((p[0].value / total) * 100)}%)` : ""}`,
      },
      grid: { top: 16, right: 24, bottom: 24, left: 36, containLabel: true },
      xAxis: {
        type: "category",
        data: buckets.map(b => b.bucket),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: muted, fontSize: 11 },
      },
      yAxis: { type: "value", show: false },
      series: [{
        type: "bar",
        data: buckets.map((b, i) => ({
          value: b.count,
          itemStyle: {
            color: b.count === 0 ? empty : COLORS[i % COLORS.length],
            borderRadius: [6, 6, 0, 0],
          },
        })),
        label: {
          show: true,
          position: "top",
          color: muted,
          fontSize: 11,
          formatter: (p: any) => p.value > 0 ? String(p.value) : "",
        },
        barWidth: "50%",
        markLine: {
          symbol: "none",
          lineStyle: { type: "dashed", width: 1 },
          data: [
            avg !== undefined ? { name: `均值 ${avg}`, xAxis: 2.2, lineStyle: { color: "#3b82f6" }, label: { color: "#3b82f6", fontSize: 10, position: "end", formatter: `均值 ${avg}` } } : { xAxis: -1 },
            median !== undefined ? { name: `中位 ${median}`, xAxis: 1.5, lineStyle: { color: "#f59e0b" }, label: { color: "#f59e0b", fontSize: 10, position: "end", formatter: `中位 ${median}` } } : { xAxis: -1 },
          ].filter(d => d.xAxis >= 0),
        },
      }],
    }, true)
  }, [data, theme, median, avg])

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

  const total = data.reduce((s, b) => s + b.count, 0)
  return (
    <div className="bg-content1 border border-default-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-default-500"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          {t("word-distribution")}
        </span>
        <span className="text-xs text-default-500">
          {median !== undefined ? `中位 ${median}` : ""} · {avg !== undefined ? `均 ${avg}` : ""} · 共 {total} 条
        </span>
      </div>
      <div ref={ref} style={{ height: 200 }} />
    </div>
  )
})
