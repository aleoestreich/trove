import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useData } from '../state'
import type { Institution } from '../data/types'
import { installmentPlans, upcomingByMonth, type InstallmentPlan } from '../lib/installments'
import { formatMonthShort, formatMonthYear } from '../lib/dates'
import { formatMoney } from '../lib/money'
import { Card, CardTitle, EmptyState, Overline, PageHeader, Progress, Swatch } from '../components/ui'
import { StackedMonthChart } from '../components/charts'
import { CategoryBadge } from '../components/CategoryBadge'
import { useAccountLabel } from '../components/TransactionRow'
import { useI18n } from '../i18n/I18nProvider'
import { InstitutionBadge, bankColors } from '../components/BankBadge'
import { useIsDesktop } from '../lib/useIsDesktop'

/** Months shown in the "committed per month" chart. */
const CHART_MONTHS = 7

interface BankGroup {
  institution: Institution
  plans: InstallmentPlan[]
  remaining: number
}

/** Plans grouped by the bank of their card: most still to pay first, then by name. */
function groupByBank(plans: InstallmentPlan[], bankOf: (accountId: string) => Institution): BankGroup[] {
  const groups = new Map<string, BankGroup>()
  for (const plan of plans) {
    const institution = bankOf(plan.accountId)
    const g = groups.get(institution.id) ?? { institution, plans: [], remaining: 0 }
    g.plans.push(plan)
    g.remaining += plan.remaining
    groups.set(institution.id, g)
  }
  return [...groups.values()].sort((a, b) => b.remaining - a.remaining || a.institution.name.localeCompare(b.institution.name))
}

export function Installments() {
  const { transactions, accountsById, institutionsById } = useData()
  const { t } = useI18n()
  const isDesktop = useIsDesktop()
  const [params, setParams] = useSearchParams()
  const plans = useMemo(() => installmentPlans(transactions), [transactions])
  const active = plans.filter((p) => p.remaining > 0)
  const finished = plans.filter((p) => p.remaining === 0)
  const showPaid = params.get('view') === 'paid' && finished.length > 0
  const bankOf = (accountId: string) => institutionsById.get(accountsById.get(accountId)!.institutionId)!
  const groups = groupByBank(showPaid ? finished : active, bankOf)
  const setView = (paid: boolean) =>
    setParams(
      (p) => {
        if (paid) p.set('view', 'paid')
        else p.delete('view')
        return p
      },
      { replace: true },
    )
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
  // Committed per month, stacked by bank (same order and colours as the list and badges).
  const chartBanks = groupByBank(active, bankOf).map((g) => g.institution)
  const colorOf = bankColors(chartBanks)
  const chartSeries = chartBanks.map((i) => ({ key: i.id, name: i.name }))
  const chartData = months.slice(0, CHART_MONTHS).map((m) => {
    const row: Record<string, number | string> = { label: formatMonthShort(m.month) }
    for (const plan of active) {
      const bank = bankOf(plan.accountId).id
      for (const u of plan.upcoming) if (u.month === m.month) row[bank] = Number(row[bank] ?? 0) + u.amount
    }
    return row
  })
  const chart = months.length > 0 && (
    <div className="flex flex-col gap-3">
      <StackedMonthChart
        data={chartData}
        series={chartSeries}
        colors={chartSeries.map((s) => colorOf.get(s.key)!)}
        highlight="first"
        label={t.installments.committedPerMonth}
      />
      <ul data-legend className="flex flex-wrap gap-x-3.5 gap-y-2 lg:gap-x-4">
        {chartSeries.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5 text-[13px] leading-[18px] text-ink-2">
            <Swatch color={colorOf.get(s.key)!} />
            {s.name}
          </li>
        ))}
      </ul>
    </div>
  )

  // In progress / Paid off. Only shown when something is paid off.
  const tabs = finished.length > 0 && (
    <div role="tablist" aria-label={t.installments.view} className="mt-2 flex self-start rounded-full border border-line bg-surface p-1">
      {[false, true].map((paid) => {
        const on = showPaid === paid
        const count = paid ? finished.length : active.length
        return (
          <button
            key={String(paid)}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={isDesktop ? 'installment-list-desktop' : 'installment-list'}
            onClick={() => setView(paid)}
            className={`inline-flex h-12 items-center gap-1.5 rounded-full px-4 text-sm lg:h-10 focus-visible:outline-2 focus-visible:outline-accent ${
              on ? 'bg-accent-soft font-medium text-accent' : 'text-ink-2'
            }`}
          >
            {paid ? t.installments.finished : t.installments.inProgress}
            <span className={`tabular text-xs ${on ? 'text-accent' : 'text-muted'}`}>{count}</span>
          </button>
        )
      })}
    </div>
  )
  const noneInProgress = !showPaid && active.length === 0 && <p className="mx-1 text-sm text-muted">{t.installments.noneInProgress}</p>

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

        {tabs}
        <div id="installment-list" role="tabpanel" className="flex flex-col gap-3">
          {noneInProgress}
          {groups.map((g) => (
            <section key={g.institution.id} aria-label={g.institution.name} className="flex flex-col gap-3">
              <BankHeader group={g} paid={showPaid} size={36} />
              {g.plans.map((p) => (
                <PlanCard key={p.key} plan={p} />
              ))}
            </section>
          ))}
        </div>
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
        {tabs}
        <div id="installment-list-desktop" role="tabpanel" className="flex flex-col gap-5">
          {noneInProgress}
          {groups.map((g) => (
            <section key={g.institution.id} aria-label={g.institution.name} className="flex flex-col gap-3">
              <BankHeader group={g} paid={showPaid} size={32} />
              <PlanTable plans={g.plans} />
            </section>
          ))}
        </div>
      </div>
    </>
  )
}

/** A bank's logo and name over its purchases, with what's left to pay there (or how many are paid off). */
function BankHeader({ group, paid, size }: { group: BankGroup; paid: boolean; size: 32 | 36 }) {
  const { t } = useI18n()
  return (
    <div className="mx-1 mt-2 flex items-center gap-3">
      <InstitutionBadge institution={group.institution} size={size} />
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="truncate text-base leading-[22px] font-medium text-ink">{group.institution.name}</h2>
        <span className="text-[13px] leading-[18px] text-muted">{t.installments.bankPurchases(group.plans.length)}</span>
      </div>
      {!paid && (
        <div className="flex flex-col items-end">
          <span className="tabular text-base leading-[22px] font-medium whitespace-nowrap text-ink">{formatMoney(group.remaining)}</span>
          <span className="text-[13px] leading-[18px] text-muted">{t.installments.bankLeft}</span>
        </div>
      )}
    </div>
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
              <PlanBadge categoryId={plan.categoryId} />
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
        <PlanBadge categoryId={plan.categoryId} />
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

/** The purchase's category badge (uncategorized when it has none). */
function PlanBadge({ categoryId }: { categoryId: string | null }) {
  const { categoriesById } = useData()
  return <CategoryBadge category={categoryId ? categoriesById.get(categoryId) : null} />
}
