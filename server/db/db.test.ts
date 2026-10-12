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
import { ALL_HISTORY, HISTORY_START, periodFrom, save, syncFrom, type Fetched } from './sync.js'
import { needsWorker, readJob, runJob, startJob } from './syncJobs.js'
import { edits, incomeAverageRoute, incomeRoutes, incomeCategoriesRoute, saveIncomeFilterRoute, startSync, syncStatus } from './handlers.js'
import { previewAverage } from '../../src/data/incomeAverage.js'
import { DEFAULT_LAYOUT, OVERVIEW_SECTIONS } from '../../src/data/overviewLayout.js'
import { DEFAULT_EXTRA_PAY } from '../../src/data/extraPay.js'
import type { OverviewLayout } from '../../src/data/types.js'
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
    await pool.query(`TRUNCATE app_settings, receivable_payments, receivables, manual_balances, manual_accounts, categories, subcategories, transactions, accounts, account_balances, card_bills, bank_connections, exchange_rates, sync_runs, sync_jobs, sync_job_items CASCADE`)
    await ensureSeeded(pool)
  })

  it('seeds the default categories once, in Portuguese', async () => {
    const names = (await pool.query(`SELECT name FROM categories ORDER BY sort_order`)).rows.map((r) => r.name)
    expect(names.slice(0, 3)).toEqual(['Moradia', 'Mercado', 'Restaurantes'])
    await pool.query(`DELETE FROM categories`)
    await ensureSeeded(pool)
    expect((await pool.query(`SELECT count(*)::int AS n FROM categories`)).rows[0].n).toBe(0)
  })

  it('adds defaults that came later once to a database seeded before them, never bringing back a deleted one', async () => {
    // As seeded by the first version: its 10 defaults, no record of what was offered; "Lazer" already made by hand.
    await pool.query(`DELETE FROM categories WHERE id IN ('education', 'leisure', 'taxes', 'yields')`)
    await pool.query(`DELETE FROM app_settings WHERE key = 'default_categories_offered'`)
    await pool.query(`INSERT INTO categories (id, name, type, color, icon) VALUES ('mine', 'Lazer', 'expense', 'pink', 'film')`)
    await pool.query(`DELETE FROM categories WHERE id = 'travel'`)
    await ensureSeeded(pool)
    const ids = async () => (await pool.query(`SELECT id FROM categories ORDER BY sort_order, id`)).rows.map((r) => r.id)
    const after = await ids()
    expect(after).toEqual(expect.arrayContaining(['education', 'taxes', 'yields', 'mine']))
    expect(after).not.toContain('leisure') // the name is taken
    expect(after).not.toContain('travel') // deleted before: not brought back
    expect(after.slice(-3)).toEqual(['education', 'taxes', 'yields'])
    expect((await pool.query(`SELECT count(*)::int AS n FROM subcategories WHERE category_id = 'education'`)).rows[0].n).toBe(3)
    // Once: deleting a new one keeps it deleted.
    await pool.query(`DELETE FROM categories WHERE id = 'education'`)
    await ensureSeeded(pool)
    expect(await ids()).not.toContain('education')
  })

  it('shows today\'s guess for an uncategorized transaction that was never edited', async () => {
    await sync([tx('t1', { category: 'Education' }), tx('t2', { category: 'Education' })])
    // Stored uncategorized, as a first sync before the Educação default would have left it; t2 was set to none by hand.
    await pool.query(`UPDATE transactions SET category_id = NULL`)
    await applyEditSql(pool, { op: 'categorize', transactionId: 't2', categoryId: null, subcategoryId: null })
    const s = (await readSnapshot(pool, ['item-1'], '2026-09-01'))!
    expect(s.transactions.find((t) => t.id === 't1')!.categoryId).toBe('education')
    expect(s.transactions.find((t) => t.id === 't2')!.categoryId).toBeNull()
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

  it('files a new Mercado Livre purchase under shopping, and never changes a stored category', async () => {
    await sync([tx('ml', { category: 'Groceries', description: 'MERCADOLIVRE*LOJAEXEMPLO' }), tx('super', { category: 'Groceries', description: 'SUPERMERCADO EXEMPLO' })])
    expect((await row('ml')).category_id).toBe('shopping')
    expect((await row('super')).category_id).toBe('groceries')
    // A category already stored stays as it is on later syncs.
    await pool.query(`UPDATE transactions SET category_id = 'groceries' WHERE id = 'ml'`)
    await sync([tx('ml', { category: 'Groceries', description: 'MERCADOLIVRE*LOJAEXEMPLO' })])
    expect((await row('ml')).category_id).toBe('groceries')
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

    it('sets a category without a subcategory', async () => {
      const delivery = await subOf('restaurants', 'Delivery')
      await sync([tx('t1'), tx('t2')])
      await many(['t1'], 'restaurants', delivery)
      await many(['t1', 't2'], 'restaurants', null)
      expect((await state()).map((r) => [r.id, r.category_id, r.subcategory_id])).toEqual([
        ['t1', 'restaurants', null],
        ['t2', 'restaurants', null],
      ])
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
      expect(body).toMatchObject({ average: 1000_00, allAverage: 1100_00, filter: { label: 'Salário, Freelance, Rendimentos', included: 3, total: 4 } })
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
      const res = await put({ excludedCategoryIds: ['salary', 'freelance', 'yields'], excludedSubcategoryIds: [], excludeUncategorized: true })
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
    // Or money into or out of an investment.
    await applyEditSql(pool, { op: 'setTransferOverride', transactionId: 't1', value: 'investment' })
    expect((await readSnapshot(pool, ['item-1'], '2026-09-01'))!.transactions.find((t) => t.id === 't1')).toMatchObject({ transfer: 'investment', transferOverride: 'investment' })
  })

  it('migration 014 can run again', async () => {
    const migration = readFileSync(new URL('../../db/migrations/014_investment_transfers.sql', import.meta.url), 'utf8')
    await pool.query(migration)
    await pool.query(migration)
    await sync([tx('t1')])
    await expect(pool.query(`UPDATE transactions SET transfer_override = 'other'`)).rejects.toThrow()
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

    describe('advanced sync', () => {
      const card: PluggyAccount = { id: 'card-1', itemId: 'item-1', type: 'CREDIT', subtype: 'CREDIT_CARD', name: 'Cartão Exemplo', balance: 200, currencyCode: 'BRL' }
      /** Fake Pluggy with a checking account and a card; records which accounts were read, and from when. */
      const twoAccounts = (balance = 1500) => {
        const reads: string[] = []
        const fetchFn = (async (input: string | URL) => {
          const u = new URL(String(input))
          const ok = (body: unknown) => Response.json(body)
          if (u.pathname === '/auth') return ok({ apiKey: 'k' })
          if (u.pathname === '/items/item-1') return ok(item)
          if (u.pathname === '/accounts') return ok({ results: [{ ...checking, balance }, card], page: 1, total: 2, totalPages: 1 })
          if (u.pathname === '/v2/transactions') {
            const account = u.searchParams.get('accountId')!
            reads.push(`${account} ${u.searchParams.get('dateFrom')}`)
            return ok({ results: account === 'card-1' ? [tx('c1', { accountId: 'card-1' })] : [], next: null })
          }
          if (u.pathname === '/bills') {
            reads.push(`bills ${u.searchParams.get('accountId')}`)
            return ok({ results: [], page: 1, total: 0, totalPages: 1 })
          }
          return new Response('{}', { status: 404 })
        }) as typeof fetch
        return { reads, fetchFn }
      }
      const settings = () => ({ pluggy: config, databaseUrl: url! })
      /** Both accounts stored, with a checking transaction. */
      const seededAt = new Date('2026-09-20T12:00:00.000Z')
      const seed = (txs = [tx('kept')]) => inTransaction(pool, (db) => save(db, { ...fetched(txs), accounts: [checking, card] }, seededAt))
      const start = async (body: unknown, fetchFn: typeof fetch) => {
        const work: Promise<unknown>[] = []
        const res = await startSync(new Request('https://t/api/sync', { method: 'POST', body: JSON.stringify(body) }), settings(), { fetch: fetchFn, now: () => now }, (p) => void work.push(p))
        await Promise.all(work)
        return res
      }

      it('reads only the chosen accounts, over the chosen period; the others keep their transactions and get their balance', async () => {
        await seed()
        const { reads, fetchFn } = twoAccounts(9900)
        const res = await start({ accountIds: ['card-1'], period: '3m' }, fetchFn)
        expect(res.status).toBe(202)
        // Only item-1 is synced (the card's connection), from Aug 1 (Aug, Sep and Oct).
        expect((await res.json()).items.map((i: { connectionId: string }) => i.connectionId)).toEqual(['item-1'])
        expect(reads).toEqual(['card-1 2026-08-01', 'bills card-1'])
        expect((await pool.query(`SELECT id FROM transactions WHERE removed_at IS NULL ORDER BY id`)).rows.map((r) => r.id)).toEqual(['c1', 'kept'])
        expect((await pool.query(`SELECT balance_cents FROM accounts WHERE id = 'acc-1'`)).rows[0].balance_cents).toBe('990000')
        const at = (await pool.query(`SELECT id, transactions_synced_at AS at FROM accounts ORDER BY id`)).rows
        expect(at).toEqual([
          { id: 'acc-1', at: seededAt }, // not read this time
          { id: 'card-1', at: now },
        ])
      })

      it('starts the default window at the oldest last read of the chosen accounts', async () => {
        await seed()
        const { reads, fetchFn } = twoAccounts()
        await start({ accountIds: ['card-1'] }, fetchFn)
        // Checking was last read on Sep 10, the card just now: both are read back 35 days from the older.
        await pool.query(`UPDATE accounts SET transactions_synced_at = '2026-09-10T12:00:00Z' WHERE id = 'acc-1'`)
        await pool.query(`INSERT INTO app_settings (key, value) VALUES ('fetched_from:item-1', to_jsonb('2025-01-01'::text)) ON CONFLICT (key) DO UPDATE SET value = excluded.value`)
        reads.length = 0
        await start({}, fetchFn)
        expect(reads.filter((r) => !r.startsWith('bills'))).toEqual(['acc-1 2026-08-06', 'card-1 2026-08-06'])
      })

      it('"all" reads everything the bank has, and removes only after the earliest day returned', async () => {
        await seed([tx('old', { date: '2025-03-01T12:00:00.000Z' })])
        const { reads, fetchFn } = twoAccounts()
        await start({ period: 'all' }, fetchFn)
        expect(reads.filter((r) => !r.startsWith('bills'))).toEqual([`acc-1 ${ALL_HISTORY}`, `card-1 ${ALL_HISTORY}`])
        // Checking returned nothing this time: its stored history is kept.
        expect((await pool.query(`SELECT removed_at IS NULL AS kept FROM transactions WHERE id = 'old'`)).rows[0].kept).toBe(true)
      })

      it('refuses an unknown period, an empty or malformed account list, and an account of another connection', async () => {
        await seed()
        const { fetchFn } = twoAccounts()
        expect((await start({ period: '2y' }, fetchFn)).status).toBe(400)
        expect((await start({ accountIds: [] }, fetchFn)).status).toBe(400)
        expect((await start({ accountIds: [1] }, fetchFn)).status).toBe(400)
        expect((await start({ accountIds: ['acc-1', 'acc-1'] }, fetchFn)).status).toBe(400)
        expect((await start({ accountIds: ['nope'] }, fetchFn)).status).toBe(403)
        expect((await start({ connectionIds: ['item-2'], accountIds: ['acc-1'] }, fetchFn)).status).toBe(403)
      })
    })
  })

  it('reads the snapshot with the stored categories and hidden flags', async () => {
    expect(await readSnapshot(pool, ['item-1'], '2026-05-01')).toBeNull() // never synced
    await sync([tx('t1', { category: 'Supermarkets' }), tx('t2')])
    await applyEditSql(pool, { op: 'hide', transactionId: 't2', hidden: true })
    const s = (await readSnapshot(pool, ['item-1'], '2026-05-01'))!
    expect(s.institutions.map((i) => i.name)).toEqual(['Banco Exemplo'])
    expect(s.categories).toHaveLength(14)
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

  it('a card’s closing and due days are stored, survive every sync and apply on any device', async () => {
    const card: PluggyAccount = { id: 'card-1', itemId: 'item-1', type: 'CREDIT', subtype: 'CREDIT_CARD', name: 'Cartão Exemplo', balance: 100, currencyCode: 'BRL', creditData: { creditLimit: 1000 } }
    const syncCard = () => inTransaction(pool, (db) => save(db, { ...fetched([tx('t1')]), accounts: [checking, card] }, now))
    await syncCard()
    await applyEditSql(pool, { op: 'setCardDays', accountId: 'card-1', days: { close: 3, due: 10 } })
    await syncCard()
    expect((await readSnapshot(pool, ['item-1'], '2026-09-01'))!.cardDays).toEqual({ 'card-1': { close: 3, due: 10 } })
    await applyEditSql(pool, { op: 'setCardDays', accountId: 'card-1', days: null })
    expect((await readSnapshot(pool, ['item-1'], '2026-09-01'))!.cardDays).toEqual({})
    // Cards only.
    await expect(applyEditSql(pool, { op: 'setCardDays', accountId: 'acc-1', days: { close: 3, due: 10 } })).rejects.toThrow(EditError)
    await expect(applyEditSql(pool, { op: 'setCardDays', accountId: 'nope', days: { close: 3, due: 10 } })).rejects.toThrow(EditError)
  })

  it('stores each bill’s closing date, in Brazil time', async () => {
    const bills = [
      { accountId: 'acc-1', bill: { id: 'b1', dueDate: '2026-10-10T03:00:00.000Z', billClosingDate: '2026-10-03T02:00:00.000Z', totalAmount: 150 } },
      { accountId: 'acc-1', bill: { id: 'b2', dueDate: '2026-11-10T03:00:00.000Z', totalAmount: 150 } },
      { accountId: 'acc-1', bill: { id: 'b3', dueDate: '2026-12-10T03:00:00.000Z', billClosingDate: 'not a date', totalAmount: 150 } },
    ]
    await sync([], bills)
    expect((await pool.query(`SELECT id, closing_date::text FROM card_bills ORDER BY id`)).rows).toEqual([
      { id: 'b1', closing_date: '2026-10-02' },
      { id: 'b2', closing_date: null },
      { id: 'b3', closing_date: null },
    ])
  })

  it('migration 009 fills in the closing date of bills already stored, and can run again', async () => {
    await sync([], [{ accountId: 'acc-1', bill: { id: 'b1', dueDate: '2026-10-10T03:00:00.000Z', billClosingDate: '2026-10-03T02:00:00.000Z', totalAmount: 150 } }])
    await pool.query(`UPDATE card_bills SET closing_date = NULL`)
    const migration = readFileSync(new URL('../../db/migrations/009_card_days.sql', import.meta.url), 'utf8')
    await pool.query(migration)
    await pool.query(migration)
    expect((await pool.query(`SELECT closing_date::text FROM card_bills`)).rows).toEqual([{ closing_date: '2026-10-02' }])
  })

  it('keeps the FGTS balance and its history, through syncs and with tracking off', async () => {
    await sync([tx('t1')])
    expect((await readSnapshot(pool, ['item-1'], '2026-09-01'))!.fgts).toEqual({ tracking: false, entries: [] })
    await applyEditSql(pool, { op: 'setFgtsTracking', tracking: true })
    await applyEditSql(pool, { op: 'saveFgtsBalance', entry: { id: 'f1', date: '2026-08-21', balance: 9_000_00 } })
    await applyEditSql(pool, { op: 'saveFgtsBalance', entry: { id: 'f2', date: '2026-09-22', balance: 10_000_00 } })
    await applyEditSql(pool, { op: 'saveFgtsBalance', entry: { id: 'f1', date: '2026-08-21', balance: 9_500_00 } }) // corrected
    await sync([tx('t1')])
    await applyEditSql(pool, { op: 'setFgtsTracking', tracking: false })
    expect((await readSnapshot(pool, ['item-1'], '2026-09-01'))!.fgts).toEqual({
      tracking: false,
      entries: [
        { id: 'f2', date: '2026-09-22', balance: 10_000_00 },
        { id: 'f1', date: '2026-08-21', balance: 9_500_00 },
      ],
    })
    await applyEditSql(pool, { op: 'deleteFgtsBalance', id: 'f2' })
    await expect(applyEditSql(pool, { op: 'deleteFgtsBalance', id: 'f2' })).rejects.toThrow(EditError)
    await applyEditSql(pool, { op: 'clearFgtsHistory' })
    expect(await count('manual_balances')).toBe(0)
  })

  it('migration 010 can run again', async () => {
    const migration = readFileSync(new URL('../../db/migrations/010_manual_balances.sql', import.meta.url), 'utf8')
    await pool.query(migration)
    await pool.query(migration)
  })

  it('keeps previdência privada plans and their balances, through syncs; deleting a plan takes its history', async () => {
    await sync([tx('t1')])
    expect((await readSnapshot(pool, ['item-1'], '2026-09-01'))!.pension).toEqual({ tracking: false, plans: [] })
    await applyEditSql(pool, { op: 'setPensionTracking', tracking: true })
    await applyEditSql(pool, { op: 'savePensionPlan', plan: { id: 'p1', name: 'Previdência Exemplo', type: 'PGBL' } })
    await applyEditSql(pool, { op: 'savePensionPlan', plan: { id: 'p2', name: 'Plano Modelo', type: null } })
    await applyEditSql(pool, { op: 'savePensionPlan', plan: { id: 'p1', name: 'Plano Exemplo', type: 'VGBL' } }) // renamed, stays first
    await applyEditSql(pool, { op: 'savePensionBalance', planId: 'p1', entry: { id: 'b1', date: '2026-08-10', balance: 20_000_00 } })
    await applyEditSql(pool, { op: 'savePensionBalance', planId: 'p1', entry: { id: 'b2', date: '2026-09-10', balance: 20_300_00 } })
    await applyEditSql(pool, { op: 'savePensionBalance', planId: 'p2', entry: { id: 'b3', date: '2026-09-02', balance: 5_000_00 } })
    await applyEditSql(pool, { op: 'savePensionBalance', planId: 'p1', entry: { id: 'b1', date: '2026-08-10', balance: 20_100_00 } }) // corrected
    // An FGTS balance alongside: each read keeps its own.
    await applyEditSql(pool, { op: 'saveFgtsBalance', entry: { id: 'f1', date: '2026-09-22', balance: 10_000_00 } })
    await sync([tx('t1')])
    const s = (await readSnapshot(pool, ['item-1'], '2026-09-01'))!
    expect(s.fgts?.entries.map((e) => e.id)).toEqual(['f1'])
    expect(s.pension).toEqual({
      tracking: true,
      plans: [
        { id: 'p1', name: 'Plano Exemplo', type: 'VGBL', entries: [{ id: 'b2', date: '2026-09-10', balance: 20_300_00 }, { id: 'b1', date: '2026-08-10', balance: 20_100_00 }] },
        { id: 'p2', name: 'Plano Modelo', type: null, entries: [{ id: 'b3', date: '2026-09-02', balance: 5_000_00 }] },
      ],
    })
    // A balance can't move to another plan, go into a missing one, or take over an FGTS balance's ID.
    await expect(applyEditSql(pool, { op: 'savePensionBalance', planId: 'p2', entry: { id: 'b1', date: '2026-08-10', balance: 1 } })).rejects.toThrow(EditError)
    await expect(applyEditSql(pool, { op: 'savePensionBalance', planId: 'nope', entry: { id: 'b9', date: '2026-08-10', balance: 1 } })).rejects.toThrow(EditError)
    await expect(applyEditSql(pool, { op: 'savePensionBalance', planId: 'p1', entry: { id: 'f1', date: '2026-08-10', balance: 1 } })).rejects.toThrow(EditError)
    await applyEditSql(pool, { op: 'deletePensionBalance', planId: 'p1', id: 'b2' })
    await expect(applyEditSql(pool, { op: 'deletePensionBalance', planId: 'p1', id: 'b2' })).rejects.toThrow(EditError)
    await applyEditSql(pool, { op: 'deletePensionPlan', id: 'p1' })
    expect((await pool.query(`SELECT id FROM manual_balances ORDER BY id`)).rows.map((r) => r.id)).toEqual(['b3', 'f1'])
    await expect(applyEditSql(pool, { op: 'deletePensionPlan', id: 'p1' })).rejects.toThrow(EditError)
  })

  it('migration 011 runs on a database from migration 010, keeping its FGTS balances, and can run again', async () => {
    await pool.query(`DROP TABLE manual_balances, manual_accounts`)
    await pool.query(readFileSync(new URL('../../db/migrations/010_manual_balances.sql', import.meta.url), 'utf8'))
    await pool.query(`INSERT INTO manual_balances (id, kind, as_of, balance_cents) VALUES ('f1', 'fgts', '2026-09-22', 100)`)
    const migration = readFileSync(new URL('../../db/migrations/011_pension_plans.sql', import.meta.url), 'utf8')
    await pool.query(migration)
    await pool.query(migration)
    expect((await pool.query(`SELECT id, account_id FROM manual_balances`)).rows).toEqual([{ id: 'f1', account_id: null }])
    await expect(pool.query(`INSERT INTO manual_balances (id, kind, as_of, balance_cents) VALUES ('x', 'pension', '2026-09-22', 1)`)).rejects.toThrow()
  })

  it('keeps the Equilíbrio groups and target, through syncs, with the same rules as the app', async () => {
    await sync([tx('t1')])
    const read = async () => (await readSnapshot(pool, ['item-1'], '2026-09-01'))!
    expect((await read()).balanceTarget).toEqual({ essential: 50, lifestyle: 30, future: 20 })
    expect((await read()).categories.every((c) => c.group === null)).toBe(true)
    await applyEditSql(pool, { op: 'setCategoryGroups', groups: [{ categoryId: 'home', group: 'essential' }, { categoryId: 'transport', group: 'essential' }, { categoryId: 'travel', group: 'lifestyle' }] })
    const ride = await subOf('transport', 'Apps de corrida')
    await applyEditSql(pool, { op: 'setSubcategoryGroup', id: ride, group: 'lifestyle' })
    await applyEditSql(pool, { op: 'setBalanceTarget', target: { essential: 60, lifestyle: 20, future: 20 } })
    await sync([tx('t1')])
    let s = await read()
    expect(s.categories.filter((c) => c.group).map((c) => [c.id, c.group])).toEqual([
      ['home', 'essential'],
      ['transport', 'essential'],
      ['travel', 'lifestyle'],
    ])
    expect(s.subcategories.filter((x) => x.group).map((x) => [x.id, x.group])).toEqual([[ride, 'lifestyle']])
    expect(s.balanceTarget).toEqual({ essential: 60, lifestyle: 20, future: 20 })
    // All or none: an income category or a missing one refuses the whole change.
    await expect(applyEditSql(pool, { op: 'setCategoryGroups', groups: [{ categoryId: 'travel', group: null }, { categoryId: 'salary', group: 'essential' }] })).rejects.toThrow(EditError)
    await expect(applyEditSql(pool, { op: 'setCategoryGroups', groups: [{ categoryId: 'travel', group: null }, { categoryId: 'nope', group: 'essential' }] })).rejects.toMatchObject({ code: 'not_found' })
    expect((await read()).categories.find((c) => c.id === 'travel')!.group).toBe('lifestyle')
    await expect(applyEditSql(pool, { op: 'setSubcategoryGroup', id: await subOf('salary', 'Salário base'), group: 'essential' })).rejects.toMatchObject({ code: 'invalid' })
    await expect(applyEditSql(pool, { op: 'setSubcategoryGroup', id: 'nope', group: 'essential' })).rejects.toMatchObject({ code: 'not_found' })
    // A category that becomes income loses its group and its subcategories' groups.
    await applyEditSql(pool, { op: 'updateCategory', id: 'transport', changes: { type: 'income' } })
    s = await read()
    expect(s.categories.find((c) => c.id === 'transport')!.group).toBeNull()
    expect(s.subcategories.find((x) => x.id === ride)!.group).toBeNull()
    // So does a subcategory moved under an income category.
    const fuel = await subOf('home', 'Energia')
    await applyEditSql(pool, { op: 'setSubcategoryGroup', id: fuel, group: 'lifestyle' })
    await applyEditSql(pool, { op: 'linkSubcategory', id: fuel, categoryId: 'salary' })
    expect((await read()).subcategories.find((x) => x.id === fuel)!.group).toBeNull()
  })

  it('keeps 13º e férias, off by default, through syncs', async () => {
    await sync([tx('t1')])
    const read = async () => (await readSnapshot(pool, ['item-1'], '2026-09-01'))!.extraPay
    expect(await read()).toEqual(DEFAULT_EXTRA_PAY)
    const extraPay = { enabled: true, salary: 6_000_00, firstPart: 'vacation' as const, vacations: [{ id: 'v1', start: '2026-12-07', days: 20, sold: true }] }
    await applyEditSql(pool, { op: 'setExtraPay', extraPay })
    await sync([tx('t1')])
    expect(await read()).toEqual(extraPay)
    // Something stored that isn't valid reads as off.
    await pool.query(`UPDATE app_settings SET value = '{"enabled": "yes"}' WHERE key = 'extra_pay'`)
    expect(await read()).toEqual(DEFAULT_EXTRA_PAY)
  })

  it('keeps the Visão geral layout, through syncs, made whole when read', async () => {
    await sync([tx('t1')])
    const read = async () => (await readSnapshot(pool, ['item-1'], '2026-09-01'))!.overviewLayout
    expect(await read()).toEqual(DEFAULT_LAYOUT)
    const layout = { order: ['trends', ...OVERVIEW_SECTIONS.filter((x) => x !== 'trends')], hidden: ['alerts'] } as OverviewLayout
    await applyEditSql(pool, { op: 'setOverviewLayout', layout })
    await sync([tx('t1')])
    expect(await read()).toEqual(layout)
    // A card the stored layout doesn't know (added later) shows at its default place; an unknown one is dropped.
    await pool.query(`UPDATE app_settings SET value = $1 WHERE key = 'overview_layout'`, [JSON.stringify({ order: ['trends', 'gone', 'netWorth'], hidden: ['alerts'] })])
    expect(await read()).toEqual({ order: ['trends', 'monthInDetail', 'netWorth', 'monthClose', 'thisMonth', 'alerts', 'comingUp'], hidden: ['alerts'] })
    // One saved before the seven cards (it names a retired one) starts from the default order, keeping what's still hidden.
    await pool.query(`UPDATE app_settings SET value = $1 WHERE key = 'overview_layout'`, [JSON.stringify({ order: ['balance', 'monthInDetail', 'netWorth'], hidden: ['unusual', 'comingUp'] })])
    expect(await read()).toEqual({ order: [...OVERVIEW_SECTIONS], hidden: ['comingUp'] })
  })

  it('migration 012 can run again', async () => {
    const migration = readFileSync(new URL('../../db/migrations/012_spending_groups.sql', import.meta.url), 'utf8')
    await pool.query(migration)
    await pool.query(migration)
    await expect(pool.query(`UPDATE categories SET spending_group = 'essential' WHERE id = 'salary'`)).rejects.toThrow()
  })

  describe('A receber', () => {
    const scope = { itemIds: ['item-1'] }
    const owe = (id: string, person: string, amount: number, transactionId = 'dinner') =>
      applyEditSql(pool, { op: 'saveReceivable', receivable: { id, transactionId, person, amount } }, scope)
    const pay = (receivableId: string, id: string, amount: number, transactionId: string | null = null) =>
      applyEditSql(pool, { op: 'saveReceivablePayment', receivableId, payment: { id, date: '2026-10-04', amount, transactionId } }, scope)
    const read = async () => (await readSnapshot(pool, ['item-1'], '2026-09-01'))!.receivables
    const refused = async (p: Promise<unknown>) => {
      try {
        await p
      } catch (e) {
        return e instanceof EditError ? (e.reason ?? e.code) : 'other'
      }
      return null
    }
    const seed = () => sync([tx('dinner', { amount: -150 }), tx('pix-in', { type: 'CREDIT', amount: 50, description: 'PIX RECEBIDO EXEMPLO', date: '2026-10-03T12:00:00.000Z' })])

    it('keeps receivables and their payments, through syncs, with the same rules as the app', async () => {
      await seed()
      await owe('r1', 'Ana', 75_00)
      await owe('r2', 'Bruno', 75_00)
      await pay('r1', 'p1', 50_00, 'pix-in')
      await pay('r1', 'p2', 5_00)
      await seed()
      expect(await read()).toEqual([
        { id: 'r1', transactionId: 'dinner', date: '2026-10-01', person: 'Ana', amount: 75_00, payments: [
          { id: 'p1', date: '2026-10-04', amount: 50_00, transactionId: 'pix-in' },
          { id: 'p2', date: '2026-10-04', amount: 5_00, transactionId: null },
        ] },
        { id: 'r2', transactionId: 'dinner', date: '2026-10-01', person: 'Bruno', amount: 75_00, payments: [] },
      ])
      // Only your part counts: the expense's owed part and the money paid back are marked on read.
      const marked = (await readSnapshot(pool, ['item-1'], '2026-09-01'))!.transactions
      expect(marked.find((t) => t.id === 'dinner')).toMatchObject({ amount: -150_00, shared: 150_00 })
      expect(marked.find((t) => t.id === 'pix-in')).toMatchObject({ amount: 50_00, repaid: 50_00 })
      expect(await refused(owe('r3', 'Carla', 1))).toBe('over_expense')
      expect(await refused(owe('r3', 'Carla', 1, 'pix-in'))).toBe('not_expense')
      expect(await refused(owe('r3', 'Carla', 1, 'nope'))).toBe('not_found')
      expect(await refused(owe('r1', 'Ana', 54_99))).toBe('below_received')
      expect(await refused(pay('r1', 'p3', 20_01))).toBe('over_owed')
      expect(await refused(pay('r2', 'p3', 1, 'pix-in'))).toBe('over_received')
      expect(await refused(pay('r2', 'p3', 1, 'dinner'))).toBe('not_money_in')
      expect(await refused(pay('r2', 'p1', 1))).toBe('invalid')
      expect(await refused(pay('nope', 'p3', 1))).toBe('not_found')
      // A correction, by ID; deleting a payment, then a receivable with its payments.
      await owe('r1', 'Ana Paula', 60_00)
      await applyEditSql(pool, { op: 'deleteReceivablePayment', receivableId: 'r1', id: 'p2' }, scope)
      expect((await read())![0]).toMatchObject({ person: 'Ana Paula', amount: 60_00, payments: [{ id: 'p1' }] })
      await applyEditSql(pool, { op: 'deleteReceivable', id: 'r1' }, scope)
      expect((await read())!.map((r) => r.id)).toEqual(['r2'])
      expect(await count('receivable_payments')).toBe(0)
      expect(await refused(applyEditSql(pool, { op: 'deleteReceivable', id: 'r1' }, scope))).toBe('not_found')
    })

    it('POST /api/edits needs the configured connections for them, and gives the reason a change is refused', async () => {
      await seed()
      const post = (body: unknown, pluggy: PluggyConfig | null) =>
        edits(new Request('https://trove.test/api/edits', { method: 'POST', body: JSON.stringify(body) }), { pluggy, databaseUrl: url! })
      const config: PluggyConfig = { clientId: 'cid', clientSecret: 'secret', itemIds: ['item-1'], baseUrl: 'https://api.pluggy.ai' }
      const body = { op: 'saveReceivable', receivable: { id: 'r1', transactionId: 'dinner', person: 'Ana', amount: 150_01 } }
      expect((await post(body, null)).status).toBe(503)
      const res = await post(body, config)
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ error: 'invalid', reason: 'over_expense' })
      expect((await post({ ...body, receivable: { ...body.receivable, amount: 150_00 } }, config)).status).toBe(204)
      // Another connection's transaction isn't one.
      expect((await post({ ...body, receivable: { ...body.receivable, id: 'r2', amount: 1 } }, { ...config, itemIds: ['item-2'] })).status).toBe(404)
    })

    it('moves them to the transaction a bank replaces under a new ID', async () => {
      await sync([tx('p1', { status: 'PENDING' }), tx('pix-in', { type: 'CREDIT', amount: 50, status: 'PENDING', date: '2026-10-03T12:00:00.000Z' })])
      await owe('r1', 'Ana', 100_00, 'p1')
      await pay('r1', 'p1', 50_00, 'pix-in')
      await sync([tx('n1', { date: '2026-10-02T12:00:00.000Z' }), tx('n2', { type: 'CREDIT', amount: 50, date: '2026-10-04T12:00:00.000Z' })])
      expect(await read()).toEqual([
        { id: 'r1', transactionId: 'n1', date: '2026-10-02', person: 'Ana', amount: 100_00, payments: [{ id: 'p1', date: '2026-10-04', amount: 50_00, transactionId: 'n2' }] },
      ])
    })

    it('migration 013 can run again', async () => {
      const migration = readFileSync(new URL('../../db/migrations/013_receivables.sql', import.meta.url), 'utf8')
      await pool.query(migration)
      await pool.query(migration)
      await expect(pool.query(`INSERT INTO receivables (id, transaction_id, person, amount_cents) VALUES ('x', 'nope', 'Ana', 1)`)).rejects.toThrow()
    })
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

  it('gives a card’s closing and due days from its last bills, when the bank reports none for the card', async () => {
    const card: PluggyAccount = { id: 'card-1', itemId: 'item-1', type: 'CREDIT', subtype: 'CREDIT_CARD', name: 'Cartão Exemplo', balance: 300, currencyCode: 'BRL', creditData: { creditLimit: 1000 } }
    // Due on the 10th; a purchase on the 2nd and the 5th of each month: it closes between them (the 3rd, the middle day).
    const months = ['2026-06', '2026-07', '2026-08', '2026-09']
    const bills = months.map((m) => ({ accountId: 'card-1', bill: { id: `bill-${m}`, dueDate: `${m}-10T03:00:00.000Z`, totalAmount: 100 } }))
    const next = (m: string) => months[months.indexOf(m) + 1]
    const purchase = (id: string, date: string, billId: string | undefined) =>
      tx(id, { accountId: 'card-1', date: `${date}T12:00:00.000Z`, amount: 50, ...(billId ? { creditCardMetadata: { billId } } : {}) })
    const txs = months.flatMap((m) => [purchase(`a-${m}`, `${m}-02`, `bill-${m}`), purchase(`b-${m}`, `${m}-05`, next(m) && `bill-${next(m)}`)])
    await inTransaction(pool, (db) => save(db, { ...fetched(txs, bills), from: '2026-05-01', accounts: [checking, card] }, now))
    const s = (await readSnapshot(pool, ['item-1'], '2026-05-01'))!
    expect(s.accounts.find((a) => a.id === 'card-1')?.creditData?.estimatedDays).toEqual({ close: 3, due: 10, bills: 3, source: 'purchases' })
    expect(s.accounts.find((a) => a.id === 'acc-1')?.creditData).toBeUndefined()
    // Bills that carry their closing date give it directly (Brazil time: 03:00Z is the start of the day there).
    const closing = bills.map((b) => ({ ...b, bill: { ...b.bill, billClosingDate: `${b.bill.dueDate.slice(0, 8)}01T03:00:00.000Z` } }))
    await inTransaction(pool, (db) => save(db, { ...fetched(txs, closing), from: '2026-05-01', accounts: [checking, card] }, now))
    const again = (await readSnapshot(pool, ['item-1'], '2026-05-01'))!
    expect(again.accounts.find((a) => a.id === 'card-1')?.creditData?.estimatedDays).toEqual({ close: 1, due: 10, bills: 3, source: 'closing' })
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
      expect((await readSnapshot(pool, ['item-1'], '2026-04-01'))!.projectionSettings).toEqual({ accountIds: ['acc-1'], includeDaily: false, includeFreelance: true, horizon: 'month' })
      // Up to the end of next month.
      const longer = await call('PUT', '/api/insights/projection/settings', { accountIds: ['acc-1'], includeDaily: false, includeFreelance: true, horizon: 'nextMonth' })
      expect((await longer.json()).endDate).toBe('2026-11-30')
      expect((await readSnapshot(pool, ['item-1'], '2026-04-01'))!.projectionSettings?.horizon).toBe('nextMonth')
      expect((await call('PUT', '/api/insights/projection/settings', { accountIds: null, includeDaily: true, includeFreelance: false, horizon: 'year' })).status).toBe(400)
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

  it('reads a chosen period from the 1st of its first month, in Brazil time', () => {
    const now = new Date('2026-10-06T12:00:00Z')
    expect(periodFrom('3m', now)).toBe('2026-08-01')
    expect(periodFrom('6m', now)).toBe('2026-05-01')
    expect(periodFrom('1y', now)).toBe('2025-11-01')
    expect(periodFrom('all', now)).toBe(ALL_HISTORY)
    // 01:00 UTC on March 1st is still February in Brazil.
    expect(periodFrom('3m', new Date('2026-03-01T01:00:00Z'))).toBe('2025-12-01')
    expect(periodFrom('1y', new Date('2026-01-15T12:00:00Z'))).toBe('2025-02-01')
  })
})

describe('database errors', () => {
  it('gives an out-of-date schema its own code, for the app to explain', () => {
    expect([dbErrorCode({ code: '42P01' }), dbErrorCode({ code: '42703' }), dbErrorCode({ code: '23505' }), dbErrorCode(new Error('x'))]).toEqual([
      'schema_outdated', 'schema_outdated', 'database', 'database',
    ])
  })
})
