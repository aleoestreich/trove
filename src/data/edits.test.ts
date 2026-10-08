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
  it('bulk categorize returns what it replaced, and undo restores it', async () => {
    const repo = createMockRepository(today)
    const before = await repo.load()
    const ids = before.transactions.filter((t) => !t.transfer && t.amount < 0 && t.categoryId !== 'income').slice(0, 3).map((t) => t.id)
    const result = await repo.edit({ op: 'categorizeMany', transactionIds: ids, categoryId: 'restaurants', subcategoryId: 'restaurants-0' })
    expect(result!.updated).toBe(3)
    expect((await repo.load()).transactions.filter((t) => ids.includes(t.id)).every((t) => t.categoryId === 'restaurants')).toBe(true)
    await repo.edit({ op: 'restoreCategories', items: result!.previous })
    const restored = (await repo.load()).transactions.filter((t) => ids.includes(t.id))
    expect(restored.map((t) => [t.categoryId, t.subcategoryId ?? null])).toEqual(
      before.transactions.filter((t) => ids.includes(t.id)).map((t) => [t.categoryId, t.subcategoryId ?? null]),
    )
  })
})

describe('bulk categorize', () => {
  const bulk = (transactionIds: string[], categoryId = 'restaurants', subcategoryId = 'restaurants-0') =>
    ({ op: 'categorizeMany', transactionIds, categoryId, subcategoryId }) as const
  const reason = (f: () => unknown) => {
    try {
      f()
    } catch (e) {
      return e instanceof EditError ? e.reason ?? e.code : 'other'
    }
    return 'none'
  }
  const mixed = (): Snapshot => ({
    ...snapshot(),
    transactions: [...snapshot().transactions, tx('pay', { amount: 3000_00, categoryId: null }), tx('own', { categoryId: null, transfer: 'own' })],
  })

  it('leaves them uncategorized, income and expenses together, but never transfers', () => {
    const s = applyEdit(mixed(), validateEdit({ op: 'categorizeMany', transactionIds: ['t1', 'pay'], categoryId: null, subcategoryId: null }))
    expect(s.transactions.filter((t) => ['t1', 'pay'].includes(t.id)).map((t) => [t.categoryId, t.subcategoryId ?? null])).toEqual([
      [null, null],
      [null, null],
    ])
    expect(reason(() => applyEdit(mixed(), { op: 'categorizeMany', transactionIds: ['t1', 'own'], categoryId: null, subcategoryId: null }))).toBe('transfer')
    // A subcategory without a category is refused.
    expect(() => validateEdit({ op: 'categorizeMany', transactionIds: ['t1'], categoryId: null, subcategoryId: 'groceries-1' })).toThrow(EditError)
  })

  it('sets one category and subcategory on every transaction', () => {
    const s = applyEdit(snapshot(), bulk(['t1', 't3']))
    expect(s.transactions.map((t) => [t.id, t.categoryId, t.subcategoryId ?? null])).toEqual([
      ['t1', 'restaurants', 'restaurants-0'],
      ['t2', 'groceries', 'groceries-1'],
      ['t3', 'restaurants', 'restaurants-0'],
    ])
  })

  it('refuses transfers, mixed types, a category of the other type and a subcategory of another category', () => {
    expect(reason(() => applyEdit(mixed(), bulk(['t1', 'own'])))).toBe('transfer')
    expect(reason(() => applyEdit(mixed(), bulk(['t1', 'pay'])))).toBe('mixed_types')
    expect(reason(() => applyEdit(mixed(), bulk(['t1', 't2'], 'salary', 'salary-0')))).toBe('category_type')
    expect(reason(() => applyEdit(mixed(), bulk(['t1'], 'restaurants', 'groceries-0')))).toBe('subcategory_category')
    expect(reason(() => applyEdit(mixed(), bulk(['t1', 'nope'])))).toBe('not_found')
    expect(reason(() => validateEdit(bulk([])))).toBe('invalid')
    expect(reason(() => validateEdit(bulk(['t1', 't1'])))).toBe('invalid')
  })

  it('undo puts back each transaction’s previous category', () => {
    const before = snapshot()
    const after = applyEdit(before, bulk(['t1', 't3']))
    const previous = [
      { id: 't1', categoryId: 'groceries', subcategoryId: 'groceries-1' },
      { id: 't3', categoryId: 'groceries', subcategoryId: null },
    ]
    expect(applyEdit(after, validateEdit({ op: 'restoreCategories', items: previous })).transactions).toEqual(before.transactions.map((t) => ({ ...t, subcategoryId: t.subcategoryId ?? null })))
  })
})

describe('card bill payment (setTransferOverride)', () => {
  it('marks a transaction as a card bill payment, without a category, and back', () => {
    const marked = applyEdit(snapshot(), validateEdit({ op: 'setTransferOverride', transactionId: 't1', value: 'card-payment' }))
    expect(marked.transactions[0]).toMatchObject({ transfer: 'card-payment', categoryId: null, subcategoryId: null, transferOverride: 'card-payment' })
    const undone = applyEdit(marked, { op: 'setTransferOverride', transactionId: 't1', value: 'none' })
    expect(undone.transactions[0].transfer).toBeUndefined()
    expect(undone.transactions[0].transferOverride).toBe('none')
    expect(() => validateEdit({ op: 'setTransferOverride', transactionId: 't1', value: 'other' })).toThrow(EditError)
  })

  it('marks a transaction as a transfer between own accounts: no category, neither income nor expense', () => {
    const s = applyEdit(snapshot(), validateEdit({ op: 'setTransferOverride', transactionId: 't3', value: 'own' }))
    expect(s.transactions[2]).toMatchObject({ transfer: 'own', categoryId: null, subcategoryId: null, transferOverride: 'own' })
  })
})

describe('renaming an account', () => {
  const account = { id: 'card-1', institutionId: 'bank', name: 'Cartão Exemplo Platinum', type: 'CREDIT' as const, subtype: 'CREDIT_CARD' as const, balance: 0 }
  const withAccount = (): Snapshot => ({ ...snapshot(), accounts: [account] })

  it('sets a name, keeps the bank’s, and goes back to it', () => {
    const named = applyEdit(withAccount(), validateEdit({ op: 'renameAccount', accountId: 'card-1', name: '  Cartão   da casa ' }))
    expect(named.accounts[0]).toMatchObject({ name: 'Cartão Exemplo Platinum', nickname: 'Cartão da casa' })
    expect(named.accountNames).toEqual({ 'card-1': 'Cartão da casa' })
    const back = applyEdit(named, validateEdit({ op: 'renameAccount', accountId: 'card-1', name: null }))
    expect(back.accounts[0].nickname).toBeUndefined()
    expect(back.accountNames).toEqual({})
  })

  it('refuses a missing account and a name over 40 characters; an empty name means the bank’s', () => {
    expect(() => applyEdit(withAccount(), { op: 'renameAccount', accountId: 'other', name: 'X' })).toThrow(EditError)
    expect(() => validateEdit({ op: 'renameAccount', accountId: 'card-1', name: 'x'.repeat(41) })).toThrow(EditError)
    expect(validateEdit({ op: 'renameAccount', accountId: 'card-1', name: '   ' })).toEqual({ op: 'renameAccount', accountId: 'card-1', name: null })
  })
})
