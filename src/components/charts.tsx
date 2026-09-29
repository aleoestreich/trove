import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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

export interface NetWorthPoint {
  label: string
  net: number
  cash: number
  cardDebt: number
}

/** Net worth at the end of each month (last point is today). Tap for the value. */
export function NetWorthChart({ points, label }: { points: NetWorthPoint[]; label: string }) {
  const data = points.map((p) => ({ ...p, value: reais(p.net) }))
  const last = data.length - 1
  return (
    <div className="h-[140px]" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="2 4" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: 'var(--line)' }}
            interval={0}
            padding={{ left: 14, right: 10 }}
            tick={(p: { x: number | string; y: number | string; index: number; payload: { value: string } }) => (
              <text
                x={Number(p.x)}
                y={Number(p.y) + 12}
                textAnchor="middle"
                fontSize={11}
                fill={p.index === last ? 'var(--ink)' : 'var(--muted)'}
                fontWeight={p.index === last ? 500 : 400}
              >
                {p.payload.value}
              </text>
            )}
          />
          <YAxis
            orientation="right"
            width={44}
            tickLine={false}
            axisLine={false}
            tickCount={3}
            domain={['auto', 'auto']}
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            tickFormatter={(v: number) => formatCompact(v)}
          />
          <Tooltip cursor={{ stroke: 'var(--muted)', strokeDasharray: '3 3' }} content={(p) => <NetWorthTooltip active={p.active} payload={p.payload} label={p.label} />} />
          <Area
            type="linear"
            dataKey="value"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="var(--accent)"
            fillOpacity={0.12}
            dot={(p: { cx?: number; cy?: number; index?: number }) =>
              p.index === last ? <circle key="last" cx={p.cx} cy={p.cy} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} /> : <g key={p.index} />
            }
            activeDot={{ r: 5, fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function NetWorthTooltip({ active, payload, label }: { active?: boolean; payload?: readonly { payload?: unknown }[]; label?: unknown }) {
  const { t } = useI18n()
  if (!active || !payload?.length) return null
  const p = payload[0].payload as NetWorthPoint
  return (
    <div className={tooltipBox}>
      <p className="text-xs text-muted">{String(label)}</p>
      <p className="tabular font-medium">{formatMoney(p.net)}</p>
      <p className="tabular text-xs text-muted">{t.overview.chartAccountsCards(formatMoney(p.cash), formatMoney(p.cardDebt))}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bar charts are plain HTML: a baseline, bars that grow from it, and month
// labels underneath. The last column is the current month.

function MonthLabels({ labels }: { labels: string[] }) {
  return (
    <div className="flex h-5" aria-hidden>
      {labels.map((l, i) => (
        <span
          key={i}
          className={`flex-1 text-center text-[11px] leading-5 whitespace-nowrap ${i === labels.length - 1 ? 'font-medium text-ink' : 'text-muted'}`}
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
  return (
    <div role="img" aria-label={label}>
      <div className="relative h-32">
        <span className="absolute top-0 right-0 text-[11px] leading-[14px] text-muted">{formatCompact(reais(top))}</span>
        <div className="absolute inset-x-0 top-4 border-t border-dashed border-line" />
        <div className="absolute inset-x-0 top-4 bottom-0 flex items-end border-b border-line">
          {data.map((d, i) => (
            <div key={i} className="flex h-full flex-1 items-end justify-center gap-0.5">
              <div className="w-3.5 rounded-t-[4px] bg-income" style={{ height: `${(d.income / top) * 100}%` }} />
              <div className="w-3.5 rounded-t-[4px] bg-ink-2" style={{ height: `${(d.expenses / top) * 100}%` }} />
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
 * Stacked monthly spending by category, total on top. Series take the
 * categorical slots in fixed order (max 6: top 5 + "Other"); 2px gaps
 * separate the segments.
 */
export function SpendingTrendChart({ data, series, label }: { data: Record<string, number | string>[]; series: StackSeries[]; label: string }) {
  const totals = data.map((d) => series.reduce((s, x) => s + Number(d[x.key] ?? 0), 0))
  const max = Math.max(1, ...totals)
  const last = data.length - 1
  return (
    <div role="img" aria-label={label}>
      <div className="flex h-[152px] items-end border-b border-line">
        {data.map((d, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className={`tabular text-[11px] leading-[14px] whitespace-nowrap ${i === last ? 'font-medium text-ink' : 'text-muted'}`}>
              {formatCompact(Math.round(reais(totals[i])))}
            </span>
            <div className="flex w-[26px] flex-col-reverse gap-0.5 overflow-hidden rounded-t-[4px]" style={{ height: `max(2px, calc(${(totals[i] / max) * 100}% - 18px))` }}>
              {series.map((s, j) => {
                const v = Number(d[s.key] ?? 0)
                return v > 0 ? <div key={s.key} className="min-h-0.5" style={{ flexGrow: v, flexBasis: 0, background: seriesColor(j) }} /> : null
              })}
            </div>
          </div>
        ))}
      </div>
      <MonthLabels labels={data.map((d) => String(d.label))} />
    </div>
  )
}

/** Single-series bars with the value on top; the first bar (next month) is emphasised. */
export function MonthBars({ data, label }: { data: { label: string; amount: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.amount))
  return (
    <div role="img" aria-label={label}>
      <div className="flex h-28 items-end border-b border-line">
        {data.map((d, i) => (
          <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className={`tabular text-[11px] leading-[14px] whitespace-nowrap ${i === 0 ? 'font-medium text-ink' : 'text-muted'}`}>
              {formatCompact(Math.round(reais(d.amount)))}
            </span>
            <div
              className={`w-6 rounded-t-[4px] bg-[var(--bar)] ${i === 0 ? '' : 'opacity-55'}`}
              style={{ height: `max(2px, calc(${(d.amount / max) * 100}% - 18px))` }}
            />
          </div>
        ))}
      </div>
      <div className="flex h-5" aria-hidden>
        {data.map((d, i) => (
          <span key={i} className={`flex-1 text-center text-[11px] leading-5 whitespace-nowrap ${i === 0 ? 'font-medium text-ink' : 'text-muted'}`}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  )
}
