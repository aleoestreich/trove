// Database tests: run against a real, disposable Postgres when TEST_DATABASE_URL
// is set (it's wiped), and are skipped otherwise. Made-up data only.

import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { EditError } from '../../src/data/edits.js'
import type { PluggyAccount, PluggyItem, PluggyTransaction } from '../pluggy/types.js'
import { applyEditSql, ensureSeeded } from './categories.js'
import { inTransaction } from './connection.js'
import { readSnapshot } from './read.js'
import { save, syncFrom } from './sync.js'

const url = process.env.TEST_DATABASE_URL
const suite = url ? describe : describe.skip

const item: PluggyItem = { id: 'item-1', connector: { id: 200, name: 'MeuPluggy' }, status: 'UPDATED' }
const checking: PluggyAccount = {
  id: 'acc-1', itemId: 'item-1', type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: 'Banco Exemplo S.A. (Conta Corrente)', balance: 1500, currencyCode: 'BRL',
}
const tx = (id: string, over: Partial<PluggyTransaction> = {}): PluggyTransaction => ({
  id, accountId: 'acc-1', date: '2026-10-01T12:00:00.000Z', description: 'LOJA EXEMPLO', type: 'DEBIT', amount: -150, currencyCode: 'BRL', status: 'POSTED', ...over,
})
const now = new Date('2026-10-06T12:00:00.000Z')
const fetched = (transactions: PluggyTransaction[]) => ({ item, accounts: [checking], transactions, from: '2026-09-01', rates: {} })

