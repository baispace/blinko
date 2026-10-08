import React from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Icon } from "@/components/Common/Iconify/icons"

interface TypeBreakdown {
  total: number
  note: number
  flash: number
  todo: number
  prev: { total: number; note: number; flash: number; todo: number } | null
}

interface TypeCardsProps {
  data: TypeBreakdown
  onJump?: (filter: "all" | "note" | "flash" | "todo") => void
}

interface CardConfig {
  key: "total" | "note" | "flash" | "todo"
  labelKey: string
  icon: string
  color: string
  filter: "all" | "note" | "flash" | "todo"
  get: (d: TypeBreakdown) => number
  getPrev: (d: TypeBreakdown) => number
}

const CARDS: CardConfig[] = [
  { key: "total", labelKey: "type-records", icon: "solar:notes-minimalistic-bold-duotone", color: "text-foreground", filter: "all", get: d => d.total, getPrev: d => d.prev?.total ?? 0 },
  { key: "note",  labelKey: "type-notes",   icon: "solar:notes-bold",   color: "text-blue-500",   filter: "note",  get: d => d.note,  getPrev: d => d.prev?.note  ?? 0 },
  { key: "flash", labelKey: "type-flash",   icon: "mdi:lightning-bolt", color: "text-emerald-500", filter: "flash", get: d => d.flash, getPrev: d => d.prev?.flash ?? 0 },
  { key: "todo",  labelKey: "type-todo",    icon: "lucide:square-check", color: "text-amber-500",  filter: "todo",  get: d => d.todo,  getPrev: d => d.prev?.todo  ?? 0 },
]

function fmtNum(n: number): string {
  return n.toLocaleString("en-US")
}

function diff(curr: number, prev: number | null | undefined, hasPrev: boolean) {
  if (!hasPrev || prev === null || prev === undefined) return null
  const delta = curr - prev
  if (delta === 0) return { sign: "flat" as const, text: t => "0" }
  if (prev === 0) return { sign: delta > 0 ? "up" as const : "down" as const, text: t => delta > 0 ? "+1" : String(delta) }
  return {
    sign: delta > 0 ? "up" as const : "down" as const,
    text: t => (delta > 0 ? "+" : "") + String(delta),
  }
}

export const TypeCards = observer(({ data, onJump }: TypeCardsProps) => {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {CARDS.map(c => {
        const v = c.get(data)
        const pv = c.getPrev(data)
        const hasPrev = !!data.prev
        const d = diff(v, hasPrev ? pv : null, hasPrev)
        const prevLabel = hasPrev && pv > 0
          ? `${t("vs-last-period")} ${pv}`
          : hasPrev ? t("first-record") : t("diff-no-change")
        return (
          <button
            key={c.key}
            onClick={() => onJump?.(c.filter)}
            className="text-left bg-content1 border border-default-200 rounded-2xl p-4 shadow-sm hover:-translate-y-0.5 hover:shadow-md hover:border-primary/30 transition-all"
          >
            <div className="flex justify-between items-center mb-2">
              <span className={`flex items-center gap-1.5 text-xs text-default-500 font-medium`}>
                <Icon icon={c.icon} className={`w-4 h-4 ${c.color}`} />
                {t(c.labelKey)}
              </span>
              {d && (
                <span className={`text-xs font-medium ${
                  d.sign === "up" ? "text-success" : d.sign === "down" ? "text-danger" : "text-default-500"
                }`}>
                  {d.sign === "up" ? "↑" : d.sign === "down" ? "↓" : "·"} {d.text(t)}
                </span>
              )}
            </div>
            <div className="text-3xl font-bold leading-tight font-feature-numeric-tnum">
              {fmtNum(v)}<span className="text-sm font-normal text-default-500 ml-1">{t("type-records") === "Records" ? "" : "条"}</span>
            </div>
            <div className="text-[11px] text-default-500 mt-1">{prevLabel}</div>
          </button>
        )
      })}
    </div>
  )
})
