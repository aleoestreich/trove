import type { CSSProperties } from 'react'
import { useMemo } from 'react'
import { useData } from '../../state'
import { useI18n } from '../../i18n/I18nProvider'
import { Icon, type IconName } from '../Icon'
import { NO_FILTER } from '../../data/incomeAverage'
import { balanceStatus, expectedCharges, monthBalance, roundedShares, type BalanceStatus, type Bucket, type MonthBalance } from '../../data/spendingBalance'
import type { BalanceTarget } from '../../data/types'
import { formatMonthName, fromISO, monthKey } from '../../lib/dates'
import { installmentPlans } from '../../lib/installments'
import { formatMoney, formatPercent, isMoneyMasked } from '../../lib/money'
import { capitalize } from '../insights/parts'

// Pieces shared by the "Equilíbrio do mês" card, its page and the target sheet.

export type Part = Bucket | 'future'

/** Group colours: Essencial in accent, Estilo de vida a light accent, Futuro in income, "Sem grupo" hatched neutral. */
export const hatch = (color: string, mix = 28) => `repeating-linear-gradient(135deg, ${color} 0 2px, color-mix(in srgb, ${color} ${mix}%, var(--surface)) 2px 5px)`
export const GROUP_FILL: Record<Part, string> = {
  essential: 'var(--accent)',
  lifestyle: 'color-mix(in srgb, var(--accent) 42%, var(--surface))',
  future: 'var(--income)',
  ungrouped: hatch('var(--series-6)'),
}
/** Spending above the income: hatched critical. */
export const OVER_FILL = hatch('var(--critical)', 22)

/** A small square in a group's colour. */
export function GroupSwatch({ part, size = 12, className = '' }: { part: Part | 'over'; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`shrink-0 rounded-[3px] ${className}`}
      style={{ width: size, height: size, background: part === 'over' ? OVER_FILL : GROUP_FILL[part] }}
    />
  )
}

/** The month the card (and the page, by default) shows: the current one when income is expected (or came in), else the last closed one with income. */
export function defaultBalanceMonth(today: string, hasIncome: (month: string) => boolean): string {
  const current = monthKey(today)
  const [y, m] = current.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  const previous = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  if (hasIncome(current)) return current
  return hasIncome(previous) ? previous : current
}

/** A month's split, its verdict and the target, from the loaded data. */
export function useMonthBalance(month?: string): { balance: MonthBalance; status: BalanceStatus; target: BalanceTarget; month: string } {
  const { allTransactions, categories, subcategories, incomeFilter, balanceTarget, today, insights } = useData()
  // This month's installments and recurring charges still to come.
  const expected = useMemo(
    () => expectedCharges(installmentPlans(allTransactions, fromISO(today)), insights.recurring.active, allTransactions, today),
    [allTransactions, insights, today],
  )
  return useMemo(() => {
    const of = (m: string) => monthBalance(allTransactions, categories, subcategories, incomeFilter ?? NO_FILTER, m, today, expected)
    const shown = month ?? defaultBalanceMonth(today, (m) => of(m).income > 0)
    const balance = of(shown)
    return { balance, status: balanceStatus(balance, balanceTarget, today), target: balanceTarget, month: shown }
  }, [allTransactions, categories, subcategories, incomeFilter, balanceTarget, today, month, expected])
}

const PILL: Record<BalanceStatus['kind'], { icon: IconName; className: string }> = {
  onTarget: { icon: 'check', className: 'bg-income-soft text-income' },
  attention: { icon: 'alert', className: 'bg-track text-ink' },
  overIncome: { icon: 'alert', className: 'bg-critical-soft text-critical' },
  partial: { icon: 'calendar', className: 'bg-track text-ink-2' },
  incomplete: { icon: 'info', className: 'bg-track text-ink-2' },
  noIncome: { icon: 'info', className: 'bg-track text-ink-2' },
}

/** The verdict in a pill: an icon and a word, so it's never colour alone. */
export function StatusPill({ status }: { status: BalanceStatus }) {
  const { t } = useI18n()
  const s = PILL[status.kind]
  return (
    <span className={`inline-flex h-[26px] shrink-0 items-center gap-[5px] rounded-full pr-2.5 pl-2 text-xs font-medium whitespace-nowrap ${s.className}`}>
      <Icon name={s.icon} className="size-3.5" strokeWidth={2.2} />
      {t.spendingBalance.status[status.kind]}
    </span>
  )
}

/** The verdict as a sentence. */
export function useStatusText(status: BalanceStatus): string {
  const { t } = useI18n()
  const b = t.spendingBalance
  switch (status.kind) {
    case 'onTarget':
      return b.onTarget
    case 'attention':
      return status.worst.group === 'future' ? b.below(b.groups.future, status.worst.points) : b.above(b.groups[status.worst.group], status.worst.points)
    case 'overIncome':
      return b.overIncome(formatMoney(status.amount))
    case 'partial':
      return status.early ? b.partialEarly : b.partialLate
    case 'incomplete':
      return b.incomplete(formatMoney(status.amount))
    case 'noIncome':
      return b.noIncome
  }
}

