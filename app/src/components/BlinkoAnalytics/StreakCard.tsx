import React from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Icon } from "@/components/Common/Iconify/icons"
import dayjs from "dayjs"

interface StreakCardProps {
  current: number
  longest: number
  longestMonth: string | null
  goal?: number
}

export const StreakCard = observer(({ current, longest, longestMonth, goal = 5 }: StreakCardProps) => {
  const { t } = useTranslation()
  const pct = Math.min(100, Math.round((current / goal) * 100))
  const monthLabel = longestMonth ? dayjs(longestMonth + "-01").format("YYYY-MM") : "—"

  return (
    <div className="bg-card border border-default-200 rounded-lg p-5  flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Icon icon="mdi:lightning-bolt" className="w-4 h-4 text-amber-500" />
          {t("streak-current")}
        </span>
        <span className="text-xs text-default-500">{t("goal-days", { count: goal })}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl">🔥</span>
        <span className="text-3xl font-bold font-feature-numeric-tnum">{current}</span>
        <span className="text-sm text-default-500 ml-1">天</span>
      </div>
      <div className="text-xs text-default-500 -mt-2">当前连续</div>

      <div className="flex justify-between text-xs">
        <span className="text-default-500">{t("streak-longest")}</span>
        <span className="font-semibold text-foreground">{longest} 天 {longest > 0 && <span className="text-default-400">({monthLabel})</span>}</span>
      </div>

      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-default-500">{t("streak-goal")}完成度</span>
          <span className="font-semibold text-foreground">{current} / {goal} = {pct}%</span>
        </div>
        <div className="h-2 bg-default-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {current < goal && current > 0 && (
        <div className="text-xs text-default-500 -mt-1">
          💡 距离本月目标还差 <strong className="text-foreground">{goal - current} 天</strong>
        </div>
      )}
    </div>
  )
})
