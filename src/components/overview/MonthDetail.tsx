import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../../state'
import { useI18n } from '../../i18n/I18nProvider'
import { expensesByCategory, inMonth, totals, visible } from '../../lib/summary'
import { formatDay, formatMonthName, monthKey } from '../../lib/dates'
import { formatCompactMoney, formatMoney, formatPercent, formatWholeMoney, signOf } from '../../lib/money'
import type { Transaction } from '../../data/types'
import { Card, Progress, SeeAll } from '../ui'
import { CategoryBadge, catVar } from '../CategoryBadge'
import { TransactionRow } from '../TransactionRow'
import { BlockLabel, CardHeader, HeaderLink } from './parts'

const TOP_CATEGORIES = 5

/**
 * Mês em detalhe: the month in progress so far. What came in, went out and
 * the month's balance, the largest categories (each opens its
 * transactions) and the latest transactions. The months before are the
 * Fechamento do mês's ("Meses anteriores").
 */
export function MonthDetailCard({ onSelect, className = '' }: { onSelect(tx: Transaction): void; className?: string }) {
  const { allTransactions, categoriesById, today } = useData()
  const { t, categoryName } = useI18n()
  const o = t.overview
  const d = o.monthDetail
  const month = monthKey(today)
  const txs = useMemo(() => inMonth(visible(allTransactions), month), [allTransactions, month])
  const sums = totals(txs, categoriesById)
  const top = expensesByCategory(txs, categoriesById).slice(0, TOP_CATEGORIES)
  const keptPct = sums.income > 0 ? (sums.net / sums.income) * 100 : null

  return (
    <Card className={`flex flex-col gap-3 !pb-2 lg:!pb-5 ${className}`}>
      <CardHeader title={o.monthInDetail} subtitle={d.sub(formatMonthName(month), formatDay(today))} action={<HeaderLink to="/month-close">{d.previous}</HeaderLink>} />
      <div className="grid grid-cols-3 gap-2 lg:gap-3">
        <Tile label={t.income} value={whole(sums.income)} tone="text-income" />
        <Tile label={t.expenses} value={whole(-sums.expenses)} tone="text-ink" />
        <Tile label={t.net} value={whole(sums.net)} tone={sums.net >= 0 ? 'text-ink' : 'text-critical'} />
      </div>
      {keptPct !== null && <p className="tabular -mt-1 text-xs leading-4 text-muted">{d.kept(formatPercent(keptPct))}</p>}

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-8">
        <div className="flex flex-col">
          <BlockLabel>{o.topCategories}</BlockLabel>
          {top.length === 0 && <p className="py-2 text-sm text-muted">{o.noExpenses}</p>}
          {top.map(({ category, amount }) => {
            const share = sums.expenses > 0 ? (amount / sums.expenses) * 100 : 0
            const key = category?.id ?? 'none'
            return (
              <Link key={key} to={`/transactions?m=${month}&c=${key}`} className="-mx-1 flex min-h-14 items-center gap-3 rounded-sm px-1 active:bg-track lg:hover:bg-track">
                <CategoryBadge category={category ?? null} size={32} />
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[15px] text-ink lg:text-sm">{categoryName(category)}</span>
                    <span className="tabular text-[15px] font-medium whitespace-nowrap text-ink lg:text-sm">{formatMoney(amount)}</span>
                  </span>
                  <Progress value={share} height={6} tone={category ? catVar(category.color) : 'var(--muted)'} />
                </span>
              </Link>
            )
          })}
        </div>

        <div className="flex flex-col">
          <BlockLabel
            action={
              <Link to={`/transactions?m=${month}`} className="hidden text-[13px] font-medium text-accent hover:underline lg:inline">
                {t.seeAll}
              </Link>
            }
          >
            {o.latestTransactions}
          </BlockLabel>
          <div className="lg:divide-y lg:divide-line">
            {txs.slice(0, 5).map((tx) => (
              <TransactionRow key={tx.id} tx={tx} onSelect={onSelect} showDate className="lg:min-h-[52px]" />
            ))}
          </div>
          <div className="lg:hidden">
            <SeeAll to={`/transactions?m=${month}`}>{t.seeAll}</SeeAll>
          </div>
        </div>
      </div>
    </Card>
  )
}

/** A figure in whole reais, signed: "+R$ 6.800"; from R$ 10 mil, compact ("+R$ 12,5 mil") to fit three across. */
const whole = (cents: number) => `${signOf(cents)}${Math.abs(cents) >= 10_000_00 ? formatCompactMoney(Math.abs(cents)) : formatWholeMoney(Math.abs(cents))}`

function Tile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-md bg-page px-2 py-2 min-[400px]:px-2.5 lg:px-3">
      <span className="truncate text-xs leading-4 text-muted">{label}</span>
      <span className={`tabular truncate text-[15px] leading-5 font-bold ${tone}`}>{value}</span>
    </div>
  )
}
