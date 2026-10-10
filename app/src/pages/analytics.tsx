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
            className="mt-4 px-4 py-1.5 bg-primary text-white rounded-md text-sm hover:opacity-90 transition-opacity"
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
    <ScrollArea fixMobileTopBar className="px-4 md:px-6 py-4 md:py-6 mx-auto max-w-7xl">
      {/* 顶部：周期切换 + 范围信息（紧凑一行） */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-5">
        <div className="flex items-center gap-2 text-xs text-default-500 flex-wrap">
          <span className="font-medium text-foreground text-sm">{snap.range.label}</span>
          {snap.range.hasPrev && compareLabel && (
            <>
              <span className="text-default-300">·</span>
              <span>{compareLabel}</span>
            </>
          )}
          <span className="text-default-300">·</span>
          <span>共 {snap.typeBreakdown.total} 条 · {snap.wordStats.activeDays} 个活跃日</span>
        </div>
        <PeriodSwitcher store={store} />
      </div>

      {/* TL;DR */}
      <div className="mb-5">
        <TldrCard snapshot={snap} />
      </div>

      {/* 按类型 */}
      <section className="mb-5">
        <SectionLabel title={t("按类型")} meta={t("click-to-jump")} />
        <TypeCards data={snap.typeBreakdown} onJump={typeJump} />
      </section>

      {/* 按字数 */}
      <section className="mb-5">
        <SectionLabel
          title={t("按字数")}
          meta={snap.wordStats.rawTotal !== snap.wordStats.total
            ? `${t("word-cleaned")} · 原始 ${snap.wordStats.rawTotal.toLocaleString("en-US")} → 净化 ${snap.wordStats.total.toLocaleString("en-US")}`
            : ""}
        />
        <WordCards data={snap.wordStats} />
      </section>

      {/* 行为反馈 */}
      <section className="mb-5">
        <SectionLabel title={t("behavior-feedback")} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <StreakCard
            current={snap.streak.current}
            longest={snap.streak.longest}
            longestMonth={snap.streak.longestMonth}
          />
          <HourChart data={snap.activeHours} peak={snap.activeHourPeak} />
        </div>
      </section>

      {/* 写作日历 */}
      <section className="mb-5">
        <SectionLabel title={t("writing-calendar")} meta={t("点击格子查看当天记录")} />
        <HeatMap
          data={snap.dailyCount}
          range={store.heatRange}
          metric={store.heatMetric}
          title={t("heatMapTitle")}
          description={t("heatMapDescription")}
        />
      </section>

      {/* 类型分布 */}
      <section className="mb-5">
        <SectionLabel title="类型分布" meta="过去 12 个月" />
        <TypeChart
          noteByMonth={snap.typeByMonth}
          mode={store.typeChartMode}
          onModeChange={(m) => store.setTypeChartMode(m)}
        />
      </section>

      {/* 标签区 */}
      <section className="mb-5">
        <SectionLabel title={t("tag-cloud")} meta="点击下钻" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-default-200 bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Icon icon="solar:tag-bold" className="w-4 h-4 text-default-500" />
                {t("tag-cloud")}
              </span>
              <div className="inline-flex bg-default-100 rounded-md p-0.5">
                <button
                  onClick={() => store.setTagCloudMode("all")}
                  className={`px-2.5 py-0.5 text-[11px] rounded ${store.tagCloudMode === "all" ? "bg-card shadow-sm" : "text-default-500"}`}
                >
                  全部时间
                </button>
                <button
                  onClick={() => store.setTagCloudMode("period")}
                  className={`px-2.5 py-0.5 text-[11px] rounded ${store.tagCloudMode === "period" ? "bg-card shadow-sm" : "text-default-500"}`}
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
          <div className="rounded-lg border border-default-200 bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Icon icon="solar:hashtag-line" className="w-4 h-4 text-default-500" />
                {t("tag-activity-heat")}
              </span>
              <span className="text-xs text-default-500">行=标签 · 列=月份</span>
            </div>
            <TagHeatmap data={snap.tagActivity} />
          </div>
        </div>
      </section>

      {/* Top N 标签 */}
      <section className="mb-5">
        <TopNTags
          data={snap.topTags}
          topN={store.topN}
          onChangeTopN={(n) => store.setTopN(n)}
        />
      </section>

      {/* 字数分布 */}
      <section className="mb-5">
        <WordDistribution
          data={snap.wordDistribution}
          median={snap.wordStats.median}
          avg={snap.wordStats.avgPerActiveDay}
        />
      </section>

      {/* 月度复盘 */}
      <section className="mb-5">
        <MonthlyReview data={snap.review} rangeLabel={snap.range.label} />
      </section>
    </ScrollArea>
  )
})

/**
 * Notion+shadcn 风格的章节标题：
 * - 11px uppercase tracking-[0.04em] muted 色（与侧边栏章节标题一致）
 * - 右侧可选 meta 说明（小一号非 uppercase）
 * - 底部 4-5 gap 与下方内容分隔（不用 border 拉线）
 */
const SectionLabel = ({ title, meta }: { title: string; meta?: string }) => (
  <div className="flex items-center justify-between text-[11px] font-medium tracking-[0.04em] uppercase text-default-400 mb-3">
    <span>{title}</span>
    {meta && <span className="text-xs text-default-400 normal-case tracking-normal font-normal">{meta}</span>}
  </div>
)

export default Analytics