// Changes to categories and transactions, and the rules they
// follow. Shared by the app (instant updates), the demo repository (which
// stores them) and the server, which applies the same rules in SQL
// (server/db/edits.ts). Imports only types and data, so the server can use it.

import { CATEGORY_COLORS, CATEGORY_ICONS, DEFAULT_CATEGORIES } from './categoryCatalog.js'
import type { Category, CategoryType, Snapshot, Subcategory } from './types.js'

export type Edit =
  /** Sets a transaction's category and subcategory (null: uncategorized / none). */
  | { op: 'categorize'; transactionId: string; categoryId: string | null; subcategoryId: string | null }
  | { op: 'hide'; transactionId: string; hidden: boolean }
  | { op: 'createCategory'; category: { id: string; name: string; type: CategoryType; color: string; icon: string } }
  | { op: 'updateCategory'; id: string; changes: { name?: string; type?: CategoryType; color?: string; icon?: string } }
  /** Its subcategories go too; its transactions become uncategorized. */
  | { op: 'deleteCategory'; id: string }
  | { op: 'createSubcategory'; subcategory: { id: string; categoryId: string; name: string } }
  | { op: 'renameSubcategory'; id: string; name: string }
  /** Its transactions keep their category, without a subcategory. */
  | { op: 'deleteSubcategory'; id: string }
  /** Moves a subcategory to another category, with every transaction that uses it. */
  | { op: 'linkSubcategory'; id: string; categoryId: string }

export class EditError extends Error {
  constructor(
    readonly code: 'not_found' | 'invalid' | 'name_taken',
    message: string,
  ) {
    super(message)
  }
}

export const NAME_MAX = 40
const ID = /^[A-Za-z0-9_-]{1,64}$/

/** A name as stored: trimmed, single spaces. */
export const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ')
const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0

/** Checks an edit's shape (IDs, names, colour and icon keys) without looking at any data. */
export function validateEdit(e: unknown): Edit {
  const bad = (what: string): never => {
    throw new EditError('invalid', `Invalid edit: ${what}.`)
  }
  const id = (v: unknown, what: string) => (typeof v === 'string' && ID.test(v) ? v : bad(what))
  const optId = (v: unknown, what: string) => (v === null ? null : id(v, what))
  const name = (v: unknown) => {
    const n = typeof v === 'string' ? cleanName(v) : ''
    return n && n.length <= NAME_MAX ? n : bad('name')
  }
  const type = (v: unknown) => (v === 'expense' || v === 'income' ? v : bad('type'))
  const color = (v: unknown) => ((CATEGORY_COLORS as readonly unknown[]).includes(v) ? (v as string) : bad('color'))
  const icon = (v: unknown) => ((CATEGORY_ICONS as readonly unknown[]).includes(v) ? (v as string) : bad('icon'))
  if (!e || typeof e !== 'object') return bad('body')
  const x = e as Record<string, unknown>
  switch (x.op) {
    case 'categorize': {
      const categoryId = optId(x.categoryId, 'category')
      const subcategoryId = optId(x.subcategoryId, 'subcategory')
      if (subcategoryId && !categoryId) bad('subcategory without a category')
      return { op: 'categorize', transactionId: id(x.transactionId, 'transaction'), categoryId, subcategoryId }
    }
    case 'hide':
      if (typeof x.hidden !== 'boolean') bad('hidden')
      return { op: 'hide', transactionId: id(x.transactionId, 'transaction'), hidden: x.hidden as boolean }
    case 'createCategory': {
      const c = (x.category ?? {}) as Record<string, unknown>
      return { op: 'createCategory', category: { id: id(c.id, 'id'), name: name(c.name), type: type(c.type), color: color(c.color), icon: icon(c.icon) } }
    }
    case 'updateCategory': {
      const c = (x.changes ?? {}) as Record<string, unknown>
      const changes: { name?: string; type?: CategoryType; color?: string; icon?: string } = {}
      if (c.name !== undefined) changes.name = name(c.name)
      if (c.type !== undefined) changes.type = type(c.type)
      if (c.color !== undefined) changes.color = color(c.color)
      if (c.icon !== undefined) changes.icon = icon(c.icon)
      return { op: 'updateCategory', id: id(x.id, 'id'), changes }
    }
    case 'deleteCategory':
      return { op: 'deleteCategory', id: id(x.id, 'id') }
    case 'createSubcategory': {
      const s = (x.subcategory ?? {}) as Record<string, unknown>
      return { op: 'createSubcategory', subcategory: { id: id(s.id, 'id'), categoryId: id(s.categoryId, 'category'), name: name(s.name) } }
    }
    case 'renameSubcategory':
      return { op: 'renameSubcategory', id: id(x.id, 'id'), name: name(x.name) }
    case 'deleteSubcategory':
      return { op: 'deleteSubcategory', id: id(x.id, 'id') }
    case 'linkSubcategory':
      return { op: 'linkSubcategory', id: id(x.id, 'id'), categoryId: id(x.categoryId, 'category') }
    default:
      return bad('op')
  }
}

const nextOrder = (items: { sortOrder: number }[]) => items.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1

/**
 * Applies an edit to a snapshot, following the same rules as the database.
 * Throws EditError when it refers to something missing or a name is taken.
 */
