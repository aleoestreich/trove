// Names and short descriptions for the insights' items, in pt-BR. Shared by
// the app and the server's insight routes, so both say the same thing.

import { messages } from '../i18n/messages.js'
import type { ProjectionEvent } from '../data/projection.js'
import type { PaymentMethod } from '../data/recurring.js'
import type { Account, Institution } from '../data/types.js'
import { formatMoney } from './money.js'

const t = messages.insights

/** The bank behind an account ("Nubank"), or the account's own name. */
export function bankName(accountId: string, accounts: Account[], institutions: Institution[]): string {
  const account = accounts.find((a) => a.id === accountId)
  if (!account) return ''
  return institutions.find((i) => i.id === account.institutionId)?.name ?? account.name
}

/** The name set in Trove for an account, if any. */
export function nicknameOf(accountId: string, accounts: Account[]): string | undefined {
  return accounts.find((a) => a.id === accountId)?.nickname
}

/** How a recurring charge is paid: "Cartão Nubank", "Pix Itaú" (with the account's name in Trove when set: "Pix Conta da casa"). */
export function paymentLabel(method: PaymentMethod, accountId: string, accounts: Account[], institutions: Institution[]): string {
  const nickname = nicknameOf(accountId, accounts)
  if (nickname) return method === 'card' ? nickname : t.recurring.account[method](nickname).trim()
  return t.recurring.account[method](bankName(accountId, accounts, institutions)).trim()
}

/** A projected event's name and description ("Fatura Nubank", "Cartão de crédito"). */
export function describeEvent(e: ProjectionEvent, accounts: Account[], institutions: Institution[]): { name: string; meta: string } {
  const p = t.projection
  switch (e.kind) {
    case 'bill':
      return {
        name: p.event.bill(nicknameOf(e.accountId, accounts) ?? bankName(e.accountId, accounts, institutions)),
        meta: e.installments > 0 ? p.event.billMetaInstallments(formatMoney(e.installments)) : p.event.billMeta,
      }
    case 'recurring':
      return { name: e.name, meta: p.event.recurringMeta(p.methods[e.paymentMethod]) }
    case 'salary':
      return { name: p.event.salary, meta: p.event.estimated }
    case 'freelance':
      return { name: p.event.freelance, meta: p.event.estimated }
  }
}

/** "Nubank, Itaú e Inter". */
export function joinList(names: string[]): string {
  const unique = [...new Set(names.filter(Boolean))]
  return unique.length <= 1 ? (unique[0] ?? '') : `${unique.slice(0, -1).join(', ')} ${t.projection.and} ${unique[unique.length - 1]}`
}
