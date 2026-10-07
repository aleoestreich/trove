// Recurring charges ("Recorrentes"): subscriptions and other bills that the
// same merchant charges every month or every year. Shared by the app and the
// server (GET /api/recurring), so it imports only types, data and date math.
//
// Detection runs on the stored transactions every time they are read, so it
// follows each sync and each edit; the hand-set answers (RecurringOverride)
// are stored apart and applied on top.
//
// - Candidates: expenses that are not hidden, not transfers or card bill
//   payments, and not installments.
// - They are grouped by merchant: the description in lower case, without
//   accents, punctuation, payment-processor prefixes or words with digits.
// - Monthly: charges about a month apart (25 to 36 days) with an amount
//   within 10% of the previous one, at least twice. Once a series is
//   established it follows price changes, and a month or two without a charge.
// - Yearly: charges 358 to 372 days apart, within 10%, at least twice.
// - A merchant with other charges around the series (a shop used every
//   week) is not a recurring charge: a series of 2 must be its only charges
//   then, a longer one may have one other for every 3 of its own.
// - Status: new while the series was first seen within the last 2 cycles;
//   stopped after 2 expected charges are missing.
// - Price increase: the latest amount is more than 2% above the stable price
//   before it (2 or more charges within 2%), so varying bills never count.
// - Foreign charges are compared in their own currency; amounts in BRL are
//   what was charged.

import { kindOf } from './categories.js'
import { addDays, addMonths, daysFrom, monthKey } from '../lib/dates.js'
import type { Account, Category, Cents, CurrencyCode, RecurringOverride, Transaction } from './types.js'

export type Cadence = 'monthly' | 'yearly'
export type PaymentMethod = 'card' | 'debit' | 'pix' | 'boleto'
export type RecurringStatus = 'active' | 'new' | 'stopped'
export type RecurringAction = 'confirm' | 'not_recurring' | 'cancelled' | 'still_active' | 'dismiss_increase'
export const RECURRING_ACTIONS: readonly RecurringAction[] = ['confirm', 'not_recurring', 'cancelled', 'still_active', 'dismiss_increase']

export interface RecurringCharge {
  transactionId: string
  date: string
  /** BRL, positive. */
  amount: Cents
  /** Original amount when charged in another currency (positive). */
  foreign?: { currency: CurrencyCode; amount: Cents }
}

export interface RecurringItem {
  /** Stable across detections: the merchant key as a slug (with -2, -3… for a second series). */
  id: string
  /** The normalized merchant, to match transactions to it. */
  key: string
  /** The latest charge's description, without codes and numbers. */
  merchant: string
  categoryId: string | null
  cadence: Cadence
  /** Day of the month of the latest charge. */
  day: number
  /** When the next charge is expected. */
  nextDate: string
  firstDate: string
  lastDate: string
  /** The latest charge in BRL. */
  amount: Cents
  /** The latest charge in its own currency, when it isn't BRL. */
  foreign?: { currency: CurrencyCode; amount: Cents }
  /** What it costs per month: the amount, or a yearly one divided by 12. */
  monthly: Cents
  accountId: string
  paymentMethod: PaymentMethod
  status: RecurringStatus
  /** The latest price increase above 2% (in the charge's currency), if any. */
  priceChange: { from: Cents; to: Cents; date: string; currency: CurrencyCode } | null
  /** The increase is recent and not dismissed: shown as an alert. */
  increaseAlert: boolean
  /** Status came from a hand-set answer. */
  overridden: boolean
  /** The latest charges per month (up to 6, oldest first), in the charge's currency. */
  priceHistory: { month: string; amount: Cents }[]
  /** Every charge, newest first. */
  charges: RecurringCharge[]
}

export interface RecurringAlert {
  type: 'price_up' | 'new' | 'stopped'
  recurringId: string
}

export interface RecurringSummary {
  /** Active (and new) charges per month: monthly ones plus yearly ones divided by 12. */
  monthTotal: Cents
  yearTotal: Cents
  /** Largest monthly cost first. */
  active: RecurringItem[]
  /** Latest charge first. */
  stopped: RecurringItem[]
  alerts: RecurringAlert[]
}

