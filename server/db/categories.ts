// Categories in the database: seeding the defaults on first run,
// and applying edits with the same rules as src/data/edits.ts.

import type pg from 'pg'
import { EditError, checkBulk, checkIncomeFilter, defaultCategories, type BulkResult, type Edit } from '../../src/data/edits.js'
import { NO_FILTER, pruneIncomeFilter } from '../../src/data/incomeAverage.js'
import { DEFAULT_PROJECTION_SETTINGS } from '../../src/data/projection.js'
import { applyRecurringAction } from '../../src/data/recurring.js'
import type { Category, IncomeFilter, ProjectionSettings, RecurringOverride, Subcategory } from '../../src/data/types.js'
import { inTransaction, type Db } from './connection.js'
import { readSnapshot } from './read.js'

/**
 * Seeds the default categories and subcategories (pt-BR names),
 * the first time the app reads the database. Only once: deleting them all
 * later doesn't bring them back.
 */
export async function ensureSeeded(pool: pg.Pool): Promise<void> {
  const done = await pool.query(`SELECT 1 FROM app_settings WHERE key = 'categories_seeded'`)
  if (done.rowCount) return
  await inTransaction(pool, async (db) => {
    // Whoever inserts the marker seeds; a request racing it does nothing.
    const won = await db.query(
      `INSERT INTO app_settings (key, value) VALUES ('categories_seeded', $1) ON CONFLICT (key) DO NOTHING RETURNING key`,
      [JSON.stringify({ lang: 'pt' })],
    )
    if (!won.rowCount) return
    const { categories, subcategories } = defaultCategories(() => crypto.randomUUID())
    await db.query(
      `INSERT INTO categories (id, name, type, color, icon, sort_order)
       SELECT id, name, type, color, icon, sort_order FROM jsonb_to_recordset($1::jsonb)
         AS r(id text, name text, type text, color text, icon text, sort_order int)
       ON CONFLICT DO NOTHING`,
      [JSON.stringify(categories.map((c) => ({ ...c, sort_order: c.sortOrder })))],
    )
    await db.query(
      `INSERT INTO subcategories (id, category_id, name, sort_order)
       SELECT id, category_id, name, sort_order FROM jsonb_to_recordset($1::jsonb)
         AS r(id text, category_id text, name text, sort_order int)
       ON CONFLICT DO NOTHING`,
      [JSON.stringify(subcategories.map((s) => ({ id: s.id, category_id: s.categoryId, name: s.name, sort_order: s.sortOrder })))],
    )
  })
}

export async function readCategories(db: Db): Promise<{ categories: Category[]; subcategories: Subcategory[] }> {
  const cats = await db.query<{ id: string; name: string; type: Category['type']; color: string; icon: string; sort_order: number }>(
    `SELECT id, name, type, color, icon, sort_order FROM categories ORDER BY sort_order, name`,
  )
  const subs = await db.query<{ id: string; category_id: string; name: string; sort_order: number }>(
    `SELECT id, category_id, name, sort_order FROM subcategories ORDER BY sort_order, name`,
  )
  return {
    categories: cats.rows.map((c) => ({ id: c.id, name: c.name, type: c.type, color: c.color, icon: c.icon, sortOrder: c.sort_order })),
    subcategories: subs.rows.map((s) => ({ id: s.id, categoryId: s.category_id, name: s.name, sortOrder: s.sort_order })),
  }
}

/**
 * The average income's filter, in app_settings under `income_avg_filter` (one
 * user, one row), as exclusions. Nothing stored: nothing excluded.
 */
const INCOME_FILTER_KEY = 'income_avg_filter'
interface StoredIncomeFilter {
  income_avg_excluded_category_ids: string[]
  income_avg_excluded_subcategory_ids: string[]
  income_avg_exclude_uncategorized: boolean
}

export async function readIncomeFilter(db: Db): Promise<IncomeFilter> {
  const r = await db.query<{ value: Partial<StoredIncomeFilter> }>(`SELECT value FROM app_settings WHERE key = $1`, [INCOME_FILTER_KEY])
  const v = r.rows[0]?.value
  if (!v) return NO_FILTER
  return {
    excludedCategoryIds: v.income_avg_excluded_category_ids ?? [],
    excludedSubcategoryIds: v.income_avg_excluded_subcategory_ids ?? [],
    excludeUncategorized: v.income_avg_exclude_uncategorized ?? false,
  }
}

