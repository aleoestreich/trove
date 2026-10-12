import { useMemo } from 'react'
import { useData } from '../state'
import { useI18n } from '../i18n/I18nProvider'
import { addDays, addMonths, formatDay, formatMonthName } from '../lib/dates'
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