const MONTH_DAYS = 30.44
/** A charge "about a month" after the previous one: within 5 days, around bill dates and weekends. */
const MONTHLY_GAP = { min: 25, max: 36 }
const YEARLY_GAP = { min: 358, max: 372 }
/** Amounts within 10% start a series. */
const SAME_AMOUNT = 0.1
/** An established series follows price changes up to 2x either way. */
const FOLLOW_AMOUNT = 2
/** Above 2%: a price increase. */
const INCREASE = 0.02
/** Price increases are flagged for 3 months. */
const INCREASE_ALERT_DAYS = 92
/** Stopped series stay listed (out of the totals) for a year after the last charge. */
const STOPPED_LISTED_DAYS = 366
/** Stopped series are flagged while the last charge is under 4 cycles old. */
const STOPPED_ALERT_CYCLES = 4

/** Payment processors and site suffixes that come and go in descriptions. */
const NOISE_WORDS = new Set(['pg', 'pag', 'pagseguro', 'mp', 'ifd', 'dl', 'ec', 'pp', 'paypal', 'iz', 'ebn', 'com', 'br', 'www', 'compra', 'debito', 'credito'])

/**
 * The merchant of a description, to group charges: "PG *NETFLIX.COM 2/3" and
 * "Netflix.com" are both "netflix". Empty when nothing is left.
 */
export function merchantKey(description: string): string {
  return description
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !/\d/.test(w) && !NOISE_WORDS.has(w))
    .join(' ')
}

/** The description as shown: without words that carry digits (codes, dates, installments). */
export function merchantName(description: string): string {
  const name = description
    .split(/\s+/)
    .filter((w) => !/\d/.test(w))
    .join(' ')
    .replace(/[\s*\-–·]+$/, '')
    .replace(/^[\s*\-–·]+/, '')
    .trim()
  return name || description.trim()
}

/** How the charge was paid: by card, or from a bank account by Pix, boleto or debit. */
export function paymentMethodOf(t: Pick<Transaction, 'description'>, account: Pick<Account, 'type'> | undefined): PaymentMethod {
  if (account?.type === 'CREDIT') return 'card'
  if (/\bpix\b/i.test(t.description)) return 'pix'
  if (/boleto/i.test(t.description)) return 'boleto'
  return 'debit'
}

/** Whether a transaction can be part of a recurring charge. */
export function isRecurringCandidate(t: Transaction, categoriesById: Map<string, Category>): boolean {
  return t.amount < 0 && !t.hidden && !t.transfer && !t.installment && kindOf(t, categoriesById) === 'expense'
}

/** The amount compared between charges: in the charge's own currency. */
const valueOf = (c: RecurringCharge) => c.foreign?.amount ?? c.amount
const currencyOf = (c: RecurringCharge) => c.foreign?.currency ?? 'BRL'

/** Whether `gap` days is `k` cycles of a month (k = 1, 2 or 3), give or take a few days. */
function monthsApart(gap: number, maxCycles: number): boolean {
  for (let k = 1; k <= maxCycles; k++) {
    const min = k === 1 ? MONTHLY_GAP.min : Math.round(k * MONTH_DAYS) - 6
    const max = k === 1 ? MONTHLY_GAP.max : Math.round(k * MONTH_DAYS) + 6
    if (gap >= min && gap <= max) return true
  }
  return false
}

/**
 * Builds series from one merchant's charges (oldest first): each charge joins
 * the series it continues best, or starts a new one.
 */
function chains(charges: RecurringCharge[], cadence: Cadence): RecurringCharge[][] {
  const out: RecurringCharge[][] = []
  for (const c of charges) {
    let best: RecurringCharge[] | null = null
    let bestScore = Infinity
    for (const chain of out) {
      const last = chain[chain.length - 1]
      if (currencyOf(last) !== currencyOf(c)) continue
      const gap = daysFrom(last.date, c.date)
      const established = chain.length >= 2
      const timed = cadence === 'monthly' ? monthsApart(gap, established ? 3 : 1) : gap >= YEARLY_GAP.min && gap <= YEARLY_GAP.max
      if (!timed) continue
      const ratio = valueOf(c) / valueOf(last)
      const close = established ? ratio <= FOLLOW_AMOUNT && ratio >= 1 / FOLLOW_AMOUNT : Math.abs(ratio - 1) <= SAME_AMOUNT
      if (!close) continue
      const score = Math.abs(ratio - 1) + (established ? 0 : 1)
      if (score < bestScore) {
        best = chain
        bestScore = score
      }
    }
    if (best) best.push(c)
    else out.push([c])
  }
  return out.filter((chain) => chain.length >= 2)
}

