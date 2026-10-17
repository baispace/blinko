import React, { useEffect, useRef } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { useTheme } from "next-themes"
import * as echarts from "echarts"
import { useNavigate } from "react-router-dom"

export interface TagNode {
  name: string
  id?: number
  value: number
  children?: TagNode[]
}

interface TagCloudProps {
  data: TagNode[]
}

const PALETTE = [
  "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899",
  "#06b6d4", "#f43f5e", "#6366f1", "#84cc16", "#a855f7",
  "#0ea5e9", "#22c55e", "#eab308", "#ef4444",
]

function colorize(nodes: TagNode[]): any[] {
  let idx = 0
  return nodes.map(n => {
    const color = PALETTE[idx++ % PALETTE.length]
    const out: any = { name: n.name, value: n.value, itemStyle: { color, borderColor: "rgba(0,0,0,0.08)" } }
    if (n.id != null) out.id = n.id
    if (n.children && n.children.length > 0) {
      out.children = colorize(n.children)
    }
    return out
  })
}

export const TagCloud = observer(({ data }: TagCloudProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const ref = useRef<HTMLDivElement>(null)
  const inst = useRef<echarts.ECharts | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!ref.current) return
    if (!inst.current) inst.current = echarts.init(ref.current, undefined, { renderer: "canvas" })
    const isDark = theme === "dark"
    const bg = isDark ? "#181c23" : "#ffffff"
    const flat = colorize(data.length > 0 ? data : [])
    inst.current.setOption({
      tooltip: {
        // 限定在 chart container 内，永远不出卡片右边界
        confine: true,
        // 自定义位置：右侧能放下就放右侧，否则放到矩形左侧；
        // 都塞不下时交给 ECharts 的 confine 兜底
        position: (point: number[], _params: any, _dom: any, rect: any, size: any) => {
          const [tw, th] = size.contentSize
          const rightX = rect.x + rect.width + 8
          if (rightX + tw <= size.viewSize[0]) {
            return [rightX, point[1] - th / 2]
          }
          const leftX = rect.x - tw - 8
          if (leftX >= 0) {
            return [leftX, point[1] - th / 2]
          }
          return [point[0], point[1] - th / 2]
        },
        formatter: (p: any) => {
          const path = p.treePathInfo?.slice(1).map((x: any) => x.name).join(" / ") || p.name
          return `<strong>${path}</strong><br/>${p.value} 条`
        },
      },
      series: [{
        type: "treemap",
        data: flat,
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        width: "100%",
        height: "100%",
        top: 4, left: 4, right: 4, bottom: 4,
        label: {
          show: true,
          // 标签名过长时自动省略号截断，不再溢出成两行
          overflow: "truncate",
          ellipsis: "…",
          // 矩形太窄时只显示标签名，不显示数字行，避免挤爆
          formatter: (p: any) => {
            const v = typeof p.value === "number" ? p.value : 0
            return v <= 2 ? `{name|${p.name}}` : `{name|${p.name}}\n{val|${p.value}}`
          },
          rich: {
            name: { color: "#fff", fontSize: 12, fontWeight: 600, lineHeight: 16 },
            val: { color: "rgba(255,255,255,0.85)", fontSize: 11 },
          },
        },
        upperLabel: { show: false },
        itemStyle: { borderColor: bg, borderWidth: 4, borderRadius: 6, gapWidth: 6 },
        emphasis: { upperLabel: { show: false } },
        levels: [
          { itemStyle: { borderColor: bg, borderWidth: 6, gapWidth: 6, borderRadius: 6 } },
          { itemStyle: { borderColor: bg, borderWidth: 4, gapWidth: 4, borderRadius: 4 } },
        ],
      }],
    }, true)
    inst.current.on("click", (params: any) => {
      const id = params.data?.id
      if (id != null) {
        navigate(`/?path=notes&tagId=${id}`)
      } else if (params.data?.name) {
        // 合成父节点（按 "/" 拆出的虚拟父）没有 id，兜底用 name 跳转已不必要——直接不响应
        return
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

  return (
    <div ref={ref} style={{ height: 220 }} />
  )
})
