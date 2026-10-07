import type { Account } from '../data/types'
import type { Messages } from '../i18n/messages'

/** The name set in Trove, else the account's name, or "Saldo em USD" when the bank sent none. */
export function accountLabel(account: Account, t: Messages): string {
  return account.nickname || account.name.trim() || t.accounts.balanceIn(account.foreign?.currency ?? 'BRL')
}
