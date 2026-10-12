// Reads what the app shows from the database: no call to Pluggy or to a rate
// service. The stored Pluggy rows go through the same mapping as live data
// (server/pluggy/map.ts), then the stored categories, subcategories and
// "hidden" flags are applied.

import { MONTHS_OF_ANALYSIS, MONTHS_OF_HISTORY, type Snapshot, type SyncInfo, type Transaction, type TransferOverride } from '../../src/data/types.js'
import { toSnapshot } from '../pluggy/map.js'
import type { PluggyAccount, PluggyItem, PluggyTransaction } from '../pluggy/types.js'
import { readBalanceTarget, readExtraPay, readOverviewLayout, readCategories, readFgts, readIncomeFilter, readPension, readProjectionSettings, readRecurringOverrides } from './categories.js'
import { withAccountNames } from '../../src/data/edits.js'
import type { Db } from './connection.js'
import { readReceivables } from './receivables.js'
import { withReceivables } from '../../src/data/receivables.js'
import { HISTORY_START } from './sync.js'
import { filterTransactions, type TransactionQuery } from '../../src/data/transactionFilter.js'
import { addDays, daysInMonth } from '../../src/lib/dates.js'
import { BILLS_USED, estimateCardDays, type EstimatedCardDays } from '../../src/data/closingDay.js'

/** When each configured connection last synced; overall = the oldest of them (null until all have). */
export async function readSyncInfo(db: Db, itemIds: string[]): Promise<SyncInfo> {
  const rows = await db.query<{ id: string; bank_name: string | null; synced_at: Date; status: string | null }>(
    `SELECT id, bank_name, synced_at, status FROM bank_connections WHERE id = ANY($1::text[])`,
    [itemIds],
  )
  const byId = new Map(rows.rows.map((r) => [r.id, r]))
  const connections = itemIds.map((id) => {
    const r = byId.get(id)
    return { id, name: r?.bank_name ?? null, lastSyncedAt: r ? r.synced_at.toISOString() : null, status: r?.status ?? null }
  })
  const all = connections.every((c) => c.lastSyncedAt)
  const oldest = all ? connections.map((c) => c.lastSyncedAt!).sort()[0] ?? null : null
  return { lastSyncedAt: oldest, connections }
}

/** Days read before `from` (and after `to`) so transfer and bill-payment pairs across the edge are still matched (pairing spans up to 5 days). */
const PAIRING_MARGIN = 7

/**
 * The snapshot from the database, or null when no configured connection has
 * synced yet: transactions from `from` (and up to `to`, when given). A few
 * more days are read on each side for the pairing, then left out.
 */
export async function readSnapshot(db: Db, itemIds: string[], from: string, to: string | null = null): Promise<Snapshot | null> {
  const sync = await readSyncInfo(db, itemIds)
  if (sync.connections.every((c) => !c.lastSyncedAt)) return null

  const items = await db.query<{ raw: PluggyItem }>(`SELECT raw FROM bank_connections WHERE id = ANY($1::text[])`, [itemIds])
  const accounts = await db.query<{ id: string; raw: PluggyAccount; nickname: string | null; card_close_day: number | null; card_due_day: number | null }>(
    `SELECT id, raw, nickname, card_close_day, card_due_day FROM accounts WHERE connection_id = ANY($1::text[])`,
    [itemIds],
  )
  const txs = await db.query<{ raw: PluggyTransaction; category_id: string | null; subcategory_id: string | null; is_hidden: boolean; edited: boolean; transfer_override: TransferOverride | null }>(
    `SELECT t.raw, t.category_id, t.subcategory_id, t.is_hidden, t.category_edited_at IS NOT NULL AS edited, t.transfer_override
     FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE a.connection_id = ANY($1::text[]) AND t.removed_at IS NULL AND t.booked_on >= $2::date
       AND ($3::date IS NULL OR t.booked_on <= $3::date)
     ORDER BY t.booked_on DESC, t.date DESC`,
    [itemIds, addDays(from, -PAIRING_MARGIN), to && addDays(to, PAIRING_MARGIN)],
  )
  // Every month with a stored transaction, for Transações' month filter (older ones are fetched on demand).
  const months = await db.query<{ month: string }>(
    `SELECT DISTINCT to_char(t.booked_on, 'YYYY-MM') AS month
     FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE a.connection_id = ANY($1::text[]) AND t.removed_at IS NULL
     ORDER BY month`,
    [itemIds],
  )
  const rates = await db.query<{ currency_code: string; brl_per_unit: string }>(
    `SELECT DISTINCT ON (currency_code) currency_code, brl_per_unit FROM exchange_rates ORDER BY currency_code, as_of DESC`,
  )
  const { categories, subcategories } = await readCategories(db)

  const snapshot = toSnapshot({
    items: items.rows.map((r) => r.raw),
    accounts: accounts.rows.map((r) => r.raw),
    transactions: txs.rows.map((r) => r.raw),
    rates: Object.fromEntries(rates.rows.map((r) => [r.currency_code.trim(), Number(r.brl_per_unit)])),
    fetchedAt: sync.lastSyncedAt ?? new Date().toISOString(),
    owner: {
      categories,
      subcategories,
      stored: new Map(
        txs.rows.map((r) => [r.raw.id, { categoryId: r.category_id, subcategoryId: r.subcategory_id, hidden: r.is_hidden, edited: r.edited, transferOverride: r.transfer_override }]),
      ),
    },
  })
  const estimates = await readEstimatedCardDays(db, snapshot.accounts.filter((a) => a.creditData && !a.creditData.balanceCloseDate).map((a) => a.id))
  return withReceivables(withAccountNames({
    ...snapshot,
    accounts: snapshot.accounts.map((a) => (a.creditData && estimates.has(a.id) ? { ...a, creditData: { ...a.creditData, estimatedDays: estimates.get(a.id) } } : a)),
    transactions: snapshot.transactions.filter((t) => t.date >= from && (!to || t.date <= to)),
    accountNames: Object.fromEntries(accounts.rows.filter((r) => r.nickname).map((r) => [r.id, r.nickname!])),
    cardDays: Object.fromEntries(accounts.rows.filter((r) => r.card_close_day && r.card_due_day).map((r) => [r.id, { close: r.card_close_day!, due: r.card_due_day! }])),
    storedMonths: months.rows.map((r) => r.month),
    sync,
    incomeFilter: await readIncomeFilter(db),
    projectionSettings: await readProjectionSettings(db),
    recurringOverrides: await readRecurringOverrides(db),
    fgts: await readFgts(db),
    pension: await readPension(db),
    balanceTarget: await readBalanceTarget(db),
    overviewLayout: await readOverviewLayout(db),
    extraPay: await readExtraPay(db),
    receivables: await readReceivables(db),
  }))
}

