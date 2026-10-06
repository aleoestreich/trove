// Reads what the app shows from the database: no call to Pluggy or to a rate
// service. The stored Pluggy rows go through the same mapping as live data
// (server/pluggy/map.ts), then the stored categories, subcategories and
// "hidden" flags are applied.

import type { Snapshot, SyncInfo } from '../../src/data/types.js'
import { toSnapshot } from '../pluggy/map.js'
import type { PluggyAccount, PluggyItem, PluggyTransaction } from '../pluggy/types.js'
import { readCategories } from './categories.js'
import type { Db } from './connection.js'

/** When each configured connection last synced; overall = the oldest of them (null until all have). */
export async function readSyncInfo(db: Db, itemIds: string[]): Promise<SyncInfo> {
  const rows = await db.query<{ id: string; bank_name: string | null; synced_at: Date }>(
    `SELECT id, bank_name, synced_at FROM bank_connections WHERE id = ANY($1::text[])`,
    [itemIds],
  )
  const byId = new Map(rows.rows.map((r) => [r.id, r]))
  const connections = itemIds.map((id) => {
    const r = byId.get(id)
    return { id, name: r?.bank_name ?? null, lastSyncedAt: r ? r.synced_at.toISOString() : null }
  })
  const all = connections.every((c) => c.lastSyncedAt)
  const oldest = all ? connections.map((c) => c.lastSyncedAt!).sort()[0] ?? null : null
  return { lastSyncedAt: oldest, connections }
}

/** The snapshot from the database, or null when no configured connection has synced yet. */
export async function readSnapshot(db: Db, itemIds: string[], from: string): Promise<Snapshot | null> {
  const sync = await readSyncInfo(db, itemIds)
  if (sync.connections.every((c) => !c.lastSyncedAt)) return null

  const items = await db.query<{ raw: PluggyItem }>(`SELECT raw FROM bank_connections WHERE id = ANY($1::text[])`, [itemIds])
  const accounts = await db.query<{ raw: PluggyAccount }>(`SELECT raw FROM accounts WHERE connection_id = ANY($1::text[])`, [itemIds])
  const txs = await db.query<{ raw: PluggyTransaction; category_id: string | null; subcategory_id: string | null; is_hidden: boolean }>(
    `SELECT t.raw, t.category_id, t.subcategory_id, t.is_hidden
     FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE a.connection_id = ANY($1::text[]) AND t.removed_at IS NULL AND t.booked_on >= $2::date
     ORDER BY t.booked_on DESC, t.date DESC`,
    [itemIds, from],
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
        txs.rows.map((r) => [r.raw.id, { categoryId: r.category_id, subcategoryId: r.subcategory_id, hidden: r.is_hidden }]),
      ),
    },
  })
  return { ...snapshot, sync }
}
