// Database tests: run against a real, disposable Postgres when TEST_DATABASE_URL
// is set (it's wiped), and are skipped otherwise. Made-up data only.

import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { EditError, type BulkResult } from '../../src/data/edits.js'
import type { PluggyAccount, PluggyItem, PluggyTransaction } from '../pluggy/types.js'
import { applyEditSql, ensureSeeded } from './categories.js'
import { dbErrorCode, inTransaction } from './connection.js'
import { readSnapshot } from './read.js'
import { save, syncFrom, type Fetched } from './sync.js'
import { needsWorker, readJob, runJob, startJob } from './syncJobs.js'
import { edits, startSync, syncStatus } from './handlers.js'
import { PluggyClient, type PluggyConfig } from '../pluggy/client.js'

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
const fetched = (transactions: PluggyTransaction[], bills: Fetched['bills'] = []) => ({ item, accounts: [checking], transactions, bills, from: '2026-09-01', rates: {} })

suite('database', () => {
  let pool: pg.Pool
  const sync = (txs: PluggyTransaction[], bills: Fetched['bills'] = []) => inTransaction(pool, (db) => save(db, fetched(txs, bills), now))
  const count = async (table: string) => (await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n as number
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
    await pool.query(`TRUNCATE app_settings, categories, subcategories, transactions, accounts, account_balances, card_bills, bank_connections, exchange_rates, sync_runs, sync_jobs, sync_job_items CASCADE`)
    await ensureSeeded(pool)
  })

  it('seeds the default categories once, in Portuguese', async () => {
    const names = (await pool.query(`SELECT name FROM categories ORDER BY sort_order`)).rows.map((r) => r.name)
    expect(names.slice(0, 3)).toEqual(['Moradia', 'Mercado', 'Restaurantes'])
    await pool.query(`DELETE FROM categories`)
    await ensureSeeded(pool)
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

  it('keeps edits when the bank replaces a pending transaction under a new ID', async () => {
    const pending = (id: string, over: Partial<PluggyTransaction> = {}) => tx(id, { status: 'PENDING', category: 'Supermarkets', ...over })
    await sync([pending('p1'), pending('p2', { amount: -80 }), pending('p3', { amount: -30, providerId: 'bank-3' } as Partial<PluggyTransaction>)])
    const delivery = await subOf('restaurants', 'Delivery')
    await applyEditSql(pool, { op: 'categorize', transactionId: 'p1', categoryId: 'restaurants', subcategoryId: delivery })
    await applyEditSql(pool, { op: 'hide', transactionId: 'p2', hidden: true })
    await applyEditSql(pool, { op: 'categorize', transactionId: 'p3', categoryId: 'home', subcategoryId: null })
    // Posted under new IDs, two days later; p3 matched by the bank's ID despite a new amount.
    const posted = (id: string, over: Partial<PluggyTransaction> = {}) => tx(id, { date: '2026-10-03T12:00:00.000Z', category: 'Supermarkets', ...over })
    expect(await sync([posted('n1'), posted('n2', { amount: -80 }), posted('n3', { amount: -31, providerId: 'bank-3' } as Partial<PluggyTransaction>), posted('n4', { amount: -150 })]))
      .toMatchObject({ inserted: 4, removed: 3 })
    expect(await row('n1')).toMatchObject({ category_id: 'restaurants', subcategory_id: delivery, is_hidden: false })
    expect(await row('n2')).toMatchObject({ category_id: 'groceries', is_hidden: true })
    expect(await row('n3')).toMatchObject({ category_id: 'home' })
    // Each edit moves once: the second purchase of the same amount keeps the guess.
    expect(await row('n4')).toMatchObject({ category_id: 'groceries', is_hidden: false })
    const edited = await pool.query(`SELECT id FROM transactions WHERE category_edited_at IS NOT NULL AND removed_at IS NULL ORDER BY id`)
    expect(edited.rows.map((r) => r.id)).toEqual(['n1', 'n3'])
  })

  it('does not move a guess: an unedited pending transaction leaves the new one to its own guess', async () => {
    await sync([tx('p1', { status: 'PENDING', category: 'Supermarkets' })])
    await sync([tx('n1', { date: '2026-10-02T12:00:00.000Z', category: 'Restaurants' })])
    expect((await row('n1')).category_id).toBe('restaurants')
  })

  describe('bulk categorize', () => {
    const ctx = { itemIds: ['item-1'] }
    const many = (transactionIds: string[], categoryId: string, subcategoryId: string) =>
      applyEditSql(pool, { op: 'categorizeMany', transactionIds, categoryId, subcategoryId }, ctx)
    const reasonOf = (p: Promise<unknown>) => p.then(() => 'none', (e) => (e instanceof EditError ? e.reason ?? e.code : String(e)))
    const state = async () =>
      (await pool.query(`SELECT id, category_id, subcategory_id, category_edited_at IS NOT NULL AS edited FROM transactions ORDER BY id`)).rows

    it('sets the category on all of them, marks them edited and returns the previous values', async () => {
      await sync([tx('t1', { category: 'Supermarkets' }), tx('t2'), tx('t3', { category: 'Supermarkets' })])
      const delivery = await subOf('restaurants', 'Delivery')
      const result = await many(['t1', 't2'], 'restaurants', delivery)
      expect(result).toEqual({
        updated: 2,
        previous: [
          { id: 't1', categoryId: 'groceries', subcategoryId: null, editedAt: null },
          { id: 't2', categoryId: null, subcategoryId: null, editedAt: null },
        ],
      })
      expect(await state()).toEqual([
        { id: 't1', category_id: 'restaurants', subcategory_id: delivery, edited: true },
        { id: 't2', category_id: 'restaurants', subcategory_id: delivery, edited: true },
        { id: 't3', category_id: 'groceries', subcategory_id: null, edited: false },
      ])
      // A later sync keeps them.
      await sync([tx('t1', { category: 'Supermarkets', amount: -151 }), tx('t2'), tx('t3', { category: 'Supermarkets' })])
      expect((await row('t1')).category_id).toBe('restaurants')
    })

    it('is all or nothing: one transfer, an unknown ID or another connection’s transaction changes nothing', async () => {
      await sync([tx('t1', { category: 'Supermarkets' }), tx('t2'), tx('bill', { category: 'Credit card payment' })])
      const before = await state()
      const delivery = await subOf('restaurants', 'Delivery')
      expect(await reasonOf(many(['t1', 'bill'], 'restaurants', delivery))).toBe('transfer')
      expect(await reasonOf(many(['t1', 'nope'], 'restaurants', delivery))).toBe('not_found')
      expect(await reasonOf(applyEditSql(pool, { op: 'categorizeMany', transactionIds: ['t1'], categoryId: 'restaurants', subcategoryId: delivery }, { itemIds: ['item-2'] }))).toBe('not_found')
      expect(await state()).toEqual(before)
    })

    it('refuses mixed types, a category of the other type and a subcategory of another category', async () => {
      await sync([tx('t1', { category: 'Supermarkets' }), tx('pay', { type: 'CREDIT', amount: 3000 })])
      const delivery = await subOf('restaurants', 'Delivery')
      const salarySub = (await pool.query(`SELECT id FROM subcategories WHERE category_id = 'salary' LIMIT 1`)).rows[0].id
      expect(await reasonOf(many(['t1', 'pay'], 'restaurants', delivery))).toBe('mixed_types')
      expect(await reasonOf(many(['t1'], 'salary', salarySub))).toBe('category_type')
      expect(await reasonOf(many(['t1'], 'groceries', delivery))).toBe('subcategory_category')
    })

    it('POST /api/edits answers 200 with the previous values, or 400 with the reason', async () => {
      await sync([tx('t1', { category: 'Supermarkets' }), tx('bill', { category: 'Credit card payment' })])
      const delivery = await subOf('restaurants', 'Delivery')
      const config = { pluggy: { clientId: 'cid', clientSecret: 'secret', itemIds: ['item-1'], baseUrl: 'https://api.pluggy.ai' }, databaseUrl: url! }
      const post = (body: unknown) => edits(new Request('https://trove.test/api/edits', { method: 'POST', body: JSON.stringify(body) }), config)
      const refused = await post({ op: 'categorizeMany', transactionIds: ['t1', 'bill'], categoryId: 'restaurants', subcategoryId: delivery })
      expect([refused.status, (await refused.json()).reason]).toEqual([400, 'transfer'])
      const ok = await post({ op: 'categorizeMany', transactionIds: ['t1'], categoryId: 'restaurants', subcategoryId: delivery })
      expect([ok.status, (await ok.json()).updated]).toEqual([200, 1])
      const noPluggy = await edits(new Request('https://trove.test/api/edits', { method: 'POST', body: JSON.stringify({ op: 'categorizeMany', transactionIds: ['t1'], categoryId: 'restaurants', subcategoryId: delivery }) }), { pluggy: null, databaseUrl: url! })
      expect(noPluggy.status).toBe(503)
    })

    it('undo restores the previous categories and edited marks', async () => {
      await sync([tx('t1', { category: 'Supermarkets' }), tx('t2')])
      const bakery = await subOf('groceries', 'Padaria')
      await applyEditSql(pool, { op: 'categorize', transactionId: 't2', categoryId: 'groceries', subcategoryId: bakery })
      const before = await pool.query(`SELECT id, category_id, subcategory_id, category_edited_at FROM transactions ORDER BY id`)
      const delivery = await subOf('restaurants', 'Delivery')
      const result = await many(['t1', 't2'], 'restaurants', delivery)
      expect(await applyEditSql(pool, { op: 'restoreCategories', items: (result as BulkResult).previous }, ctx)).toEqual({ updated: 2 })
      expect((await pool.query(`SELECT id, category_id, subcategory_id, category_edited_at FROM transactions ORDER BY id`)).rows).toEqual(before.rows)
    })
  })

  it('is idempotent: the same data synced again changes nothing and duplicates nothing', async () => {
    const data = [tx('t1', { category: 'Supermarkets' }), tx('t2')]
    const bills = [{ accountId: 'acc-1', bill: { id: 'b1', dueDate: '2026-10-10T03:00:00.000Z', totalAmount: 150 } }]
    await sync(data, bills)
    const counts = [await count('transactions'), await count('card_bills'), await count('accounts'), await count('bank_connections')]
    expect(await sync(data, bills)).toMatchObject({ inserted: 0, updated: 0, removed: 0 })
    expect([await count('transactions'), await count('card_bills'), await count('accounts'), await count('bank_connections')]).toEqual(counts)
    expect(counts).toEqual([2, 1, 1, 1])
  })

  it('keeps one row when Pluggy repeats a transaction ID within one fetch', async () => {
    expect(await sync([tx('t1'), tx('t1', { description: 'LOJA EXEMPLO 2' })])).toMatchObject({ inserted: 1 })
    expect((await row('t1')).description).toBe('LOJA EXEMPLO 2')
    expect(await count('transactions')).toBe(1)
  })

  it('stores card bills, updated in place on the next sync', async () => {
    const bill = (total: number) => [{ accountId: 'acc-1', bill: { id: 'b1', dueDate: '2026-10-10T03:00:00.000Z', totalAmount: total, minimumPaymentAmount: 15 } }]
    await sync([], bill(150))
    await sync([], bill(152.5))
    const rows = (await pool.query(`SELECT id, due_date::text, total_cents::int, minimum_payment_cents::int FROM card_bills`)).rows
    expect(rows).toEqual([{ id: 'b1', due_date: '2026-10-10', total_cents: 152_50, minimum_payment_cents: 15_00 }])
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

  describe('background sync jobs', () => {
    const config: PluggyConfig = { clientId: 'cid', clientSecret: 'secret', itemIds: ['item-1', 'item-2'], baseUrl: 'https://api.pluggy.ai' }
    /** Fake Pluggy: item-1 has one account and two transactions; item-2 fails. */
    const fakeFetch = (async (input: string | URL) => {
      const url = new URL(String(input))
      const ok = (body: unknown) => Response.json(body)
      if (url.pathname === '/auth') return ok({ apiKey: 'k' })
      if (url.pathname === '/items/item-1') return ok(item)
      if (url.pathname.startsWith('/items/')) return new Response('{}', { status: 500 })
      if (url.pathname === '/accounts') return ok({ results: [checking], page: 1, total: 1, totalPages: 1 })
      if (url.pathname === '/v2/transactions') return ok({ results: [tx('t1'), tx('t2')], next: null })
      if (url.pathname === '/bills') return ok({ results: [], page: 1, total: 0, totalPages: 1 })
      return new Response('{}', { status: 404 })
    }) as typeof fetch
    const client = () => new PluggyClient(config, fakeFetch)

    it('works through every connection: one saved, one failed with a status code', async () => {
      const job = await startJob(pool, config.itemIds)
      expect(job.items.map((i) => i.status)).toEqual(['queued', 'queued'])
      await runJob(pool, client(), job.id, { fetch: fakeFetch, now: () => now })
      const done = (await readJob(pool, job.id))!
      expect(done.done).toBe(true)
      expect(done.items).toMatchObject([
        { connectionId: 'item-1', status: 'ok', inserted: 2, name: 'Banco Exemplo' },
        { connectionId: 'item-2', status: 'failed', error: 'pluggy_500' },
      ])
      expect(await count('transactions')).toBe(2)
    })

    it('runs one sync at a time, and a second run of the same data adds nothing', async () => {
      const first = await startJob(pool, ['item-1'])
      expect((await startJob(pool, ['item-1'])).id).toBe(first.id) // still running: the same job
      await runJob(pool, client(), first.id, { fetch: fakeFetch, now: () => now })
      const second = await startJob(pool, ['item-1'])
      expect(second.id).not.toBe(first.id)
      await runJob(pool, client(), second.id, { fetch: fakeFetch, now: () => now })
      expect((await readJob(pool, second.id))!.items[0]).toMatchObject({ status: 'ok', inserted: 0, updated: 0 })
      expect(await count('transactions')).toBe(2)
    })

    it('leaves work queued when the time budget runs out, for the next poll to resume', async () => {
      const job = await startJob(pool, config.itemIds)
      await runJob(pool, client(), job.id, { fetch: fakeFetch, budgetMs: 0 })
      const after = (await readJob(pool, job.id))!
      expect(after.done).toBe(false)
      expect(needsWorker(after)).toBe(true)
    })

    it('marks an item left running by a stopped worker as failed', async () => {
      const job = await startJob(pool, ['item-1'])
      await pool.query(`UPDATE sync_job_items SET status = 'running', started_at = now() - interval '10 minutes' WHERE job_id = $1`, [job.id])
      expect((await readJob(pool, job.id))!.items[0]).toMatchObject({ status: 'failed', error: 'timeout' })
    })

    it('POST /api/sync answers 202 at once and the sync finishes in the background', async () => {
      const work: Promise<unknown>[] = []
      const background = (p: Promise<unknown>) => void work.push(p)
      const settings = { pluggy: config, databaseUrl: url! }
      const res = await startSync(new Request('https://t/api/sync', { method: 'POST', body: '{}' }), settings, { fetch: fakeFetch, now: () => now }, background)
      expect(res.status).toBe(202)
      expect((await res.json()).done).toBe(false)
      expect(work).toHaveLength(1)
      await Promise.all(work)
      const status = await (await syncStatus(new Request('https://t/api/sync'), settings, {}, background)).json()
      expect(status.job).toMatchObject({ done: true })
      expect(work).toHaveLength(1) // nothing left to resume
      const bad = await startSync(new Request('https://t/api/sync', { method: 'POST', body: '{"connectionIds":["other"]}' }), settings, {}, background)
      expect(bad.status).toBe(403)
    })
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
    expect(s.sync).toMatchObject({ lastSyncedAt: now.toISOString(), connections: [{ id: 'item-1', name: 'Banco Exemplo', status: 'UPDATED' }] })
  })
})

describe('sync window', () => {
  it('goes back a year on the first sync and overlaps later ones by 35 days', () => {
    expect(syncFrom(null, new Date(2026, 9, 6))).toBe('2025-10-01')
    expect(syncFrom(new Date('2026-10-01T00:00:00Z'), now)).toBe('2026-08-27')
  })
})

describe('database errors', () => {
  it('gives an out-of-date schema its own code, for the app to explain', () => {
    expect([dbErrorCode({ code: '42P01' }), dbErrorCode({ code: '42703' }), dbErrorCode({ code: '23505' }), dbErrorCode(new Error('x'))]).toEqual([
      'schema_outdated', 'schema_outdated', 'database', 'database',
    ])
  })
})
