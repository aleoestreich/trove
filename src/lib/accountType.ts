import type { Account } from '../data/types'
import type { Messages } from '../i18n/messages'

export type AccountType = 'checking' | 'savings' | 'usd' | 'card'

/** The kind of account, for its icon and label. Anything unknown counts as checking. */
export function accountType(account: Account): AccountType {
  if (account.type === 'CREDIT' || account.subtype === 'CREDIT_CARD') return 'card'
  if (account.foreign?.currency === 'USD') return 'usd'
  if (account.subtype === 'SAVINGS_ACCOUNT') return 'savings'
  return 'checking'
}

/**
 * Labels for a bank's accounts on Accounts: the kind of account ("Checking",
 * "Credit card"…), or "EUR balance" for other foreign balances. When a bank has
 * two of the same, each also shows its own name ("Credit card · Platinum").
 * A name set in Trove replaces the label.
 */
export function accountTypeLabels(accounts: Account[], t: Messages): Map<string, string> {
  const base = (a: Account) => {
    const type = accountType(a)
    return a.foreign && type !== 'usd' ? t.accounts.balanceIn(a.foreign.currency) : t.accounts.types[type]
  }
  const counts = new Map<string, number>()
  for (const a of accounts) counts.set(base(a), (counts.get(base(a)) ?? 0) + 1)
  return new Map(
    accounts.map((a) => {
      if (a.nickname) return [a.id, a.nickname]
      const label = base(a)
      const name = a.name.trim()
      return [a.id, (counts.get(label) ?? 0) > 1 && name && name !== label ? `${label} · ${name}` : label]
    }),
  )
}
