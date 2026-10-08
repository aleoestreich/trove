import { useState, type PointerEvent } from 'react'
import type { Projection } from '../../data/projection'
import { formatCompact, formatCompactMoney, formatMoney } from '../../lib/money'
import { formatDay } from '../../lib/dates'
import { useI18n } from '../../i18n/I18nProvider'
import { useWidth } from './parts'

// The balance this month: the real balance up to today (solid accent line),
// then the projection (dashed) inside its range (accent at 10%). A line at
// today, a hollow critical dot at the lowest point and a hollow accent dot at
// the end. The full variant adds grid lines, labels, day ticks and a
// crosshair with the day's value on hover or touch.

const reais = (cents: number) => cents / 100

/** Grid values: 2 or 3 round steps (1, 2 or 5 × 10ⁿ reais) inside [min, max]. */
function gridLines(min: number, max: number): number[] {
  const span = Math.max(1, max - min)
  const raw = span / 3
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((k) => k * pow).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(v)
  return out.slice(-3)
}

export function ProjectionChart({ projection, variant, height }: { projection: Projection; variant: 'spark' | 'full'; height?: number }) {
  const { t } = useI18n()
  const p = t.insights.projection
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const full = variant === 'full'
  const H = height ?? (full ? 190 : 76)
  const days = projection.daily
  const n = days.length
  const todayIndex = days.findIndex((d) => d.day === projection.asOf)
  const lowIndex = days.findIndex((d) => d.day === projection.low.date)
  const values = days.flatMap((d) => [d.lo, d.hi, d.value])
  let min = Math.min(...values)
  let max = Math.max(...values)
  const pad = Math.max(1, (max - min) * (full ? 0.12 : 0.08))
  min -= pad
  max += pad
  const W = Math.max(1, width)
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W)
  const y = (v: number) => H - ((v - min) / (max - min)) * H
  const path = (from: number, to: number, key: 'value' | 'lo' | 'hi') =>
    days
      .slice(from, to + 1)
      .map((d, k) => `${k === 0 ? 'M' : 'L'}${x(from + k).toFixed(1)} ${y(d[key]).toFixed(1)}`)
      .join(' ')
  const band =
    todayIndex < n - 1
      ? `${path(todayIndex, n - 1, 'hi')} ${days
          .slice(todayIndex)
          .map((d, k) => [x(todayIndex + k), y(d.lo)] as const)
          .reverse()
          .map(([px, py]) => `L${px.toFixed(1)} ${py.toFixed(1)}`)
          .join(' ')} Z`
      : ''
  const today = days[todayIndex]
  const end = days[n - 1]
  const low = days[lowIndex]
  const aria = p.chart(
    formatMoney(today.value),
    formatCompactMoney(projection.low.value),
    formatDay(projection.low.date),
    formatMoney(projection.end),
    formatDay(projection.endDate),
  )
  const grid = full ? gridLines(reais(min), reais(max)) : []
  const ticks = full ? [0, 7, 14, 21, n - 1].filter((i, k, a) => i < n && a.indexOf(i) === k) : []
  const clampLabel = (px: number, w: number) => Math.min(Math.max(px - w / 2, 0), W - w)

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!full || !width) return
    const rect = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - rect.left) / rect.width) * (n - 1))
    setHover(Math.min(n - 1, Math.max(0, i)))
  }
  const h = hover !== null ? days[hover] : null

  return (
    <div className="relative" style={{ height: H + (full ? 24 : 16) }}>
      <div
        ref={ref}
        data-chart
        className="relative touch-pan-y"
        style={{ height: H }}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {width > 0 && (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria} className="block overflow-visible">
            {grid.map((g) => (
              <line key={g} x1={0} x2={W} y1={y(g * 100)} y2={y(g * 100)} stroke="var(--line)" strokeWidth={1} strokeDasharray="2 4" />
            ))}
            {full && <line x1={0} x2={W} y1={H} y2={H} stroke="var(--line)" strokeWidth={1} />}
            {band && <path d={band} fill="var(--accent)" fillOpacity={0.1} />}
            <path d={path(0, todayIndex, 'value')} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {todayIndex < n - 1 && (
              <path
                d={path(todayIndex, n - 1, 'value')}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2}
                strokeDasharray="4 4"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            <line
              x1={x(todayIndex)}
              x2={x(todayIndex)}
              y1={0}
              y2={H}
              stroke={full ? 'var(--ink-2)' : 'var(--line)'}
              strokeWidth={1}
              strokeDasharray={full ? '3 3' : undefined}
            />
            {h && <line x1={x(hover!)} x2={x(hover!)} y1={0} y2={H} stroke="var(--muted)" strokeWidth={1} />}
            <circle cx={x(lowIndex)} cy={y(low.value)} r={full ? 4.5 : 4} fill="var(--surface)" stroke="var(--critical)" strokeWidth={2} />
            <circle cx={x(n - 1)} cy={y(end.value)} r={full ? 5 : 4.5} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2} />
            <circle cx={x(todayIndex)} cy={y(today.value)} r={full ? 5 : 4.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
            {h && <circle cx={x(hover!)} cy={y(h.value)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />}
          </svg>
        )}
        {full &&
          width > 0 &&
          grid.map((g) => (
            <span key={g} aria-hidden className="tabular pointer-events-none absolute left-0 rounded-[4px] bg-surface pr-1 text-[11px] leading-[14px] text-muted" style={{ top: y(g * 100) - 16 }}>
              {formatCompact(g)}
            </span>
          ))}
        {full && width > 0 && (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute -top-0.5 rounded-[6px] bg-ink px-1.5 py-0.5 text-[11px] leading-[14px] font-medium text-page"
              style={{ left: clampLabel(x(todayIndex), 34) }}
            >
              {p.todayTag}
            </span>
            {lowIndex !== n - 1 && (
              <span
                aria-hidden
                className="tabular pointer-events-none absolute rounded-[6px] bg-surface px-1.5 py-0.5 text-[11px] leading-[14px] whitespace-nowrap text-ink shadow-[0_0_0_1px_var(--line)]"
                style={{ left: clampLabel(x(lowIndex), 130), top: Math.min(y(low.value) + 10, H - 22) }}
              >
                {p.lowShort(formatCompactMoney(projection.low.value), formatDay(projection.low.date))}
              </span>
            )}
            <span
              aria-hidden
              className="tabular pointer-events-none absolute right-0 rounded-[6px] bg-surface px-1.5 py-0.5 text-[11px] leading-[14px] font-medium whitespace-nowrap text-ink shadow-[0_0_0_1px_var(--line)]"
              style={{ top: Math.max(y(end.value) - 28, 0) }}
            >
              {formatCompactMoney(projection.end)}
            </span>
          </>
        )}
        {h && (
          <div
            aria-hidden
            className="pointer-events-none absolute z-10 rounded-sm border border-line bg-surface px-3 py-2 text-[13px] text-ink shadow-sm"
            style={{ top: 8, left: clampLabel(x(hover!), 132), width: 132 }}
          >
            <p className="text-xs text-muted">
              {formatDay(h.day)} · {h.actual ? p.tooltipActual : p.tooltipProjected}
            </p>
            <p className="tabular font-medium">{formatMoney(h.value)}</p>
          </div>
        )}
      </div>
      {/* Day labels */}
      {full ? (
        width > 0 &&
        ticks.map((i) => (
          <span key={i} aria-hidden className="absolute w-12 text-center text-[11px] leading-4 text-muted" style={{ top: H + 6, left: Math.min(Math.max(x(i) - 24, 0), W - 48) }}>
            {formatDay(days[i].day)}
          </span>
        ))
      ) : (
        <div aria-hidden className="relative mt-0.5 h-3.5 text-[11px] leading-[14px]">
          <span className="absolute left-0 text-muted">{formatDay(days[0].day)}</span>
          {width > 0 && todayIndex > 2 && todayIndex < n - 4 && (
            <span className="absolute font-medium text-ink" style={{ left: clampLabel(x(todayIndex), 28) }}>
              {p.todayTag}
            </span>
          )}
          <span className="absolute right-0 text-muted">{formatDay(end.day)}</span>
        </div>
      )}
    </div>
  )
}

