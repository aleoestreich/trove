// Database tests: run against a real, disposable Postgres when TEST_DATABASE_URL
// is set (it's wiped), and are skipped otherwise. Made-up data only.

import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { EditError, type BulkResult } from '../../src/data/edits.js'
import type { PluggyAccount, PluggyItem, PluggyTransaction } from '../pluggy/types.js'
import { applyEditSql, ensureSeeded } from './categories.js'
import { dbErrorCode, inTransaction } from './connection.js'
import { readSnapshot, readStart } from './read.js'
import { financeRoutes } from './handlers.js'
import { HISTORY_START, save, syncFrom, type Fetched } from './sync.js'
import { needsWorker, readJob, runJob, startJob } from './syncJobs.js'
import { edits, incomeAverageRoute, incomeRoutes, incomeCategoriesRoute, saveIncomeFilterRoute, startSync, syncStatus } from './handlers.js'
import { previewAverage } from '../../src/data/incomeAverage.js'
import { insightRoutes } from './insights.js'
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
    const many = (transactionIds: string[], categoryId: string | null, subcategoryId: string | null) =>
      applyEditSql(pool, { op: 'categorizeMany', transactionIds, categoryId, subcategoryId }, ctx)
    const reasonOf = (p: Promise<unknown>) => p.then(() => 'none', (e) => (e instanceof EditError ? e.reason ?? e.code : String(e)))
    const state = async () =>
      (await pool.query(`SELECT id, category_id, subcategory_id, category_edited_at IS NOT NULL AS edited FROM transactions ORDER BY id`)).rows

    it('leaves them uncategorized, marked edited, so a sync never guesses again; undo restores them', async () => {
      await sync([tx('t1', { category: 'Supermarkets' }), tx('t2', { category: 'Supermarkets' })])
      const result = await many(['t1', 't2'], null, null)
      expect(result).toMatchObject({ updated: 2 })
      await sync([tx('t1', { category: 'Supermarkets' }), tx('t2', { category: 'Supermarkets' })])
      expect(await state()).toEqual([
        { id: 't1', category_id: null, subcategory_id: null, edited: true },
        { id: 't2', category_id: null, subcategory_id: null, edited: true },
      ])
      await applyEditSql(pool, { op: 'restoreCategories', items: (result as BulkResult).previous }, ctx)
      expect((await state()).map((r) => r.category_id)).toEqual(['groceries', 'groceries'])
    })

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

  describe('average income filter', () => {
    const config = () => ({ pluggy: { clientId: 'cid', clientSecret: 'secret', itemIds: ['item-1'], baseUrl: 'https://api.pluggy.ai' }, databaseUrl: url! })
    const deps = { now: () => now }
    const get = async (route: typeof incomeAverageRoute) => (await route(new Request('https://trove.test/api'), config(), deps)).json()
    const put = (body: unknown) =>
      saveIncomeFilterRoute(new Request('https://trove.test/api/settings/income-average-filter', { method: 'PUT', body: JSON.stringify(body) }), config(), deps)
    const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
    const income = () =>
      sync(
        months.flatMap((m) => [
          tx(`sal-${m}`, { type: 'CREDIT', amount: 1000, category: 'Salary', date: `${m}-05T12:00:00.000Z` }),
          tx(`pix-${m}`, { type: 'CREDIT', amount: 100, date: `${m}-12T12:00:00.000Z` }),
          tx(`out-${m}`, { amount: -50, category: 'Supermarkets', date: `${m}-15T12:00:00.000Z` }),
        ]),
      )
    const none = { excludedCategoryIds: [], excludedSubcategoryIds: [], excludeUncategorized: false }

    it('GET returns the card and the categories; PUT saves and answers with what the preview showed', async () => {
      await income()
      const card = await get(incomeAverageRoute)
      expect(card).toMatchObject({ average: 1100_00, allAverage: 1100_00, filter: { ...none, label: 'Todas as receitas' } })
      expect(card.months).toHaveLength(6)
      const options = await get(incomeCategoriesRoute)
      expect(options.categories.find((c: { id: string }) => c.id === 'salary')).toMatchObject({ name: 'Salário', average: 1000_00 })
      expect(options.uncategorized.average).toBe(100_00)
      const chosen = { ...none, excludeUncategorized: true }
      const saved = await put(chosen)
      expect(saved.status).toBe(200)
      const body = await saved.json()
      expect(body.average).toBe(previewAverage(options, chosen))
      expect(body).toMatchObject({ average: 1000_00, allAverage: 1100_00, filter: { label: 'Salário, Freelance', included: 2, total: 3 } })
      // Stored, and part of the app's data.
      expect((await readSnapshot(pool, ['item-1'], '2026-04-01'))!.incomeFilter).toEqual(chosen)
    })

    it('one function serves the three routes, by the rewritten view or the original path', async () => {
      await income()
      const call = (method: string, path: string, body?: unknown) =>
        incomeRoutes(new Request(`https://trove.test${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }), config(), deps)
      expect((await (await call('GET', '/api/income-average?view=card')).json()).average).toBe(1100_00)
      expect((await (await call('GET', '/api/overview/income-average')).json()).average).toBe(1100_00)
      expect((await (await call('GET', '/api/income-average?view=categories')).json()).uncategorized.average).toBe(100_00)
      expect((await (await call('GET', '/api/overview/income-average/categories')).json()).uncategorized.average).toBe(100_00)
      expect((await call('PUT', '/api/income-average?view=filter', { ...none, excludeUncategorized: true })).status).toBe(200)
      expect((await call('PUT', '/api/settings/income-average-filter', none)).status).toBe(200)
      expect((await call('PUT', '/api/overview/income-average', none)).status).toBe(405)
      expect((await call('GET', '/api/settings/income-average-filter')).status).toBe(405)
    })

    it('refuses a filter with nothing selected', async () => {
      await income()
      const res = await put({ excludedCategoryIds: ['salary', 'freelance'], excludedSubcategoryIds: [], excludeUncategorized: true })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ reason: 'nothing_selected', message: 'Selecione pelo menos uma categoria' })
      expect((await put({ ...none, excludedCategoryIds: ['groceries'] })).status).toBe(400)
    })

    it('deleting an excluded category or subcategory removes it from the setting', async () => {
      await income()
      const salarySub = await subOf('salary', (await pool.query(`SELECT name FROM subcategories WHERE category_id = 'salary' LIMIT 1`)).rows[0].name)
      expect((await put({ excludedCategoryIds: ['freelance'], excludedSubcategoryIds: [salarySub], excludeUncategorized: false })).status).toBe(200)
      await applyEditSql(pool, { op: 'deleteCategory', id: 'freelance' })
      await applyEditSql(pool, { op: 'deleteSubcategory', id: salarySub })
      const stored = (await pool.query(`SELECT value FROM app_settings WHERE key = 'income_avg_filter'`)).rows[0].value
      expect(stored).toEqual({ income_avg_excluded_category_ids: [], income_avg_excluded_subcategory_ids: [], income_avg_exclude_uncategorized: false })
    })
  })

  it('a hand-set card bill payment clears the category, survives syncs and moves to a replacing transaction', async () => {
    await sync([tx('t1', { category: 'Supermarkets' }), tx('p1', { status: 'PENDING', description: 'PIX ENVIADO' })])
    await applyEditSql(pool, { op: 'setTransferOverride', transactionId: 't1', value: 'card-payment' })
    await applyEditSql(pool, { op: 'setTransferOverride', transactionId: 'p1', value: 'card-payment' })
    expect((await pool.query(`SELECT category_id, transfer_override FROM transactions WHERE id = 't1'`)).rows[0]).toEqual({ category_id: null, transfer_override: 'card-payment' })
    // The pending one posts under a new ID; the answer moves with it.
    await sync([tx('t1', { category: 'Supermarkets', amount: -151 }), tx('n1', { description: 'PIX ENVIADO', date: '2026-10-02T12:00:00.000Z' })])
    const s = (await readSnapshot(pool, ['item-1'], '2026-09-01'))!
    expect(s.transactions.find((t) => t.id === 't1')).toMatchObject({ transfer: 'card-payment', categoryId: null, transferOverride: 'card-payment' })
    expect(s.transactions.find((t) => t.id === 'n1')).toMatchObject({ transfer: 'card-payment' })
    await applyEditSql(pool, { op: 'setTransferOverride', transactionId: 't1', value: 'none' })
    expect((await readSnapshot(pool, ['item-1'], '2026-09-01'))!.transactions.find((t) => t.id === 't1')!.transfer).toBeUndefined()
    // Or a transfer between own accounts.
    await applyEditSql(pool, { op: 'categorize', transactionId: 't1', categoryId: 'groceries', subcategoryId: null })
    await applyEditSql(pool, { op: 'setTransferOverride', transactionId: 't1', value: 'own' })
    expect((await pool.query(`SELECT category_id, category_edited_at, transfer_override FROM transactions WHERE id = 't1'`)).rows[0]).toEqual({
      category_id: null,
      category_edited_at: null,
      transfer_override: 'own',
    })
    expect((await readSnapshot(pool, ['item-1'], '2026-09-01'))!.transactions.find((t) => t.id === 't1')).toMatchObject({ transfer: 'own', categoryId: null })
  })

  it('records how far back a connection was fetched, and never removes stored transactions older than what Pluggy returned', async () => {
    const fetchedFrom = async () => (await pool.query(`SELECT value #>> '{}' AS day FROM app_settings WHERE key = 'fetched_from:item-1'`)).rows[0]?.day
    await sync([tx('old', { date: '2025-03-10T12:00:00.000Z' }), tx('t1')])
    expect(fetchedFrom).toBeDefined()
    expect(await fetchedFrom()).toBe('2026-09-01')
    // A full fetch from January 2025 where the bank only returns recent months: 'old' stays.
    const full = { ...fetched([tx('t1')]), from: '2025-01-01' }
    expect(await inTransaction(pool, (db) => save(db, full, now))).toMatchObject({ removed: 0 })
    expect((await row('old')).removed_at).toBeNull()
    expect(await fetchedFrom()).toBe('2025-01-01')
    // A later, shorter sync doesn't move it forward.
    await sync([tx('t1')])
    expect(await fetchedFrom()).toBe('2025-01-01')
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

  it('a name set in Trove survives every sync, and can go back to the bank’s', async () => {
    await sync([tx('t1')])
    await applyEditSql(pool, { op: 'renameAccount', accountId: 'acc-1', name: 'Conta da casa' })
    // The bank renames the account and the next sync stores it: Trove's name stays.
    const renamed = { ...checking, name: 'Banco Exemplo S.A. (Conta Corrente Plus)' }
    await inTransaction(pool, (db) => save(db, { ...fetched([tx('t1'), tx('t2')]), accounts: [renamed] }, now))
    const s = (await readSnapshot(pool, ['item-1'], '2026-09-01'))!
    expect(s.accounts[0]).toMatchObject({ id: 'acc-1', nickname: 'Conta da casa' })
    // Stored on the account's row: the bank's name updated, Trove's kept.
    expect((await pool.query(`SELECT name, nickname FROM accounts WHERE id = 'acc-1'`)).rows[0]).toEqual({
      name: 'Banco Exemplo S.A. (Conta Corrente Plus)',
      nickname: 'Conta da casa',
    })
    await applyEditSql(pool, { op: 'renameAccount', accountId: 'acc-1', name: null })
    expect((await pool.query(`SELECT nickname FROM accounts WHERE id = 'acc-1'`)).rows[0].nickname).toBeNull()
    expect((await readSnapshot(pool, ['item-1'], '2026-09-01'))!.accounts[0].nickname).toBeUndefined()
    await expect(applyEditSql(pool, { op: 'renameAccount', accountId: 'nope', name: 'X' })).rejects.toThrow(EditError)
  })

  it('GET /api/transactions fetches older months and every stored month, with the filters', async () => {
    await sync([
      tx('old-1', { date: '2025-02-10T12:00:00.000Z', description: 'LOJA ANTIGA' }),
      tx('old-2', { date: '2025-02-20T12:00:00.000Z', description: 'MERCADO EXEMPLO', amount: -80 }),
      tx('old-3', { date: '2025-03-05T12:00:00.000Z', type: 'CREDIT', amount: 500, description: 'PIX RECEBIDO EXEMPLO' }),
      tx('new-1', { date: '2026-10-01T12:00:00.000Z' }),
    ])
    const config = { pluggy: { clientId: 'cid', clientSecret: 'secret', itemIds: ['item-1'], baseUrl: 'https://api.pluggy.ai' }, databaseUrl: url! }
    const get = async (query: string) => {
      const res = await financeRoutes(new Request(`https://trove.test/api/finance?view=transactions&${query}`), config)
      return { status: res.status, ids: res.ok ? ((await res.json()).transactions as { id: string }[]).map((t) => t.id).sort() : [] }
    }
    expect(await get('month=2025-02')).toEqual({ status: 200, ids: ['old-1', 'old-2'] })
    expect(await get('month=all')).toEqual({ status: 200, ids: ['new-1', 'old-1', 'old-2', 'old-3'] })
    expect(await get('month=all&type=income')).toEqual({ status: 200, ids: ['old-3'] })
    expect(await get('month=all&q=mercado')).toEqual({ status: 200, ids: ['old-2'] })
    expect((await get('month=fev')).status).toBe(400)
    // The app's data lists every stored month, for the month filter.
    expect((await readSnapshot(pool, ['item-1'], '2026-10-01'))!.storedMonths).toEqual(['2025-02', '2025-03', '2026-10'])
  })

  it('matches a bill payment whose bank debit is just before the days read', async () => {
    const card: PluggyAccount = { id: 'card-1', itemId: 'item-1', type: 'CREDIT', subtype: 'CREDIT_CARD', name: 'Cartão Exemplo', balance: 0, currencyCode: 'BRL' }
    await inTransaction(pool, (db) =>
      save(db, { ...fetched([tx('debit', { date: '2026-09-29T12:00:00.000Z', description: 'DEBITO EXEMPLO', amount: -500 }), tx('credit', { accountId: 'card-1', date: '2026-10-02T12:00:00.000Z', type: 'CREDIT', amount: 500, description: 'CREDITO EXEMPLO' })]), accounts: [checking, card] }, now),
    )
    const s = (await readSnapshot(pool, ['item-1'], '2026-10-01'))!
    expect(s.transactions.map((t) => [t.id, t.transfer])).toEqual([['credit', 'card-payment']])
  })

  describe('insight routes', () => {
    const config = () => ({ pluggy: { clientId: 'cid', clientSecret: 'secret', itemIds: ['item-1'], baseUrl: 'https://api.pluggy.ai' }, databaseUrl: url! })
    const deps = { now: () => now }
    const call = (method: string, path: string, body?: unknown) =>
      insightRoutes(new Request(`https://trove.test${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }), config(), deps)
    const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
    const history = (extra: PluggyTransaction[] = []) =>
      sync([
        ...months.flatMap((m) => [
          tx(`sal-${m}`, { type: 'CREDIT', amount: 1000, category: 'Salary', date: `${m}-05T12:00:00.000Z` }),
          tx(`rent-${m}`, { amount: -300, description: 'Pix enviado ALUGUEL EXEMPLO', date: `${m}-10T12:00:00.000Z` }),
          tx(`str-${m}`, { amount: -39.9, description: 'STREAMING EXEMPLO', date: `${m}-20T12:00:00.000Z` }),
        ]),
        ...extra,
      ])

    it('GET /api/insights/projection projects the month end from the database', async () => {
      await history()
      const res = await call('GET', '/api/insights/projection')
      expect(res.status).toBe(200)
      const p = await res.json()
      expect(p).toMatchObject({ available: true, asOf: '2026-10-06', endDate: '2026-10-31', settings: { accountIds: null, includeDaily: true, includeFreelance: false } })
      expect(p.breakdown).toMatchObject({ saldoHoje: 1500_00, receitasPrevistas: 1000_00, faturas: 0, recorrentes: 339_90 })
      expect(p.end).toBe(1500_00 + 1000_00 - 339_90 - p.breakdown.diaADia)
      expect(p.events).toContainEqual({ date: '2026-10-10', name: 'Pix enviado ALUGUEL EXEMPLO', meta: 'Recorrente · Pix', amount: -300_00 })
      expect(p.events).toContainEqual({ date: '2026-10-07', name: 'Salário', meta: 'Estimado · média de 6 meses', amount: 1000_00 })
    })

    it('PUT /api/insights/projection/settings saves them and recalculates', async () => {
      await history()
      const res = await call('PUT', '/api/insights/projection/settings', { accountIds: ['acc-1'], includeDaily: false, includeFreelance: true })
      expect(res.status).toBe(200)
      expect((await res.json()).breakdown.diaADia).toBe(0)
      expect((await readSnapshot(pool, ['item-1'], '2026-04-01'))!.projectionSettings).toEqual({ accountIds: ['acc-1'], includeDaily: false, includeFreelance: true })
      expect((await call('PUT', '/api/insights/projection/settings', { accountIds: [], includeDaily: false, includeFreelance: true })).status).toBe(400)
      expect((await call('POST', '/api/insights/projection/settings', {})).status).toBe(405)
    })

    it('GET /api/recurring and the actions, which survive the next sync', async () => {
      await history()
      const list = await (await call('GET', '/api/recurring')).json()
      expect(list.active.map((i: { id: string }) => i.id).sort()).toEqual(['pix-enviado-aluguel-exemplo', 'streaming-exemplo'])
      expect(list.monthTotal).toBe(339_90)
      expect(list.active.find((i: { id: string }) => i.id === 'streaming-exemplo')).toMatchObject({ paymentMethod: 'debit', account: 'Débito Banco Exemplo', cadence: 'monthly', day: 20 })
      const done = await call('POST', '/api/recurring/streaming-exemplo/action', { action: 'not_recurring' })
      expect(done.status).toBe(200)
      expect((await done.json()).active.map((i: { id: string }) => i.id)).toEqual(['pix-enviado-aluguel-exemplo'])
      // The next sync brings another charge: still not recurring.
      await history([tx('str-2026-10', { amount: -39.9, description: 'STREAMING EXEMPLO', date: '2026-10-05T12:00:00.000Z' })])
      expect((await (await call('GET', '/api/recurring')).json()).monthTotal).toBe(300_00)
      expect((await readSnapshot(pool, ['item-1'], '2026-04-01'))!.recurringOverrides).toEqual({ 'streaming-exemplo': { status: 'not_recurring', statusAt: '2026-10-06' } })
      expect((await call('POST', '/api/recurring/streaming-exemplo/action', { action: 'delete' })).status).toBe(400)
      expect((await call('POST', '/api/insights?view=recurring-action&id=has%20space', { action: 'confirm' })).status).toBe(400)
    })

    it('GET /api/insights/unusual-categories, and the income routes still answer here', async () => {
      await history()
      const u = await (await call('GET', '/api/insights/unusual-categories')).json()
      expect(u).toMatchObject({ mode: 'month', month: '2026-09', compareFrom: '2026-04', compareTo: '2026-08' })
      expect((await (await call('GET', '/api/insights?view=card')).json()).average).toBe(1000_00)
      expect((await (await call('GET', '/api/overview/income-average')).json()).average).toBe(1000_00)
      expect((await call('DELETE', '/api/recurring')).status).toBe(405)
    })

    it('fails closed without the database settings', async () => {
      const res = await insightRoutes(new Request('https://trove.test/api/recurring'), { pluggy: null, databaseUrl: null }, deps)
      expect(res.status).toBe(503)
    })
  })
})

describe('read window', () => {
  it('loads the 14 months the insights need; older ones are fetched on demand', () => {
    expect(readStart(new Date(2026, 9, 7))).toBe('2025-09-01')
  })
})

describe('sync window', () => {
  it('fetches back to January 2025 until a connection has been, then overlaps the last sync by 35 days', () => {
    expect(HISTORY_START).toBe('2025-01-01')
    expect(syncFrom(null, null)).toBe('2025-01-01')
    // Synced before, but only back to October 2025: one full fetch.
    expect(syncFrom(new Date('2026-10-01T00:00:00Z'), '2025-10-01')).toBe('2025-01-01')
    expect(syncFrom(new Date('2026-10-01T00:00:00Z'), null)).toBe('2025-01-01')
    expect(syncFrom(new Date('2026-10-01T00:00:00Z'), '2025-01-01')).toBe('2026-08-27')
  })
})

describe('database errors', () => {
  it('gives an out-of-date schema its own code, for the app to explain', () => {
    expect([dbErrorCode({ code: '42P01' }), dbErrorCode({ code: '42703' }), dbErrorCode({ code: '23505' }), dbErrorCode(new Error('x'))]).toEqual([
      'schema_outdated', 'schema_outdated', 'database', 'database',
    ])
  })
})
