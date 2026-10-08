import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from '../Icon'
import { formatPercent } from '../../lib/money'
import { useI18n } from '../../i18n/I18nProvider'

// Small pieces shared by the insight cards and pages.

/** "+45%" / "−35%" from a fraction (0.45). */
export function signedPct(fraction: number): string {
  const pct = Math.round(fraction * 100)
  return `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${formatPercent(Math.abs(pct))}`
}

export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** The element's width, kept up to date (charts draw to it). */
export function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

/** A detail page's heading: "‹ Visão geral", the title and a subtitle (phones and desktop). */
export function DetailHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  const { t } = useI18n()
  return (
    <header className="mb-3 flex flex-col gap-0.5 lg:mb-6 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
      <div className="flex flex-col gap-0.5 lg:gap-1">
        <Link
          to="/"
          className="-ml-1 inline-flex h-11 items-center gap-1 self-start rounded-sm pr-3 pl-1 text-sm font-medium text-accent hover:bg-track lg:h-9"
        >
          <Icon name="chevronLeft" className="size-5" strokeWidth={2} />
          {t.insights.back}
        </Link>
        <h1 className="text-2xl leading-[30px] font-medium text-ink lg:text-[28px] lg:leading-[34px] lg:tracking-[-0.01em]">{title}</h1>
        {subtitle && <p className="text-sm leading-5 text-ink-2 lg:text-muted">{subtitle}</p>}
      </div>
      {children}
    </header>
  )
}

/** Esc closes; focus goes inside on open and back where it was on close. */
function useDialog(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  }, [onClose])
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('button, [href], input')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      before?.focus()
    }
  }, [ref])
}

/** A bottom sheet over a scrim (a centred dialog from tablets up). */
export function Sheet({
  title,
  onClose,
  children,
  footer,
  privateTitle = false,
}: {
  title: string
  onClose(): void
  children: ReactNode
  footer?: ReactNode
  /** The title is data (a merchant's name): blurred in privacy mode. */
  privateTitle?: boolean
}) {
  const ref = useRef<HTMLElement>(null)
  const { t } = useI18n()
  useDialog(ref, onClose)
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-scrim md:items-center" onClick={onClose}>
      <section
        ref={ref}
        role="dialog"
        aria-modal
        aria-label={title}
        className="flex max-h-[92dvh] w-full max-w-[480px] flex-col overflow-y-auto rounded-t-xl bg-surface px-4 pb-[calc(16px+env(safe-area-inset-bottom))] md:rounded-xl md:pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-[22px] shrink-0 items-center justify-center md:hidden" aria-hidden>
          <span className="h-1 w-8 rounded-full bg-line" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <h2 className={`text-lg leading-6 font-medium text-ink ${privateTitle ? 'private' : ''}`}>{title}</h2>
          <button type="button" onClick={onClose} aria-label={t.close} className="-mr-2 flex size-11 items-center justify-center rounded-md text-ink-2 hover:bg-track">
            <Icon name="close" className="size-5" />
          </button>
        </div>
        {children}
        {footer}
      </section>
    </div>
  )
}

/** A switch row: label, note, and the switch (role="switch"). */
export function SwitchRow({ label, note, checked, onChange, divider }: { label: string; note: string; checked: boolean; onChange(v: boolean): void; divider?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex min-h-16 w-full items-center gap-3 py-2 text-left ${divider ? 'border-t border-line' : ''}`}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm leading-[19px] font-medium text-ink">{label}</span>
        <span className="text-xs leading-4 text-muted">{note}</span>
      </span>
      <span
        aria-hidden
        className={`flex h-8 w-[52px] shrink-0 items-center rounded-full border-2 px-1 transition-colors ${checked ? 'justify-end border-accent bg-accent' : 'border-muted bg-track'}`}
      >
        <span className={`rounded-full transition-all ${checked ? 'size-6 bg-surface' : 'size-4 bg-muted'}`} />
      </span>
    </button>
  )
}

/** A legend entry: a swatch (or a line) and its name. */
export function LegendItem({ children, swatch }: { children: ReactNode; swatch: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {swatch}
      {children}
    </span>
  )
}

export function Legend({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs leading-4 text-muted ${className}`}>{children}</div>
}

export const swatch = (background: string, extra = '') => <span aria-hidden className={`h-2 w-3 rounded-[2px] ${extra}`} style={{ background }} />

/** Scale of the diverging bars: ±60%, clamped. */
const BAR_SCALE = 0.6
/** The normal band: ±15%. */
const BAND = 0.15

/**
 * How far from its average a category is: a bar from the centre, right in
 * critical (above) or left in income (below), over the ±15% normal band.
 * Normal ones in muted. Decorative: the row says the same in text.
 */
