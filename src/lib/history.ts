// Where the money is now: today's balances split by bank and by currency.
import type { Account, Cents } from '../data/types'

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