/**
 * Whether a monthly series stands out from the merchant's other charges over
 * its span. A series of 2 must be the only charges there; a longer one may
 * have a few others (one for every 3 of its own) outside any series. Rules
 * out shops used every week, where two similar amounts a month apart are a
 * coincidence.
 */
function standsOut(chain: RecurringCharge[], all: RecurringCharge[], inAnySeries: Set<string>): boolean {
  const ids = new Set(chain.map((c) => c.transactionId))
  const from = chain[0].date
  const to = addDays(chain[chain.length - 1].date, MONTHLY_GAP.max)
  const around = all.filter((c) => !ids.has(c.transactionId) && c.date >= from && c.date <= to)
  if (chain.length === 2) return around.length === 0
  return around.filter((c) => !inAnySeries.has(c.transactionId)).length <= Math.floor(chain.length / 3)
}

/**
 * The latest increase above 2%: the latest amount vs the stable price before
 * it (at least 2 charges within 2% of each other). Bills that vary every
 * month have no stable price, so they never count as an increase.
 */
function latestIncrease(chain: RecurringCharge[]): RecurringItem['priceChange'] {
  const runStart = (end: number) => {
    let i = end
    while (i > 0 && Math.abs(valueOf(chain[i - 1]) / valueOf(chain[end]) - 1) <= INCREASE) i--
    return i
  }
  const start = runStart(chain.length - 1)
  if (start < 2) return null
  const before = start - 1
  if (before - runStart(before) < 1) return null
  const latest = valueOf(chain[chain.length - 1])
  const from = valueOf(chain[before])
  return latest > from * (1 + INCREASE) ? { from, to: latest, date: chain[start].date, currency: currencyOf(chain[start]) } : null
}

const slug = (key: string) => key.replace(/ /g, '-').slice(0, 60).replace(/-+$/, '')

/**
 * Detects the recurring charges in `transactions` as of `today` (ISO date),
 * with the hand-set answers applied.
 */
export function detectRecurring(
  transactions: Transaction[],
  accounts: Account[],
  categories: Category[],
  overrides: Record<string, RecurringOverride> = {},
  today: string,
): RecurringSummary {
  const categoriesById = new Map(categories.map((c) => [c.id, c]))
  const accountsById = new Map(accounts.map((a) => [a.id, a]))
  const byTx = new Map<string, Transaction>()
  const groups = new Map<string, RecurringCharge[]>()
  for (const t of transactions) {
    if (t.date > today || !isRecurringCandidate(t, categoriesById)) continue
    const key = merchantKey(t.description)
    if (!key) continue
    byTx.set(t.id, t)
    const charge: RecurringCharge = { transactionId: t.id, date: t.date, amount: -t.amount }
    if (t.foreign) charge.foreign = { currency: t.foreign.currency, amount: Math.abs(t.foreign.amount) }
    groups.set(key, [...(groups.get(key) ?? []), charge])
  }

  const items: RecurringItem[] = []
  for (const [key, list] of groups) {
    const charges = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.transactionId.localeCompare(b.transactionId))
    const series = chains(charges, 'monthly')
    const inAnySeries = new Set(series.flat().map((c) => c.transactionId))
    const monthly = series.filter((c) => standsOut(c, charges, inAnySeries))
    const used = new Set(monthly.flat().map((c) => c.transactionId))
    const yearly = chains(
      charges.filter((c) => !used.has(c.transactionId)),
      'yearly',
    )
    const found = [...monthly.map((c) => ({ chain: c, cadence: 'monthly' as const })), ...yearly.map((c) => ({ chain: c, cadence: 'yearly' as const }))]
    // The first series keeps the plain ID; a second one at the same merchant gets "-2", "-3"…
    found.sort((a, b) => a.chain[0].date.localeCompare(b.chain[0].date))
    found.forEach(({ chain, cadence }, i) => {
      const id = i === 0 ? slug(key) : `${slug(key)}-${i + 1}`
      const item = toItem(id, key, chain, cadence, byTx, accountsById, overrides[id], today)
      if (item) items.push(item)
    })
  }

  const active = items.filter((i) => i.status !== 'stopped').sort((a, b) => b.monthly - a.monthly || a.merchant.localeCompare(b.merchant))
  const stopped = items
    .filter((i) => i.status === 'stopped' && daysFrom(i.lastDate, today) <= STOPPED_LISTED_DAYS)
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate))
  const monthTotal = active.reduce((s, i) => s + i.monthly, 0)
  const alerts: RecurringAlert[] = [
    ...active.filter((i) => i.increaseAlert).map((i) => ({ type: 'price_up' as const, recurringId: i.id })),
    ...active.filter((i) => i.status === 'new').map((i) => ({ type: 'new' as const, recurringId: i.id })),
    ...stopped
      .filter((i) => !i.overridden && daysFrom(i.lastDate, today) <= STOPPED_ALERT_CYCLES * (i.cadence === 'monthly' ? MONTH_DAYS : 365))
      .map((i) => ({ type: 'stopped' as const, recurringId: i.id })),
  ]
  return { monthTotal, yearTotal: monthTotal * 12, active, stopped, alerts }
}

