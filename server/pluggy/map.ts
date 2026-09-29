// Converts Pluggy data into Trove's model (src/data/types.ts).
//
// Rules:
// - Amounts are signed from the transaction type: DEBIT = money out (-),
//   CREDIT = money in (+). On a credit card, a purchase is DEBIT (-) and a
//   bill payment or refund is CREDIT (+), like the demo data.
// - Everything is totalled in BRL. Foreign-currency accounts and transactions
//   are converted with `rates` (BRL per unit) and keep their original amount
//   in `foreign`.
// - Pluggy's category names are matched to Trove's categories; anything
//   unknown falls back to "Other income" / "Other expenses".
// - Money moved between the owner's own accounts is marked as a transfer so it
//   isn't counted as income or expense: Pluggy's "same person transfer" and
//   "credit card payment" categories, plus generic transfers that have a
//   matching opposite transaction (same amount, same day) in another account.

import { categories } from '../../src/data/categories.js'
import type { Account, Cents, Institution, Snapshot, Transaction } from '../../src/data/types.js'
import type { PluggyAccount, PluggyItem, PluggyTransaction } from './types.js'

export interface PluggyData {
  items: PluggyItem[]
  accounts: PluggyAccount[]
  transactions: PluggyTransaction[]
  /** BRL per 1 unit of each non-BRL currency present. */
  rates: Record<string, number>
  fetchedAt: string
}

const cents = (n: number): Cents => Math.round(n * 100)

