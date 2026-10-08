// Sync: fetches one bank connection from Meu Pluggy and saves it to the
// database, in one transaction. Only the Sync button starts it.
//
// - Rows are matched on Pluggy's IDs (connection, account, transaction, bill),
//   so running a sync again never duplicates anything: a repeated ID inside
//   one fetch is kept once, and two syncs of the same connection are
//   serialized by a lock on its ID.
// - A new transaction gets Trove's category guess; an existing one keeps its
//   category, subcategory and "hidden" flag: a sync never overwrites
//   edits.
// - Transactions in the fetched window that Pluggy no longer returns (e.g. a
//   pending purchase that posted under a new ID) are marked removed, not
//   deleted; their edits (category, hidden, card-payment answer) move to the
//   transaction that replaced them.
// - Advanced sync (SyncOptions) can read only some accounts and cards, and
//   choose how far back (SyncPeriod). The other accounts' balances are still
//   updated; only the chosen ones' transactions and bills are read.
// - Each run is logged in sync_runs with counts only; errors keep status
//   codes, never amounts, descriptions or credentials.

import type pg from 'pg'
import { fromGuess } from '../../src/data/categories.js'
import { ALL_HISTORY, periodStart } from '../../src/data/syncPeriod.js'
import type { SyncPeriod, SyncResult } from '../../src/data/types.js'
import { PluggyClient } from '../pluggy/client.js'
import { brazilDate, categoryFor, isMeuPluggy, itemBankName } from '../pluggy/map.js'
import { ratesToBRL } from '../pluggy/rates.js'
import type { PluggyAccount, PluggyBill, PluggyItem, PluggyTransaction } from '../pluggy/types.js'
import { inTransaction, type Db } from './connection.js'

/**
 * How far back Sync fetches. Pluggy returns what each bank provides from
 * there (often about a year). A connection not yet fetched back to it gets
 * one full fetch on its next sync.
 */
export const HISTORY_START = '2025-01-01'
/** Later syncs re-read this many days before the last one, to pick up late changes. */
const OVERLAP_DAYS = 35
/** app_settings key holding how far back a connection has been fetched (YYYY-MM-DD). */
const fetchedFromKey = (itemId: string) => `fetched_from:${itemId}`

const cents = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) : null)
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
const day = (v: unknown): string | null => (typeof v === 'string' && v ? brazilDate(v) : null)

/**
 * The first day of the window to fetch, as YYYY-MM-DD: HISTORY_START until
 * the connection has been fetched back to it (`fetchedFrom`), then 35 days
 * before its last sync.
 */
export function syncFrom(lastSyncedAt: Date | null, fetchedFrom: string | null): string {
  if (!lastSyncedAt || !fetchedFrom || fetchedFrom > HISTORY_START) return HISTORY_START
  return new Date(lastSyncedAt.getTime() - OVERLAP_DAYS * 86_400_000).toISOString().slice(0, 10)
}

export { ALL_HISTORY }

/** The first day a chosen period reads (src/data/syncPeriod.ts), today being Brazil's date. */
export function periodFrom(period: Exclude<SyncPeriod, 'default'>, now: Date): string {
  return periodStart(period, brazilDate(now.toISOString()))
}

/** A connection's name in Trove: the bank for Meu Pluggy items, else the connector. */
export function connectionName(item: PluggyItem, accounts: PluggyAccount[]): string {
  return (isMeuPluggy(item) ? itemBankName(accounts) : null) ?? item.connector.name
}

export interface Fetched {
  item: PluggyItem
  accounts: PluggyAccount[]
  transactions: PluggyTransaction[]
  /** Closed bills per credit card account. */
  bills: { accountId: string; bill: PluggyBill }[]
  from: string
  rates: Record<string, number>
  /** The accounts whose transactions and bills were read (absent: all of `accounts`). */
  accountIds?: string[]
  /**
   * A history read (a chosen period, or the first full fetch): only what's
   * after the earliest day Pluggy returned can be marked removed, since a bank
   * may keep less history than asked for. Absent: when `from` <= HISTORY_START.
   */
  history?: boolean
}

/** One entry per ID, the last one winning (Pluggy's pages can repeat a row). */
export function uniqueById<T>(rows: T[], id: (row: T) => string): T[] {
  return [...new Map(rows.map((r) => [id(r), r])).values()]
}

