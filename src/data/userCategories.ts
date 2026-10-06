// Categories and subcategories the owner creates, kept in this browser's
// localStorage (like category changes) until the database stores them.
//
// Built-in categories (src/data/categories.ts) stay as they are; the owner can
// add categories of their own and subcategories under any income or expense
// category. A transaction keeps its category and may also have a subcategory,
// so every total by category stays the same and subcategories add detail.

import type { Category, CategoryKind, Snapshot, Subcategory } from './types'
import { removeOverridesTo } from './overrides'

const KEY = 'trove.userCategories'
const SUB_OVERRIDES_KEY = 'trove.subcategoryOverrides'

export interface UserCategories {
  categories: Category[]
  subcategories: Subcategory[]
}

const empty = (): UserCategories => ({ categories: [], subcategories: [] })

export function readUserCategories(): UserCategories {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<UserCategories> | null
    if (!raw) return empty()
    return {
      categories: Array.isArray(raw.categories) ? raw.categories.filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string') : [],
      subcategories: Array.isArray(raw.subcategories)
        ? raw.subcategories.filter((s) => s && typeof s.id === 'string' && typeof s.categoryId === 'string' && typeof s.name === 'string')
        : [],
    }
  } catch {
    return empty()
  }
}

function write(data: UserCategories) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // Storage unavailable (private mode); edits last until reload.
  }
}

/** Transaction ID → subcategory ID, as set by the owner. */
export function readSubcategoryOverrides(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SUB_OVERRIDES_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function writeSubcategoryOverrides(map: Record<string, string>) {
  try {
    localStorage.setItem(SUB_OVERRIDES_KEY, JSON.stringify(map))
  } catch {
    // Storage unavailable.
  }
}

/** Set (or clear, with null) a transaction's subcategory. */
export function saveSubcategory(transactionId: string, subcategoryId: string | null) {
  const map = readSubcategoryOverrides()
  if (subcategoryId) map[transactionId] = subcategoryId
  else delete map[transactionId]
  writeSubcategoryOverrides(map)
}

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
const clean = (name: string) => name.trim().replace(/\s+/g, ' ')
const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0

/** Adds a category; returns it, or null when the name is empty or already taken. */
export function addCategory(name: string, kind: Exclude<CategoryKind, 'transfer'>, icon: string, existing: Category[]): Category | null {
  const n = clean(name)
  if (!n || existing.some((c) => same(c.name, n))) return null
  const data = readUserCategories()
  const category: Category = { id: newId('cat'), name: n, kind, icon, custom: true }
  write({ ...data, categories: [...data.categories, category] })
  return category
}

export function updateCategory(id: string, changes: { name?: string; icon?: string }, existing: Category[]): boolean {
  const data = readUserCategories()
  const n = changes.name === undefined ? undefined : clean(changes.name)
  if (n !== undefined && (!n || existing.some((c) => c.id !== id && same(c.name, n)))) return false
  write({ ...data, categories: data.categories.map((c) => (c.id === id ? { ...c, ...(n && { name: n }), ...(changes.icon && { icon: changes.icon }) } : c)) })
  return true
}

/**
 * Removes a category the owner created, with its subcategories. Transactions
 * moved into it go back to the category the data source gave them.
 */
export function deleteCategory(id: string): string[] {
  const data = readUserCategories()
  const gone = data.subcategories.filter((s) => s.categoryId === id).map((s) => s.id)
  write({ categories: data.categories.filter((c) => c.id !== id), subcategories: data.subcategories.filter((s) => s.categoryId !== id) })
  dropSubcategoryOverrides(gone)
  removeOverridesTo(id)
  return gone
}

/** Adds a subcategory under a category; null when the name is empty or already used in that category. */
export function addSubcategory(categoryId: string, name: string): Subcategory | null {
  const n = clean(name)
  const data = readUserCategories()
  if (!n || data.subcategories.some((s) => s.categoryId === categoryId && same(s.name, n))) return null
  const sub: Subcategory = { id: newId('sub'), categoryId, name: n }
  write({ ...data, subcategories: [...data.subcategories, sub] })
  return sub
}

export function renameSubcategory(id: string, name: string): boolean {
  const n = clean(name)
  const data = readUserCategories()
  const sub = data.subcategories.find((s) => s.id === id)
  if (!sub || !n || data.subcategories.some((s) => s.id !== id && s.categoryId === sub.categoryId && same(s.name, n))) return false
  write({ ...data, subcategories: data.subcategories.map((s) => (s.id === id ? { ...s, name: n } : s)) })
  return true
}

/** Removes a subcategory; its transactions keep their category. */
export function deleteSubcategory(id: string) {
  const data = readUserCategories()
  write({ ...data, subcategories: data.subcategories.filter((s) => s.id !== id) })
  dropSubcategoryOverrides([id])
}

function dropSubcategoryOverrides(subIds: string[]) {
  if (subIds.length === 0) return
  const gone = new Set(subIds)
  const map = readSubcategoryOverrides()
  writeSubcategoryOverrides(Object.fromEntries(Object.entries(map).filter(([, sub]) => !gone.has(sub))))
}

/**
 * Adds the owner's categories and subcategories to a snapshot and sets each
 * transaction's subcategory. A subcategory only applies while the transaction
 * is in that subcategory's category; a transaction whose category was deleted
 * goes back to the data source's category.
 */
export function applyUserCategories(snapshot: Snapshot, user: UserCategories = readUserCategories()): Snapshot & { subcategories: Subcategory[] } {
  const categories = [...snapshot.categories, ...user.categories.filter((c) => !snapshot.categories.some((b) => b.id === c.id))]
  const known = new Set(categories.map((c) => c.id))
  const subcategories = user.subcategories.filter((s) => known.has(s.categoryId))
  const subById = new Map(subcategories.map((s) => [s.id, s]))
  const subs = readSubcategoryOverrides()
  return {
    ...snapshot,
    categories,
    subcategories,
    transactions: snapshot.transactions.map((t) => {
      const sub = subById.get(subs[t.id] ?? '')
      return sub && sub.categoryId === t.categoryId ? { ...t, subcategoryId: sub.id } : t
    }),
  }
}

export function clearUserCategories() {
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem(SUB_OVERRIDES_KEY)
  } catch {
    // ignore
  }
}
