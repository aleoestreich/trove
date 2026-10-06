import type { Account, Cents, Transaction } from '../data/types'
import { addMonths, toISO } from './dates'
import type { InstallmentPlan } from './installments'

/** The card bill to show: the open one, or the closed one still to be paid. */
export interface CardBill {
  amount: Cents
  /** Day this bill closes (or closed). */
  closeDate: string
  /** The previous closing: the cycle is the days after it, up to `closeDate`. */
  fromDate: string
  /** Installments expected to post in the cycle that aren't in the data yet (included in `amount`). */
  expected: Cents
  dueDate: string | null
  /** Closed but not due yet: this is the amount to pay now. */
  closed: boolean
  /** Closed bills: bill payments made since it closed (a partial payment; `amount` is what's left). */
  paid: Cents
  /**
   * Where the amount comes from, most reliable first:
   * - "bank-bill": the bank's own closed bill (Pluggy's bills);
   * - "unbilled": the card's transactions the bank hasn't put on a bill yet;
   * - "cycle": the transactions dated in the cycle.
   */
  source: 'bank-bill' | 'unbilled' | 'cycle'
  /** "bank-bill": the bank's bill ID, which its transactions are tagged with. */
  billId?: string
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
 * When the bank gives more, it's used first (the dates can miss: installments
 * are often dated on the purchase day, and closing days shift):
 * - a closed bill from the bank that isn't due yet is the closed bill, with
 *   its own total (which includes any unpaid remainder carried over);
 * - when the bank tags billed transactions with their bill, the open bill is
 *   the card's transactions not on any bill yet, plus expected installments.
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

  // The bank tags billed transactions with their bill: what's untagged is still open.
  const tagged = own.some((t) => t.billId)

  /** What a cycle's bill adds up to (`open`: the bill still taking purchases). */
  const billOf = (close: string, open: boolean) => {
    const from = addMonths(close, -1) // previous closing, excluded
    const inCycle = (date: string) => date > from && date <= close
    const source: CardBill['source'] = open && tagged ? 'unbilled' : 'cycle'
    let amount = 0
    let expected = 0
    for (const t of own) {
      if (t.categoryId === 'card-payment') continue
      if (source === 'unbilled' ? !t.billId : inCycle(t.date)) amount -= t.amount
    }
    for (const p of plans) {
      if (p.accountId !== account.id) continue
      for (const u of p.upcoming) if (inCycle(u.date)) expected += u.amount
    }
    return { amount: amount + expected, expected, source }
  }
  /** Bill payments on the card since `close` (up to today). */
  const paidSince = (close: string) =>
    own.filter((t) => t.categoryId === 'card-payment' && t.amount > 0 && t.date > close && t.date <= todayISO).reduce((sum, t) => sum + t.amount, 0)

  // Move past bills that are already due (or closed, without a due date). Bounded.
  let k = 0
  while (k < 24 && (cycle(k).due ? cycle(k).due! < todayISO : cycle(k).close < todayISO)) k++

  // The bank's closed bill, while it isn't due: it closed at the last closing
  // on or before today (by the dates, that's this cycle or the one before).
  const bank = credit.lastBill && credit.lastBill.dueDate >= todayISO ? credit.lastBill : null
  if (bank && cycle(k).close >= todayISO) k--

  const bill = (close: string, due: string | null, b: { amount: Cents; expected: Cents; source: CardBill['source'] }, paid: Cents, billId?: string): CardBill => ({
    amount: b.amount - paid,
    closeDate: close,
    fromDate: addMonths(close, -1),
    expected: b.expected,
    dueDate: due,
    closed: close < todayISO,
    paid,
    source: b.source,
    ...(billId && { billId }),
  })

  let { close, due } = cycle(k)
  const closedBill = bank
    ? { amount: bank.amount, expected: 0, source: 'bank-bill' as const }
    : close < todayISO
      ? billOf(close, false)
      : null
  if (!closedBill) return bill(close, due, billOf(close, true), 0)

  // Closed and not due yet: if it's been paid, the next cycle is what matters now.
  if (bank) due = bank.dueDate
  const paid = paidSince(close)
  if (paid < closedBill.amount - PAID_TOLERANCE) return bill(close, due, closedBill, paid, bank?.id)
  ;({ close, due } = cycle(k + 1))
  return bill(close, due, billOf(close, true), 0)
}

/**
 * Whether a transaction is part of a bill: the card's purchases and refunds
 * (bill payments aren't) on the bank's bill, not on any bill yet, or dated in
 * the cycle, following where the bill's amount came from.
 */
export function inBill(t: Transaction, accountId: string, bill: CardBill): boolean {
  if (t.accountId !== accountId || t.categoryId === 'card-payment') return false
  if (bill.source === 'bank-bill' && bill.billId) return t.billId === bill.billId
  if (bill.source === 'unbilled') return !t.billId
  return t.date > bill.fromDate && t.date <= bill.closeDate
}

/**
 * A card with nothing in its current or future cycles: no bill to pay (the
 * current one, or a closed one still unpaid) and no installments still to
 * come. Such cards are hidden from Accounts and Coming up; their past
 * transactions stay in the history. Without a closing date, the balance
 * stands in for the bill.
 */
export function isIdleCard(account: Account, transactions: Transaction[], plans: InstallmentPlan[], today: Date = new Date()): boolean {
  if (account.type !== 'CREDIT') return false
  if (plans.some((p) => p.accountId === account.id && p.remaining > 0)) return false
  const bill = currentBill(account, transactions, plans, today)
  return (bill ? bill.amount : account.balance) <= 0
}