/**
 * Everything from Pluggy for one connection: every account (for balances),
 * and the transactions and bills of `accountIds` (null: all). Nothing is
 * written until it's all fetched.
 */
export async function fetchConnection(client: PluggyClient, itemId: string, from: string, fetchFn: typeof fetch, accountIds: string[] | null = null): Promise<Fetched> {
  const item = await client.getItem(itemId)
  const accounts = await client.getAccounts(itemId)
  const read = accountIds ? accounts.filter((a) => accountIds.includes(a.id)) : accounts
  const transactions = (await Promise.all(read.map((a) => client.getTransactions(a.id, from)))).flat()
  // Bills are optional: a card whose bills can't be read still syncs the rest.
  const bills = (
    await Promise.all(
      read
        .filter((a) => a.type === 'CREDIT')
        .map((a) => client.getBills(a.id).then((list) => list.map((bill) => ({ accountId: a.id, bill })), () => [])),
    )
  ).flat()
  // Rates are optional here: if every source fails, the last stored ones are used when reading.
  const currencies = [...accounts.map((a) => a.currencyCode), ...transactions.map((t) => t.currencyCode)].filter(Boolean)
  const rates = await ratesToBRL(currencies, fetchFn).catch(() => ({}))
  return { item, accounts, transactions, bills, from, rates, accountIds: read.map((a) => a.id) }
}

/**
 * Syncs one connection: fetch from Pluggy, then save. `accountIds` (null:
 * all) and `period` come from an advanced sync. The default window starts
 * from the chosen accounts' oldest transaction sync, so an account left out
 * of an earlier sync still gets everything since its own last one.
 */
export async function syncConnection(
  pool: pg.Pool,
  client: PluggyClient,
  itemId: string,
  deps: { now?: Date; fetch?: typeof fetch; trigger?: string; period?: SyncPeriod; accountIds?: string[] | null } = {},
): Promise<SyncResult> {
  const now = deps.now ?? new Date()
  const period = deps.period ?? 'default'
  const accountIds = deps.accountIds ?? null
  const last = await pool.query<{ at: Date | null }>(
    `SELECT min(coalesce(a.transactions_synced_at, c.synced_at)) AS at
     FROM bank_connections c LEFT JOIN accounts a ON a.connection_id = c.id AND ($2::text[] IS NULL OR a.id = ANY($2::text[]))
     WHERE c.id = $1`,
    [itemId, accountIds],
  )
  const fetchedFrom = await pool.query<{ day: string }>(`SELECT value #>> '{}' AS day FROM app_settings WHERE key = $1`, [fetchedFromKey(itemId)])
  const from = period === 'default' ? syncFrom(last.rows[0]?.at ?? null, fetchedFrom.rows[0]?.day ?? null) : periodFrom(period, now)
  const run = await pool.query<{ id: string }>(`INSERT INTO sync_runs (connection_id, trigger, started_at) VALUES (NULL, $1, $2) RETURNING id`, [
    deps.trigger ?? 'manual',
    now,
  ])
  const runId = run.rows[0].id
  try {
    const fetched = await fetchConnection(client, itemId, from, deps.fetch ?? fetch, accountIds)
    const result = await inTransaction(pool, (db) => save(db, { ...fetched, history: period !== 'default' || undefined }, now))
    await pool.query(
      `UPDATE sync_runs SET connection_id = $2, finished_at = now(), ok = true, transactions_upserted = $3, transactions_removed = $4 WHERE id = $1`,
      [runId, itemId, result.inserted + result.updated, result.removed],
    )
    return result
  } catch (e) {
    // Status codes and messages without values only (see PluggyError and dbErrorMessage).
    const code = (e as { status?: unknown; code?: unknown })?.status ?? (e as { code?: unknown })?.code ?? 'error'
    await pool.query(`UPDATE sync_runs SET finished_at = now(), ok = false, error = $2 WHERE id = $1`, [runId, String(code)]).catch(() => {})
    throw e
  }
}

