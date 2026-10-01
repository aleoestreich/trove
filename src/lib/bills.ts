import type { Account, Cents, Transaction } from '../data/types'
import { addMonths, toISO } from './dates'
import type { InstallmentPlan } from './installments'

/** The card bill to show: the open one, or the closed one still to be paid. */
export interface CardBill {
  amount: Cents
  /** Day this bill closes (or closed). */
  closeDate: string
  dueDate: string | null
  /** Closed but not due yet: this is the amount to pay now. */
  closed: boolean
  /** Closed bills: bill payments made since it closed (a partial payment; `amount` is what's left). */
  paid: Cents
}

/** Rounding slack when comparing a payment with the bill (R$ 1). */
const PAID_TOLERANCE = 1_00

/**
 * A card's current bill, from its billing cycle rather than its balance (the
 * balance is everything owed on the card, so it matches the used limit).
 *
 * The cycle runs from the day after the previous closing to the closing date
 * the bank reports. If that bill is already due, the dates move forward a
 * month at a time. The bill is:
 * - purchases and refunds dated in the cycle, except bill payments (they
 *   settle the previous bill);
 * - plus installments expected to post in the cycle that aren't in the data
 *   yet.
 * A closed bill that's been paid (bill payments on the card since it closed
 * cover it) moves on to the next cycle, even before its due date; if it's
 * only partly paid, what's left is shown. A previous bill left partly unpaid
 * isn't added to the next one.
 *
 * Null when the bank doesn't report a closing date: show the balance instead.
 */
export function currentBill(account: Account, transactions: Transaction[], plans: InstallmentPlan[], today: Date = new Date()): CardBill | null {
  const credit = account.creditData
  if (account.type !== 'CREDIT' || !credit?.balanceCloseDate) return null
  const reportedClose = credit.balanceCloseDate
  const reportedDue = credit.balanceDueDate
  const todayISO = toISO(today)
  // Dates `k` months after the reported ones, so day 31 doesn't drift.
  const cycle = (k: number) => ({ close: addMonths(reportedClose, k), due: reportedDue && addMonths(reportedDue, k) })
  const own = transactions.filter((t) => t.accountId === account.id)

  /** What a cycle's bill adds up to. */
  const billOf = (close: string) => {
    const from = addMonths(close, -1) // previous closing, excluded
    const inCycle = (date: string) => date > from && date <= close
    let amount = 0
    for (const t of own) if (t.categoryId !== 'card-payment' && inCycle(t.date)) amount -= t.amount
    for (const p of plans) {
      if (p.accountId !== account.id) continue
      for (const u of p.upcoming) if (inCycle(u.date)) amount += u.amount
    }
    return amount
  }
  /** Bill payments on the card since `close` (up to today). */
  const paidSince = (close: string) =>
    own.filter((t) => t.categoryId === 'card-payment' && t.amount > 0 && t.date > close && t.date <= todayISO).reduce((sum, t) => sum + t.amount, 0)

  // Move past bills that are already due (or closed, without a due date). Bounded.
  let k = 0
  while (k < 24 && (cycle(k).due ? cycle(k).due! < todayISO : cycle(k).close < todayISO)) k++
  let { close, due } = cycle(k)
  let amount = billOf(close)
  let paid = 0
  if (close < todayISO) {
    // Closed and not due yet: if it's been paid, the next cycle is what matters now.
    paid = paidSince(close)
    if (paid >= amount - PAID_TOLERANCE) {
      ;({ close, due } = cycle(k + 1))
      amount = billOf(close)
      paid = 0
    } else {
      amount -= paid
    }
  }
  return { amount, closeDate: close, dueDate: due, closed: close < todayISO, paid }
}
