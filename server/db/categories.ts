// Categories in the database: seeding the defaults on first run,
// and applying edits with the same rules as src/data/edits.ts.

import type pg from 'pg'
import { EditError, defaultCategories, type Edit } from '../../src/data/edits.js'
import type { Category, Subcategory } from '../../src/data/types.js'
import { inTransaction, type Db } from './connection.js'

/**
 * Seeds the default categories and subcategories, in the app's language,
 * the first time the app reads the database. Only once: deleting them all
 * later doesn't bring them back.
 */
export async function ensureSeeded(pool: pg.Pool, lang: 'en' | 'pt'): Promise<void> {
  const done = await pool.query(`SELECT 1 FROM app_settings WHERE key = 'categories_seeded'`)
  if (done.rowCount) return
  await inTransaction(pool, async (db) => {
    // Whoever inserts the marker seeds; a request racing it does nothing.
    const won = await db.query(
      `INSERT INTO app_settings (key, value) VALUES ('categories_seeded', $1) ON CONFLICT (key) DO NOTHING RETURNING key`,
      [JSON.stringify({ lang })],
    )
    if (!won.rowCount) return
    const { categories, subcategories } = defaultCategories(lang, () => crypto.randomUUID())
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

const notFound = (what: string) => new EditError('not_found', `No such ${what}.`)

/** Postgres errors as edit errors: a taken name (unique index) or a missing row (foreign key). */
function asEditError(e: unknown): unknown {
  const code = (e as { code?: unknown })?.code
  if (code === '23505') return new EditError('name_taken', 'That name is taken.')
  if (code === '23503') return new EditError('not_found', 'It refers to something that no longer exists.')
  return e
}

/** Applies one (validated) edit in a database transaction. */
export async function applyEditSql(pool: pg.Pool, e: Edit): Promise<void> {
  try {
    await inTransaction(pool, (db) => run(db, e))
  } catch (err) {
    throw asEditError(err)
  }
}

async function run(db: Db, e: Edit): Promise<void> {
  const one = async (sql: string, params: unknown[], what: string) => {
    const r = await db.query(sql, params)
    if (!r.rowCount) throw notFound(what)
  }
  switch (e.op) {
    case 'categorize': {
      if (e.categoryId) await one(`SELECT 1 FROM categories WHERE id = $1`, [e.categoryId], 'category')
      if (e.subcategoryId) await one(`SELECT 1 FROM subcategories WHERE id = $1 AND category_id = $2`, [e.subcategoryId, e.categoryId], 'subcategory in that category')
      await one(`UPDATE transactions SET category_id = $2, subcategory_id = $3 WHERE id = $1`, [e.transactionId, e.categoryId, e.subcategoryId], 'transaction')
      return
    }
    case 'hide':
      await one(`UPDATE transactions SET is_hidden = $2 WHERE id = $1`, [e.transactionId, e.hidden], 'transaction')
      return
    case 'createCategory': {
      const c = e.category
      await db.query(
        `INSERT INTO categories (id, name, type, color, icon, sort_order)
         VALUES ($1, $2, $3, $4, $5, (SELECT coalesce(max(sort_order) + 1, 0) FROM categories))`,
        [c.id, c.name, c.type, c.color, c.icon],
      )
      return
    }
    case 'updateCategory': {
      const c = e.changes
      await one(
        `UPDATE categories SET name = coalesce($2, name), type = coalesce($3, type), color = coalesce($4, color), icon = coalesce($5, icon) WHERE id = $1`,
        [e.id, c.name ?? null, c.type ?? null, c.color ?? null, c.icon ?? null],
        'category',
      )
      return
    }
    case 'deleteCategory':
      // Its subcategories go with it (CASCADE); its transactions become uncategorized (SET NULL).
      await one(`DELETE FROM categories WHERE id = $1`, [e.id], 'category')
      return
    case 'createSubcategory': {
      const s = e.subcategory
      await db.query(
        `INSERT INTO subcategories (id, category_id, name, sort_order)
         VALUES ($1, $2, $3, (SELECT coalesce(max(sort_order) + 1, 0) FROM subcategories WHERE category_id = $2))`,
        [s.id, s.categoryId, s.name],
      )
      return
    }
    case 'renameSubcategory':
      await one(`UPDATE subcategories SET name = $2 WHERE id = $1`, [e.id, e.name], 'subcategory')
      return
    case 'deleteSubcategory':
      // Its transactions keep their category (subcategory_id SET NULL).
      await one(`DELETE FROM subcategories WHERE id = $1`, [e.id], 'subcategory')
      return
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
        return // already there
      }
      // Its transactions move with it.
      await db.query(`UPDATE transactions SET category_id = $2 WHERE subcategory_id = $1`, [e.id, e.categoryId])
      return
    }
  }
}
