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
}

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
 * A previous bill left partly unpaid isn't included.
 *
 * Null when the bank doesn't report a closing date: show the balance instead.
 */
export function currentBill(account: Account, transactions: Transaction[], plans: InstallmentPlan[], today: Date = new Date()): CardBill | null {
  const credit = account.creditData
  if (account.type !== 'CREDIT' || !credit?.balanceCloseDate) return null
  const todayISO = toISO(today)
  // Move past bills that are already due (or closed, without a due date),
  // counting from the reported dates so day 31 doesn't drift. Bounded.
  let close = credit.balanceCloseDate
  let due = credit.balanceDueDate
  for (let k = 1; k <= 24 && (due ? due < todayISO : close < todayISO); k++) {
    close = addMonths(credit.balanceCloseDate, k)
    due = credit.balanceDueDate && addMonths(credit.balanceDueDate, k)
  }
  const from = addMonths(close, -1) // previous closing, excluded
  const inCycle = (date: string) => date > from && date <= close

  let amount = 0
  for (const t of transactions) {
    if (t.accountId === account.id && t.categoryId !== 'card-payment' && inCycle(t.date)) amount -= t.amount
  }
  for (const p of plans) {
    if (p.accountId !== account.id) continue
    for (const u of p.upcoming) if (inCycle(u.date)) amount += u.amount
  }
  return { amount, closeDate: close, dueDate: due, closed: close < todayISO }
}