async function writeIncomeFilter(db: Db, f: IncomeFilter): Promise<void> {
  const value: StoredIncomeFilter = {
    income_avg_excluded_category_ids: f.excludedCategoryIds,
    income_avg_excluded_subcategory_ids: f.excludedSubcategoryIds,
    income_avg_exclude_uncategorized: f.excludeUncategorized,
  }
  await db.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [INCOME_FILTER_KEY, JSON.stringify(value)],
  )
}

/** After a delete: the filter keeps only IDs that still exist. */
async function pruneStoredIncomeFilter(db: Db): Promise<void> {
  const current = await readIncomeFilter(db)
  if (current.excludedCategoryIds.length === 0 && current.excludedSubcategoryIds.length === 0) return
  const { categories, subcategories } = await readCategories(db)
  await writeIncomeFilter(db, pruneIncomeFilter(current, categories, subcategories))
}

/** The month-end projection's settings, in app_settings under `projection_settings`. Nothing stored: the defaults. */
const PROJECTION_KEY = 'projection_settings'
/** Hand-set answers about recurring charges, in app_settings under `recurring_overrides`, by recurring charge ID. */
const RECURRING_KEY = 'recurring_overrides'

export async function readProjectionSettings(db: Db): Promise<ProjectionSettings> {
  const r = await db.query<{ value: Partial<ProjectionSettings> }>(`SELECT value FROM app_settings WHERE key = $1`, [PROJECTION_KEY])
  const v = r.rows[0]?.value
  return {
    accountIds: Array.isArray(v?.accountIds) ? v.accountIds : DEFAULT_PROJECTION_SETTINGS.accountIds,
    includeDaily: typeof v?.includeDaily === 'boolean' ? v.includeDaily : DEFAULT_PROJECTION_SETTINGS.includeDaily,
    includeFreelance: typeof v?.includeFreelance === 'boolean' ? v.includeFreelance : DEFAULT_PROJECTION_SETTINGS.includeFreelance,
  }
}

export async function readRecurringOverrides(db: Db): Promise<Record<string, RecurringOverride>> {
  const r = await db.query<{ value: Record<string, RecurringOverride> }>(`SELECT value FROM app_settings WHERE key = $1`, [RECURRING_KEY])
  return r.rows[0]?.value ?? {}
}

async function writeSetting(db: Db, key: string, value: unknown): Promise<void> {
  await db.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, JSON.stringify(value)],
  )
}

const notFound = (what: string) => new EditError('not_found', `No such ${what}.`)

/** Postgres errors as edit errors: a taken name (unique index) or a missing row (foreign key). */
function asEditError(e: unknown): unknown {
  const code = (e as { code?: unknown })?.code
  if (code === '23505') return new EditError('name_taken', 'That name is taken.')
  if (code === '23503') return new EditError('not_found', 'It refers to something that no longer exists.')
  return e
}

/** What a bulk edit returns: categorizeMany's changes (for undo), or restoreCategories' count. */
export type EditOutcome = BulkResult | { updated: number } | null

/**
 * Applies one (validated) edit in a database transaction: all of it or none.
 * `itemIds`: the configured connections; bulk edits only touch their
 * transactions (required for those).
 */
export async function applyEditSql(pool: pg.Pool, e: Edit, ctx: { itemIds?: string[] } = {}): Promise<EditOutcome> {
  try {
    return await inTransaction(pool, (db) => run(db, e, ctx.itemIds))
  } catch (err) {
    throw asEditError(err)
  }
}

