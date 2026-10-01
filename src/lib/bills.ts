import type { Account, Cents, Transaction } from '../data/types'
import { addMonths, toISO } from './dates'
import type { InstallmentPlan } from './installments'

/** The card bill to show: the open one, or the closed one still to be paid. */
export interface CardBill {
  amount: Cents
  /** Day this bill closes (or closed), when known. */
  closeDate: string | null
  dueDate: string | null
  /** Closed but not due yet: this is the amount to pay now. */
  closed: boolean
  /** Where the amount comes from, most reliable first. */
  source: 'bank-bill' | 'unbilled' | 'cycle'
}

/**
 * A card's current bill (the balance is everything owed on the card, so it
 * matches the used limit, not the bill). From the most reliable source:
 * 1. "bank-bill": the bank's latest closed bill, while it isn't due yet: its
 *    own total is what there is to pay.
 * 2. "unbilled": when the bank tags billed transactions with their bill, the
 *    open bill is the card's transactions with no bill yet (except bill
 *    payments), plus installments expected to post before it closes.
 * 3. "cycle": otherwise, from the closing date: what's dated from the day after
 *    the previous closing to the closing date (except bill payments), plus
 *    expected installments. Dates already due move forward a month at a time.
 * A previous bill left partly unpaid is only included in 1.
 *
 * Null when there's nothing to go on: show the balance instead.
 */
export function currentBill(account: Account, transactions: Transaction[], plans: InstallmentPlan[], today: Date = new Date()): CardBill | null {
  const credit = account.creditData
  if (account.type !== 'CREDIT' || !credit) return null
  const todayISO = toISO(today)

  // The cycle the bank's closing date points to (next bill not yet due).
  let close = credit.balanceCloseDate
  let due = credit.balanceDueDate
  if (credit.balanceCloseDate) {
    // Counted from the reported dates so day 31 doesn't drift. Bounded.
    for (let k = 1; k <= 24 && (due ? due < todayISO : close! < todayISO); k++) {
      close = addMonths(credit.balanceCloseDate, k)
      due = credit.balanceDueDate && addMonths(credit.balanceDueDate, k)
    }
  }
  const from = close ? addMonths(close, -1) : null // previous closing, excluded
  const inCycle = (date: string) => from !== null && date > from && date <= close!
  const expectedInstallments = plans
    .filter((p) => p.accountId === account.id)
    .flatMap((p) => p.upcoming)
    .filter((u) => inCycle(u.date))
    .reduce((sum, u) => sum + u.amount, 0)
  const own = transactions.filter((t) => t.accountId === account.id && t.categoryId !== 'card-payment')

  // 1. The bank's closed bill, until it's due.
  const last = credit.lastBill
  if (last && last.dueDate >= todayISO) {
    const closed = close && close <= todayISO ? close : close ? addMonths(close, -1) : null
    return { amount: last.amount, closeDate: closed, dueDate: last.dueDate, closed: true, source: 'bank-bill' }
  }

  // 2. Transactions not on any bill yet, when the bank tags the billed ones.
  if (transactions.some((t) => t.accountId === account.id && t.billId)) {
    const unbilled = own.filter((t) => !t.billId).reduce((sum, t) => sum - t.amount, 0)
    return { amount: unbilled + expectedInstallments, closeDate: close, dueDate: due, closed: false, source: 'unbilled' }
  }

  // 3. From the closing date.
  if (!close) return null
  const dated = own.filter((t) => inCycle(t.date)).reduce((sum, t) => sum - t.amount, 0)
  return { amount: dated + expectedInstallments, closeDate: close, dueDate: due, closed: close < todayISO, source: 'cycle' }
}