/** A share of the income: "58%", "−5%" ("•• %" in privacy mode). */
export const pct = (n: number) => (n < 0 && !isMoneyMasked() ? `−${formatPercent(-n)}` : formatPercent(n))

/** "Setembro" or "Outubro até agora", for the subtitles. */
export const monthLabel = (month: string) => capitalize(formatMonthName(month))

/**
 * The month as one bar: Essencial, Estilo de vida, "Sem grupo" and the rest of
 * the Futuro, across the income, with the target's two divisions marked. When
 * spending passes the income, the bar runs to the spending, the part beyond
 * the income (dashed line) hatched in critical.
 */
export function SplitBar({ balance, target, height = 14 }: { balance: MonthBalance; target: BalanceTarget; height?: 14 | 28 }) {
  const { t } = useI18n()
  const shares = roundedShares(balance)
  if (!shares) return null
  const spent = balance.essential + balance.lifestyle + balance.ungrouped
  const scale = Math.max(balance.income, spent)
  const at = (v: number) => `${(v / scale) * 100}%`
  const over = balance.overIncome > 0
  const ungroupedShown = over ? balance.ungrouped : Math.min(balance.ungrouped, Math.max(0, balance.future))
  const segments: [Part, number][] = [
    ['essential', balance.essential],
    ['lifestyle', balance.lifestyle],
    ['ungrouped', ungroupedShown],
    ['future', over ? 0 : Math.max(0, balance.future - ungroupedShown)],
  ]
  const incomeAt = (pct: number) => (balance.income * pct) / 100
  const marker = (left: string, dashed = false): CSSProperties =>
    dashed
      ? { left: `calc(${left} - 1px)`, top: -8, bottom: -8, width: 0, borderLeft: '2px dashed var(--ink)' }
      : { left: `calc(${left} - 1px)`, top: -5, bottom: -5, width: 2, borderRadius: 2, background: 'var(--ink)', boxShadow: '0 0 0 1.5px var(--surface)' }
  return (
    <div
      role="img"
      aria-label={isMoneyMasked() ? t.privacy.chartHidden : t.spendingBalance.barAria(shares.essential, shares.lifestyle, shares.future, target.essential, target.lifestyle, target.future)}
    >
      <div className="relative py-[5px]">
        <div data-progress className="relative flex gap-0.5 overflow-hidden bg-surface" style={{ height, borderRadius: height > 14 ? 9 : 4 }}>
          {segments
            .filter(([, v]) => v > 0)
            .map(([part, v]) => (
              <span key={part} className="min-w-0" style={{ flex: `${v} 1 0`, background: GROUP_FILL[part] }} />
            ))}
          {over && <span className="absolute inset-y-0 right-0" style={{ left: at(balance.income), background: OVER_FILL }} />}
        </div>
        {/* data-legend: hidden in privacy mode, with the proportions. */}
        <span data-legend aria-hidden className="absolute" style={marker(at(incomeAt(target.essential)))} />
        <span data-legend aria-hidden className="absolute" style={marker(at(incomeAt(target.essential + target.lifestyle)))} />
        {over && <span data-legend aria-hidden className="absolute" style={marker(at(balance.income), true)} />}
      </div>
    </div>
  )
}

/** The legend under the big bar: the target's marks, and the income line and overflow when spending passed it. */
export function BarLegend({ target, over, onEditTarget }: { target: BalanceTarget; over: boolean; onEditTarget?(): void }) {
  const { t } = useI18n()
  const d = t.spendingBalance.detail
  const mark = (
    <>
      <span aria-hidden className="h-3.5 w-0.5 rounded-[2px] bg-ink" />
      {d.legendTarget(target.essential, target.lifestyle, target.future)}
    </>
  )
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-4 text-muted">
      {onEditTarget ? (
        <button
          type="button"
          onClick={onEditTarget}
          aria-label={`${d.legendTarget(target.essential, target.lifestyle, target.future)}. ${d.editTarget}`}
          className="-mx-1.5 inline-flex h-11 items-center gap-1.5 rounded-sm px-1.5 hover:bg-track lg:h-8"
        >
          {mark}
          <Icon name="edit" className="size-3.5 text-accent" />
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5">{mark}</span>
      )}
      {over && (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-3.5 w-0 border-l-2 border-dashed border-ink" />
            {d.legendIncome}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <GroupSwatch part="over" />
            {d.legendOver}
          </span>
        </>
      )}
    </div>
  )
}
