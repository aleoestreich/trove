import { useMemo } from 'react'
import { useData } from '../state'
import { installmentPlans, upcomingByMonth, type InstallmentPlan } from '../lib/installments'
import { formatMonthShort, formatMonthYear } from '../lib/dates'
import { formatMoney } from '../lib/money'
import { Card, CardTitle, EmptyState, IconDisc, Overline, PageHeader, Progress } from '../components/ui'
import { MonthBars } from '../components/charts'
import { categoryIcon } from '../components/Icon'
import { useAccountLabel } from '../components/TransactionRow'
import { useI18n } from '../i18n/I18nProvider'

/** Months shown in the "committed per month" chart. */
const CHART_MONTHS = 7

export function Installments() {
  const { transactions } = useData()
  const { t } = useI18n()
  const plans = useMemo(() => installmentPlans(transactions), [transactions])
  const active = plans.filter((p) => p.remaining > 0)
  const finished = plans.filter((p) => p.remaining === 0)
  const months = upcomingByMonth(plans)
  const stillToPay = active.reduce((s, p) => s + p.remaining, 0)
  const lastMonth = months.at(-1)?.month

  if (plans.length === 0)
    return (
      <EmptyState icon="installments" title={t.installments.emptyTitle}>
        {t.installments.emptyBody}
      </EmptyState>
    )

  const summary = (
    <div className="flex flex-col gap-0.5 lg:gap-1">
      <span className="text-[13px] leading-[18px] font-medium text-muted">{t.installments.stillToPay}</span>
      <span className="tabular text-4xl leading-[44px] font-bold tracking-[-0.02em] text-ink lg:text-[40px] lg:leading-[48px]">{formatMoney(stillToPay)}</span>
      <span className="text-[13px] leading-[18px] text-ink-2 lg:text-sm lg:leading-5">
        {t.installments.summary(active.length, lastMonth ? formatMonthYear(lastMonth) : null)}
      </span>
    </div>
  )
  const chart = months.length > 0 && (
    <MonthBars
      label={t.installments.committedPerMonth}
      data={months.slice(0, CHART_MONTHS).map((m) => ({ label: formatMonthShort(m.month), amount: m.amount }))}
    />
  )

  return (
    <>
      <PageHeader title={t.nav.installments} subtitle={t.installments.subtitle} />

      {/* Phones */}
      <div className="flex flex-col gap-3 lg:hidden">
        <Card className="flex flex-col gap-4">
          {summary}
          {chart && (
            <div className="flex flex-col gap-2.5">
              <Overline>{t.installments.committedPerMonth}</Overline>
              {chart}
              <p className="text-xs leading-4 text-muted">{t.installments.committedNote}</p>
            </div>
          )}
        </Card>

        {active.length > 0 && <h2 className="mx-1 mt-2 text-base leading-[22px] font-medium text-ink">{t.installments.purchases}</h2>}
        {active.map((p) => (
          <PlanCard key={p.key} plan={p} />
        ))}

        {finished.length > 0 && <h2 className="mx-1 mt-2 text-base leading-[22px] font-medium text-ink">{t.installments.finished}</h2>}
        {finished.map((p) => (
          <PlanCard key={p.key} plan={p} />
        ))}
      </div>

      {/* Desktop */}
      <div className="hidden flex-col gap-5 lg:flex">
        <div className="grid grid-cols-12 gap-5">
          <Card className="col-span-4 flex flex-col justify-center">{summary}</Card>
          <Card className="col-span-8 flex flex-col gap-3">
            <CardTitle>{t.installments.committedPerMonth}</CardTitle>
            {chart}
            <p className="text-xs leading-4 text-muted">{t.installments.committedNote}</p>
          </Card>
        </div>
        {active.length > 0 && <PlanTable plans={active} />}
        {finished.length > 0 && (
          <>
            <h2 className="mx-1 text-base leading-[22px] font-medium text-ink">{t.installments.finished}</h2>
            <PlanTable plans={finished} />
          </>
        )}
      </div>
    </>
  )
}

const planColumns = 'grid grid-cols-[minmax(0,1fr)_260px_130px_140px_110px] items-center gap-5 px-5'

