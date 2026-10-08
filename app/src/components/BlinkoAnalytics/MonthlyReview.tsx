import React from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import dayjs from "dayjs"
import { Icon } from "@/components/Common/Iconify/icons"

interface ReviewData {
  longestNote: { id: number; title: string; length: number; createdAt: string } | null
  newTags: Array<{ name: string; count: number }>
  todoCompletion: { total: number; completed: number; overdue: number }
  activeHourPeak: { hour: number; count: number }
}

interface MonthlyReviewProps {
  data: ReviewData
  rangeLabel?: string
}

export const MonthlyReview = observer(({ data, rangeLabel }: MonthlyReviewProps) => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const peakHourText = data.activeHourPeak.count > 0
    ? `${String(data.activeHourPeak.hour).padStart(2, "0")}:00-${String((data.activeHourPeak.hour + 1) % 24).padStart(2, "0")}:00`
    : null
  const completionPct = data.todoCompletion.total > 0
    ? Math.round((data.todoCompletion.completed / data.todoCompletion.total) * 100)
    : 0

  const rows: Array<{
    icon: any
    iconBg: string
    iconColor: string
    title: string
    desc: string
    onClick?: () => void
  }> = []

  if (data.longestNote) {
    rows.push({
      icon: <Icon icon="solar:bookmark-bold" className="w-4 h-4" />,
      iconBg: "rgba(59,130,246,0.1)",
      iconColor: "#3b82f6",
      title: `${t("review-longest")}：${data.longestNote.title}`,
      desc: `${data.longestNote.length.toLocaleString("en-US")} 字 · ${dayjs(data.longestNote.createdAt).format("MM-DD")}`,
      onClick: () => navigate(`/detail?id=${data.longestNote!.id}`),
    })
  }
  if (data.newTags.length > 0) {
    rows.push({
      icon: <Icon icon="solar:hashtag-line" className="w-4 h-4" />,
      iconBg: "rgba(16,185,129,0.1)",
      iconColor: "#10b981",
      title: `${t("review-new-tags")}：${data.newTags.map(t => t.name).slice(0, 4).join(" · ")}${data.newTags.length > 4 ? " …" : ""}`,
      desc: `本周期首次出现 · 共 ${data.newTags.length} 个`,
    })
  }
  if (data.todoCompletion.total > 0) {
    rows.push({
      icon: <Icon icon="lucide:square-check" className="w-4 h-4" />,
      iconBg: "rgba(245,158,11,0.1)",
      iconColor: "#f59e0b",
      title: `${t("review-completion")}：待办 ${data.todoCompletion.completed} / ${data.todoCompletion.total} = ${completionPct}%`,
      desc: data.todoCompletion.overdue > 0
        ? `${data.todoCompletion.overdue} 个待办待完成`
        : `全部按时完成`,
    })
  }
  if (peakHourText) {
    rows.push({
      icon: <Icon icon="solar:clock-circle-bold" className="w-4 h-4" />,
      iconBg: "rgba(244,63,94,0.1)",
      iconColor: "#f43f5e",
      title: `${t("review-peak-hour")}：${peakHourText}`,
      desc: `本周期 ${data.activeHourPeak.count} 条都在这个时段`,
    })
  }

  if (rows.length === 0) {
    return null
  }

  return (
    <div className="bg-content1 border border-default-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Icon icon="solar:bookmark-bold" className="w-4 h-4 text-amber-500" />
          {t("monthly-review")}
        </span>
        <span className="text-xs text-default-500">{rangeLabel}</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {rows.map((row, i) => (
          <div
            key={i}
            onClick={row.onClick}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-default-50 transition-colors ${row.onClick ? "cursor-pointer hover:bg-primary/5" : ""}`}
          >
            <div
              className="w-8 h-8 rounded-lg grid place-items-center shrink-0"
              style={{ background: row.iconBg, color: row.iconColor }}
            >
              {row.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium truncate">{row.title}</div>
              <div className="text-[11px] text-default-500 mt-0.5">{row.desc}</div>
            </div>
            {row.onClick && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-default-400 shrink-0"><polyline points="9 18 15 12 9 6"/></svg>
            )}
          </div>
        ))}
      </div>
    </div>
  )
})
