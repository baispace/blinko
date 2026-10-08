import { makeAutoObservable } from "mobx"
import { Store } from "./standard/base"
import { api } from "@/lib/trpc"
import { PromiseState } from "./standard/PromiseState"

export type PeriodInput =
  | { type: "week" }
  | { type: "month"; value: string }
  | { type: "30d" }
  | { type: "90d" }
  | { type: "year" }
  | { type: "all" }
  | { type: "custom"; from: string; to: string }

export interface AnalyticsSnapshot {
  range: {
    type: string
    label: string
    start: string
    end: string
    hasPrev: boolean
  }
  typeBreakdown: {
    total: number
    note: number
    flash: number
    todo: number
    prev: { total: number; note: number; flash: number; todo: number } | null
  }
  wordStats: {
    rawTotal: number
    total: number
    avgPerActiveDay: number
    median: number
    activeDays: number
    longestNote: { id: number; title: string; length: number; createdAt: string } | null
    prev: {
      rawTotal: number
      total: number
      avgPerActiveDay: number
      activeDays: number
    } | null
  }
  dailyCount: Array<[string, number]>
  activeHours: number[]
  activeHourPeak: { hour: number; count: number }
  streak: {
    current: number
    longest: number
    longestMonth: string | null
  }
  tagCloud: Array<{
    name: string
    value: number
    children?: Array<{ name: string; value: number }>
  }>
  topTags: Array<{ name: string; count: number }>
  tagActivity: { months: string[]; tags: Array<{ tag: string; data: number[] }> }
  wordDistribution: Array<{ bucket: string; count: number }>
  review: {
    longestNote: { id: number; title: string; length: number; createdAt: string } | null
    newTags: Array<{ name: string; count: number }>
    todoCompletion: { total: number; completed: number; overdue: number }
    activeHourPeak: { hour: number; count: number }
  }
  allTimeRange: { earliest: string | null }
  typeByMonth: Array<{ month: string; note: number; flash: number; todo: number }>
}

export class AnalyticsStore implements Store {
  sid = "AnalyticsStore"
  period: PeriodInput = { type: "month", value: new Date().toISOString().slice(0, 7) }
  heatMetric: "count" | "words" = "count"
  heatRange: "6m" | "1y" | "all" = "1y"
  typeChartMode: "stack" | "group" | "100" = "stack"
  tagCloudMode: "all" | "period" = "all"
  topN: number = 5

  constructor() {
    makeAutoObservable(this)
  }

  setPeriod(period: PeriodInput) {
    this.period = period
    this.snapshot.call()
  }

  setHeatMetric(m: "count" | "words") { this.heatMetric = m }
  setHeatRange(r: "6m" | "1y" | "all") { this.heatRange = r }
  setTypeChartMode(m: "stack" | "group" | "100") { this.typeChartMode = m }
  setTagCloudMode(m: "all" | "period") { this.tagCloudMode = m }
  setTopN(n: number) { this.topN = n }

  snapshot = new PromiseState({
    function: async () => {
      const data = await api.analytics.snapshot.mutate({ period: this.period }) as AnalyticsSnapshot
      return data
    }
  })

  use() {
    // hook called in component; no-op
  }

  useEnsureLoaded() {
    // initial load if not loaded
    if (this.snapshot.isLoading === false && !this.snapshot.value && !this.snapshot.error) {
      this.snapshot.call()
    }
  }
}
