import { useState } from 'react'
import { formatCompact, formatMoney } from '../lib/money'
import { useI18n } from '../i18n/I18nProvider'

// Charts follow the design system: recessive dashed grid, 11px labels in
// `muted`, the latest month in `ink`, amounts in compact reais ("15 mil" / "15K").

export function seriesColor(i: number): string {
  return `var(--series-${Math.min(i, 5) + 1})`
}

/** Values arrive in cents; axes plot reais. */
const reais = (cents: number) => cents / 100

const tooltipBox = 'rounded-sm border border-line bg-surface px-3 py-2 text-[13px] text-ink shadow-sm'

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Bar charts are plain HTML: a baseline, bars that grow from it, and month
// labels underneath. The last column is the current month.

function MonthLabels({ labels, highlight = labels.length - 1 }: { labels: string[]; highlight?: number }) {
  const dense = labels.length > 6
  return (
    <div className="flex h-5" aria-hidden>
      {labels.map((l, i) => (
        <span
          key={i}
          className={`min-w-0 flex-1 text-center leading-5 lg:text-xs whitespace-nowrap ${dense ? 'text-[10px]' : 'text-[11px]'} ${i === highlight ? 'font-medium text-ink' : 'text-muted'}`}
        >
          {l}
        </span>
      ))}
    </div>
  )
}

export interface CashFlowPoint {
  label: string
  income: number
  expenses: number
}

/** Income vs expenses per month, side by side, with a dashed top line for scale. */
export function CashFlowChart({ data, label }: { data: CashFlowPoint[]; label: string }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expenses]))
  // Round the scale up to a tidy number of thousands of reais.
  const step = 5_000_00
  const top = Math.ceil(max / step) * step
  const dense = data.length > 6
  return (
    <div role="img" aria-label={label}>
      <div className="relative h-32 lg:h-44">
        <span className="absolute top-0 right-0 text-[11px] leading-[14px] lg:text-xs text-muted">{formatCompact(reais(top))}</span>
        <div className="absolute inset-x-0 top-4 border-t border-dashed border-line" />
        <div className="absolute inset-x-0 top-4 bottom-0 flex items-end border-b border-line">
          {data.map((d, i) => (
            <div key={i} className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5">
              <div className={`rounded-t-[4px] bg-income ${dense ? 'w-2 lg:w-3' : 'w-3.5 lg:w-5'}`} style={{ height: `${(d.income / top) * 100}%` }} />
              <div className={`rounded-t-[4px] bg-ink-2 ${dense ? 'w-2 lg:w-3' : 'w-3.5 lg:w-5'}`} style={{ height: `${(d.expenses / top) * 100}%` }} />
            </div>
          ))}
        </div>
      </div>
      <MonthLabels labels={data.map((d) => d.label)} />
    </div>
  )
}

export interface StackSeries {
  key: string
  name: string
}

/**
 * Stacked monthly bars, total on top; 2px gaps separate the segments.
 * Series take the categorical slots in fixed order (max 6) unless `colors`
 * gives one per series. The `highlight` month's label is emphasised: the
 * latest month for history, the first one for months ahead.
 */
