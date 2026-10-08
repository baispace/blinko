import React, { useEffect, useRef } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { useTheme } from "next-themes"
import * as echarts from "echarts"
import { Icon } from "@/components/Common/Iconify/icons"

interface HourChartProps {
  data: number[]
  peak?: { hour: number; count: number }
}

export const HourChart = observer(({ data, peak }: HourChartProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const ref = useRef<HTMLDivElement>(null)
  const inst = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!ref.current) return
    if (!inst.current) inst.current = echarts.init(ref.current, undefined, { renderer: "canvas" })
    const isDark = theme === "dark"
    const max = Math.max(1, ...data)
    inst.current.setOption({
      tooltip: {
        trigger: "axis",
        formatter: (p: any) => {
          const v = typeof p[0].data === "object" ? p[0].data.value : p[0].data
          return `${String(p[0].axisValue).padStart(2, "0")}:00<br/><strong>${v}</strong>`
        },
      },
      grid: { top: 6, right: 0, bottom: 0, left: 0, containLabel: false },
      xAxis: {
        type: "category",
        data: Array.from({ length: 24 }, (_, i) => i),
        show: false,
      },
      yAxis: { type: "value", show: false },
      series: [{
        type: "bar",
        data: data.map((v, i) => ({
          value: v,
          itemStyle: {
            color: v === 0
              ? (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)")
              : `rgba(16, 185, 129, ${0.25 + (v / max) * 0.75})`,
            borderRadius: [3, 3, 0, 0],
            ...(peak && i === peak.hour && v > 0 ? { borderColor: "#f59e0b", borderWidth: 1.5 } : {}),
          },
        })),
        barCategoryGap: "18%",
      }],
    }, true)
  }, [data, theme, peak])

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

  const peakHour = peak && peak.count > 0
    ? `${String(peak.hour).padStart(2, "0")}:00`
    : null

  return (
    <div className="bg-content1 border border-default-200 rounded-2xl p-5 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Icon icon="solar:clock-circle-bold" className="w-4 h-4" />
          {t("active-hours")}
        </span>
        <span className="text-xs text-default-500">
          {peakHour ? `${peakHour} 写得最多` : t("no-data")}
        </span>
      </div>
      <div ref={ref} style={{ height: 100 }} />
      <div className="flex justify-between text-[10px] text-default-400 -mt-1 font-feature-numeric-tnum">
        <span>0时</span><span>6时</span><span>12时</span><span>18时</span><span>24时</span>
      </div>
    </div>
  )
})
