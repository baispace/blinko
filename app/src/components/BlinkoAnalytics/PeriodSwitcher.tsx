import React from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import dayjs from "dayjs"
import { Icon } from "@/components/Common/Iconify/icons"
import { Popover, PopoverTrigger, PopoverContent, Input, Button } from "@heroui/react"
import { AnalyticsStore, PeriodInput } from "@/store/analyticsStore"

interface PeriodSwitcherProps {
  store: AnalyticsStore
}

const PRESETS: Array<{ key: string; build: () => PeriodInput; labelKey: string }> = [
  { key: "week", build: () => ({ type: "week" }), labelKey: "period-week" },
  { key: "month", build: () => ({ type: "month", value: dayjs().format("YYYY-MM") }), labelKey: "period-month" },
  { key: "30d", build: () => ({ type: "30d" }), labelKey: "period-30d" },
  { key: "90d", build: () => ({ type: "90d" }), labelKey: "period-90d" },
  { key: "year", build: () => ({ type: "year" }), labelKey: "period-year" },
  { key: "all", build: () => ({ type: "all" }), labelKey: "period-all" },
]

function periodKey(p: PeriodInput): string {
  if (p.type === "month") return `month:${p.value}`
  return p.type
}

function labelFor(p: PeriodInput, t: (k: string) => string): string {
  if (p.type === "month") return p.value
  if (p.type === "custom") return `${p.from} → ${p.to}`
  return t(`period-${p.type}`)
}

export const PeriodSwitcher = observer(({ store }: PeriodSwitcherProps) => {
  const { t } = useTranslation()
  const currentKey = periodKey(store.period)

  const [customOpen, setCustomOpen] = React.useState(false)
  const [from, setFrom] = React.useState(dayjs().subtract(30, "day").format("YYYY-MM-DD"))
  const [to, setTo] = React.useState(dayjs().format("YYYY-MM-DD"))

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map(p => (
        <button
          key={p.key}
          className={`px-3.5 py-1.5 text-[13px] rounded-lg font-medium transition-colors ${
            currentKey === p.key
              ? "bg-primary/10 text-primary font-semibold"
              : "text-default-600 hover:text-foreground hover:bg-default-100"
          }`}
          onClick={() => store.setPeriod(p.build())}
        >
          {p.build().type === "month" && currentKey === p.key
            ? (store.period as any).value
            : t(p.labelKey)}
        </button>
      ))}
      <Popover isOpen={customOpen} onOpenChange={setCustomOpen} placement="bottom">
        <PopoverTrigger>
          <button
            className={`px-3.5 py-1.5 text-[13px] rounded-lg font-medium transition-colors ${
              currentKey === "custom"
                ? "bg-primary/10 text-primary font-semibold"
                : "text-default-600 hover:text-foreground hover:bg-default-100"
            }`}
          >
            {currentKey === "custom" ? labelFor(store.period, t) : t("period-custom")}
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-4 w-80">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-default-500">From</label>
              <Input type="date" size="sm" value={from} onValueChange={setFrom} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-default-500">To</label>
              <Input type="date" size="sm" value={to} onValueChange={setTo} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="light" onPress={() => setCustomOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                color="primary"
                onPress={() => {
                  store.setPeriod({ type: "custom", from, to })
                  setCustomOpen(false)
                }}
              >
                Apply
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
})
