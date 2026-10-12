import { useCallback, useRef, useState } from 'react'
import type { IncomeAverage } from '../data/incomeAverage'
import { formatMonthShort } from '../lib/dates'
import { formatCompactMoney, formatMoney, formatPercent, signOf } from '../lib/money'
import { useIsDesktop } from '../lib/useIsDesktop'
import { useI18n } from '../i18n/I18nProvider'
import { IncomeFilterPill, IncomeFilterPopover, IncomeFilterSheet } from './IncomeFilter'

/**
 * Renda média, the app's reference income, inside Tendências: the monthly
 * average of the complete months, counting the income categories chosen with
 * the pill, its lowest and highest months, and how the current month
 * compares. The chart above draws it as a dashed line.
 */
export function IncomeAverageBlock({ average }: { average: IncomeAverage }) {
  const { t } = useI18n()
  const a = t.overview.avgIncome
  const desktop = useIsDesktop()
  const [picking, setPicking] = useState(false)
  const pill = useRef<HTMLButtonElement>(null)
  const closePicker = useCallback(() => setPicking(false), [])
  const current = average.currentMonth
  const above = current.vsAverage >= 0
  const pct = `${signOf(above ? 1 : -1)}${formatPercent(Math.abs(current.vsAverage), 1)}`

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] leading-[18px] text-muted">{a.title}</span>
        <div className="relative flex flex-col">
          <IncomeFilterPill onOpen={() => setPicking((p) => !p)} pillRef={pill} expanded={picking} />
          {picking && desktop && <IncomeFilterPopover currentMonth={current.month} onClose={closePicker} returnTo={pill} />}
        </div>
      </div>
      {picking && !desktop && <IncomeFilterSheet currentMonth={current.month} onClose={closePicker} returnTo={pill} />}
      <div className="flex items-baseline gap-1">
        <span className="tabular text-[22px] leading-7 font-bold tracking-[-0.01em] text-ink">{formatMoney(average.average)}</span>
        <span className="text-sm text-muted">{a.perMonth}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="tabular text-xs leading-4 text-ink-2">
          {a.range(formatCompactMoney(average.lowest.total), formatMonthShort(average.lowest.month), formatCompactMoney(average.highest.total), formatMonthShort(average.highest.month))}
        </span>
        <span className="tabular text-xs leading-4 text-muted">
          {/* Early in the month nothing may have come in yet: a "−100%" would only alarm. */}
          {current.total > 0 ? a.current(formatMoney(current.total), pct, above) : a.currentNone(formatMoney(0))}
        </span>
      </div>
    </div>
  )
}
