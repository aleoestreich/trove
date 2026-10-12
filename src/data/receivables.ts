// "A receber": money paid on someone else's behalf (a purchase or a Pix),
// tracked until they pay it back. Each receivable points at the expense it
// came from; its payments point at the money that came in (a Pix received)
// or were typed in by hand (cash, another account). Totals count only what's
// yours: the part of an expense others owe is left out of spending, and the
// money that pays it back out of income (withReceivables, countedAmount).
// Shared by the app and the server (src/data/edits.ts,
// server/db/receivables.ts), so it imports types only.

import type { Cents, Snapshot, Transaction } from './types.js'

export interface ReceivablePayment {
  id: string
  /** The day it came in (ISO date). */
  date: string
  amount: Cents
  /** The incoming transaction it came in; null: received outside the connected accounts. */
  transactionId: string | null
}

export interface Receivable {
  id: string
  /** The expense paid on the person's behalf. */
  transactionId: string
  /** The expense's day (ISO date), shown when the transaction isn't loaded. */
  date: string
  /** Who owes it, as typed. */
  person: string
  /** What they owe (part or all of the expense). */
  amount: Cents
  /** Oldest first. */
  payments: ReceivablePayment[]
}

/** Longest name of a person. */
export const PERSON_MAX = 40
/** The most one receivable can be: R$ 10 milhões. */
export const RECEIVABLE_MAX: Cents = 10_000_000_00

export const received = (r: Receivable): Cents => r.payments.reduce((s, p) => s + p.amount, 0)
export const remaining = (r: Receivable): Cents => r.amount - received(r)
export const isSettled = (r: Receivable) => remaining(r) <= 0

/** Payments oldest first (by day, then ID, so the order is stable). */
export const sortPayments = (payments: ReceivablePayment[]) =>
  [...payments].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

/** Receivables newest first (by the expense's day, then ID). */
export const sortReceivables = (list: Receivable[]) => [...list].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))

/** The same person whatever the case: "ana" and "Ana". */
export const samePerson = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }) === 0

/** What is still owed in all. */
export const owedTotal = (list: Receivable[]): Cents => list.reduce((s, r) => s + Math.max(0, remaining(r)), 0)

export interface PersonOwed {
  /** The name as first typed. */
  person: string
  /** Still owed. */
  remaining: Cents
  /** Their open receivables, newest first. */
  open: Receivable[]
}

/** Who still owes something, most owed first. */
export function owedByPerson(list: Receivable[]): PersonOwed[] {
  const out: PersonOwed[] = []
  for (const r of sortReceivables(list)) {
    if (isSettled(r)) continue
    const p = out.find((x) => samePerson(x.person, r.person))
    if (p) {
      p.remaining += remaining(r)
      p.open.push(r)
    } else out.push({ person: r.person, remaining: remaining(r), open: [r] })
  }
  return out.sort((a, b) => b.remaining - a.remaining || a.person.localeCompare(b.person, 'pt-BR'))
}

/** Every name used, most recent first, once each: suggestions for the next one. */
export function knownPeople(list: Receivable[]): string[] {
  const out: string[] = []
  for (const r of sortReceivables(list)) if (!out.some((p) => samePerson(p, r.person))) out.push(r.person)
  return out
}

/** The receivables of an expense. */
export const receivablesOf = (list: Receivable[], transactionId: string) => list.filter((r) => r.transactionId === transactionId)

/** Each payment that came in through a transaction, with its receivable. */
export const paymentsIn = (list: Receivable[], transactionId: string) =>
  list.flatMap((r) => r.payments.filter((p) => p.transactionId === transactionId).map((payment) => ({ receivable: r, payment })))

/** How much of an expense is already owed by someone (what's left can still be). */
export const owedOf = (list: Receivable[], transactionId: string, except?: string): Cents =>
  receivablesOf(list, transactionId).reduce((s, r) => (r.id === except ? s : s + r.amount), 0)

/** How much of an incoming transaction already pays something back. */
export const usedOf = (list: Receivable[], transactionId: string, except?: string): Cents =>
  paymentsIn(list, transactionId).reduce((s, x) => (x.payment.id === except ? s : s + x.payment.amount), 0)

/** Whether a transaction can be marked as paid on someone's behalf: money out, not a transfer. */
export const canBeOwed = (t: Pick<Transaction, 'amount' | 'transfer'>) => t.amount < 0 && !t.transfer

/** Whether a transaction can pay a receivable back: money in, not a transfer. */
export const canRepay = (t: Pick<Transaction, 'amount' | 'transfer'>) => t.amount > 0 && !t.transfer

/**
 * Incoming transactions that could pay `r` back, best first: on or after its
 * day, not fully used by other payments; the ones whose free amount matches
 * what's owed come first, then the newest.
 */
export function repaymentCandidates(list: Receivable[], r: Receivable, transactions: Transaction[]): { tx: Transaction; free: Cents }[] {
  const owed = remaining(r)
  return transactions
    .filter((t) => canRepay(t) && t.date >= r.date)
    .map((tx) => ({ tx, free: tx.amount - usedOf(list, tx.id) }))
    .filter((x) => x.free > 0)
    .sort((a, b) => Number(b.free === owed) - Number(a.free === owed) || b.tx.date.localeCompare(a.tx.date) || a.tx.id.localeCompare(b.tx.id))
}

/**
 * The transactions with what "A receber" takes out of the totals: each
 * expense's part others owe (`shared`), and each incoming transaction's part
 * that pays a debt back (`repaid`); none where nothing is (an old mark is
 * cleared). Balances, bills and lists keep the bank's amount.
 */
export function withReceivables(s: Snapshot): Snapshot {
  const shared = new Map<string, Cents>()
  const repaid = new Map<string, Cents>()
  for (const r of s.receivables ?? []) {
    shared.set(r.transactionId, (shared.get(r.transactionId) ?? 0) + r.amount)
    for (const p of r.payments) if (p.transactionId) repaid.set(p.transactionId, (repaid.get(p.transactionId) ?? 0) + p.amount)
  }
  let changed = false
  const transactions = s.transactions.map((t) => {
    // Never more than the transaction itself: a later change of rate can shrink its amount in BRL.
    const owed = t.amount < 0 ? Math.min(shared.get(t.id) ?? 0, -t.amount) : 0
    const back = t.amount > 0 ? Math.min(repaid.get(t.id) ?? 0, t.amount) : 0
    if ((t.shared ?? 0) === owed && (t.repaid ?? 0) === back) return t
    changed = true
    const { shared: _s, repaid: _r, ...rest } = t
    return { ...rest, ...(owed ? { shared: owed } : {}), ...(back ? { repaid: back } : {}) }
  })
  return changed ? { ...s, transactions } : s
}
