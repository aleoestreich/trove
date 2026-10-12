import type { Account, Cents, Transaction } from '../data/types.js'
import { addMonths, toISO } from './dates.js'
import type { InstallmentPlan } from './installments.js'

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
    let expected = 0
    for (const t of own) if (t.transfer !== 'card-payment' && inCycle(t.date)) amount -= t.amount
    for (const p of plans) {
      if (p.accountId !== account.id) continue
      for (const u of p.upcoming) if (inCycle(u.date)) expected += u.amount
    }
    return { amount: amount + expected, expected }
  }
  /** Bill payments on the card since `close` (up to today). */
  const paidSince = (close: string) =>
    own.filter((t) => t.transfer === 'card-payment' && t.amount > 0 && t.date > close && t.date <= todayISO).reduce((sum, t) => sum + t.amount, 0)

  // Move past bills that are already due (or closed, without a due date). Bounded.
  let k = 0
  while (k < 24 && (cycle(k).due ? cycle(k).due! < todayISO : cycle(k).close < todayISO)) k++
  let { close, due } = cycle(k)
  let { amount, expected } = billOf(close)
  let paid = 0
  if (close < todayISO) {
    // Closed and not due yet: if it's been paid, the next cycle is what matters now.
    paid = paidSince(close)
    if (paid >= amount - PAID_TOLERANCE) {
      ;({ close, due } = cycle(k + 1))
      ;({ amount, expected } = billOf(close))
      paid = 0
    } else {
      amount -= paid
    }
  }
  return { amount, closeDate: close, fromDate: addMonths(close, -1), expected, dueDate: due, closed: close < todayISO, paid }
}

/** Closed bills averaged to estimate one still open. */
const ESTIMATE_BILLS = 3

/** A bill due later: its own cycle, and whether its amount is an estimate. */
export interface UpcomingBill extends CardBill {
  /** The cycle hasn't closed: the amount is the larger of what's in it so far and the card's recent average. */
  estimated: boolean
}

/**
 * The card's bills due from today up to `until` (ISO date): the current one,
 * then each following cycle. A bill whose cycle is still open can only grow,
 * so its amount is the larger of what's in it so far (purchases and
 * installments) and the average of the card's last 3 closed bills.
 */
export function upcomingBills(account: Account, transactions: Transaction[], plans: InstallmentPlan[], today: Date, until: string): UpcomingBill[] {
  const first = currentBill(account, transactions, plans, today)
  if (!first?.dueDate) return []
  const todayISO = toISO(today)
  const own = transactions.filter((t) => t.accountId === account.id && t.transfer !== 'card-payment')
  const cycleOf = (close: string) => {
    const from = addMonths(close, -1)
    let amount = 0
    let expected = 0
    for (const t of own) if (t.date > from && t.date <= close) amount -= t.amount
    for (const p of plans) {
      if (p.accountId !== account.id) continue
      for (const u of p.upcoming) if (u.date > from && u.date <= close) expected += u.amount
    }
    return { amount: amount + expected, expected, fromDate: from }
  }
  // The card's recent closed bills (before today), with anything in them.
  const past = Array.from({ length: ESTIMATE_BILLS + 2 }, (_, i) => addMonths(first.closeDate, -(i + 1)))
    .filter((close) => close < todayISO)
    .map((close) => cycleOf(close).amount)
    .filter((amount) => amount > 0)
    .slice(0, ESTIMATE_BILLS)
  const average = past.length ? Math.round(past.reduce((s, x) => s + x, 0) / past.length) : 0
  const estimate = (bill: CardBill): UpcomingBill => {
    const open = bill.closeDate >= todayISO
    return open && average > bill.amount ? { ...bill, amount: average, estimated: true } : { ...bill, estimated: false }
  }
  const out: UpcomingBill[] = []
  for (let k = 0, bill: CardBill = first; k < 24 && bill.dueDate && bill.dueDate <= until; k++) {
    out.push(estimate(bill))
    const close = addMonths(first.closeDate, k + 1)
    const c = cycleOf(close)
    bill = { amount: c.amount, closeDate: close, fromDate: c.fromDate, expected: c.expected, dueDate: addMonths(first.dueDate, k + 1), closed: false, paid: 0 }
  }
  return out
}

/** Whether a transaction is part of a bill: the card's purchases and refunds in its cycle (bill payments aren't). */
export function inBill(t: Transaction, accountId: string, bill: CardBill): boolean {
  return t.accountId === accountId && t.transfer !== 'card-payment' && t.date > bill.fromDate && t.date <= bill.closeDate
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