/** Desktop: purchases as a table with a progress column. */
function PlanTable({ plans }: { plans: InstallmentPlan[] }) {
  const { t } = useI18n()
  const accountLabel = useAccountLabel()
  return (
    <section role="table" aria-label={t.installments.purchases} className="overflow-hidden rounded-lg border border-line bg-surface">
      <div role="row" className={`${planColumns} label-caps border-b border-line py-3`}>
        <span role="columnheader">{t.installments.purchase}</span>
        <span role="columnheader">{t.installments.progress}</span>
        <span role="columnheader" className="text-right">
          {t.installments.perMonth}
        </span>
        <span role="columnheader" className="text-right">
          {t.installments.leftToPay}
        </span>
        <span role="columnheader" className="text-right">
          {t.installments.ends}
        </span>
      </div>
      {plans.map((plan, i) => {
        const toGo = plan.count - plan.charged
        const last = plan.upcoming.at(-1)
        return (
          <div key={plan.key} role="row" className={`${planColumns} min-h-[72px] py-2 ${i > 0 ? 'border-t border-line' : ''}`}>
            <span role="cell" className="flex min-w-0 items-center gap-3">
              <IconDisc icon={categoryIcon(plan.categoryId)} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[15px] font-medium text-ink">{plan.description}</span>
                <span className="text-[13px] text-muted">{accountLabel(plan.accountId)}</span>
              </span>
            </span>
            <span role="cell" className="flex flex-col gap-1.5">
              <span className="flex justify-between text-[13px]">
                <span className="text-ink-2">
                  <span className="tabular font-bold text-ink">
                    {plan.charged}/{plan.count}
                  </span>{' '}
                  {t.installments.paid}
                </span>
                <span className="tabular text-muted">{toGo > 0 ? t.installments.toGo(toGo) : t.installments.paidOff}</span>
              </span>
              <Progress value={(plan.charged / plan.count) * 100} label={t.installments.chargedLabel} />
            </span>
            <span role="cell" className="tabular text-right text-sm font-medium text-ink">
              {formatMoney(Math.floor(plan.totalAmount / plan.count))}
            </span>
            <span role="cell" className="tabular text-right text-sm font-medium text-ink">
              {formatMoney(plan.remaining)}
            </span>
            <span role="cell" className="text-right text-sm text-ink-2">
              {last ? formatMonthYear(last.month) : '—'}
            </span>
          </div>
        )
      })}
    </section>
  )
}

function PlanCard({ plan }: { plan: InstallmentPlan }) {
  const { t } = useI18n()
  const accountLabel = useAccountLabel()
  const perMonth = Math.floor(plan.totalAmount / plan.count)
  const last = plan.upcoming.at(-1)
  const toGo = plan.count - plan.charged

  return (
    <Card className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <IconDisc icon={categoryIcon(plan.categoryId)} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-base leading-[22px] font-medium text-ink">{plan.description}</span>
          <span className="text-[13px] leading-[18px] text-muted">{accountLabel(plan.accountId)}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-[13px] leading-[18px]">
          <span className="text-ink-2">
            <span className="tabular font-bold text-ink">
              {plan.charged}/{plan.count}
            </span>{' '}
            {t.installments.paid}
          </span>
          <span className="tabular text-muted">{toGo > 0 ? t.installments.toGo(toGo) : t.installments.paidOff}</span>
        </div>
        <Progress value={(plan.charged / plan.count) * 100} label={t.installments.chargedLabel} />
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-line pt-3">
        <Figure label={t.installments.perMonth} value={formatMoney(perMonth)} />
        <Figure label={t.installments.leftToPay} value={formatMoney(plan.remaining)} />
        <Figure label={t.installments.ends} value={last ? formatMonthYear(last.month) : '—'} end />
      </div>
    </Card>
  )
}

function Figure({ label, value, end = false }: { label: string; value: string; end?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${end ? 'items-end' : ''}`}>
      <span className="text-xs leading-4 text-muted">{label}</span>
      <span className="tabular text-sm font-medium whitespace-nowrap text-ink">{value}</span>
    </div>
  )
}