export function DivergingBar({ pct, normal, height = 10 }: { pct: number; normal: boolean; height?: 10 | 12 }) {
  const w = (Math.min(Math.abs(pct), BAR_SCALE) / BAR_SCALE) * 50
  const up = pct > 0
  const color = normal ? 'var(--muted)' : up ? 'var(--critical)' : 'var(--income)'
  const band = (BAND / BAR_SCALE) * 50
  return (
    <span aria-hidden className="relative block w-full" style={{ height }}>
      <span className="absolute inset-x-0 h-0.5 rounded-full bg-track" style={{ top: height / 2 - 1 }} />
      <span className="absolute top-0 rounded-[3px] bg-track" style={{ left: `${50 - band}%`, width: `${band * 2}%`, height }} />
      <span className="absolute -top-0.5 w-0.5 bg-muted" style={{ left: 'calc(50% - 1px)', height: height + 4 }} />
      {w > 0 && (
        <span
          className="absolute"
          style={{
            top: (height - 8) / 2,
            height: 8,
            left: up ? '50%' : `${50 - w}%`,
            width: `${w}%`,
            background: color,
            borderRadius: up ? '0 4px 4px 0' : '4px 0 0 4px',
          }}
        />
      )}
    </span>
  )
}

export function DivergingLegend() {
  const { t } = useI18n()
  const l = t.insights.unusual.legend
  return (
    <Legend>
      <LegendItem swatch={swatch('var(--critical)')}>{l.above}</LegendItem>
      <LegendItem swatch={swatch('var(--income)')}>{l.below}</LegendItem>
      <LegendItem swatch={swatch('var(--track)', 'shadow-[inset_0_0_0_1px_var(--line)]')}>{l.band}</LegendItem>
    </Legend>
  )
}

/** "↑ +45%" in a tinted pill: critical above, income below, neutral when normal. */
export function PctPill({ pct, normal = false }: { pct: number; normal?: boolean }) {
  const up = pct > 0
  const tone = normal ? 'bg-track text-ink-2' : up ? 'bg-critical-soft text-critical' : 'bg-income-soft text-income'
  return (
    <span className={`tabular inline-flex h-[26px] shrink-0 items-center gap-0.5 rounded-full px-2 text-[13px] font-bold ${tone}`}>
      <Icon name={up ? 'arrowUp' : 'arrowDown'} className="size-3.5" strokeWidth={2.4} />
      {signedPct(pct)}
    </span>
  )
}

export type AlertKind = 'price_up' | 'new' | 'stopped'

const ALERT_STYLE: Record<AlertKind, { icon: IconName; className: string }> = {
  price_up: { icon: 'arrowUp', className: 'bg-critical-soft text-critical' },
  new: { icon: 'plus', className: 'bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-accent' },
  stopped: { icon: 'pause', className: 'bg-track text-ink-2' },
}

/** "↑ Aumento", "+ Nova", "⏸ Parou": icon and word, so it's never colour alone. */
export function AlertBadge({ kind, long = false, fixed = false, small = false }: { kind: AlertKind; long?: boolean; fixed?: boolean; small?: boolean }) {
  const { t } = useI18n()
  const b = t.insights.recurring.badge
  const label = kind === 'price_up' ? (long ? b.upLong : b.up) : kind === 'new' ? b.new : b.stopped
  const s = ALERT_STYLE[kind]
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center gap-[3px] rounded-full text-xs font-medium whitespace-nowrap ${small ? 'h-[22px] px-2' : 'h-6 px-2'} ${fixed ? 'w-[76px] px-0' : ''} ${s.className}`}
    >
      <Icon name={s.icon} className={`shrink-0 ${small ? 'size-3' : 'size-[13px]'}`} strokeWidth={2.4} />
      {label}
    </span>
  )
}

/** A text button for the alert actions (44px tall on phones). */
export function TextAction({ children, onClick, tone = 'accent', compact = false }: { children: ReactNode; onClick(): void; tone?: 'accent' | 'ink'; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-sm font-medium whitespace-nowrap hover:bg-track ${compact ? 'h-11 px-2.5 text-[13px] lg:h-8' : 'h-11 px-3 text-sm'} ${tone === 'accent' ? 'text-accent' : 'text-ink-2'}`}
    >
      {children}
    </button>
  )
}

/** Placeholder shapes while something loads (same card shapes). */
export function CardSkeleton({ lines = 4, chart = true }: { lines?: number; chart?: boolean }) {
  return (
    <div aria-hidden className="flex flex-col gap-2.5">
      <div className="skeleton h-3.5 w-40 rounded-[7px]" />
      <div className="skeleton h-9 w-[200px] rounded-[10px]" />
      {chart && <div className="skeleton h-[76px] rounded-sm" />}
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton h-3 rounded-xs" style={{ width: `${80 - i * 9}%` }} />
      ))}
    </div>
  )
}