function toItem(
  id: string,
  key: string,
  chain: RecurringCharge[],
  cadence: Cadence,
  byTx: Map<string, Transaction>,
  accountsById: Map<string, Account>,
  override: RecurringOverride | undefined,
  today: string,
): RecurringItem | null {
  if (override?.status === 'not_recurring') return null
  const first = chain[0]
  const last = chain[chain.length - 1]
  const lastTx = byTx.get(last.transactionId)!
  const cycle = cadence === 'monthly' ? 1 : 12
  // Missing 2 expected charges (with a few days' slack): stopped.
  const missed = today > addDays(addMonths(last.date, 2 * cycle), 5)
  // First seen when its second charge came in.
  const isNew = daysFrom(chain[1].date, today) <= 2 * cycle * MONTH_DAYS
  let status: RecurringStatus = missed ? 'stopped' : isNew ? 'new' : 'active'
  let overridden = false
  if (override?.status) {
    overridden = true
    if (override.status === 'cancelled') {
      // Cancelled, unless it has charged again since.
      status = override.statusAt && last.date > override.statusAt ? 'active' : 'stopped'
    } else if (override.status === 'still_active') status = 'active'
    else if (status === 'new') status = 'active'
  }
  const priceChange = latestIncrease(chain)
  const increaseAlert =
    !!priceChange &&
    status !== 'stopped' &&
    daysFrom(priceChange.date, today) <= INCREASE_ALERT_DAYS &&
    !(override?.increaseDismissedAt && override.increaseDismissedAt >= priceChange.date)
  // One price per month: the latest charge of each.
  const perMonth = new Map<string, Cents>()
  for (const c of chain) perMonth.set(monthKey(c.date), valueOf(c))
  const amount = last.amount
  return {
    id,
    key,
    merchant: merchantName(lastTx.description),
    categoryId: lastTx.categoryId,
    cadence,
    day: Number(last.date.slice(8, 10)),
    nextDate: addMonths(last.date, cycle),
    firstDate: first.date,
    lastDate: last.date,
    amount,
    foreign: last.foreign,
    monthly: cadence === 'monthly' ? amount : Math.round(amount / 12),
    accountId: lastTx.accountId,
    paymentMethod: paymentMethodOf(lastTx, accountsById.get(lastTx.accountId)),
    status,
    priceChange,
    increaseAlert,
    overridden,
    priceHistory: [...perMonth].slice(-6).map(([month, value]) => ({ month, amount: value })),
    charges: [...chain].reverse(),
  }
}

/** A hand-set answer as the stored override it becomes (merged into the current one). */
export function applyRecurringAction(current: RecurringOverride | undefined, action: RecurringAction, at: string): RecurringOverride {
  const base = { ...current }
  switch (action) {
    case 'confirm':
      return { ...base, status: 'confirmed', statusAt: at }
    case 'not_recurring':
      return { ...base, status: 'not_recurring', statusAt: at }
    case 'cancelled':
      return { ...base, status: 'cancelled', statusAt: at }
    case 'still_active':
      return { ...base, status: 'still_active', statusAt: at }
    case 'dismiss_increase':
      return { ...base, increaseDismissedAt: at }
  }
}
