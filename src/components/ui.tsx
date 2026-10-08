import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Cents, CurrencyCode } from '../data/types'
import { formatMoney } from '../lib/money'
import { Icon, type IconName } from './Icon'
import { useI18n } from '../i18n/I18nProvider'

/** Surface card: 20px radius, 1px border, 16px padding. Borders, not shadows. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-line bg-surface p-4 lg:p-5 ${className}`}>{children}</section>
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
      data-progress
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
  disabled = false,
}: {
  children: ReactNode
  variant?: keyof typeof button
  icon?: IconName
  className?: string
  onClick?(): void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-md text-[15px] font-medium active:opacity-80 disabled:opacity-60 ${button[variant]} ${className}`}
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

/** Desktop page heading: title, subtitle and optional controls on the right. */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 hidden min-h-14 items-end justify-between gap-6 lg:flex">
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] leading-[34px] font-medium tracking-[-0.01em] text-ink">{title}</h1>
        {subtitle && <p className="tabular text-sm leading-5 text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

/** The periods the Overview's multi-month charts can show, in months. */
export const RANGES = [3, 6, 12] as const
export type Range = (typeof RANGES)[number]

/** A period from the address (?r=3|6|12); 6 months when missing or unknown. */
export function parseRange(value: string | null): Range {
  const n = Number(value)
  return (RANGES as readonly number[]).includes(n) ? (n as Range) : 6
}

/** "3 meses · 6 meses · 1 ano": a segmented control for the charts' period (44px targets). */
export function RangeSwitcher({ value, onChange }: { value: Range; onChange(r: Range): void }) {
  const { t } = useI18n()
  const r = t.overview.range
  return (
    <div role="group" aria-label={r.label} className="flex rounded-md bg-track p-1">
      {RANGES.map((n) => {
        const on = n === value
        return (
          <button
            key={n}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(n)}
            className={`h-10 flex-1 rounded-[10px] px-3 text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-accent ${
              on ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {n === 12 ? r.year : r.months(n)}
          </button>
        )
      })}
    </div>
  )
}
