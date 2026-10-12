import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../state'
import { useI18n } from '../i18n/I18nProvider'
import { Card } from './ui'
import { Icon } from './Icon'
import { addDays, addMonths, formatDay, formatMonthName } from '../lib/dates'
import { formatMoney } from '../lib/money'
import { extraPayments, salaryCuts, vacationEnd, type ExtraPayment } from '../data/extraPay'
import type { Cents } from '../data/types'

/** Months ahead the page and the card look at. */
export const EXTRA_PAY_MONTHS = 12

/**
 * What "13º e férias" expects: the salary its estimates use (set by hand, or
 * the forecast's average), the payments over the next 12 months and the
 * months whose salary is smaller.
 */
export function useExtraPayPlan() {
  const { extraPay, insights, today } = useData()
  const detected: Cents | null = insights.projection?.salary.average || null
  const salary = extraPay.salary ?? detected
  return useMemo(() => {
    const to = addDays(addMonths(today, EXTRA_PAY_MONTHS), -1)
    const payments = salary ? extraPayments(extraPay, salary, today, to) : []
    const cuts = salary ? salaryCuts(extraPay, salary, today, to) : []
    return { extraPay, detected, salary, payments, cuts, total: payments.reduce((s, p) => s + p.amount, 0) }
  }, [extraPay, detected, salary, today])
}

/** A payment's name: "13º salário · 1ª parcela", "Férias de 3 nov. a 22 nov.". */
export function usePaymentName() {
  const { t } = useI18n()
  const { extraPay } = useData()
  const x = t.extraPay
  return (p: ExtraPayment) => {
    if (p.kind === 'thirteenth') return x.thirteenth(p.part)
    const v = extraPay.vacations.find((v) => v.id === p.vacationId)
    return v ? x.vacation(formatDay(v.start), formatDay(vacationEnd(v))) : t.insights.projection.event.vacation
  }
}

export const monthTitle = (month: string) => formatMonthName(month)

/**
 * "13º e férias" on the Visão geral (only when turned on): the next payment
 * and the ones after it, a smaller salary ahead, and the page.
 */
export function ExtraPayCard() {
  const { t } = useI18n()
  const c = t.extraPay.card
  const { payments, cuts, salary } = useExtraPayPlan()
  const name = usePaymentName()
  const [first, ...rest] = payments
  const cut = cuts[0]
  return (
    <Card className="relative flex flex-col gap-3 lg:order-5 lg:col-span-12">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base leading-[22px] font-medium text-ink">
          {/* The whole card opens the page. */}
          <Link to="/extra-pay" className="after:absolute after:inset-0 after:rounded-lg after:content-['']">
            {c.title}
          </Link>
        </h2>
        <Icon name="chevronRight" className="size-[18px] shrink-0 text-muted" />
      </div>
      {!salary ? (
        <p className="text-sm leading-5 text-ink-2">{c.noSalary}</p>
      ) : !first ? (
        <p className="text-sm leading-5 text-ink-2">{c.none}</p>
      ) : (
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-start lg:gap-8">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] leading-[18px] text-muted">{c.next(name(first), formatDay(first.date))}</span>
            <span className="tabular text-[28px] leading-9 font-bold tracking-[-0.02em] text-income">{formatMoney(first.amount, 'BRL', { signed: true })}</span>
            {cut && (
              <span className="mt-1 flex items-start gap-1.5 text-xs leading-4 text-ink-2">
                <Icon name="info" className="size-3.5 shrink-0" />
                <span className="tabular">{c.cut(monthTitle(cut.month), formatMoney(cut.amount))}</span>
              </span>
            )}
          </div>
          {rest.length > 0 && (
            <ul className="flex flex-col border-t border-line lg:border-t-0">
              {rest.slice(0, 3).map((p) => (
                <li key={`${p.kind}-${p.date}`} className="flex min-h-11 items-center justify-between gap-3 border-b border-line last:border-b-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm leading-[19px] text-ink">{name(p)}</span>
                    <span className="text-xs leading-4 text-muted">{formatDay(p.date)}</span>
                  </span>
                  <span className="tabular text-sm font-medium whitespace-nowrap text-income">{formatMoney(p.amount, 'BRL', { signed: true })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}
