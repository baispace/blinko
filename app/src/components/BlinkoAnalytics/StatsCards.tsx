import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Icon } from '@/components/Common/Iconify/icons'

interface StatsCardsProps {
  stats: {
    noteCount?: number
    totalWords?: number
    maxDailyWords?: number
    activeDays?: number
  }
}

/**
 * Notion+shadcn 风格的统计卡：
 * - 纯 `bg-card` + `border-default-200` + `rounded-lg`，无 shadow、无圆胖
 * - 大字号数字用 `text-foreground font-semibold tabular-nums`，不用渐变（更接近 Notion）
 * - 图标小、置顶 label 11px tracking-wide muted
 */
interface StatCardProps {
  label: string
  value: number
  icon: string
}

const StatCard = ({ label, value, icon }: StatCardProps) => (
  <div className="rounded-lg border border-default-200 bg-card p-4 flex flex-col gap-2">
    <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.04em] uppercase text-default-400">
      <Icon icon={icon} className="w-3.5 h-3.5" />
      <span>{label}</span>
    </div>
    <div className="text-3xl font-semibold text-foreground tabular-nums leading-none">
      {value.toLocaleString("en-US")}
    </div>
  </div>
)

export const StatsCards = observer(({ stats }: StatsCardsProps) => {
  const { t } = useTranslation()
  const statItems = [
    { label: t('note-count'), value: stats?.noteCount ?? 0, icon: 'ri:file-list-3-line' },
    { label: t('total-words'), value: stats?.totalWords ?? 0, icon: 'ri:file-text-line' },
    { label: t('max-daily-words'), value: stats?.maxDailyWords ?? 0, icon: 'ri:line-chart-line' },
    { label: t('active-days'), value: stats?.activeDays ?? 0, icon: 'ri:calendar-check-line' },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {statItems.map((item) => (
        <StatCard key={item.label} {...item} />
      ))}
    </div>
  )
})