/**
 * Each card's closing and due days from its last stored bills: their own
 * closing dates (`closing_date`), or estimated from the purchases charged to them (and the
 * ones after them). Only for cards whose bank reports no closing date; cards
 * without enough data are left out.
 */
export async function readEstimatedCardDays(db: Db, cardIds: string[]): Promise<Map<string, EstimatedCardDays>> {
  const out = new Map<string, EstimatedCardDays>()
  if (cardIds.length === 0) return out
  // The last bills of each card (one more than used: its purchases sit after the one before).
  const bills = await db.query<{ id: string; account_id: string; due_date: string; closing: string | null }>(
    `SELECT id, account_id, to_char(due_date, 'YYYY-MM-DD') AS due_date, to_char(closing_date, 'YYYY-MM-DD') AS closing FROM (
       SELECT id, account_id, due_date, closing_date, row_number() OVER (PARTITION BY account_id ORDER BY due_date DESC) AS n
       FROM card_bills WHERE account_id = ANY($1::text[])
     ) b WHERE n <= $2`,
    [cardIds, BILLS_USED + 1],
  )
  if (bills.rows.length === 0) return out
  // Purchases (debits) from about two cycles before the oldest of those bills.
  const purchases = await db.query<{ account_id: string; booked_on: string; card_bill_id: string | null }>(
    `SELECT t.account_id, to_char(t.booked_on, 'YYYY-MM-DD') AS booked_on, t.card_bill_id
     FROM transactions t
     WHERE t.account_id = ANY($1::text[]) AND t.removed_at IS NULL AND t.type = 'DEBIT'
       AND t.booked_on >= (SELECT min(due_date) FROM card_bills WHERE id = ANY($2::text[])) - 70`,
    [cardIds, bills.rows.map((b) => b.id)],
  )
  for (const id of cardIds) {
    const estimate = estimateCardDays(
      bills.rows.filter((b) => b.account_id === id).map((b) => ({ id: b.id, dueDate: b.due_date, closingDate: b.closing })),
      purchases.rows.filter((p) => p.account_id === id).map((p) => ({ date: p.booked_on, billId: p.card_bill_id })),
    )
    if (estimate) out.set(id, estimate)
  }
  return out
}

/**
 * First day of the oldest month the app shows, as YYYY-MM-DD; `extra` months
 * further back (the database read adds one, for the 6-complete-month income average).
 */
export function historyStart(now: Date, extra = 0): string {
  const d = new Date(now.getFullYear(), now.getMonth() - (MONTHS_OF_HISTORY - 1) - extra, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/**
 * First day the app loads: the months the insights need (MONTHS_OF_ANALYSIS,
 * the current one included). Older stored months are fetched by Transações
 * when asked for (readTransactions).
 */
export function readStart(now: Date): string {
  return historyStart(now, MONTHS_OF_ANALYSIS - MONTHS_OF_HISTORY)
}

/**
 * GET /api/transactions: a month's (or every stored month's) transactions,
 * mapped as the app maps them, with Transações' filters applied. Null when
 * nothing has synced yet.
 */
export async function readTransactions(db: Db, itemIds: string[], q: TransactionQuery): Promise<Transaction[] | null> {
  const all = q.month === 'all'
  const first = all ? HISTORY_START : `${q.month}-01`
  const last = all ? null : `${q.month}-${String(daysInMonth(q.month)).padStart(2, '0')}`
  const s = await readSnapshot(db, itemIds, first, last)
  if (!s) return null
  return filterTransactions(s.transactions, new Map(s.categories.map((c) => [c.id, c])), { ...q, month: undefined })
}
