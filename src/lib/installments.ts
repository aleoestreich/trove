import type { Cents, Transaction } from '../data/types'
import { dayOfMonth, monthKey } from './dates'

export interface UpcomingInstallment {
  number: number
  /** Month it will be charged, "2026-10". */
  month: string
  amount: Cents
}

/** One installment purchase ("compra parcelada"), rebuilt from its charged installments. */
export interface InstallmentPlan {
  key: string
  accountId: string
  description: string
  categoryId: string
  purchaseDate: string
  totalAmount: Cents
  count: number
  /** Installments already charged. */
  charged: number
  /** Amount already charged (positive). */
  chargedAmount: Cents
  /** Amount still to be charged (positive). */
  remaining: Cents
  upcoming: UpcomingInstallment[]
}

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return dayOfMonth(new Date(y, m - 1, 1), months, d)
}

/**
 * Groups installment transactions into purchases and projects the installments
 * not charged yet. Needs only what Pluggy reports per transaction (installment
 * number, total count, total amount, purchase date), so it works on real data.
 */
export function installmentPlans(transactions: Transaction[]): InstallmentPlan[] {
  const groups = new Map<string, Transaction[]>()
  for (const t of transactions) {
    if (!t.installment) continue
    const i = t.installment
    const key = `${t.accountId}|${t.description}|${i.purchaseDate}|${i.total}|${i.totalAmount}`
    groups.set(key, [...(groups.get(key) ?? []), t])
  }

  const plans: InstallmentPlan[] = []
  for (const [key, txs] of groups) {
    const latest = txs.reduce((a, b) => (b.installment!.number > a.installment!.number ? b : a))
    const { total, totalAmount, purchaseDate } = latest.installment!
    const charged = latest.installment!.number
    // Exact when every charged installment is in the data. Otherwise (earlier
    // installments fell before the fetched history window) the later
    // installments are all equal to the latest one, so what's left is
    // (installments left) x (latest installment).
    const numbersSeen = new Set(txs.map((t) => t.installment!.number))
    const complete = numbersSeen.size === charged
    const remaining = complete
      ? Math.max(0, totalAmount + txs.reduce((s, t) => s + t.amount, 0))
      : Math.min(totalAmount, (total - charged) * Math.abs(latest.amount))
    const chargedAmount = totalAmount - remaining

    // Split what's left evenly; the first upcoming installment absorbs rounding.
    const left = total - charged
    const each = left > 0 ? Math.floor(remaining / left) : 0
    const upcoming: UpcomingInstallment[] = []
    for (let n = charged + 1; n <= total; n++) {
      upcoming.push({
        number: n,
        month: monthKey(addMonths(latest.date, n - charged)),
        amount: n === charged + 1 ? remaining - each * (left - 1) : each,
      })
    }

    plans.push({
      key,
      accountId: latest.accountId,
      description: latest.description,
      categoryId: latest.categoryId,
      purchaseDate,
      totalAmount,
      count: total,
      charged,
      chargedAmount,
      remaining,
      upcoming,
    })
  }
  // Active first (most still to pay), then finished, newest purchase first.
  return plans.sort((a, b) => b.remaining - a.remaining || b.purchaseDate.localeCompare(a.purchaseDate))
}

/** Installments still to be charged, per card account. */
export function remainingByAccount(plans: InstallmentPlan[]): Map<string, Cents> {
  const out = new Map<string, Cents>()
  for (const p of plans) out.set(p.accountId, (out.get(p.accountId) ?? 0) + p.remaining)
  return out
}

/** Total already committed in future months, oldest month first. */
export function upcomingByMonth(plans: InstallmentPlan[]): { month: string; amount: Cents }[] {
  const out = new Map<string, Cents>()
  for (const p of plans) for (const u of p.upcoming) out.set(u.month, (out.get(u.month) ?? 0) + u.amount)
  return [...out].map(([month, amount]) => ({ month, amount })).sort((a, b) => a.month.localeCompare(b.month))
}
