import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCompact, formatMoney } from '../lib/money'
import { useI18n } from '../i18n/I18nProvider'

// Shared chart chrome: recessive grid and axes, text in theme ink.
// Axis ticks in compact reais ("15 mil" / "15K"); the card titles say the unit is BRL.
const axisTick = { fill: 'var(--muted)', fontSize: 12 }
const xAxisProps = { dataKey: 'label', tickLine: false, axisLine: { stroke: 'var(--line)' }, tick: axisTick } as const
const yAxisProps = { width: 64, tickLine: false, axisLine: false, tick: axisTick, tickFormatter: (v: number) => formatCompact(v) } as const
const tooltipStyle = {
  contentStyle: { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--ink)', fontSize: 13 },
  labelStyle: { color: 'var(--ink-2)', marginBottom: 4 },
  itemStyle: { color: 'var(--ink)', padding: 0 },
}
const legendText = (value: string) => <span style={{ color: 'var(--ink-2)' }}>{value}</span>

/** Values arrive in cents; charts plot reais. */
const reais = (cents: number) => cents / 100
const money = (v: unknown) => formatMoney(Math.round(Number(v) * 100))

// ---------------------------------------------------------------------------

export interface NetWorthPoint {
  label: string
  net: number
  cash: number
  cardDebt: number
}

/** Net worth at the end of each month (last point is today). */
export function NetWorthChart({ points }: { points: NetWorthPoint[] }) {
  const { t } = useI18n()
  const data = points.map((p) => ({ ...p, net: reais(p.net) }))
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} domain={['auto', 'auto']} />
          <Tooltip cursor={{ stroke: 'var(--muted)', strokeDasharray: '3 3' }} content={(p) => <NetWorthTooltip active={p.active} payload={p.payload} label={p.label} />} />
          <Line
            type="monotone"
            dataKey="net"
            name={t.overview.netWorthSeries}
            stroke="var(--series-1)"
            strokeWidth={2}
            dot={{ r: 4, fill: 'var(--series-1)', stroke: 'var(--surface)', strokeWidth: 2 }}
            activeDot={{ r: 6, fill: 'var(--series-1)', stroke: 'var(--surface)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function NetWorthTooltip({ active, payload, label }: { active?: boolean; payload?: readonly { payload?: unknown }[]; label?: unknown }) {
  const { t } = useI18n()
  if (!active || !payload?.length) return null
  const p = payload[0].payload as NetWorthPoint
  return (
    <div style={tooltipStyle.contentStyle} className="px-3 py-2">
      <p className="text-xs text-ink-2">{String(label)}</p>
      <p className="tabular font-semibold">{formatMoney(Math.round(p.net * 100))}</p>
      <p className="tabular text-xs text-muted">
        {t.overview.chartAccountsCards(formatMoney(p.cash), formatMoney(p.cardDebt))}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------

export interface CashFlowPoint {
  label: string
  income: number
  expenses: number
}

/** Income vs expenses per month, side by side. */
export function CashFlowChart({ data }: { data: CashFlowPoint[] }) {
  const { t } = useI18n()
  const rows = data.map((d) => ({ label: d.label, income: reais(d.income), expenses: reais(d.expenses) }))
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} barGap={2} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} />
          <Tooltip cursor={{ fill: 'var(--track)' }} formatter={money} {...tooltipStyle} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
          <Bar dataKey="income" name={t.income} fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="expenses" name={t.expenses} fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------------------------------------------------------------------------

export interface StackSeries {
  key: string
  name: string
}

/**
 * Stacked monthly spending by category. Series take the categorical slots in
 * fixed order (max 6: top 5 + "Other"); a 2px surface gap separates segments.
 */
export function SpendingTrendChart({ data, series }: { data: Record<string, number | string>[]; series: StackSeries[] }) {
  const rows = data.map((d) => {
    const row: Record<string, number | string> = { label: d.label }
    for (const s of series) row[s.key] = reais(Number(d[s.key] ?? 0))
    return row
  })
  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} />
          <Tooltip cursor={{ fill: 'var(--track)' }} formatter={money} {...tooltipStyle} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stackId="spend"
              fill={seriesColor(i)}
              stroke="var(--surface)"
              strokeWidth={2}
              maxBarSize={32}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function seriesColor(i: number): string {
  return `var(--series-${i + 1})`
}
