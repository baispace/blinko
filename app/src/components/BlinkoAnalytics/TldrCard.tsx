import React from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Icon } from "@/components/Common/Iconify/icons"
import type { AnalyticsSnapshot } from "@/store/analyticsStore"

interface TldrCardProps {
  snapshot: AnalyticsSnapshot
}

function fmtNum(n: number): string {
  if (n >= 1000) return n.toLocaleString("en-US")
  return String(n)
}

function pct(curr: number, prev: number | null | undefined): { sign: "up" | "down" | "flat"; text: string } | null {
  if (prev === null || prev === undefined) return null
  if (prev === 0 && curr === 0) return { sign: "flat", text: "0%" }
  if (prev === 0) return { sign: "up", text: "新" }
  const diff = ((curr - prev) / prev) * 100
  if (Math.abs(diff) < 0.5) return { sign: "flat", text: "0%" }
  return {
    sign: diff > 0 ? "up" : "down",
    text: `${diff > 0 ? "+" : ""}${Math.round(diff)}%`,
  }
}

export const TldrCard = observer(({ snapshot }: TldrCardProps) => {
  const { t } = useTranslation()
  const { typeBreakdown, wordStats, review, activeHourPeak, range } = snapshot
  const noteDiff = pct(typeBreakdown.total, typeBreakdown.prev?.total)
  const wordDiff = pct(wordStats.total, wordStats.prev?.total)
  const longest = review.longestNote
  const peakHour = activeHourPeak.count > 0
    ? `${String(activeHourPeak.hour).padStart(2, "0")}:00-${String((activeHourPeak.hour + 1) % 24).padStart(2, "0")}:00`
    : null

  if (typeBreakdown.total === 0) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-lg bg-card border border-default-200 ">
        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
          <Icon icon="solar:ai-line" className="w-5 h-5" />
        </div>
        <div className="text-sm leading-relaxed flex-1">
          {t("empty-period")} · <span className="text-primary cursor-pointer">{t("empty-period-cta")} →</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 p-4 rounded-lg bg-card border border-default-200 ">
      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
        <Icon icon="solar:ai-line" className="w-5 h-5" />
      </div>
      <div className="text-sm leading-relaxed flex-1">
        <strong className="text-primary font-semibold">
          {range.label} {t("type-records")} {typeBreakdown.total} {t("type-records") === "Records" ? "" : "条"}
        </strong>
        {noteDiff && (
          <span className={`ml-1 ${noteDiff.sign === "up" ? "text-success" : noteDiff.sign === "down" ? "text-danger" : "text-default-500"}`}>
            {noteDiff.sign === "up" ? "↑" : noteDiff.sign === "down" ? "↓" : "·"} {t("vs-last-period")} {noteDiff.text}
          </span>
        )}
        {wordDiff && wordStats.total > 0 && (
          <span>，{t("total-words")} {t("vs-last-period")} <strong className={wordDiff.sign === "up" ? "text-success" : wordDiff.sign === "down" ? "text-danger" : ""}>{wordDiff.text}</strong></span>
        )}
        {longest && (
          <>
            {"，"}<strong className="text-foreground">{t("review-longest")}「{longest.title}」</strong>
            <span className="text-default-500"> ({fmtNum(longest.length)} {t("total-words").slice(0, 2)})</span>
          </>
        )}
        {peakHour && (
          <span>，{t("review-peak-hour")} <strong className="text-primary">{peakHour}</strong></span>
        )}
        {"。"}
      </div>
    </div>
  )
})
