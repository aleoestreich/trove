import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditError, applyEdit, defaultCategories, validateEdit } from './edits'
import { createMockRepository } from './mockRepository'
import type { Snapshot, Transaction } from './types'

const { categories, subcategories } = defaultCategories((c, i) => `${c}-${i}`)
const tx = (id: string, over: Partial<Transaction> = {}): Transaction => ({
  id, accountId: 'a', date: '2026-10-01', description: 'LOJA EXEMPLO', amount: -150_00, categoryId: 'groceries', status: 'POSTED', ...over,
})
const snapshot = (): Snapshot => ({
  institutions: [], accounts: [], categories, subcategories, source: 'demo',
  transactions: [tx('t1', { subcategoryId: 'groceries-1' }), tx('t2', { subcategoryId: 'groceries-1' }), tx('t3')],
})

describe('applyEdit', () => {
  it('hides and unhides a transaction', () => {
    const hidden = applyEdit(snapshot(), { op: 'hide', transactionId: 't1', hidden: true })
    expect(hidden.transactions[0].hidden).toBe(true)
    expect(applyEdit(hidden, { op: 'hide', transactionId: 't1', hidden: false }).transactions[0].hidden).toBe(false)
  })

  it('linking a subcategory moves it and every transaction using it', () => {
    const s = applyEdit(snapshot(), { op: 'linkSubcategory', id: 'groceries-1', categoryId: 'restaurants' })
    expect(s.subcategories.find((x) => x.id === 'groceries-1')!.categoryId).toBe('restaurants')
    expect(s.transactions.map((t) => [t.categoryId, t.subcategoryId ?? null])).toEqual([
      ['restaurants', 'groceries-1'],
      ['restaurants', 'groceries-1'],
      ['groceries', null],
    ])
  })

  it('deleting a category removes its subcategories and leaves its transactions uncategorized', () => {
    const s = applyEdit(snapshot(), { op: 'deleteCategory', id: 'groceries' })
    expect(s.categories.some((c) => c.id === 'groceries')).toBe(false)
    expect(s.subcategories.some((x) => x.categoryId === 'groceries')).toBe(false)
    expect(s.transactions.every((t) => t.categoryId === null && !t.subcategoryId)).toBe(true)
  })

  it('deleting a subcategory keeps the transactions in the category', () => {
    const s = applyEdit(snapshot(), { op: 'deleteSubcategory', id: 'groceries-1' })
    expect(s.transactions[0]).toMatchObject({ categoryId: 'groceries', subcategoryId: null })
  })

  it('refuses a taken name, a missing category and a subcategory of another category', () => {
    const create = (name: string) => applyEdit(snapshot(), { op: 'createCategory', category: { id: 'x', name, type: 'expense', color: 'orange', icon: 'fork' } })
    expect(() => create('mercado')).toThrow(EditError)
    expect(create('Pets').categories.at(-1)).toMatchObject({ name: 'Pets', sortOrder: categories.length })
    expect(() => applyEdit(snapshot(), { op: 'deleteCategory', id: 'nope' })).toThrow(EditError)
    expect(() => applyEdit(snapshot(), { op: 'categorize', transactionId: 't1', categoryId: 'restaurants', subcategoryId: 'groceries-0' })).toThrow(EditError)
  })
})

describe('validateEdit', () => {
  it('accepts well-formed edits and cleans names', () => {
    expect(validateEdit({ op: 'renameSubcategory', id: 's-1', name: '  Fuel   station ' })).toEqual({ op: 'renameSubcategory', id: 's-1', name: 'Fuel station' })
  })

  it('refuses unknown ops, colours, icons and odd IDs', () => {
    const bad = [
      { op: 'drop' },
      { op: 'createCategory', category: { id: 'c', name: 'X', type: 'expense', color: '#ff0000', icon: 'fork' } },
      { op: 'createCategory', category: { id: 'c', name: 'X', type: 'expense', color: 'orange', icon: 'rocket' } },
      { op: 'hide', transactionId: "x'; DROP TABLE", hidden: true },
      { op: 'categorize', transactionId: 't', categoryId: null, subcategoryId: 's' },
      { op: 'updateCategory', id: 'c', changes: { name: 'x'.repeat(41) } },
    ]
    for (const e of bad) expect(() => validateEdit(e), JSON.stringify(e)).toThrow(EditError)
  })
})

describe('demo repository', () => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
  beforeEach(() => store.clear())
  const today = new Date(2026, 8, 27)

  it('starts with the default categories and some demo subcategories', async () => {
    const s = await createMockRepository(today).load()
    expect(s.categories.map((c) => c.id)).toContain('restaurants')
    expect(s.transactions.some((t) => t.subcategoryId)).toBe(true)
  })

  it('keeps edits across loads', async () => {
    const repo = createMockRepository(today)
    const first = (await repo.load()).transactions.find((t) => !t.transfer)!
    await repo.edit({ op: 'hide', transactionId: first.id, hidden: true })
    await repo.edit({ op: 'deleteCategory', id: 'transport' })
    const s = await createMockRepository(today).load()
    expect(s.transactions.find((t) => t.id === first.id)!.hidden).toBe(true)
    expect(s.transactions.some((t) => t.categoryId === 'transport')).toBe(false)
  })
})
