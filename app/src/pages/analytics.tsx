import React, { useEffect } from 'react'
import { observer } from "mobx-react-lite"
import { RootStore } from "@/store/root"
import { AnalyticsStore } from "@/store/analyticsStore"
import { useTranslation } from "react-i18next"
import { Icon } from '@/components/Common/Iconify/icons'
import { ScrollArea } from '@/components/Common/ScrollArea'
import { PeriodSwitcher } from '@/components/BlinkoAnalytics/PeriodSwitcher'
import { TldrCard } from '@/components/BlinkoAnalytics/TldrCard'
import { TypeCards } from '@/components/BlinkoAnalytics/TypeCards'
import { WordCards } from '@/components/BlinkoAnalytics/WordCards'
import { StreakCard } from '@/components/BlinkoAnalytics/StreakCard'
import { HourChart } from '@/components/BlinkoAnalytics/HourChart'
import { HeatMap } from '@/components/BlinkoAnalytics/HeatMap'
import { TagCloud } from '@/components/BlinkoAnalytics/TagCloud'
import { TagHeatmap } from '@/components/BlinkoAnalytics/TagHeatmap'
import { TopNTags } from '@/components/BlinkoAnalytics/TopNTags'
import { WordDistribution } from '@/components/BlinkoAnalytics/WordDistribution'
import { MonthlyReview } from '@/components/BlinkoAnalytics/MonthlyReview'
import { TypeChart } from '@/components/BlinkoAnalytics/TypeChart'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'

