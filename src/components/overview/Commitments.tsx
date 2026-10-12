import { useMemo } from 'react'
import { useData } from '../../state'
import { useI18n } from '../../i18n/I18nProvider'
import { installmentPlans, upcomingByMonth } from '../../lib/installments'
import { currentBill, isIdleCard } from '../../lib/bills'
import { dayOfMonth, formatMonthName, formatShortDate, monthKey } from '../../lib/dates'
import { formatMoney } from '../../lib/money'
import { shownName } from '../../lib/accountLabel'
import { Card } from '../ui'
import { InstitutionBadge } from '../BankBadge'
import { CardHeader, RowIcon, RowLink, RowValue } from './parts'

/**
 * Compromissos: what's already committed. Each card's bill (from its
 * billing cycle; the balance when the bank gives no closing date), the
 * installments charged next month, and the subscriptions and recurring
 * charges per month. Each row opens its detail.
 */
export function CommitmentsCard({ className = '' }: { className?: string }) {
  const { accounts, transactions, institutionsById, insights } = useData()
  const { t } = useI18n()
  const o = t.overview
  const c = o.commitments
  const plans = useMemo(() => installmentPlans(transactions), [transactions])
  const cards = accounts.filter((a) => a.type === 'CREDIT' && !isIdleCard(a, transactions, plans))
  const nextMonth = monthKey(dayOfMonth(new Date(), 1, 1))
  const nextInstallments = upcomingByMonth(plans).find((m) => m.month === nextMonth)?.amount ?? 0
  const nextPurchases = plans.filter((p) => p.upcoming.some((u) => u.month === nextMonth)).length
  const recurring = insights.recurring

  return (
    <Card className={`flex flex-col gap-1 ${className}`}>
      <CardHeader title={c.title} subtitle={c.sub} />
      <div className="mt-1 flex flex-col divide-y divide-line">
        {cards.map((card) => {
          const bill = currentBill(card, transactions, plans)
          const due = bill ? bill.dueDate : card.creditData?.balanceDueDate
          const institution = institutionsById.get(card.institutionId)!
          return (
            <RowLink
              key={card.id}
              to={bill ? `/transactions?bill=${card.id}` : `/transactions?m=all&a=${card.id}`}
              lead={<InstitutionBadge institution={institution} size={32} />}
              title={shownName(card, t.cardOf(institution.name))}
              sub={due ? o.due(formatShortDate(due)) : o.openCardBills}
              trail={<RowValue>{formatMoney(bill ? bill.amount : card.balance)}</RowValue>}
            />
          )
        })}
        <RowLink
          to="/installments"
          lead={<RowIcon icon="installments" />}
          title={o.installmentsNextMonth}
          sub={o.nextMonthPurchases(formatMonthName(nextMonth), nextPurchases)}
          trail={<RowValue>{formatMoney(nextInstallments)}</RowValue>}
        />
        <RowLink
          to="/recurring"
          lead={<RowIcon icon="subscriptions" />}
          title={c.recurring}
          sub={c.recurringSub(recurring.active.length)}
          trail={<RowValue>{formatMoney(recurring.monthTotal)}</RowValue>}
        />
      </div>
    </Card>
  )
}
