import { observer } from "mobx-react-lite"
import { RootStore } from "@/store/root"
import { AnalyticsStore } from "@/store/analyticsStore"
import { useTranslation } from "react-i18next"
import { HeatMap } from "@/components/BlinkoAnalytics/HeatMap"
import { StatsCards } from "@/components/BlinkoAnalytics/StatsCards"
import { Select, SelectItem } from "@nextui-org/react"
import { TagDistributionChart } from "@/components/BlinkoAnalytics/TagDistributionChart"
import dayjs from "dayjs"

const Analytics = observer(() => {
  const analyticsStore = RootStore.Get(AnalyticsStore)
  const { t } = useTranslation()
  analyticsStore.use()

  const currentMonth = dayjs().format("YYYY-MM")
  const last12Months = Array.from({ length: 12 }, (_, i) => {
    return dayjs().subtract(i, "month").format("YYYY-MM")
  })

  const data = analyticsStore.dailyNoteCount.value?.map(item => [
    item.date,
    item.count
  ] as [string, number]) ?? []

  const stats = analyticsStore.monthlyStats.value

  return (
    <div className="p-6 space-y-6 mx-auto max-w-7xl">
      <div className="w-72">
        <Select
          label={t('select-month')}
          defaultSelectedKeys={[currentMonth]}
          className="max-w-xs"
          size="sm"
          onChange={(e) => analyticsStore.setSelectedMonth(e.target.value)}
        >
          {last12Months.map((month) => (
            <SelectItem key={month} value={month}>
              {month}
            </SelectItem>
          ))}
        </Select>
      </div>

      <StatsCards stats={stats ?? {}} />

      <HeatMap
        data={data}
        title={t('heatMapTitle')}
        description={t('heatMapDescription')}
      />

      {stats?.tagStats && stats.tagStats.length > 0 && (
        <TagDistributionChart tagStats={stats.tagStats} />
      )}

    </div>
  )
})

export default Analytics