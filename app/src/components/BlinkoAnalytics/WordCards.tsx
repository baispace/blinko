import React from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Icon } from "@/components/Common/Iconify/icons"
import { useNavigate } from "react-router-dom"

interface WordStats {
  rawTotal: number
  total: number
  avgPerActiveDay: number
  median: number
  activeDays: number
  longestNote: { id: number; title: string; length: number; createdAt: string } | null
  prev: { rawTotal: number; total: number; avgPerActiveDay: number; activeDays: number } | null
}

interface WordCardsProps {
  data: WordStats
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-US")
}

function diffPct(curr: number, prev: number | null | undefined) {
  if (prev === null || prev === undefined) return null
  if (prev === 0) return null
  const d = ((curr - prev) / prev) * 100
  if (Math.abs(d) < 0.5) return { sign: "flat" as const, text: "0%" }
  return {
    sign: d > 0 ? "up" as const : "down" as const,
    text: `${d > 0 ? "+" : ""}${d.toFixed(1)}%`,
  }
}

export const WordCards = observer(({ data }: WordCardsProps) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const totalDiff = diffPct(data.total, data.prev?.total)
  const avgDiff = diffPct(data.avgPerActiveDay, data.prev?.avgPerActiveDay)
  const rawDiffPct = data.rawTotal > 0
    ? Math.round(((data.total - data.rawTotal) / data.rawTotal) * 1000) / 10
    : 0

  const cards: Array<{
    labelKey: string
    icon: string
    value: string
    unit?: string
    diff?: { sign: "up" | "down" | "flat"; text: string } | null
    sub: string
    subClass?: string
    onClick?: () => void
  }> = [
    {
      labelKey: "total-words",
      icon: "solar:file-text-line",
      value: fmtNum(data.total),
      diff: totalDiff,
      sub: data.rawTotal !== data.total
        ? `原始 ${fmtNum(data.rawTotal)} · ${rawDiffPct > 0 ? "-" : "+"}${Math.abs(rawDiffPct)}% ${t("word-cleaned")}`
        : `${data.activeDays} ${t("active-days")}`,
    },
    {
      labelKey: "word-daily-avg",
      icon: "solar:line-chart-line",
      value: fmtNum(data.avgPerActiveDay),
      diff: avgDiff,
      sub: `${data.activeDays} ${t("active-days")} · ${data.avgPerActiveDay > 0 ? "平均每天" : ""}`,
    },
    {
      labelKey: "word-median",
      icon: "mdi:chevron-double-right",
      value: fmtNum(data.median),
      sub: data.avgPerActiveDay > 0
        ? `比日均低 ${Math.round((1 - data.median / data.avgPerActiveDay) * 100)}%`
        : "—",
    },
    {
      labelKey: "word-longest",
      icon: "solar:bookmark-bold",
      value: data.longestNote ? fmtNum(data.longestNote.length) : "0",
      unit: data.longestNote ? "字" : undefined,
      sub: data.longestNote ? `「${data.longestNote.title}」` : t("no-data"),
      subClass: "text-primary cursor-pointer truncate max-w-[160px]",
      onClick: data.longestNote ? () => navigate(`/detail?id=${data.longestNote!.id}`) : undefined,
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c, i) => (
        <button
          key={i}
          onClick={c.onClick}
          disabled={!c.onClick}
          className={`text-left bg-content1 border border-default-200 rounded-2xl p-4 shadow-sm transition-all ${
            c.onClick ? "hover:-translate-y-0.5 hover:shadow-md hover:border-primary/30 cursor-pointer" : ""
          }`}
        >
          <div className="flex justify-between items-center mb-2">
            <span className="flex items-center gap-1.5 text-xs text-default-500 font-medium">
              <Icon icon={c.icon} className="w-4 h-4 opacity-70" />
              {t(c.labelKey)}
            </span>
            {c.diff && (
              <span className={`text-xs font-medium ${
                c.diff.sign === "up" ? "text-success" : c.diff.sign === "down" ? "text-danger" : "text-default-500"
              }`}>
                {c.diff.sign === "up" ? "↑" : c.diff.sign === "down" ? "↓" : "·"} {c.diff.text}
              </span>
            )}
          </div>
          <div className="text-3xl font-bold leading-tight font-feature-numeric-tnum">
            {c.value}
            {c.unit && <span className="text-sm font-normal text-default-500 ml-1">{c.unit}</span>}
          </div>
          <div className={`text-[11px] mt-1 ${c.subClass || "text-default-500"}`}>
            {c.sub}
          </div>
        </button>
      ))}
    </div>
  )
})
