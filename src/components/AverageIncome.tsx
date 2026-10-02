import type { Cents } from '../data/types'
import type { AverageIncome as Average } from '../lib/summary'
import { formatMonthShort } from '../lib/dates'
import { formatCompactMoney, formatMoney, formatPercent } from '../lib/money'
import { useI18n } from '../i18n/I18nProvider'
import { CardTitle } from './ui'

/**
 * Average income: the monthly average (complete months), lowest and highest
 * months, how the current month compares, and a bar per month with a dashed
 * average line. Phones stack it; desktop puts the figures beside the chart.
 */
export function AverageIncomeCard({ average, perMonth }: { average: Average; perMonth: { month: string; income: Cents }[] }) {
  const { t } = useI18n()
  const a = t.overview.avgIncome
  const scale = Math.max(1, average.average, ...perMonth.map((m) => m.income)) * 1.15
  const last = perMonth.length - 1
  const above = average.current.vsAverage >= 0
  const pct = `${above ? '+' : '−'}${formatPercent(Math.abs(average.current.vsAverage), 1)}`
  const avgShare = average.average / scale

  return (
    <div className="flex flex-col gap-3.5 lg:flex-row lg:gap-8">
      <div className="flex flex-col gap-3.5 lg:w-[360px] lg:shrink-0">
        <CardTitle subtitle={a.sub(average.months)}>{a.title}</CardTitle>
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-1">
            <span className="tabular text-[30px] leading-9 font-bold tracking-[-0.02em] text-ink lg:text-[34px] lg:leading-10">{formatMoney(average.average)}</span>
            <span className="text-sm text-muted">{a.perMonth}</span>
          </div>
          <span className="tabular text-[13px] leading-[18px] text-ink-2">
            {a.range(
              formatCompactMoney(average.lowest.amount),
              formatMonthShort(average.lowest.month),
              formatCompactMoney(average.highest.amount),
              formatMonthShort(average.highest.month),
            )}
          </span>
          <span className="tabular text-[13px] leading-[18px] text-muted">
            {/* Early in the month nothing may have come in yet: a "−100%" would only alarm. */}
            {average.current.amount > 0 ? a.current(formatMoney(average.current.amount), pct, above) : a.currentNone(formatMoney(0))}
          </span>
        </div>
      </div>

      {/* Bars grow from the baseline; the dashed line is the average. */}
      <div role="img" aria-label={a.chart(formatMoney(average.average))} className="relative h-[168px] lg:h-[270px] lg:min-w-0 lg:flex-1 lg:self-end">
        <div className="absolute inset-x-0 bottom-6 h-px bg-line" />
        <div className="absolute inset-x-0 top-0 bottom-[25px] flex items-end lg:right-24">
          {perMonth.map((m, i) => (
            <div key={m.month} className="flex h-full flex-1 items-end justify-center">
              <div
                className={`w-[26px] rounded-t-[4px] bg-income lg:w-11 ${i === last ? '' : 'opacity-60'}`}
                style={{ height: `${(m.income / scale) * 100}%` }}
              />
            </div>
          ))}
        </div>
        <div className="absolute inset-x-0 border-t-[1.5px] border-dashed border-ink-2" style={{ bottom: `calc(25px + (100% - 25px) * ${avgShare})` }} />
        <span
          className="tabular absolute right-0 rounded-[6px] bg-surface px-1.5 py-px text-[11px] leading-[14px] font-medium text-ink lg:px-2 lg:py-0.5 lg:text-xs lg:leading-4"
          style={{ bottom: `calc(28px + (100% - 25px) * ${avgShare})` }}
        >
          {a.avgLabel(formatCompactMoney(average.average))}
        </span>
        <div className="absolute inset-x-0 bottom-0 flex h-5 lg:right-24" aria-hidden>
          {perMonth.map((m, i) => (
            <span key={m.month} className={`flex-1 text-center text-[11px] leading-5 lg:text-xs ${i === last ? 'font-medium text-ink' : 'text-muted'}`}>
              {formatMonthShort(m.month)}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