/** Calendar date in Brazil for an ISO timestamp ("2026-09-20T02:00:00Z" -> "2026-09-19"). */
export function brazilDate(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

function rateOf(currency: string, rates: Record<string, number>): number {
  const c = currency.toUpperCase()
  if (c === 'BRL') return 1
  const r = rates[c]
  if (!r) throw new Error(`Missing exchange rate for ${c}.`)
  return r
}

function color(primary: string | null | undefined): string {
  const hex = (primary ?? '').replace(/^#/, '')
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex}` : '#6f6d68'
}

// ---------------------------------------------------------------------------
// Categories

/** Keyword rules on Pluggy's category name (English or Portuguese), first match wins. */
const CATEGORY_RULES: [RegExp, string][] = [
  [/same person|mesma titularidade|own account|entre contas/i, 'transfer'],
  [/credit card payment|card payment|pagamento de (fatura|cart)/i, 'card-payment'],
  [/salar|wage|payroll|sal[aá]rio/i, 'salary'],
  [/investment|interest|yield|dividend|rendimento|juros/i, 'investments'],
  [/grocer|supermarket|supermercado|mercado/i, 'groceries'],
  [/restaurant|food|delivery|bakery|coffee|bar\b|aliment|restaurante/i, 'food'],
  [/taxi|ride|uber|transport|fuel|gas station|parking|toll|vehicle|automotive|combust|estacionamento|ped[aá]gio/i, 'transport'],
  [/digital service|streaming|subscription|software|assinatura/i, 'subscriptions'],
  [/shopping|clothing|electronic|online|department|pet|compras|vestu[aá]rio/i, 'shopping'],
  [/health|pharma|drugstore|hospital|clinic|dentist|gym|fitness|wellness|sa[uú]de|farm[aá]cia|academia/i, 'health'],
  [/leisure|entertainment|game|ticket|cinema|music|lazer|entretenimento/i, 'leisure'],
  [/travel|airline|flight|hotel|accommodation|lodging|tourism|viage|hospedagem/i, 'travel'],
  [/education|school|university|course|book|educa|escola|curso/i, 'education'],
  [/tax|fee|tariff|iof|legal obligation|imposto|taxa|tarifa/i, 'taxes'],
  [/rent|housing|condominium|home|mortgage|house|aluguel|moradia|condom[ií]nio/i, 'housing'],
  [/utilit|electric|water|internet|telecom|phone|mobile|energia|[aá]gua|telefon/i, 'utilities'],
]

/** Generic transfers (Pix/TED to someone): an expense or income unless paired with another own account. */
const GENERIC_TRANSFER = /transfer|pix|ted\b|doc\b|transfer[eê]ncia/i

export function categoryFor(tx: Pick<PluggyTransaction, 'category' | 'type'>): string {
  const name = tx.category ?? ''
  for (const [re, id] of CATEGORY_RULES) if (re.test(name)) return id
  return tx.type === 'CREDIT' ? 'other-income' : 'other-expense'
}

/** Marks generic transfers that have an opposite twin in another own account. */
function pairOwnTransfers(txs: Transaction[], genericIds: Set<string>) {
  const open = new Map<string, Transaction[]>() // "date|abs amount" -> unmatched
  for (const t of txs) {
    if (!genericIds.has(t.id)) continue
    const key = `${t.date}|${Math.abs(t.amount)}`
    const twin = (open.get(key) ?? []).find((o) => o.accountId !== t.accountId && Math.sign(o.amount) === -Math.sign(t.amount))
    if (twin) {
      twin.categoryId = 'transfer'
      t.categoryId = 'transfer'
      open.set(key, open.get(key)!.filter((o) => o !== twin))
    } else {
      open.set(key, [...(open.get(key) ?? []), t])
    }
  }
}

// ---------------------------------------------------------------------------

export function toSnapshot(data: PluggyData): Snapshot {
  const { rates } = data
  const itemById = new Map(data.items.map((i) => [i.id, i]))

  const institutions: Institution[] = data.items.map((i) => ({ id: i.id, name: i.connector.name, color: color(i.connector.primaryColor) }))

  const accountCurrency = new Map<string, string>()
  const accounts: Account[] = data.accounts
    .filter((a) => itemById.has(a.itemId))
    .map((a) => {
      const currency = (a.currencyCode || 'BRL').toUpperCase()
      accountCurrency.set(a.id, currency)
      const rate = rateOf(currency, rates)
      const account: Account = {
        id: a.id,
        institutionId: a.itemId,
        name: a.marketingName || a.name,
        type: a.type,
        subtype: a.subtype,
        balance: cents(a.balance * rate),
      }
      if (currency !== 'BRL') {
        account.foreign = { currency, balance: cents(a.balance), rate }
      }
      if (a.type === 'CREDIT') {
        const limit = cents((a.creditData?.creditLimit ?? 0) * rate)
        const available = a.creditData?.availableCreditLimit
        account.creditData = {
          creditLimit: limit,
          availableCreditLimit: available != null ? cents(available * rate) : limit - account.balance,
          balanceCloseDate: a.creditData?.balanceCloseDate ? brazilDate(a.creditData.balanceCloseDate) : null,
          balanceDueDate: a.creditData?.balanceDueDate ? brazilDate(a.creditData.balanceDueDate) : null,
        }
      }
      return account
    })

  const genericTransfers = new Set<string>()
  const transactions: Transaction[] = data.transactions
    .filter((t) => accountCurrency.has(t.accountId))
    .map((t) => {
      const accCur = accountCurrency.get(t.accountId)!
      const txCur = (t.currencyCode || accCur).toUpperCase()
      const sign = t.type === 'CREDIT' ? 1 : -1
      // Amount in the account's currency, then in BRL.
      const inAccountCurrency =
        txCur === accCur ? Math.abs(t.amount) : Math.abs(t.amountInAccountCurrency ?? (t.amount * rateOf(txCur, rates)) / rateOf(accCur, rates))
      const factor = rateOf(accCur, rates)
      const tx: Transaction = {
        id: t.id,
        accountId: t.accountId,
        date: brazilDate(t.date),
        description: t.description,
        amount: sign * cents(inAccountCurrency * factor),
        categoryId: categoryFor(t),
        status: t.status === 'PENDING' ? 'PENDING' : 'POSTED',
      }
      if (txCur !== 'BRL') tx.foreign = { currency: txCur, amount: sign * cents(Math.abs(t.amount)) }
      else if (accCur !== 'BRL') tx.foreign = { currency: accCur, amount: sign * cents(inAccountCurrency) }

      const m = t.creditCardMetadata
      if (m?.installmentNumber && m.totalInstallments && m.totalInstallments > 1) {
        // Convert the purchase total at the same rate as this installment.
        const brlPerUnit = Math.abs(t.amount) > 0 ? (inAccountCurrency * factor) / Math.abs(t.amount) : factor
        tx.installment = {
          number: m.installmentNumber,
          total: m.totalInstallments,
          totalAmount: m.totalAmount != null ? cents(Math.abs(m.totalAmount) * brlPerUnit) : Math.abs(tx.amount) * m.totalInstallments,
          purchaseDate: m.purchaseDate ? brazilDate(m.purchaseDate) : tx.date,
        }
      }
      if (tx.categoryId.startsWith('other-') && GENERIC_TRANSFER.test(t.category ?? '')) genericTransfers.add(tx.id)
      return tx
    })

  // Sort chronologically so pairing is stable, then newest first for the app.
  transactions.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  pairOwnTransfers(transactions, genericTransfers)
  transactions.reverse()

  return { institutions, accounts, categories, transactions, source: 'pluggy', fetchedAt: data.fetchedAt }
}
