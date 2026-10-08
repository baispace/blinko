import React from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

interface TopNTagsProps {
  data: Array<{ name: string; id: number; count: number }>
  topN?: number
  onChangeTopN?: (n: number) => void
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#6366f1", "#f43f5e", "#8b5cf6", "#06b6d4", "#84cc16"]

export const TopNTags = observer(({ data, topN = 5, onChangeTopN }: TopNTagsProps) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const sorted = [...data].sort((a, b) => b.count - a.count)
  const visible = sorted.slice(0, topN)
  const rest = sorted.slice(topN)
  const restSum = rest.reduce((s, x) => s + x.count, 0)
  const max = visible[0]?.count || 1
  const totalCount = sorted.reduce((s, x) => s + x.count, 0)

  return (
    <div className="bg-content1 border border-default-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-default-500"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          本周期标签排名
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-default-500">{totalCount} 条 · {sorted.length} 个</span>
          {onChangeTopN && (
            <div className="inline-flex bg-default-100 rounded-md p-0.5">
              {[3, 5, 8, 10].map(n => {
                const disabled = n > sorted.length
                return (
                  <button
                    key={n}
                    onClick={() => !disabled && onChangeTopN(n)}
                    disabled={disabled}
                    className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                      topN === n
                        ? "bg-content1 shadow-sm text-foreground"
                        : disabled
                          ? "text-default-300 cursor-not-allowed"
                          : "text-default-500 hover:text-foreground"
                    }`}
                  >
                    Top {n}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center text-sm text-default-400 py-8">{t("no-tags")}</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {visible.map((row, i) => (
            <div
              key={row.id}
              onClick={() => row.id && navigate(`/?path=notes&tagId=${row.id}`)}
              className="grid grid-cols-[24px_120px_1fr_60px] gap-3 items-center px-2 py-1.5 rounded-md cursor-pointer hover:bg-default-100 transition-colors"
            >
              <span className="text-xs text-default-500 font-semibold text-center">{i + 1}</span>
              <span className="text-[13px] font-medium truncate">#{row.name}</span>
              <div className="h-2 bg-default-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(row.count / max) * 100}%`,
                    background: COLORS[i % COLORS.length],
                  }}
                />
              </div>
              <span className="text-xs text-default-500 text-right font-feature-numeric-tnum">{row.count} 条</span>
            </div>
          ))}
          {rest.length > 0 && (
            <div className="grid grid-cols-[24px_120px_1fr_60px] gap-3 items-center px-2 py-1.5">
              <span className="text-xs text-default-400 text-center">…</span>
              <span className="text-[13px] text-default-500 truncate">其他 {rest.length} 个</span>
              <div className="h-2 bg-default-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-default-300"
                  style={{ width: `${(restSum / max) * 100}%` }}
                />
              </div>
              <span className="text-xs text-default-400 text-right font-feature-numeric-tnum">{restSum} 条</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
})
