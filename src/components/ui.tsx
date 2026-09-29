import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Cents, CurrencyCode, Institution } from '../data/types'
import { formatMoney } from '../lib/money'
import { formatMonth, lastMonths } from '../lib/dates'
import { Icon, type IconName } from './Icon'
import { useI18n } from '../i18n/I18nProvider'

/** Surface card: 20px radius, 1px border, 16px padding. Borders, not shadows. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-line bg-surface p-4 ${className}`}>{children}</section>
}

/** Card title (16/22 medium) with an optional muted subtitle. */
export function CardTitle({ children, subtitle }: { children: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="text-base leading-[22px] font-medium text-ink">{children}</h2>
      {subtitle && <p className="text-[13px] leading-[18px] text-muted">{subtitle}</p>}
    </div>
  )
}

/** Small caps label above a group ("By bank"). */
export function Overline({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h3 className={`label-caps ${className}`}>{children}</h3>
}

/** Institution disc with its first letters, e.g. "Nu" for Nubank. */
export function InstitutionBadge({ institution, size = 'md' }: { institution: Institution; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'size-9 text-[13px]' : 'size-10 text-sm'
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-track font-bold text-ink-2 ${cls}`} aria-hidden>
      {institution.name.slice(0, 2)}
    </span>
  )
}

/** Icon on a neutral disc (categories, purchases). */
export function IconDisc({ icon, size = 'md', tone = 'neutral' }: { icon: IconName; size?: 'sm' | 'md' | 'lg' | 'xl'; tone?: 'neutral' | 'accent' }) {
  const box = { sm: 'size-9', md: 'size-10', lg: 'size-11', xl: 'size-16' }[size]
  const glyph = { sm: 'size-5', md: 'size-5', lg: 'size-[22px]', xl: 'size-7' }[size]
  const colors = tone === 'accent' ? 'bg-accent-soft text-accent' : 'bg-track text-ink-2'
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full ${box} ${colors}`} aria-hidden>
      <Icon name={icon} className={glyph} strokeWidth={size === 'xl' ? 1.8 : 1.75} />
    </span>
  )
}

/** 10px square legend swatch in a chart colour. */
export function Swatch({ color }: { color: string }) {
  return <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: color }} aria-hidden />
}

/** Rounded progress bar. `tone` picks the fill colour. */
export function Progress({
  value,
  height = 8,
  tone = 'accent',
  label,
  role = 'progressbar',
}: {
  value: number
  height?: 4 | 6 | 8
  tone?: 'accent' | 'bar' | 'income' | 'critical' | string
  label?: string
  role?: 'progressbar' | 'meter'
}) {
  const pct = Math.max(0, Math.min(100, value))
  const fill = tone.startsWith('var(') ? tone : `var(--${tone})`
  return (
    <div
      role={label ? role : undefined}
      aria-label={label}
      aria-valuemin={label ? 0 : undefined}
      aria-valuemax={label ? 100 : undefined}
      aria-valuenow={label ? Math.round(pct) : undefined}
      aria-hidden={label ? undefined : true}
      className="rounded-full bg-track"
      style={{ height }}
    >
      <div className="rounded-full" style={{ height, width: `${pct}%`, background: fill }} />
    </div>
  )
}

/** Tinted pill with an icon: +R$3.842,10 · 6,0% or "Near limit". */
export function Badge({ children, icon, tone }: { children: ReactNode; icon?: IconName; tone: 'income' | 'critical' }) {
  const colors = tone === 'income' ? 'bg-income-soft text-income text-[13px]' : 'bg-critical-soft text-critical text-xs'
  return (
    <span className={`tabular inline-flex h-6 items-center gap-1 rounded-full px-2 font-medium whitespace-nowrap ${colors}`}>
      {icon && <Icon name={icon} className="size-3.5" strokeWidth={2.25} />}
      {children}
    </span>
  )
}

const button = {
  primary: 'bg-accent text-surface px-5',
  secondary: 'border border-line bg-surface text-accent px-[18px]',
  text: 'text-accent px-3',
}

/** 48px tall button: primary, secondary or text. */
export function Button({
  children,
  variant = 'primary',
  icon,
  className = '',
  onClick,
}: {
  children: ReactNode
  variant?: keyof typeof button
  icon?: IconName
  className?: string
  onClick?(): void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-md text-[15px] font-medium active:opacity-80 ${button[variant]} ${className}`}
    >
      {icon && <Icon name={icon} className="size-[18px]" strokeWidth={2} />}
      {children}
    </button>
  )
}

/** "See all ›" text link, full width at the bottom of a card. */
export function SeeAll({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="-mx-2 mt-1 flex h-12 items-center justify-center gap-1 rounded-md text-[15px] font-medium text-accent active:bg-track">
      {children}
      <Icon name="chevronRight" className="size-[18px]" strokeWidth={2} />
    </Link>
  )
}

/**
 * The main amount of a transaction row. Income is green with "+", transfers
 * are muted and unsigned. Foreign transactions show the original currency and
 * the BRL value underneath.
 */
export function Amount({
  cents,
  foreign,
  transfer = false,
  className = '',
}: {
  cents: Cents
  foreign?: { currency: CurrencyCode; amount: Cents }
  transfer?: boolean
  className?: string
}) {
  const color = transfer ? 'text-muted' : cents > 0 ? 'text-income' : 'text-ink'
  const main = foreign
    ? formatMoney(transfer ? Math.abs(foreign.amount) : foreign.amount, foreign.currency, { signed: !transfer })
    : formatMoney(transfer ? Math.abs(cents) : cents, 'BRL', { signed: !transfer })
  return (
    <span className={`flex shrink-0 flex-col items-end gap-0.5 ${className}`}>
      <span className={`tabular text-[15px] leading-5 font-medium whitespace-nowrap ${color}`}>{main}</span>
      {foreign && <span className="tabular text-xs leading-4 whitespace-nowrap text-muted">≈ {formatMoney(Math.abs(cents))}</span>}
    </span>
  )
}

/** ‹ September 2026 › on a page-coloured bar; steps through the months with data. */
export function MonthSwitcher({ month, latest, count, onChange }: { month: string; latest: string; count: number; onChange(m: string): void }) {
  const { t } = useI18n()
  const months = lastMonths(latest, count)
  const i = months.indexOf(month)
  const btn = 'flex size-12 items-center justify-center rounded-md text-ink-2 active:bg-track disabled:text-line'
  return (
    <div className="-mx-2 flex items-center justify-between rounded-md bg-page">
      <button type="button" className={btn} disabled={i <= 0} onClick={() => onChange(months[i - 1])} aria-label={t.previousMonth}>
        <Icon name="chevronLeft" className="size-[22px]" strokeWidth={2} />
      </button>
      <span className="text-[15px] font-medium text-ink">{formatMonth(month)}</span>
      <button type="button" className={btn} disabled={i >= months.length - 1} onClick={() => onChange(months[i + 1])} aria-label={t.nextMonth}>
        <Icon name="chevronRight" className="size-[22px]" strokeWidth={2} />
      </button>
    </div>
  )
}

/** Centred icon, title, text and optional action: empty lists and errors. */
export function EmptyState({
  icon,
  title,
  children,
  action,
  alert = false,
}: {
  icon: IconName
  title: string
  children: ReactNode
  action?: ReactNode
  alert?: boolean
}) {
  return (
    <div role={alert ? 'alert' : undefined} className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <IconDisc icon={icon} size="xl" />
      <h2 className="mt-1 text-xl leading-[26px] font-medium text-ink">{title}</h2>
      <p className="max-w-[290px] text-[15px] leading-[22px] text-ink-2">{children}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