export function StackedMonthChart({
  data,
  series,
  label,
  colors,
  highlight = 'last',
}: {
  data: Record<string, number | string>[]
  series: StackSeries[]
  label: string
  colors?: string[]
  highlight?: 'first' | 'last'
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState<number | null>(null)
  const totals = data.map((d) => series.reduce((s, x) => s + Number(d[x.key] ?? 0), 0))
  const max = Math.max(1, ...totals)
  const last = highlight === 'first' ? 0 : data.length - 1
  // A year: narrower bars, and on phones only the highlighted month's total above its bar.
  const dense = data.length > 6
  const colorOf = (j: number) => colors?.[j] ?? seriesColor(j)
  /** The month's values per series, largest first, without empty ones. */
  const breakdown = (i: number) =>
    series
      .map((s, j) => ({ name: s.name, color: colorOf(j), value: Number(data[i][s.key] ?? 0) }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value)

  return (
    // Hover (desktop), tap (phones) or focus a month to see its breakdown.
    <div role="group" aria-label={label} className="relative" onMouseLeave={() => setOpen(null)}>
      <div className="flex h-[152px] items-end border-b border-line lg:h-[176px]">
        {data.map((d, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${String(d.label)}: ${breakdown(i)
              .map((x) => `${x.name} ${formatMoney(x.value)}`)
              .join(', ')}; ${t.chartTotal} ${formatMoney(totals[i])}`}
            aria-expanded={open === i}
            onMouseEnter={() => setOpen(i)}
            onFocus={() => setOpen(i)}
            onBlur={() => setOpen(null)}
            // Focus already opens it on a tap; clicking keeps it open. Tapping elsewhere blurs and closes it.
            onClick={() => setOpen(i)}
            className={`flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-t-sm focus-visible:outline-2 focus-visible:outline-accent ${open === i ? 'bg-track/60' : ''}`}
          >
            <span
              className={`tabular leading-[14px] whitespace-nowrap ${dense ? 'text-[10px]' : 'text-[11px] lg:text-xs'} ${i === last ? 'font-medium text-ink' : 'text-muted'} ${dense && i !== last ? 'invisible lg:visible' : ''}`}
            >
              {formatCompact(Math.round(reais(totals[i])))}
            </span>
            <span className={`flex flex-col-reverse gap-0.5 overflow-hidden rounded-t-[4px] ${dense ? 'w-4 lg:w-7' : 'w-[26px] lg:w-9'}`} style={{ height: `max(2px, calc(${(totals[i] / max) * 100}% - 18px))` }}>
              {series.map((s, j) => {
                const v = Number(d[s.key] ?? 0)
                return v > 0 ? <span key={s.key} className="block min-h-0.5" style={{ flexGrow: v, flexBasis: 0, background: colorOf(j) }} /> : null
              })}
            </span>
          </button>
        ))}
      </div>
      <MonthLabels labels={data.map((d) => String(d.label))} highlight={last} />
      {open !== null && (
        <BreakdownTooltip
          title={String(data[open].label)}
          rows={breakdown(open)}
          total={totals[open]}
          totalLabel={t.chartTotal}
          // Keep it inside the card: anchor left, centre or right by column.
          align={open < data.length / 3 ? 'left' : open >= (data.length * 2) / 3 ? 'right' : 'center'}
          at={((open + 0.5) / data.length) * 100}
        />
      )}
    </div>
  )
}

/** A month's values per category or bank, with the total, over the chart. */
function BreakdownTooltip({
  title,
  rows,
  total,
  totalLabel,
  align,
  at,
}: {
  title: string
  rows: { name: string; color: string; value: number }[]
  total: number
  totalLabel: string
  align: 'left' | 'center' | 'right'
  at: number
}) {
  const position =
    align === 'left'
      ? { left: `max(0px, calc(${at}% - 24px))` }
      : align === 'right'
        ? { right: `max(0px, calc(${100 - at}% - 24px))` }
        : { left: `${at}%`, transform: 'translateX(-50%)' }
  return (
    <div aria-hidden className={`${tooltipBox} pointer-events-none absolute top-0 z-10 flex min-w-[180px] flex-col gap-1`} style={position}>
      <p className="text-xs text-muted">{title}</p>
      {rows.map((r) => (
        <p key={r.name} className="flex items-center justify-between gap-4">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-ink-2">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: r.color }} />
            <span className="truncate">{r.name}</span>
          </span>
          <span className="tabular whitespace-nowrap">{formatMoney(r.value)}</span>
        </p>
      ))}
      <p className="mt-0.5 flex justify-between gap-4 border-t border-line pt-1 font-medium">
        <span>{totalLabel}</span>
        <span className="tabular whitespace-nowrap">{formatMoney(total)}</span>
      </p>
    </div>
  )
}