export function applyEdit(s: Snapshot, e: Edit): Snapshot {
  const cat = (id: string) => s.categories.find((c) => c.id === id) ?? fail('not_found', 'category')
  const sub = (id: string) => s.subcategories.find((x) => x.id === id) ?? fail('not_found', 'subcategory')
  const tx = (id: string) => s.transactions.find((t) => t.id === id) ?? fail('not_found', 'transaction')
  const freeCategoryName = (name: string, except?: string) => {
    if (s.categories.some((c) => c.id !== except && same(c.name, name))) fail('name_taken', 'category name')
  }
  const freeSubName = (categoryId: string, name: string, except?: string) => {
    if (s.subcategories.some((x) => x.id !== except && x.categoryId === categoryId && same(x.name, name))) fail('name_taken', 'subcategory name')
  }
  const mapTx = (f: (t: Snapshot['transactions'][number]) => Snapshot['transactions'][number]) => s.transactions.map(f)

  switch (e.op) {
    case 'categorize': {
      tx(e.transactionId)
      if (e.categoryId) cat(e.categoryId)
      if (e.subcategoryId && sub(e.subcategoryId).categoryId !== e.categoryId) fail('invalid', 'subcategory of another category')
      return { ...s, transactions: mapTx((t) => (t.id === e.transactionId ? { ...t, categoryId: e.categoryId, subcategoryId: e.subcategoryId } : t)) }
    }
    case 'hide':
      tx(e.transactionId)
      return { ...s, transactions: mapTx((t) => (t.id === e.transactionId ? { ...t, hidden: e.hidden } : t)) }
    case 'createCategory': {
      if (s.categories.some((c) => c.id === e.category.id)) fail('invalid', 'category id in use')
      freeCategoryName(e.category.name)
      const created: Category = { ...e.category, sortOrder: nextOrder(s.categories) }
      return { ...s, categories: [...s.categories, created] }
    }
    case 'updateCategory': {
      cat(e.id)
      if (e.changes.name) freeCategoryName(e.changes.name, e.id)
      return { ...s, categories: s.categories.map((c) => (c.id === e.id ? { ...c, ...e.changes } : c)) }
    }
    case 'deleteCategory': {
      cat(e.id)
      return {
        ...s,
        categories: s.categories.filter((c) => c.id !== e.id),
        subcategories: s.subcategories.filter((x) => x.categoryId !== e.id),
        transactions: mapTx((t) => (t.categoryId === e.id ? { ...t, categoryId: null, subcategoryId: null } : t)),
      }
    }
    case 'createSubcategory': {
      cat(e.subcategory.categoryId)
      if (s.subcategories.some((x) => x.id === e.subcategory.id)) fail('invalid', 'subcategory id in use')
      freeSubName(e.subcategory.categoryId, e.subcategory.name)
      const siblings = s.subcategories.filter((x) => x.categoryId === e.subcategory.categoryId)
      return { ...s, subcategories: [...s.subcategories, { ...e.subcategory, sortOrder: nextOrder(siblings) }] }
    }
    case 'renameSubcategory': {
      const x = sub(e.id)
      freeSubName(x.categoryId, e.name, e.id)
      return { ...s, subcategories: s.subcategories.map((y) => (y.id === e.id ? { ...y, name: e.name } : y)) }
    }
    case 'deleteSubcategory':
      sub(e.id)
      return {
        ...s,
        subcategories: s.subcategories.filter((x) => x.id !== e.id),
        transactions: mapTx((t) => (t.subcategoryId === e.id ? { ...t, subcategoryId: null } : t)),
      }
    case 'linkSubcategory': {
      const x = sub(e.id)
      cat(e.categoryId)
      if (x.categoryId === e.categoryId) return s
      freeSubName(e.categoryId, x.name, e.id)
      const siblings = s.subcategories.filter((y) => y.categoryId === e.categoryId)
      return {
        ...s,
        subcategories: s.subcategories.map((y) => (y.id === e.id ? { ...y, categoryId: e.categoryId, sortOrder: nextOrder(siblings) } : y)),
        transactions: mapTx((t) => (t.subcategoryId === e.id ? { ...t, categoryId: e.categoryId } : t)),
      }
    }
  }
}

function fail(code: EditError['code'], what: string): never {
  throw new EditError(code, code === 'not_found' ? `No such ${what}.` : code === 'name_taken' ? `That ${what} is taken.` : `Invalid ${what}.`)
}

/** The default categories and subcategories in a language, with the given subcategory IDs. */
export function defaultCategories(lang: 'en' | 'pt', subId: (categoryId: string, index: number) => string): { categories: Category[]; subcategories: Subcategory[] } {
  return {
    categories: DEFAULT_CATEGORIES.map((c, i) => ({ id: c.id, name: c.name[lang], type: c.type, color: c.color, icon: c.icon, sortOrder: i })),
    subcategories: DEFAULT_CATEGORIES.flatMap((c) => c.subcategories.map((s, i) => ({ id: subId(c.id, i), categoryId: c.id, name: s[lang], sortOrder: i }))),
  }
}

/** A new ID for a category or subcategory. */
export function newId(): string {
  return crypto.randomUUID()
}
