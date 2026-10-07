import type { Account } from '../data/types.js'
import type { Messages } from '../i18n/messages.js'

/**
 * The one rule for naming an account on any screen: the name set in Trove
 * when there is one, otherwise the original (whatever that screen shows by
 * default: "Cartão Nubank", "Itaú", "Conta corrente"…).
 */
export function shownName(account: Pick<Account, 'nickname'> | undefined, original: string): string {
  return account?.nickname || original
}

/** The name set in Trove, else the account's name, or "Saldo em USD" when the bank sent none. */
export function accountLabel(account: Account, t: Messages): string {
  return shownName(account, account.name.trim() || t.accounts.balanceIn(account.foreign?.currency ?? 'BRL'))
}