async function run(db: Db, e: Edit, itemIds: string[] | undefined): Promise<EditOutcome> {
  const one = async (sql: string, params: unknown[], what: string) => {
    const r = await db.query(sql, params)
    if (!r.rowCount) throw notFound(what)
  }
  switch (e.op) {
    case 'categorize': {
      if (e.categoryId) await one(`SELECT 1 FROM categories WHERE id = $1`, [e.categoryId], 'category')
      if (e.subcategoryId) await one(`SELECT 1 FROM subcategories WHERE id = $1 AND category_id = $2`, [e.subcategoryId, e.categoryId], 'subcategory in that category')
      await one(`UPDATE transactions SET category_id = $2, subcategory_id = $3, category_edited_at = now() WHERE id = $1`, [e.transactionId, e.categoryId, e.subcategoryId], 'transaction')
      return null
    }
    case 'hide':
      await one(`UPDATE transactions SET is_hidden = $2 WHERE id = $1`, [e.transactionId, e.hidden], 'transaction')
      return null
    case 'createCategory': {
      const c = e.category
      await db.query(
        `INSERT INTO categories (id, name, type, color, icon, sort_order)
         VALUES ($1, $2, $3, $4, $5, (SELECT coalesce(max(sort_order) + 1, 0) FROM categories))`,
        [c.id, c.name, c.type, c.color, c.icon],
      )
      return null
    }
    case 'updateCategory': {
      const c = e.changes
      await one(
        `UPDATE categories SET name = coalesce($2, name), type = coalesce($3, type), color = coalesce($4, color), icon = coalesce($5, icon) WHERE id = $1`,
        [e.id, c.name ?? null, c.type ?? null, c.color ?? null, c.icon ?? null],
        'category',
      )
      return null
    }
    case 'deleteCategory':
      // Its subcategories go with it (CASCADE); its transactions become uncategorized (SET NULL).
      await one(`DELETE FROM categories WHERE id = $1`, [e.id], 'category')
      await pruneStoredIncomeFilter(db)
      return null
    case 'createSubcategory': {
      const s = e.subcategory
      await db.query(
        `INSERT INTO subcategories (id, category_id, name, sort_order)
         VALUES ($1, $2, $3, (SELECT coalesce(max(sort_order) + 1, 0) FROM subcategories WHERE category_id = $2))`,
        [s.id, s.categoryId, s.name],
      )
      return null
    }
    case 'renameSubcategory':
      await one(`UPDATE subcategories SET name = $2 WHERE id = $1`, [e.id, e.name], 'subcategory')
      return null
    case 'deleteSubcategory':
      // Its transactions keep their category (subcategory_id SET NULL).
      await one(`DELETE FROM subcategories WHERE id = $1`, [e.id], 'subcategory')
      await pruneStoredIncomeFilter(db)
      return null
    case 'linkSubcategory': {
      await one(`SELECT 1 FROM categories WHERE id = $1`, [e.categoryId], 'category')
      const moved = await db.query(
        `UPDATE subcategories
         SET category_id = $2, sort_order = (SELECT coalesce(max(sort_order) + 1, 0) FROM subcategories WHERE category_id = $2)
         WHERE id = $1 AND category_id <> $2`,
        [e.id, e.categoryId],
      )
      if (!moved.rowCount) {
        await one(`SELECT 1 FROM subcategories WHERE id = $1`, [e.id], 'subcategory')
        return null // already there
      }
      // Its transactions move with it.
      await db.query(`UPDATE transactions SET category_id = $2 WHERE subcategory_id = $1`, [e.id, e.categoryId])
      return null
    }
    case 'categorizeMany':
      return categorizeMany(db, e, connections(itemIds))
    case 'restoreCategories':
      return restoreCategories(db, e, connections(itemIds))
    case 'setTransferOverride':
      // A transfer has no category: it loses its category and edited mark ("neither" then leaves it uncategorized).
      await one(
        `UPDATE transactions SET transfer_override = $2,
           category_id = CASE WHEN $2 <> 'none' THEN NULL ELSE category_id END,
           subcategory_id = CASE WHEN $2 <> 'none' THEN NULL ELSE subcategory_id END,
           category_edited_at = CASE WHEN $2 <> 'none' THEN NULL ELSE category_edited_at END
         WHERE id = $1`,
        [e.transactionId, e.value],
        'transaction',
      )
      return null
    case 'setIncomeFilter': {
      // The same rules as the app (checkIncomeFilter), on the stored categories.
      const { categories, subcategories } = await readCategories(db)
      await writeIncomeFilter(db, checkIncomeFilter(categories, subcategories, e.filter))
      return null
    }
    case 'setProjectionSettings':
      await writeSetting(db, PROJECTION_KEY, e.settings)
      return null
    case 'renameAccount':
      // Its own column: syncs only write the bank's columns, so they never change it.
      await one(`UPDATE accounts SET nickname = $2 WHERE id = $1`, [e.accountId, e.name], 'account')
      return null
    case 'setCardDays':
      // Their own columns too; cards only, as in the app.
      await one(`UPDATE accounts SET card_close_day = $2, card_due_day = $3 WHERE id = $1 AND type = 'CREDIT'`, [e.accountId, e.days?.close ?? null, e.days?.due ?? null], 'card')
      return null
    case 'recurringAction': {
      // The row is locked so two answers given at once both stay.
      await db.query(`INSERT INTO app_settings (key, value) VALUES ($1, '{}'::jsonb) ON CONFLICT (key) DO NOTHING`, [RECURRING_KEY])
      const r = await db.query<{ value: Record<string, RecurringOverride> }>(`SELECT value FROM app_settings WHERE key = $1 FOR UPDATE`, [RECURRING_KEY])
      const all = r.rows[0]?.value ?? {}
      await writeSetting(db, RECURRING_KEY, { ...all, [e.id]: applyRecurringAction(all[e.id], e.action, e.at) })
      return null
    }
  }
}

