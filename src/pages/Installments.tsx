import { useMemo } from 'react'
import { useData } from '../state'
import { installmentPlans, upcomingByMonth, type InstallmentPlan } from '../lib/installments'
import { formatMonth, formatShortDate } from '../lib/dates'
import { formatMoney } from '../lib/money'
import { Card, InstitutionBadge, SectionTitle } from '../components/ui'

export function Installments() {
  const { transactions } = useData()
  const plans = useMemo(() => installmentPlans(transactions), [transactions])
  const active = plans.filter((p) => p.remaining > 0)
  const finished = plans.filter((p) => p.remaining === 0)
  const months = upcomingByMonth(plans)
  const stillToPay = active.reduce((s, p) => s + p.remaining, 0)
  const maxMonth = Math.max(0, ...months.map((m) => m.amount))

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-ink-2">Installments still to pay</p>
        <p className="tabular mt-1 text-4xl font-semibold tracking-tight">{formatMoney(stillToPay)}</p>
        <p className="mt-2 text-sm text-muted">
          {active.length} active {active.length === 1 ? 'purchase' : 'purchases'}. This amount is already taken from your available
          card limit.
        </p>
      </Card>

      {months.length > 0 && (
        <Card>
          <SectionTitle>Already committed in future bills</SectionTitle>
          <ul className="space-y-2">
            {months.map((m) => (
              <li key={m.month}>
                <span className="flex items-baseline justify-between gap-2 text-sm">
                  <span>{formatMonth(m.month)}</span>
                  <span className="tabular font-medium">{formatMoney(m.amount)}</span>
                </span>
                <span className="mt-1 block h-2 overflow-hidden rounded-full bg-track">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${(m.amount / maxMonth) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Installments only. New purchases will add to these bills.</p>
        </Card>
      )}

      <Card className="!px-3">
        <SectionTitle>Active purchases</SectionTitle>
        {active.length === 0 && <p className="text-sm text-muted">No active installment purchases.</p>}
        <div className="divide-y divide-line">
          {active.map((p) => (
            <PlanRow key={p.key} plan={p} />
          ))}
        </div>
      </Card>

      {finished.length > 0 && (
        <Card className="!px-3">
          <SectionTitle>Finished</SectionTitle>
          <div className="divide-y divide-line">
            {finished.map((p) => (
              <PlanRow key={p.key} plan={p} />
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function PlanRow({ plan }: { plan: InstallmentPlan }) {
  const { accountsById, institutionsById } = useData()
  const account = accountsById.get(plan.accountId)!
  const institution = institutionsById.get(account.institutionId)!
  const perMonth = Math.floor(plan.totalAmount / plan.count)
  const last = plan.upcoming.at(-1)

  return (
    <div className="flex gap-3 px-1 py-3">
      <InstitutionBadge institution={institution} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate font-medium">{plan.description}</p>
          <p className="tabular shrink-0 font-medium">
            {plan.count}× {formatMoney(perMonth)}
          </p>
        </div>
        <p className="text-xs text-muted">
          {institution.name} · {formatShortDate(plan.purchaseDate)} · total {formatMoney(plan.totalAmount)}
        </p>
        <div
          className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full"
          role="meter"
          aria-label="Installments charged"
          aria-valuemin={0}
          aria-valuemax={plan.count}
          aria-valuenow={plan.charged}
        >
          {Array.from({ length: plan.count }, (_, i) => (
            <span key={i} className={`h-full flex-1 ${i < plan.charged ? 'bg-accent' : 'bg-track'}`} />
          ))}
        </div>
        <p className="tabular mt-1.5 flex justify-between gap-2 text-xs text-ink-2">
          <span>
            {plan.charged}/{plan.count}
            {last && ` · ends ${last.month.slice(5)}/${last.month.slice(0, 4)}`}
          </span>
          {plan.remaining > 0 ? (
            <span>{formatMoney(plan.remaining)} left</span>
          ) : (
            <span>Paid off</span>
          )}
        </p>
      </div>
    </div>
  )
}
