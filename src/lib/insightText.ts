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

/** How a recurring charge is paid: "Cartão Nubank", "Pix Itaú". */
export function paymentLabel(method: PaymentMethod, bank: string): string {
  return t.recurring.account[method](bank).trim()
}

/** A projected event's name and description ("Fatura Nubank", "Cartão de crédito"). */
export function describeEvent(e: ProjectionEvent, accounts: Account[], institutions: Institution[]): { name: string; meta: string } {
  const p = t.projection
  switch (e.kind) {
    case 'bill':
      return {
        name: p.event.bill(bankName(e.accountId, accounts, institutions)),
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