const connections = (itemIds: string[] | undefined) => itemIds ?? fail('Bulk edits need the configured connections.')
const fail = (message: string): never => {
  throw new Error(message)
}

/**
 * The same category on many transactions. Locks them, checks the rules
 * (checkBulk) on the transactions as the app shows them (transfers are
 * detected on read), then updates them all and marks them edited, so a sync
 * never changes them. Returns the previous values for undo.
 */
async function categorizeMany(db: Db, e: Extract<Edit, { op: 'categorizeMany' }>, itemIds: string[]): Promise<BulkResult> {
  const rows = await db.query<{ id: string; category_id: string | null; subcategory_id: string | null; category_edited_at: Date | null; day: string }>(
    `SELECT t.id, t.category_id, t.subcategory_id, t.category_edited_at, t.booked_on::text AS day
     FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.id = ANY($1::text[]) AND t.removed_at IS NULL AND a.connection_id = ANY($2::text[])
     FOR UPDATE OF t`,
    [e.transactionIds, itemIds],
  )
  // Every ID must be a live transaction of a configured connection.
  if (rows.rowCount !== e.transactionIds.length) throw new EditError('not_found', 'No such transaction.')
  // readSnapshot reads a few days around them, so pairs across the earliest day are matched as the app shows them.
  const from = rows.rows.reduce((min, r) => (r.day < min ? r.day : min), rows.rows[0].day)
  const snapshot = await readSnapshot(db, itemIds, from)
  if (!snapshot) throw new EditError('not_found', 'No such transaction.')
  checkBulk(snapshot, e)
  await db.query(
    `UPDATE transactions SET category_id = $2, subcategory_id = $3, category_edited_at = now() WHERE id = ANY($1::text[])`,
    [e.transactionIds, e.categoryId, e.subcategoryId],
  )
  const byId = new Map(rows.rows.map((r) => [r.id, r]))
  return {
    updated: rows.rowCount,
    previous: e.transactionIds.map((id) => {
      const r = byId.get(id)!
      return { id, categoryId: r.category_id, subcategoryId: r.subcategory_id, editedAt: r.category_edited_at?.toISOString() ?? null }
    }),
  }
}

/** Undo of categorizeMany: puts each transaction's previous values back, all or none. */
async function restoreCategories(db: Db, e: Extract<Edit, { op: 'restoreCategories' }>, itemIds: string[]): Promise<{ updated: number }> {
  const items = JSON.stringify(e.items.map((i) => ({ id: i.id, category_id: i.categoryId, subcategory_id: i.subcategoryId, edited_at: i.editedAt ?? null })))
  // A subcategory must still belong to its category (a missing one fails on the foreign key).
  const wrong = await db.query(
    `SELECT 1 FROM jsonb_to_recordset($1::jsonb) AS r(id text, category_id text, subcategory_id text)
     JOIN subcategories s ON s.id = r.subcategory_id WHERE s.category_id IS DISTINCT FROM r.category_id`,
    [items],
  )
  if (wrong.rowCount) throw new EditError('invalid', 'The subcategory belongs to another category.', 'subcategory_category')
  const updated = await db.query(
    `UPDATE transactions t SET category_id = r.category_id, subcategory_id = r.subcategory_id, category_edited_at = r.edited_at
     FROM jsonb_to_recordset($1::jsonb) AS r(id text, category_id text, subcategory_id text, edited_at timestamptz), accounts a
     WHERE t.id = r.id AND a.id = t.account_id AND a.connection_id = ANY($2::text[])`,
    [items, itemIds],
  )
  if (updated.rowCount !== e.items.length) throw new EditError('not_found', 'No such transaction.')
  return { updated: updated.rowCount }
}
