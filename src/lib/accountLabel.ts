import type { Account } from '../data/types'
import type { Messages } from '../i18n/messages'

/** The account's name, or "USD balance" / "Saldo em USD" when the bank sent none. */
export function accountLabel(account: Account, t: Messages): string {
  return account.name.trim() || t.accounts.balanceIn(account.foreign?.currency ?? 'BRL')
}
