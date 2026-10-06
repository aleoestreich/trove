import type { Account } from '../data/types'

/** Order of account kinds within a bank: checking first, then savings, then cards. */
const RANK: Record<Account['subtype'], number> = { CHECKING_ACCOUNT: 0, SAVINGS_ACCOUNT: 1, CREDIT_CARD: 2 }

/** A bank's accounts in display order; accounts of the same kind keep their order. */
export function sortForDisplay(accounts: Account[]): Account[] {
  return [...accounts].sort((a, b) => (RANK[a.subtype] ?? 3) - (RANK[b.subtype] ?? 3))
}
