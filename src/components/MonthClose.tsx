import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../state'
import { useI18n } from '../i18n/I18nProvider'
import { monthClose, type MonthClose } from '../data/monthClose'
import type { BalanceStatus } from '../data/spendingBalance'
import { formatMonthName } from '../lib/dates'
import { formatMoney, formatPercent } from '../lib/money'
import { Card } from './ui'
import { Icon } from './Icon'

/** The summary of `month` from the data loaded (null: nothing counted in it). */
export function useMonthClose(month: string): MonthClose | null {
  const { allTransactions, categories, subcategories, incomeFilter, balanceTarget } = useData()
  return useMemo(
    () => monthClose({ transactions: allTransactions, categories, subcategories, incomeFilter, balanceTarget }, month),
    [allTransactions, categories, subcategories, incomeFilter, balanceTarget, month],
  )
}

/** The "Equilíbrio do mês" verdict as a sentence (the month is a closed one). */
export function useBalanceVerdict() {
  const { t } = useI18n()
  const b = t.spendingBalance
  return (status: BalanceStatus): string => {
    switch (status.kind) {
      case 'onTarget':
        return b.onTarget
      case 'attention':
        return status.worst.group === 'future' ? b.below(b.groups.future, status.worst.points) : b.above(b.groups[status.worst.group], status.worst.points)
      case 'overIncome':
        return b.overIncome(formatMoney(status.amount))
      case 'incomplete':
        return b.incomplete(formatMoney(status.amount))
      case 'noIncome':
        return b.noIncome
      case 'partial':
        return status.early ? b.partialEarly : b.partialLate
    }
  }
}

/** "Você guardou R$ 1.234,56" or "Você gastou R$ 300,00 a mais do que entrou". */
export function keptLine(t: ReturnType<typeof useI18n>['t'], c: MonthClose): string {
  return c.figures.net >= 0 ? t.monthClose.kept(formatMoney(c.figures.net)) : t.monthClose.overspent(formatMoney(-c.figures.net))
}

/**
 * On the Visão geral in the first days of a month: the month just closed,
 * what was kept, the biggest category, how many were unusual and the
 * Equilíbrio's verdict. The whole card opens the full summary.
 */
export function MonthCloseCard({ close }: { close: MonthClose }) {
  const { t, categoryName } = useI18n()
  const { categoriesById } = useData()
  const verdict = useBalanceVerdict()
  const m = t.monthClose
  const top = close.topCategories[0]
  const lines = [
    top && m.biggestCategory(categoryName(top.categoryId ? categoriesById.get(top.categoryId) : null), formatMoney(top.amount)),
    close.unusual && close.unusual.length > 0 && m.unusualCount(close.unusual.length),
    close.balance && `${t.spendingBalance.title}: ${verdict(close.balance.status)}`,
  ].filter((x): x is string => !!x)
  return (
    <Card className="relative flex flex-col gap-3 lg:order-3 lg:col-span-12">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base leading-[22px] font-medium text-ink">
          {/* The whole card opens the page. */}
          <Link to={`/month-close?m=${close.month}`} className="after:absolute after:inset-0 after:rounded-lg after:content-['']">
            {m.cardTitle(formatMonthName(close.month))}
          </Link>
        </h2>
        <Icon name="chevronRight" className="size-[18px] shrink-0 text-muted" />
      </div>
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-start lg:gap-8">
        <div className="flex flex-col gap-0.5">
          <span className={`tabular text-[22px] leading-7 font-bold tracking-[-0.01em] ${close.figures.net >= 0 ? 'text-ink' : 'text-critical'}`}>{keptLine(t, close)}</span>
          <span className="tabular text-[13px] leading-[18px] text-muted">{close.keptPct !== null ? m.keptPct(formatPercent(close.keptPct)) : m.noIncome}</span>
        </div>
        {lines.length > 0 && (
          <ul className="flex flex-col border-t border-line lg:border-t-0">
            {lines.map((line) => (
              <li key={line} className="flex min-h-11 items-center border-b border-line text-sm leading-[19px] text-ink-2 last:border-b-0">
                <span className="tabular">{line}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