const Analytics = observer(() => {
  const store = RootStore.Get(AnalyticsStore)
  const { t } = useTranslation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!store.snapshot.value && !store.snapshot.loading.value) {
      store.snapshot.call()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const snap = store.snapshot.value
  const isLoading = store.snapshot.loading.value
  const error = store.snapshot.errMsg

  const typeJump = (filter: "all" | "note" | "flash" | "todo") => {
    const path = filter === "all" ? "all" : filter === "note" ? "notes" : filter === "flash" ? "blinko" : "todo"
    navigate(`/?path=${path}`)
  }

  if (error) {
    return (
      <ScrollArea className="px-6 md:p-6 mx-auto max-w-7xl">
        <div className="text-center py-20 text-default-500">
          <Icon icon="mdi:alert-circle" className="w-12 h-12 mx-auto mb-2 text-danger" />
          <p>{t("load-error")}: {error}</p>
          <button
            onClick={() => store.snapshot.call()}
            className="mt-4 px-4 py-1.5 bg-primary text-white rounded-lg text-sm"
          >
            {t("retry")}
          </button>
        </div>
      </ScrollArea>
    )
  }

  if (!snap) {
    return (
      <ScrollArea className="px-6 md:p-6 mx-auto max-w-7xl">
        <div className="text-center py-20 text-default-400 text-sm">
          {isLoading ? t("loading") : t("no-data")}
        </div>
      </ScrollArea>
    )
  }

  const compareLabel = snap.range.type === "month" ? "较上月" :
                       snap.range.type === "year" ? "较去年" :
                       snap.range.type === "week" ? "较上周" :
                       snap.range.type === "30d" ? "较上 30 天" :
                       snap.range.type === "90d" ? "较上 90 天" :
                       snap.range.type === "all" ? "" :
                       t("vs-last-period")

  return (
    <ScrollArea fixMobileTopBar className="px-4 md:px-6 space-y-4 md:space-y-6 md:p-6 mx-auto max-w-7xl">
      {/* Period switcher + range label */}
      <div>
        <PeriodSwitcher store={store} />
        <div className="flex items-center gap-2 mt-3 text-xs text-default-500 flex-wrap">
          <span className="font-medium text-foreground">{snap.range.label}</span>
          {snap.range.hasPrev && compareLabel && (
            <>
              <span>·</span>
              <span>{compareLabel}</span>
            </>
          )}
          <span style={{ marginLeft: "auto" }} className="px-2 py-0.5 rounded-md bg-default-100 text-default-600">
            共 {snap.typeBreakdown.total} 条 · {snap.wordStats.activeDays} 个活跃日
          </span>
        </div>
      </div>

      {/* TL;DR */}
      <TldrCard snapshot={snap} />

      {/* Type breakdown */}
      <div>
        <SectionLabel title={t("按类型")} meta={t("click-to-jump")} />
        <TypeCards data={snap.typeBreakdown} onJump={typeJump} />
      </div>

      {/* Word quality */}
      <div>
        <SectionLabel
          title={t("按字数")}
          meta={snap.wordStats.rawTotal !== snap.wordStats.total
            ? `${t("word-cleaned")} · 原始 ${snap.wordStats.rawTotal.toLocaleString("en-US")} → 净化 ${snap.wordStats.total.toLocaleString("en-US")}`
            : ""}
        />
        <WordCards data={snap.wordStats} />
      </div>

      {/* Behavior: streak + active hours */}
      <div>
        <SectionLabel title={t("behavior-feedback")} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StreakCard
            current={snap.streak.current}
            longest={snap.streak.longest}
            longestMonth={snap.streak.longestMonth}
          />
          <HourChart data={snap.activeHours} peak={snap.activeHourPeak} />
        </div>
      </div>

      {/* Writing calendar */}
      <div>
        <SectionLabel title={t("writing-calendar")} meta={t("点击格子查看当天记录")} />
        <HeatMap
          data={snap.dailyCount}
          range={store.heatRange}
          metric={store.heatMetric}
          title={t("heatMapTitle")}
          description={t("heatMapDescription")}
        />
      </div>

      {/* Type distribution by month */}
      <div>
        <SectionLabel title="类型分布" meta="过去 12 个月" />
        <TypeChart
          noteByMonth={snap.typeByMonth}
          mode={store.typeChartMode}
          onModeChange={(m) => store.setTypeChartMode(m)}
        />
      </div>

      {/* Tag section: cloud + activity + top N */}
      <div>
        <SectionLabel title={t("tag-cloud")} meta="点击下钻" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-content1 border border-default-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Icon icon="solar:tag-bold" className="w-4 h-4 text-default-500" />
                {t("tag-cloud")}
              </span>
              <div className="inline-flex bg-default-100 rounded-md p-0.5">
                <button
                  onClick={() => store.setTagCloudMode("all")}
                  className={`px-2.5 py-0.5 text-[11px] rounded ${store.tagCloudMode === "all" ? "bg-content1 shadow-sm" : "text-default-500"}`}
                >
                  全部时间
                </button>
                <button
                  onClick={() => store.setTagCloudMode("period")}
                  className={`px-2.5 py-0.5 text-[11px] rounded ${store.tagCloudMode === "period" ? "bg-content1 shadow-sm" : "text-default-500"}`}
                >
                  本周期
                </button>
              </div>
            </div>
            <TagCloud data={snap.tagCloud} />
            <div className="flex justify-between text-[11px] text-default-500 mt-2">
              <span>共 <strong className="text-foreground">{snap.topTags.length}</strong> 个标签 · 面积 ∝ 笔记数</span>
            </div>
          </div>
          <div className="bg-content1 border border-default-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Icon icon="solar:hashtag-line" className="w-4 h-4 text-default-500" />
                {t("tag-activity-heat")}
              </span>
              <span className="text-xs text-default-500">行=标签 · 列=月份</span>
            </div>
            <TagHeatmap data={snap.tagActivity} />
          </div>
        </div>
      </div>

      {/* Top N tags */}
      <TopNTags
        data={snap.topTags}
        topN={store.topN}
        onChangeTopN={(n) => store.setTopN(n)}
      />

      {/* Word distribution */}
      <WordDistribution
        data={snap.wordDistribution}
        median={snap.wordStats.median}
        avg={snap.wordStats.avgPerActiveDay}
      />

      {/* Monthly review */}
      <MonthlyReview data={snap.review} rangeLabel={snap.range.label} />
    </ScrollArea>
  )
})

const SectionLabel = ({ title, meta }: { title: string; meta?: string }) => (
  <div className="flex items-center justify-between text-xs text-default-500 font-medium uppercase tracking-wider mb-2.5">
    <span>{title}</span>
    {meta && <span className="text-default-400 normal-case tracking-normal font-normal">{meta}</span>}
  </div>
)

export default Analytics