/** "Saldo real / Previsto / Margem". */
export function ProjectionLegend() {
  const { t } = useI18n()
  const l = t.insights.projection.legend
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs leading-4 text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-0.5 w-3.5 bg-accent" />
        {l.actual}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="w-3.5 border-t-2 border-dashed border-accent" />
        {l.projected}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-2 w-3 rounded-[2px] bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]" />
        {l.band}
      </span>
    </div>
  )
}

/**
 * "Como chegamos nesse valor": today's balance, income floating up, bills,
 * recurring charges and day-to-day spending floating down, and what's left
 * from zero. A value over each column; at least 2px tall.
 */
export function Waterfall({ projection }: { projection: Projection }) {
  const { t } = useI18n()
  const p = t.insights.projection
  const b = projection.breakdown
  const [ref, width] = useWidth<HTMLDivElement>()
  const afterIncome = b.saldoHoje + b.receitasPrevistas
  const afterBills = afterIncome - b.faturas
  const afterRecurring = afterBills - b.recorrentes
  const steps = [
    { label: p.waterfall.saldo, from: 0, to: b.saldoHoje, color: 'var(--accent)', value: b.saldoHoje, sign: '' },
    { label: p.waterfall.receitas, from: b.saldoHoje, to: afterIncome, color: 'var(--income)', value: b.receitasPrevistas, sign: '+' },
    { label: p.waterfall.faturas, from: afterBills, to: afterIncome, color: 'var(--critical)', value: b.faturas, sign: '−' },
    { label: p.waterfall.recorrentes, from: afterRecurring, to: afterBills, color: 'var(--critical)', value: b.recorrentes, sign: '−' },
    { label: p.waterfall.diaADia, from: projection.end, to: afterRecurring, color: 'var(--critical)', value: b.diaADia, sign: '−' },
    { label: p.waterfall.sobra, from: 0, to: projection.end, color: 'var(--accent)', value: projection.end, sign: '' },
  ]
  const lo = Math.min(0, ...steps.flatMap((s) => [s.from, s.to]))
  const hi = Math.max(1, ...steps.flatMap((s) => [s.from, s.to]))
  const H = 164
  const top = 18
  const k = (H - top) / (hi - lo)
  const base = (v: number) => (v - lo) * k
  const col = width / steps.length
  const barW = Math.min(38, col - 10)
  const short = (v: number) => formatCompactMoney(Math.abs(v)).replace(/^R\$\s?/, '')
  return (
    <div
      role="img"
      data-chart
      aria-label={p.waterfallChart(formatMoney(b.saldoHoje), formatMoney(b.receitasPrevistas), formatMoney(b.faturas), formatMoney(b.recorrentes), formatMoney(b.diaADia), formatMoney(projection.end))}
    >
      <div ref={ref} className="relative border-b border-line" style={{ height: H }}>
        {width > 0 &&
          steps.map((s, i) => {
            const bottom = base(Math.min(s.from, s.to))
            const h = Math.max(2, Math.abs(s.to - s.from) * k)
            const left = i * col + (col - barW) / 2
            return (
              <div key={s.label} aria-hidden>
                <span className="absolute rounded-[3px]" style={{ left, width: barW, bottom, height: h, background: s.color }} />
                <span
                  className="tabular absolute text-center text-[10px] leading-3 font-medium whitespace-nowrap text-ink"
                  style={{ left: i * col, width: col, bottom: bottom + h + 3 }}
                >
                  {s.value < 0 && !s.sign ? '−' : s.sign}
                  {short(s.value)}
                </span>
              </div>
            )
          })}
      </div>
      <div aria-hidden className="mt-1 flex">
        {steps.map((s) => (
          <span key={s.label} className="flex-1 text-center text-[11px] leading-[14px] text-ink-2">
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
