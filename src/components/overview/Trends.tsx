import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useData } from '../../state'
import { useI18n } from '../../i18n/I18nProvider'
import { expensesByCategory, inMonth, totals, visible } from '../../lib/summary'
import { incomeAverage, NO_FILTER } from '../../data/incomeAverage'
import { formatMonthShort, lastMonths, monthKey } from '../../lib/dates'
import { formatCompactMoney, formatPercent } from '../../lib/money'
import { messages } from '../../i18n/messages'
import { Card, RangeSwitcher, Swatch, parseRange, type Range } from '../ui'
import { CashFlowChart, StackedMonthChart, seriesColor } from '../charts'
import { catVar } from '../CategoryBadge'
import { Icon } from '../Icon'
import { IncomeAverageBlock } from '../AverageIncome'
import { BlockLabel, CardHeader } from './parts'

const TOP_CATEGORIES = 5

/**
 * Tendências: the months before, over the period chosen (3 or 6 months, or
 * a year; ?r= in the address). Income vs expenses per month with Renda
 * média as a dashed line (its block below: the value, its filter, its
 * range), the average share of income kept, and spending by category (top
 * 5 and "Outros"). Months before the data starts are dashed, with a note.
 */
export function TrendsCard({ className = '' }: { className?: string }) {
  const { allTransactions, transactions, categories, subcategories, incomeFilter, categoriesById, storedMonths, today } = useData()
  const { t, categoryName } = useI18n()
  const o = t.overview
  const tr = o.trends
  const [params, setParams] = useSearchParams()
  const latest = monthKey(today)
  const range = parseRange(params.get('r'))
  const months = useMemo(() => lastMonths(latest, range), [latest, range])
  const setRange = (r: Range) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        next.set('r', String(r))
        return next
      },
      { replace: true },
    )

  // Hidden transactions count nowhere here.
  const counted = useMemo(() => visible(allTransactions), [allTransactions])
  const firstMonth = storedMonths[0] ?? latest
  const shortHistory = months[0] < firstMonth
  const empty = months.map((m) => m < firstMonth)
  const flow = useMemo(
    () => months.map((m) => ({ month: m, label: formatMonthShort(m), empty: m < firstMonth, ...totals(inMonth(counted, m), categoriesById) })),
    [counted, categoriesById, months, firstMonth],
  )
  // Renda média: the last 6 complete months, under the filter chosen on its pill (src/data/incomeAverage.ts).
  const avgIncome = useMemo(() => incomeAverage(transactions, categories, subcategories, incomeFilter ?? NO_FILTER, latest), [transactions, categories, subcategories, incomeFilter, latest])
  // The share of income kept over the period's complete months with data.
  const complete = flow.filter((f) => !f.empty && f.month !== latest)
  const income = complete.reduce((s, f) => s + f.income, 0)
  const keptPct = income > 0 ? (complete.reduce((s, f) => s + f.net, 0) / income) * 100 : null

  // Spending by category: the period's top categories, the rest folded into "Outros".
  const periodByCategory = expensesByCategory(
    counted.filter((tx) => monthKey(tx.date) >= months[0]),
    categoriesById,
  )
  const top = periodByCategory.slice(0, TOP_CATEGORIES)
  const series = [
    ...top.map((c) => ({ key: c.category?.id ?? 'none', name: categoryName(c.category) })),
    ...(periodByCategory.length > TOP_CATEGORIES ? [{ key: 'other', name: t.other }] : []),
  ]
  const data = months.map((m) => {
    const row: Record<string, number | string> = { label: formatMonthShort(m) }
    for (const c of expensesByCategory(inMonth(counted, m), categoriesById)) {
      const id = c.category?.id ?? 'none'
      const key = top.some((x) => (x.category?.id ?? 'none') === id) ? id : 'other'
      row[key] = Number(row[key] ?? 0) + c.amount
    }
    return row
  })
  // Each category in its own colour; uncategorized in muted; the rest share "Outros".
  const colors = series.map((s) => (s.key === 'other' ? seriesColor(5) : s.key === 'none' ? 'var(--muted)' : catVar(categoriesById.get(s.key)?.color ?? 'slate')))

  return (
    <Card className={`flex flex-col gap-4 ${className}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={tr.title} subtitle={spanLabel(months)} />
        <div className="lg:w-[330px]">
          <RangeSwitcher value={range} onChange={setRange} />
        </div>
      </div>
      {shortHistory && (
        <p className="-mt-1 flex items-start gap-2 text-[13px] leading-[18px] text-ink-2">
          <Icon name="info" className="mt-px size-4 shrink-0" />
          {o.shortHistory(`${formatMonthShort(firstMonth)} ${firstMonth.slice(0, 4)}`)}
        </p>
      )}

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:gap-8">
        <div className="flex min-w-0 flex-col gap-3">
          <BlockLabel>{o.incomeVsExpenses}</BlockLabel>
          <div data-legend className="-mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
            <Legend swatch={<Swatch color="var(--income)" />}>{t.income}</Legend>
            <Legend swatch={<Swatch color="var(--ink-2)" />}>{t.expenses}</Legend>
            {avgIncome && <Legend swatch={<span aria-hidden className="w-3 border-t-[1.5px] border-dashed border-ink-2" />}>{tr.legendAvg}</Legend>}
          </div>
          <CashFlowChart
            data={flow}
            label={o.incomeVsExpenses}
            reference={avgIncome ? { value: avgIncome.average, label: tr.avgLine(formatCompactMoney(avgIncome.average)) } : undefined}
          />
          {(avgIncome || keptPct !== null) && (
            <div className="flex flex-col gap-3 border-t border-line pt-3 sm:grid sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] sm:gap-4">
              {avgIncome && <IncomeAverageBlock average={avgIncome} />}
              {keptPct !== null && (
                <div className="flex flex-col gap-1.5 sm:border-l sm:border-line sm:pl-4">
                  <span className="text-[13px] leading-[18px] text-muted">{tr.keptLabel}</span>
                  <span className={`tabular text-[22px] leading-7 font-bold tracking-[-0.01em] ${keptPct >= 0 ? 'text-ink' : 'text-critical'}`}>{formatPercent(keptPct)}</span>
                  <span className="text-xs leading-4 text-muted">{tr.keptSub}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3 border-t border-line pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          <BlockLabel>{o.spendingByCategory}</BlockLabel>
          <StackedMonthChart data={data} series={series} colors={colors} label={o.spendingByCategory} months={months} empty={empty} />
          <ul data-legend className="flex flex-wrap gap-x-3.5 gap-y-2">
            {series.map((s, i) => (
              <li key={s.key}>
                <Legend swatch={<Swatch color={colors[i]} />}>{s.name}</Legend>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  )
}

function Legend({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] leading-[18px] text-ink-2">
      {swatch}
      {children}
    </span>
  )
}

/** "abr. a set. 2026" within a year; "out. 2025 a set. 2026" across two. */
function spanLabel(months: string[]): string {
  const first = months[0]
  const last = months[months.length - 1]
  const sameYear = first.slice(0, 4) === last.slice(0, 4)
  return messages.overview.span(sameYear ? formatMonthShort(first) : `${formatMonthShort(first)} ${first.slice(0, 4)}`, `${formatMonthShort(last)} ${last.slice(0, 4)}`)
}
