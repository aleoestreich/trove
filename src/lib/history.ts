import type { Account, Cents, Transaction } from '../data/types'
import { convertToBRL } from './money'
import { monthKey } from './dates'

export interface BalancePoint {
  /** "2026-09" */
  month: string
  /** Money in bank accounts, BRL. */
  cash: Cents
  /** Credit card debt (bills not yet paid), BRL. */
  cardDebt: Cents
  net: Cents
}

/**
 * Balances at the end of each month, rebuilt backwards from today's balances:
 * balance at end of M = today's balance - every transaction after M.
 * The last point is today. Foreign-currency accounts are rebuilt in their own
 * currency and converted at that month's rate (taken from that month's
 * transactions; today's rate if the month had none).
 *
 * Hidden transactions are left out: they don't move the line. Today's point
 * is still the bank's balance (which includes them), so a hidden transaction
 * shifts the months before it instead of showing as a jump.
 */
export function balanceHistory(accounts: Account[], transactions: Transaction[], months: string[]): BalancePoint[] {
  const byAccount = new Map<string, Transaction[]>()
  for (const t of transactions) if (!t.hidden) byAccount.set(t.accountId, [...(byAccount.get(t.accountId) ?? []), t])

  return months.map((month) => {
    let cash = 0
    let cardDebt = 0
    for (const a of accounts) {
      const later = (byAccount.get(a.id) ?? []).filter((t) => monthKey(t.date) > month)
      if (a.type === 'CREDIT') {
        // Card balance is amount owed: purchases (negative) raise it, payments lower it.
        cardDebt += a.balance + later.reduce((s, t) => s + t.amount, 0)
      } else if (a.foreign && later.length === 0) {
        cash += a.balance // nothing since: today's balance at today's rate
      } else if (a.foreign) {
        const foreignThen = a.foreign.balance - later.reduce((s, t) => s + (t.foreign?.amount ?? 0), 0)
        cash += convertToBRL(foreignThen, rateIn(byAccount.get(a.id) ?? [], month) ?? a.foreign.rate)
      } else {
        cash += a.balance - later.reduce((s, t) => s + t.amount, 0)
      }
    }
    return { month, cash, cardDebt, net: cash - cardDebt }
  })
}

/** Average BRL-per-unit rate implied by a month's foreign transactions. */
function rateIn(transactions: Transaction[], month: string): number | undefined {
  let brl = 0
  let foreign = 0
  for (const t of transactions) {
    if (!t.foreign || monthKey(t.date) !== month) continue
    brl += Math.abs(t.amount)
    foreign += Math.abs(t.foreign.amount)
  }
  return foreign ? brl / foreign : undefined
}

export interface Slice {
  id: string
  label: string
  amount: Cents
}

/** Cash per institution, largest first. */
export function cashByInstitution(accounts: Account[], names: Map<string, string>): Slice[] {
  const sums = new Map<string, Cents>()
  for (const a of accounts) if (a.type === 'BANK') sums.set(a.institutionId, (sums.get(a.institutionId) ?? 0) + a.balance)
  return [...sums].map(([id, amount]) => ({ id, label: names.get(id) ?? id, amount })).sort((a, b) => b.amount - a.amount)
}

/** Cash per currency (BRL value), largest first. */
export function cashByCurrency(accounts: Account[]): Slice[] {
  const sums = new Map<string, Cents>()
  for (const a of accounts) {
    if (a.type !== 'BANK') continue
    const cur = a.foreign?.currency ?? 'BRL'
    sums.set(cur, (sums.get(cur) ?? 0) + a.balance)
  }
  return [...sums].map(([id, amount]) => ({ id, label: id, amount })).sort((a, b) => b.amount - a.amount)
}