/** Writes one fetched connection. Exported for tests. */
export async function save(db: Db, f: Fetched, now: Date): Promise<SyncResult> {
  const { item } = f
  const accounts = uniqueById(f.accounts, (a) => a.id)
  const transactions = uniqueById(f.transactions, (t) => t.id)
  const bills = uniqueById(f.bills, (b) => b.bill.id)
  // The accounts whose transactions were read; the others only get their balance.
  const read = f.accountIds ?? accounts.map((a) => a.id)
  const everyAccount = accounts.every((a) => read.includes(a.id))
  // One sync per connection at a time; the lock is released with the transaction.
  await db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`sync:${item.id}`])
  const name = connectionName(item, accounts)
  const today = brazilDate(now.toISOString())

  await db.query(
    `INSERT INTO bank_connections (id, connector_id, connector_name, bank_name, status, execution_status, last_updated_at, created_at, raw, synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (id) DO UPDATE SET connector_id = excluded.connector_id, connector_name = excluded.connector_name, bank_name = excluded.bank_name,
       status = excluded.status, execution_status = excluded.execution_status, last_updated_at = excluded.last_updated_at, raw = excluded.raw, synced_at = excluded.synced_at`,
    [
      item.id,
      item.connector.id,
      item.connector.name,
      name,
      item.status,
      text((item as unknown as Record<string, unknown>).executionStatus),
      item.lastUpdatedAt ?? null,
      text((item as unknown as Record<string, unknown>).createdAt),
      JSON.stringify(item),
      now,
    ],
  )

  const accountRows = accounts.map((a) => {
    const credit = (a.creditData ?? {}) as Record<string, unknown>
    const raw = a as unknown as Record<string, unknown>
    return {
      id: a.id,
      connection_id: item.id,
      type: a.type,
      subtype: a.subtype,
      name: a.name ?? '',
      marketing_name: a.marketingName ?? null,
      number: text(raw.number),
      currency_code: (a.currencyCode || 'BRL').toUpperCase(),
      balance_cents: cents(a.balance) ?? 0,
      credit_limit_cents: cents(credit.creditLimit),
      available_limit_cents: cents(credit.availableCreditLimit),
      minimum_payment_cents: cents(credit.minimumPayment),
      balance_close_date: day(credit.balanceCloseDate),
      balance_due_date: day(credit.balanceDueDate),
      card_brand: text(credit.brand),
      card_level: text(credit.level),
      raw: a,
    }
  })
  await db.query(
    `INSERT INTO accounts (id, connection_id, type, subtype, name, marketing_name, number, currency_code, balance_cents, credit_limit_cents,
       available_limit_cents, minimum_payment_cents, balance_close_date, balance_due_date, card_brand, card_level, raw, synced_at)
     SELECT r.id, r.connection_id, r.type, r.subtype, r.name, r.marketing_name, r.number, r.currency_code, r.balance_cents, r.credit_limit_cents,
       r.available_limit_cents, r.minimum_payment_cents, r.balance_close_date, r.balance_due_date, r.card_brand, r.card_level, r.raw, $2
     FROM jsonb_to_recordset($1::jsonb) AS r(id text, connection_id text, type text, subtype text, name text, marketing_name text, number text,
       currency_code text, balance_cents bigint, credit_limit_cents bigint, available_limit_cents bigint, minimum_payment_cents bigint,
       balance_close_date date, balance_due_date date, card_brand text, card_level text, raw jsonb)
     ON CONFLICT (id) DO UPDATE SET connection_id = excluded.connection_id, type = excluded.type, subtype = excluded.subtype, name = excluded.name,
       marketing_name = excluded.marketing_name, number = excluded.number, currency_code = excluded.currency_code, balance_cents = excluded.balance_cents,
       credit_limit_cents = excluded.credit_limit_cents, available_limit_cents = excluded.available_limit_cents,
       minimum_payment_cents = excluded.minimum_payment_cents, balance_close_date = excluded.balance_close_date,
       balance_due_date = excluded.balance_due_date, card_brand = excluded.card_brand, card_level = excluded.card_level, raw = excluded.raw,
       synced_at = excluded.synced_at`,
    [JSON.stringify(accountRows), now],
  )
  // Today's balance, for the balance history.
  await db.query(
    `INSERT INTO account_balances (account_id, as_of, balance_cents, available_limit_cents)
     SELECT r.id, $2::date, r.balance_cents, r.available_limit_cents FROM jsonb_to_recordset($1::jsonb) AS r(id text, balance_cents bigint, available_limit_cents bigint)
     ON CONFLICT (account_id, as_of) DO UPDATE SET balance_cents = excluded.balance_cents, available_limit_cents = excluded.available_limit_cents`,
    [JSON.stringify(accountRows), today],
  )

  // Card bills (the card itself is a row in accounts).
  if (bills.length > 0) {
    await db.query(
      `INSERT INTO card_bills (id, account_id, due_date, total_cents, currency_code, minimum_payment_cents, allows_installments, finance_charges, raw, synced_at)
       SELECT r.id, r.account_id, r.due_date, r.total_cents, r.currency_code, r.minimum_payment_cents, r.allows_installments, r.finance_charges, r.raw, $2
       FROM jsonb_to_recordset($1::jsonb) AS r(id text, account_id text, due_date date, total_cents bigint, currency_code text,
         minimum_payment_cents bigint, allows_installments boolean, finance_charges jsonb, raw jsonb)
       ON CONFLICT (id) DO UPDATE SET account_id = excluded.account_id, due_date = excluded.due_date, total_cents = excluded.total_cents,
         currency_code = excluded.currency_code, minimum_payment_cents = excluded.minimum_payment_cents,
         allows_installments = excluded.allows_installments, finance_charges = excluded.finance_charges, raw = excluded.raw,
         synced_at = excluded.synced_at`,
      [
        JSON.stringify(
          bills.map(({ accountId, bill }) => ({
            id: bill.id,
            account_id: accountId,
            due_date: brazilDate(bill.dueDate),
            total_cents: cents(bill.totalAmount) ?? 0,
            currency_code: (bill.totalAmountCurrencyCode || accounts.find((a) => a.id === accountId)?.currencyCode || 'BRL').toUpperCase(),
            minimum_payment_cents: cents(bill.minimumPaymentAmount),
            allows_installments: bill.allowsInstallments ?? null,
            finance_charges: bill.financeCharges ?? null,
            raw: bill,
          })),
        ),
        now,
      ],
    )
  }

  // New transactions get the guess, but only for categories that exist.
  const known = new Set((await db.query<{ id: string }>(`SELECT id FROM categories`)).rows.map((r) => r.id))
  const txRows = transactions.map((t) => {
    const raw = t as unknown as Record<string, unknown>
    const m = (t.creditCardMetadata ?? {}) as Record<string, unknown>
    const merchant = (raw.merchant ?? {}) as Record<string, unknown>
    const payment = (raw.paymentData ?? {}) as Record<string, unknown>
    const other = ((t.type === 'CREDIT' ? payment.payer : payment.receiver) ?? {}) as Record<string, unknown>
    return {
      id: t.id,
      account_id: t.accountId,
      card_bill_id: text(m.billId),
      provider_id: text(raw.providerId),
      date: t.date,
      booked_on: brazilDate(t.date),
      description: t.description ?? '',
      description_raw: text(raw.descriptionRaw),
      type: t.type,
      amount_cents: cents(t.amount) ?? 0,
      currency_code: (t.currencyCode || 'BRL').toUpperCase(),
      amount_in_account_currency_cents: cents(t.amountInAccountCurrency),
      balance_cents: cents(raw.balance),
      status: t.status ?? null,
      operation_type: text(raw.operationType),
      pluggy_category: t.category ?? null,
      pluggy_category_id: t.categoryId ?? null,
      installment_number: typeof m.installmentNumber === 'number' ? m.installmentNumber : null,
      total_installments: typeof m.totalInstallments === 'number' ? m.totalInstallments : null,
      purchase_total_cents: cents(m.totalAmount),
      purchase_date: day(m.purchaseDate),
      card_last_digits: text(m.cardNumber),
      mcc: m.payeeMCC != null ? String(m.payeeMCC) : null,
      merchant_name: text(merchant.name),
      merchant_cnpj: text(merchant.cnpj),
      payment_method: text(payment.paymentMethod),
      counterparty_name: text(other.name),
      pluggy_updated_at: text(raw.updatedAt),
      category_id: fromGuess(categoryFor(t), known).categoryId,
      raw: t,
    }
  })
  const json = JSON.stringify(txRows)
  const ids = txRows.map((r) => r.id)

  // Counts first: new IDs, and existing rows whose data changed (or that come back after being removed).
  const existing = await db.query<{ id: string; changed: boolean }>(
    `SELECT t.id, (t.raw IS DISTINCT FROM n.raw OR t.removed_at IS NOT NULL) AS changed
     FROM transactions t JOIN jsonb_to_recordset($1::jsonb) AS n(id text, raw jsonb) USING (id)`,
    [json],
  )
  const inserted = ids.length - existing.rowCount!
  const updated = existing.rows.filter((r) => r.changed).length

  // The category guess is set on insert only: category_id, subcategory_id and is_hidden are never updated here.
  await db.query(
    `INSERT INTO transactions (id, account_id, card_bill_id, provider_id, date, booked_on, description, description_raw, type, amount_cents,
       currency_code, amount_in_account_currency_cents, balance_cents, status, operation_type, pluggy_category, pluggy_category_id,
       installment_number, total_installments, purchase_total_cents, purchase_date, card_last_digits, mcc, merchant_name, merchant_cnpj,
       payment_method, counterparty_name, pluggy_updated_at, category_id, raw, first_seen_at, last_seen_at)
     SELECT r.id, r.account_id, r.card_bill_id, r.provider_id, r.date, r.booked_on, r.description, r.description_raw, r.type, r.amount_cents,
       r.currency_code, r.amount_in_account_currency_cents, r.balance_cents, r.status, r.operation_type, r.pluggy_category, r.pluggy_category_id,
       r.installment_number, r.total_installments, r.purchase_total_cents, r.purchase_date, r.card_last_digits, r.mcc, r.merchant_name,
       r.merchant_cnpj, r.payment_method, r.counterparty_name, r.pluggy_updated_at, r.category_id, r.raw, $2, $2
     FROM jsonb_to_recordset($1::jsonb) AS r(id text, account_id text, card_bill_id text, provider_id text, date timestamptz, booked_on date,
       description text, description_raw text, type text, amount_cents bigint, currency_code text, amount_in_account_currency_cents bigint,
       balance_cents bigint, status text, operation_type text, pluggy_category text, pluggy_category_id text, installment_number smallint,
       total_installments smallint, purchase_total_cents bigint, purchase_date date, card_last_digits text, mcc text, merchant_name text,
       merchant_cnpj text, payment_method text, counterparty_name text, pluggy_updated_at timestamptz, category_id text, raw jsonb)
     ON CONFLICT (id) DO UPDATE SET account_id = excluded.account_id, card_bill_id = excluded.card_bill_id, provider_id = excluded.provider_id,
       date = excluded.date, booked_on = excluded.booked_on, description = excluded.description, description_raw = excluded.description_raw,
       type = excluded.type, amount_cents = excluded.amount_cents, currency_code = excluded.currency_code,
       amount_in_account_currency_cents = excluded.amount_in_account_currency_cents, balance_cents = excluded.balance_cents,
       status = excluded.status, operation_type = excluded.operation_type, pluggy_category = excluded.pluggy_category,
       pluggy_category_id = excluded.pluggy_category_id, installment_number = excluded.installment_number,
       total_installments = excluded.total_installments, purchase_total_cents = excluded.purchase_total_cents,
       purchase_date = excluded.purchase_date, card_last_digits = excluded.card_last_digits, mcc = excluded.mcc,
       merchant_name = excluded.merchant_name, merchant_cnpj = excluded.merchant_cnpj, payment_method = excluded.payment_method,
       counterparty_name = excluded.counterparty_name, pluggy_updated_at = excluded.pluggy_updated_at, raw = excluded.raw,
       last_seen_at = excluded.last_seen_at, removed_at = NULL`,
    [json, now],
  )

  // In the fetched window of the accounts read, what Pluggy no longer returns
  // is marked removed. On a history read (a full fetch, or a chosen period),
  // the window starts at the earliest day Pluggy returned: a bank that keeps
  // less history than asked for must not remove the older transactions
  // stored. A normal sync (35 days) uses its whole window, so a pending
  // transaction replaced by a later-dated one is still removed.
  const earliest = txRows.reduce((min, r) => (r.booked_on < min ? r.booked_on : min), '9999-12-31')
  const history = f.history ?? f.from <= HISTORY_START
  const removeFrom = history && txRows.length && earliest > f.from ? earliest : f.from
  const removed = await db.query(
    `UPDATE transactions SET removed_at = $4
     WHERE account_id = ANY($1::text[]) AND booked_on >= $2::date AND removed_at IS NULL AND NOT (id = ANY($3::text[]))`,
    [read, removeFrom, ids, now],
  )
  await db.query(`UPDATE accounts SET transactions_synced_at = $2 WHERE id = ANY($1::text[])`, [read, now])
  // How far back this connection has been fetched (only ever moves earlier),
  // when every account was read.
  if (everyAccount)
    await db.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, to_jsonb($2::text), $3)
       ON CONFLICT (key) DO UPDATE SET value = CASE WHEN app_settings.value #>> '{}' <= $2 THEN app_settings.value ELSE excluded.value END,
         updated_at = excluded.updated_at`,
      [fetchedFromKey(item.id), f.from, now],
    )
  await carryEdits(db, new Set(ids.filter((id) => !existing.rows.some((r) => r.id === id))), now)

  for (const [currency, rate] of Object.entries(f.rates)) {
    await db.query(
      `INSERT INTO exchange_rates (currency_code, as_of, brl_per_unit, source) VALUES ($1, $2, $3, 'sync')
       ON CONFLICT (currency_code, as_of) DO UPDATE SET brl_per_unit = excluded.brl_per_unit`,
      [currency, today, rate],
    )
  }

  // Per connection: bank_connections.synced_at (above). Overall: the latest sync of any connection.
  await db.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('last_synced_at', to_jsonb($1::text), $2)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [now.toISOString(), now],
  )

  return { connectionId: item.id, name, inserted, updated, removed: removed.rowCount ?? 0 }
}

/** Days between a pending transaction and the posted one that replaces it. */
const REPLACED_WITHIN_DAYS = 10

/**
 * A bank can replace a transaction under a new ID (a pending card purchase
 * that posts). The old row was just marked removed; its edits (category,
 * subcategory, hidden) move to the new row, so they aren't lost to the guess.
 * The new row is the one with the same bank ID (provider_id) or, failing that,
 * a pending one with the same account, type and amount, nearest in date. Each
 * row is matched at most once.
 */
async function carryEdits(db: Db, newIds: Set<string>, removedAt: Date) {
  if (newIds.size === 0) return
  const old = await db.query<Candidate>(
    `SELECT id, account_id, provider_id, type, amount_cents::text AS amount, booked_on::text AS day, status,
       category_id, subcategory_id, is_hidden, category_edited_at, transfer_override
     FROM transactions WHERE removed_at = $1 AND (category_edited_at IS NOT NULL OR is_hidden OR transfer_override IS NOT NULL)`,
    [removedAt],
  )
  if (old.rows.length === 0) return
  const fresh = await db.query<Candidate>(
    `SELECT id, account_id, provider_id, type, amount_cents::text AS amount, booked_on::text AS day, status
     FROM transactions WHERE id = ANY($1::text[])`,
    [[...newIds]],
  )
  const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000
  const pairs: { score: number; from: Candidate; to: Candidate }[] = []
  for (const from of old.rows)
    for (const to of fresh.rows) {
      if (from.account_id !== to.account_id) continue
      if (from.provider_id && from.provider_id === to.provider_id) pairs.push({ score: -1, from, to })
      else if (from.status === 'PENDING' && from.type === to.type && from.amount === to.amount && days(from.day, to.day) <= REPLACED_WITHIN_DAYS)
        pairs.push({ score: days(from.day, to.day), from, to })
    }
  pairs.sort((a, b) => a.score - b.score)
  const used = new Set<string>()
  for (const { from, to } of pairs) {
    if (used.has(from.id) || used.has(to.id)) continue
    used.add(from.id).add(to.id)
    if (from.category_edited_at)
      await db.query(`UPDATE transactions SET category_id = $2, subcategory_id = $3, category_edited_at = $4, is_hidden = $5 WHERE id = $1`, [
        to.id,
        from.category_id,
        from.subcategory_id,
        from.category_edited_at,
        from.is_hidden,
      ])
    else await db.query(`UPDATE transactions SET is_hidden = $2 WHERE id = $1`, [to.id, from.is_hidden])
    if (from.transfer_override) await db.query(`UPDATE transactions SET transfer_override = $2 WHERE id = $1`, [to.id, from.transfer_override])
  }
}

interface Candidate {
  id: string
  account_id: string
  provider_id: string | null
  type: string
  amount: string
  day: string
  status: string | null
  category_id?: string | null
  subcategory_id?: string | null
  is_hidden?: boolean
  category_edited_at?: Date | null
  transfer_override?: string | null
}
