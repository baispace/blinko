import React, { useEffect, useRef } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { useTheme } from "next-themes"
import * as echarts from "echarts"
import { useNavigate } from "react-router-dom"

interface TagActivity {
  months: string[]
  tags: Array<{ tag: string; data: number[] }>
}

interface TagHeatmapProps {
  data: TagActivity
}

export const TagHeatmap = observer(({ data }: TagHeatmapProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const ref = useRef<HTMLDivElement>(null)
  const inst = useRef<echarts.ECharts | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!ref.current) return
    if (!inst.current) inst.current = echarts.init(ref.current, undefined, { renderer: "canvas" })
    const isDark = theme === "dark"
    const muted = isDark ? "#9aa0aa" : "#7c7a72"
    const bg = isDark ? "#181c23" : "#ffffff"
    const cells: Array<[number, number, number]> = []
    data.tags.forEach((row, ti) => {
      row.data.forEach((v, mi) => {
        if (v > 0) cells.push([mi, ti, v])
      })
    })
    inst.current.setOption({
      tooltip: {
        formatter: (p: any) => {
          const [mi, ti, v] = p.value
          return `<strong>#${data.tags[ti]?.tag}</strong><br/>${data.months[mi]}<br/>${v} 条`
        },
      },
      grid: { top: 10, right: 24, bottom: 28, left: 96, containLabel: false },
      xAxis: {
        type: "category",
        data: data.months,
        splitArea: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: muted, fontSize: 10, formatter: (v: string) => v.slice(5) },
      },
      yAxis: {
        type: "category",
        data: data.tags.map(t => t.tag),
        splitArea: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: muted, fontSize: 11 },
      },
      visualMap: {
        show: false,
        min: 0,
        max: Math.max(2, ...cells.map(c => c[2])),
        inRange: {
          color: isDark
            ? ["#181c23", "#1e3a5f", "#3b82f6", "#60a5fa"]
            : ["#f1f5f9", "#bfdbfe", "#60a5fa", "#3b82f6"],
        },
      },
      series: [{
        type: "heatmap",
        data: cells,
        itemStyle: { borderRadius: 4, borderColor: bg, borderWidth: 3 },
        emphasis: { itemStyle: { borderColor: "#10b981", borderWidth: 2 } },
      }],
    }, true)
    inst.current.on("click", (params: any) => {
      const [mi, ti] = params.value
      const tag = data.tags[ti]?.tag
      const month = data.months[mi]
      if (tag) {
        navigate(`/?path=notes&searchTag=${encodeURIComponent(tag)}&from=${month}-01&to=${month}-31`)
      }
    })
  }, [data, theme, navigate])

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

  return <div ref={ref} style={{ height: 220 }} />
})