suite('database', () => {
  let pool: pg.Pool
  const sync = (txs: PluggyTransaction[]) => inTransaction(pool, (db) => save(db, fetched(txs), now))
  const row = async (id: string) =>
    (await pool.query(`SELECT category_id, subcategory_id, is_hidden, removed_at, description FROM transactions WHERE id = $1`, [id])).rows[0]
  const subOf = async (categoryId: string, name: string) =>
    (await pool.query(`SELECT id FROM subcategories WHERE category_id = $1 AND name = $2`, [categoryId, name])).rows[0].id as string

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 2 })
    await pool.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public`)
    await pool.query(readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8'))
  })
  afterAll(() => pool.end())
  beforeEach(async () => {
    await pool.query(`TRUNCATE app_settings, categories, subcategories, transactions, accounts, account_balances, bank_connections, exchange_rates, sync_runs CASCADE`)
    await ensureSeeded(pool, 'pt')
  })

  it('seeds the default categories once, in the app’s language', async () => {
    const names = (await pool.query(`SELECT name FROM categories ORDER BY sort_order`)).rows.map((r) => r.name)
    expect(names.slice(0, 3)).toEqual(['Moradia', 'Mercado', 'Restaurantes'])
    await pool.query(`DELETE FROM categories`)
    await ensureSeeded(pool, 'en')
    expect((await pool.query(`SELECT count(*)::int AS n FROM categories`)).rows[0].n).toBe(0)
  })

  it('saves new transactions with the guess, and counts new and updated ones', async () => {
    const first = await sync([tx('t1', { category: 'Supermarkets' }), tx('t2')])
    expect(first).toMatchObject({ connectionId: 'item-1', name: 'Banco Exemplo', inserted: 2, updated: 0, removed: 0 })
    expect((await row('t1')).category_id).toBe('groceries')
    expect((await row('t2')).category_id).toBeNull() // no rule matched: uncategorized
    const again = await sync([tx('t1', { category: 'Supermarkets', description: 'LOJA EXEMPLO 2' }), tx('t2'), tx('t3')])
    expect(again).toMatchObject({ inserted: 1, updated: 1, removed: 0 })
  })

  it('never overwrites a stored category, subcategory or hidden flag', async () => {
    await sync([tx('t1', { category: 'Supermarkets' })])
    const delivery = await subOf('restaurants', 'Delivery')
    await applyEditSql(pool, { op: 'categorize', transactionId: 't1', categoryId: 'restaurants', subcategoryId: delivery })
    await applyEditSql(pool, { op: 'hide', transactionId: 't1', hidden: true })
    await sync([tx('t1', { category: 'Supermarkets', amount: -151 })])
    expect(await row('t1')).toMatchObject({ category_id: 'restaurants', subcategory_id: delivery, is_hidden: true })
  })

  it('marks transactions Pluggy no longer returns as removed, and brings them back', async () => {
    await sync([tx('t1'), tx('t2')])
    expect(await sync([tx('t1')])).toMatchObject({ removed: 1 })
    expect((await row('t2')).removed_at).not.toBeNull()
    expect(await sync([tx('t1'), tx('t2')])).toMatchObject({ updated: 1 })
    expect((await row('t2')).removed_at).toBeNull()
  })

  it('linking a subcategory moves it and its transactions to the other category', async () => {
    await sync([tx('t1', { category: 'Supermarkets' }), tx('t2', { category: 'Supermarkets' })])
    const bakery = await subOf('groceries', 'Padaria')
    await applyEditSql(pool, { op: 'categorize', transactionId: 't1', categoryId: 'groceries', subcategoryId: bakery })
    await applyEditSql(pool, { op: 'linkSubcategory', id: bakery, categoryId: 'restaurants' })
    expect((await pool.query(`SELECT category_id FROM subcategories WHERE id = $1`, [bakery])).rows[0].category_id).toBe('restaurants')
    expect(await row('t1')).toMatchObject({ category_id: 'restaurants', subcategory_id: bakery })
    expect((await row('t2')).category_id).toBe('groceries') // without that subcategory: stays
  })

  it('deleting a category leaves its transactions uncategorized and removes its subcategories', async () => {
    await sync([tx('t1', { category: 'Supermarkets' })])
    const market = await subOf('groceries', 'Supermercado')
    await applyEditSql(pool, { op: 'categorize', transactionId: 't1', categoryId: 'groceries', subcategoryId: market })
    await applyEditSql(pool, { op: 'deleteCategory', id: 'groceries' })
    expect(await row('t1')).toMatchObject({ category_id: null, subcategory_id: null })
    expect((await pool.query(`SELECT count(*)::int AS n FROM subcategories WHERE category_id = 'groceries'`)).rows[0].n).toBe(0)
    // A later sync doesn't put the guess back.
    await sync([tx('t1', { category: 'Supermarkets', amount: -152 })])
    expect((await row('t1')).category_id).toBeNull()
  })

  it('refuses a taken name, a missing category and a subcategory of another category', async () => {
    const create = (name: string) => applyEditSql(pool, { op: 'createCategory', category: { id: `c-${name}`, name, type: 'expense', color: 'orange', icon: 'fork' } })
    await create('Pets')
    await expect(create('pets')).rejects.toMatchObject({ code: 'name_taken' })
    await expect(applyEditSql(pool, { op: 'deleteCategory', id: 'nope' })).rejects.toBeInstanceOf(EditError)
    await sync([tx('t1')])
    const delivery = await subOf('restaurants', 'Delivery')
    await expect(applyEditSql(pool, { op: 'categorize', transactionId: 't1', categoryId: 'groceries', subcategoryId: delivery })).rejects.toMatchObject({ code: 'not_found' })
  })

  it('reads the snapshot with the stored categories and hidden flags', async () => {
    expect(await readSnapshot(pool, ['item-1'], '2026-05-01')).toBeNull() // never synced
    await sync([tx('t1', { category: 'Supermarkets' }), tx('t2')])
    await applyEditSql(pool, { op: 'hide', transactionId: 't2', hidden: true })
    const s = (await readSnapshot(pool, ['item-1'], '2026-05-01'))!
    expect(s.institutions.map((i) => i.name)).toEqual(['Banco Exemplo'])
    expect(s.categories).toHaveLength(10)
    expect(s.transactions.map((t) => [t.id, t.categoryId, !!t.hidden]).sort()).toEqual([
      ['t1', 'groceries', false],
      ['t2', null, true],
    ])
    expect(s.sync).toMatchObject({ lastSyncedAt: now.toISOString(), connections: [{ id: 'item-1', name: 'Banco Exemplo' }] })
  })
})

describe('sync window', () => {
  it('goes back a year on the first sync and overlaps later ones by 35 days', () => {
    expect(syncFrom(null, new Date(2026, 9, 6))).toBe('2025-10-01')
    expect(syncFrom(new Date('2026-10-01T00:00:00Z'), now)).toBe('2026-08-27')
  })
})
