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
// Banks
//
// Meu Pluggy gathers accounts from many banks under one item, whose connector
// is "MeuPluggy". The real bank is only in each account's name, e.g.
// "Nu Pagamentos S.A. - Instituição de Pagamento (Conta Pré-paga)". Those
// accounts are grouped by bank; other items stay one institution each.

/** True for the Meu Pluggy connector (the same match as connectToken.ts). */
export function isMeuPluggy(item: PluggyItem): boolean {
  return /^meu\s*pluggy$/i.test(item.connector.name.trim())
}

/** Well-known names, matched on the account's legal or marketing name. First match wins. */
const BANKS: [RegExp, string][] = [
  [/\bnu\s*(pagamentos|bank|financeira|invest)|\bnubank\b/i, 'Nubank'],
  [/\bita[uú]/i, 'Itaú'],
  [/\b(banco\s+)?inter\b/i, 'Inter'],
  [/\bwise\b/i, 'Wise'],
  [/\bbradesco\b/i, 'Bradesco'],
  [/\bsantander\b/i, 'Santander'],
  [/\bcaixa\s+econ[oô]mica\b/i, 'Caixa'],
  [/\bbanco do brasil\b/i, 'Banco do Brasil'],
  [/\bc6\b/i, 'C6 Bank'],
  [/\bbtg\b/i, 'BTG Pactual'],
  [/\bxp\s+(investimentos|inc)\b|\bbanco xp\b/i, 'XP'],
  [/\bmercado\s*pago\b/i, 'Mercado Pago'],
  [/\bpicpay\b/i, 'PicPay'],
  [/\bpagseguro\b|\bpagbank\b/i, 'PagBank'],
  [/\bneon\b/i, 'Neon'],
  [/\bsicoob\b/i, 'Sicoob'],
  [/\bsicredi\b/i, 'Sicredi'],
  [/\bbanrisul\b/i, 'Banrisul'],
  [/\bsafra\b/i, 'Safra'],
  [/\bwill\s*bank\b/i, 'Will Bank'],
  [/\bbanco original\b/i, 'Banco Original'],
]

/** The bank behind a Meu Pluggy account: a known name, else the legal name before " - " or " (". */
export function bankOf(account: Pick<PluggyAccount, 'name' | 'marketingName'>): string | null {
  const text = `${account.name} ${account.marketingName ?? ''}`
  for (const [re, name] of BANKS) if (re.test(text)) return name
  const legal = account.name
    .split(/\s+-\s+|\s*\(/)[0]
    .replace(/[\s,]+(S\.?\s?\/?A\.?|Ltda\.?)$/i, '')
    .trim()
  return legal || null
}

/** "Nu Pagamentos S.A. - Instituição de Pagamento (Conta Pré-paga)" -> "Conta Pré-paga". */
function shortAccountName(a: PluggyAccount): string {
  if (a.marketingName) return a.marketingName
  const kind = /\(([^()]+)\)\s*$/.exec(a.name)?.[1]?.trim()
  return kind || a.name
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

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

  // One institution per item, except Meu Pluggy: one per bank, in the order accounts arrive.
  const institutions: Institution[] = []
  const institutionOf = new Map<string, string>()
  for (const a of data.accounts) {
    const item = itemById.get(a.itemId)
    if (!item) continue
    const bank = isMeuPluggy(item) ? bankOf(a) : null
    const id = bank ? `${item.id}:${slug(bank) || 'bank'}` : item.id
    institutionOf.set(a.id, id)
    if (!institutions.some((i) => i.id === id)) institutions.push({ id, name: bank ?? item.connector.name, color: color(item.connector.primaryColor) })
  }

  const accountCurrency = new Map<string, string>()
  const accounts: Account[] = data.accounts
    .filter((a) => itemById.has(a.itemId))
    .map((a) => {
      const currency = (a.currencyCode || 'BRL').toUpperCase()
      accountCurrency.set(a.id, currency)
      const rate = rateOf(currency, rates)
      const account: Account = {
        id: a.id,
        institutionId: institutionOf.get(a.id)!,
        name: isMeuPluggy(itemById.get(a.itemId)!) ? shortAccountName(a) : a.marketingName || a.name,
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
