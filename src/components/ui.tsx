import type { ReactNode } from 'react'
import type { Cents, CurrencyCode, Institution } from '../data/types'
import { formatMoney } from '../lib/money'
import { formatMonth, lastMonths } from '../lib/dates'
import { Icon } from './Icon'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-surface p-4 ring-1 ring-line ${className}`}>{children}</section>
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-2">
      <h2 className="text-sm font-semibold text-ink-2">{children}</h2>
      {action}
    </div>
  )
}

/** Institution avatar: initial on a coloured dot. */
export function InstitutionBadge({ institution, size = 'md' }: { institution: Institution; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'size-8 text-xs' : 'size-10 text-sm'
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${cls}`}
      style={{ background: institution.color }}
      aria-hidden
    >
      {institution.name[0]}
    </span>
  )
}

/**
 * A signed BRL amount; income shows "+" in green. When the money moved in
 * another currency, the original amount is shown underneath.
 */
export function Amount({
  cents,
  foreign,
  muted = false,
  className = '',
}: {
  cents: Cents
  foreign?: { currency: CurrencyCode; amount: Cents }
  muted?: boolean
  className?: string
}) {
  const color = muted ? 'text-muted' : cents > 0 ? 'text-income' : 'text-ink'
  return (
    <span className={`flex flex-col items-end ${className}`}>
      <span className={`tabular font-medium whitespace-nowrap ${color}`}>{formatMoney(cents, 'BRL', { signed: true })}</span>
      {foreign && (
        <span className="tabular text-xs whitespace-nowrap text-muted">{formatMoney(foreign.amount, foreign.currency, { signed: true })}</span>
      )}
    </span>
  )
}

/** ‹ set. de 2026 › — steps through the months that have data. */
export function MonthSwitcher({ month, latest, count, onChange }: { month: string; latest: string; count: number; onChange(m: string): void }) {
  const months = lastMonths(latest, count)
  const i = months.indexOf(month)
  const btn = 'flex size-11 items-center justify-center rounded-full text-ink-2 active:bg-track disabled:opacity-30'
  return (
    <div className="flex items-center justify-between">
      <button className={btn} disabled={i <= 0} onClick={() => onChange(months[i - 1])} aria-label="Previous month">
        <Icon name="chevronLeft" />
      </button>
      <span className="font-semibold">{formatMonth(month)}</span>
      <button className={btn} disabled={i >= months.length - 1} onClick={() => onChange(months[i + 1])} aria-label="Next month">
        <Icon name="chevronRight" />
      </button>
    </div>
  )
}
