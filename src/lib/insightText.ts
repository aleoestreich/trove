// Names and short descriptions for the insights' items, in pt-BR. Shared by
// the app and the server's insight routes, so both say the same thing.

import { messages } from '../i18n/messages.js'
import type { ProjectionEvent } from '../data/projection.js'
import type { PaymentMethod } from '../data/recurring.js'
import type { Account, Institution } from '../data/types.js'
import { formatMoney } from './money.js'
import { shownName } from './accountLabel.js'

const t = messages.insights

/** The bank behind an account ("Nubank"), or the account's own name. */
export function bankName(accountId: string, accounts: Account[], institutions: Institution[]): string {
  const account = accounts.find((a) => a.id === accountId)
  if (!account) return ''
  return institutions.find((i) => i.id === account.institutionId)?.name ?? account.name
}

/** An account as named on screen: its name in Trove, else its bank ("Nubank"). */
export function accountName(accountId: string, accounts: Account[], institutions: Institution[]): string {
  return shownName(accounts.find((a) => a.id === accountId), bankName(accountId, accounts, institutions))
}

/** How a recurring charge is paid: its card or account by name in Trove ("Cartão da casa", "Pix Conta da casa"), else "Cartão Nubank", "Pix Itaú". */
export function paymentLabel(method: PaymentMethod, accountId: string, accounts: Account[], institutions: Institution[]): string {
  const account = accounts.find((a) => a.id === accountId)
  const bank = bankName(accountId, accounts, institutions)
  if (method === 'card') return shownName(account, t.recurring.account.card(bank).trim())
  return t.recurring.account[method](shownName(account, bank)).trim()
}

/** A projected event's name and description ("Fatura Nubank", "Cartão de crédito"). */
export function describeEvent(e: ProjectionEvent, accounts: Account[], institutions: Institution[]): { name: string; meta: string } {
  const p = t.projection
  switch (e.kind) {
    case 'bill':
      return {
        name: p.event.bill(accountName(e.accountId, accounts, institutions)),
        meta: e.estimated ? p.event.billEstimated : e.installments > 0 ? p.event.billMetaInstallments(formatMoney(e.installments)) : p.event.billMeta,
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
