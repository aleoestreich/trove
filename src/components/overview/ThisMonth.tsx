import { useData } from '../../state'
import { useI18n } from '../../i18n/I18nProvider'
import { daysInMonth, formatDay, formatMonthName, monthKey } from '../../lib/dates'
import { formatCompactMoney, formatMoney } from '../../lib/money'
import { Card } from '../ui'
import { ProjectionChart } from '../insights/ProjectionChart'
import { useLowNote, useProjectionLines, useProjectionTitle } from '../insights/cards'
import { BalanceBlock } from '../balance/BalanceCard'
import { useExtraPayPlan, usePaymentName } from '../ExtraPay'
import type { Projection } from '../../data/projection'
import { BlockLabel, CardHeader, RowIcon, RowLink, RowValue, TextLink } from './parts'

/**
 * Este mês: where the month is heading. The month-end projection (what
 * should be left, its range, the daily line and its breakdown) beside the
 * Equilíbrio do mês (the split against its target), and, with 13º e férias
 * on, the next extra payment. Phones stack the blocks; desktop puts them
 * side by side.
 */
export function ThisMonthCard({ className = '' }: { className?: string }) {
  const { insights, today, extraPay } = useData()
  const { t } = useI18n()
  const m = t.overview.thisMonth
  const month = monthKey(today)
  return (
    <Card className={`flex flex-col gap-4 ${className}`}>
      <CardHeader title={m.title} subtitle={m.sub(formatMonthName(month), Number(today.slice(8, 10)), daysInMonth(month))} />
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-8">
        <ProjectionBlock projection={insights.projection} />
        <div className="border-t border-line pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          <BalanceBlock />
        </div>
      </div>
      {extraPay.enabled && <ExtraPayRow />}
    </Card>
  )
}

function ProjectionBlock({ projection }: { projection: Projection | null }) {
  const { t } = useI18n()
  const p = t.insights.projection
  const title = useProjectionTitle(projection)
  if (!projection)
    return (
      <div className="flex flex-col gap-2">
        <BlockLabel>{title}</BlockLabel>
        <p className="text-sm leading-5 text-ink-2">{p.empty}</p>
      </div>
    )
  return <ProjectionFigures projection={projection} title={title} />
}

function ProjectionFigures({ projection, title }: { projection: Projection; title: string }) {
  const { t } = useI18n()
  const p = t.insights.projection
  const lines = useProjectionLines(projection)
  const lowNote = useLowNote(projection)
  return (
    <div className="flex min-w-0 flex-col">
      <BlockLabel>{title}</BlockLabel>
      <p className="mt-1.5 text-[13px] leading-[18px] text-muted">{p.shouldRemain(formatDay(projection.endDate))}</p>
      <p className="tabular text-[28px] leading-9 font-bold tracking-[-0.02em] text-ink">{formatMoney(projection.end)}</p>
      <p className="tabular text-[13px] leading-[18px] text-ink-2">{p.range(formatCompactMoney(projection.range.min), formatCompactMoney(projection.range.max))}</p>
      <div className="mt-3 lg:hidden">
        <ProjectionChart projection={projection} variant="spark" />
      </div>
      <div className="mt-3 hidden lg:block">
        <ProjectionChart projection={projection} variant="full" height={150} />
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-xs leading-4 text-ink-2">
        <span aria-hidden className="size-2 shrink-0 rounded-full border-2 border-critical" />
        {lowNote}
      </p>
      {/* What makes it up: one list; two columns on desktop. */}
      <dl className="mt-3 border-t border-line lg:grid lg:grid-cols-2 lg:gap-x-6">
        {lines.map((l) => (
          <div key={l.key} className="flex min-h-10 items-center justify-between gap-3 border-b border-line">
            <dt className="text-sm leading-[18px] text-ink-2 lg:text-[13px]">{l.label}</dt>
            <dd className={`tabular text-sm font-medium whitespace-nowrap lg:text-[13px] ${l.income ? 'text-income' : 'text-ink'}`}>{l.value}</dd>
          </div>
        ))}
      </dl>
      <TextLink to="/insights/projection" className="mt-1">
        {t.overview.thisMonth.seeProjection}
      </TextLink>
    </div>
  )
}

/** With 13º e férias on: the next extra payment (or what's missing to estimate it), opening its page. */
function ExtraPayRow() {
  const { t } = useI18n()
  const c = t.extraPay.card
  const { payments, salary } = useExtraPayPlan()
  const name = usePaymentName()
  const next = payments[0]
  return (
    <div className="border-t border-line pt-1">
      <RowLink
        to="/extra-pay"
        lead={<RowIcon icon="salary" />}
        title={next ? name(next) : c.title}
        sub={!salary ? c.noSalary : next ? formatDay(next.date) : c.none}
        trail={next && <RowValue tone="text-income">{formatMoney(next.amount, 'BRL', { signed: true })}</RowValue>}
      />
    </div>
  )
}
