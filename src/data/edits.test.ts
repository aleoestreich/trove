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
  const bulk = (transactionIds: string[], categoryId = 'restaurants', subcategoryId: string | null = 'restaurants-0') =>
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

  it('sets a category without a subcategory, clearing the one they had', () => {
    const s = applyEdit(snapshot(), validateEdit({ op: 'categorizeMany', transactionIds: ['t1', 't2'], categoryId: 'restaurants', subcategoryId: null }))
    expect(s.transactions.filter((t) => ['t1', 't2'].includes(t.id)).map((t) => [t.id, t.categoryId, t.subcategoryId ?? null])).toEqual([
      ['t1', 'restaurants', null],
      ['t2', 'restaurants', null],
    ])
    expect(reason(() => applyEdit(mixed(), bulk(['t1', 'pay'], 'restaurants', null)))).toBe('mixed_types')
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
    expect(validateEdit({ op: 'renameAccount', accountId: 'card-1', name: 'x'.repeat(30) })).toMatchObject({ name: 'x'.repeat(30) })
    expect(() => validateEdit({ op: 'renameAccount', accountId: 'card-1', name: 'x'.repeat(31) })).toThrow(EditError)
    expect(validateEdit({ op: 'renameAccount', accountId: 'card-1', name: '   ' })).toEqual({ op: 'renameAccount', accountId: 'card-1', name: null })
  })
})

describe('a card’s closing and due days', () => {
  const card = { id: 'card-1', institutionId: 'bank', name: 'Cartão Exemplo', type: 'CREDIT' as const, subtype: 'CREDIT_CARD' as const, balance: 0 }
  const checking = { id: 'acc-1', institutionId: 'bank', name: 'Conta Exemplo', type: 'BANK' as const, subtype: 'CHECKING_ACCOUNT' as const, balance: 0 }
  const withCards = (): Snapshot => ({ ...snapshot(), accounts: [card, checking] })

  it('sets them and clears them', () => {
    const set = applyEdit(withCards(), validateEdit({ op: 'setCardDays', accountId: 'card-1', days: { close: 3, due: 10 } }))
    expect(set.cardDays).toEqual({ 'card-1': { close: 3, due: 10 } })
    expect(applyEdit(set, validateEdit({ op: 'setCardDays', accountId: 'card-1', days: null })).cardDays).toEqual({})
  })

  it('refuses days outside 1–31, a missing card and an account that isn’t a card', () => {
    for (const days of [{ close: 0, due: 10 }, { close: 3, due: 32 }, { close: 2.5, due: 10 }, { close: 3 }, 'x'])
      expect(() => validateEdit({ op: 'setCardDays', accountId: 'card-1', days })).toThrow(EditError)
    expect(() => applyEdit(withCards(), { op: 'setCardDays', accountId: 'other', days: { close: 3, due: 10 } })).toThrow(EditError)
    expect(() => applyEdit(withCards(), { op: 'setCardDays', accountId: 'acc-1', days: { close: 3, due: 10 } })).toThrow(EditError)
  })
})

describe('the FGTS balance', () => {
  const entry = (id: string, date: string, balance: number) => ({ id, date, balance })

  it('turns tracking on and off, keeping the history', () => {
    const on = applyEdit(snapshot(), validateEdit({ op: 'setFgtsTracking', tracking: true }))
    expect(on.fgts).toEqual({ tracking: true, entries: [] })
    const saved = applyEdit(on, validateEdit({ op: 'saveFgtsBalance', entry: entry('f1', '2026-09-22', 10_000_00) }))
    const off = applyEdit(saved, validateEdit({ op: 'setFgtsTracking', tracking: false }))
    expect(off.fgts).toEqual({ tracking: false, entries: [entry('f1', '2026-09-22', 10_000_00)] })
  })

  it('adds balances newest first, corrects one by ID, deletes one or all', () => {
    let s = applyEdit(snapshot(), { op: 'saveFgtsBalance', entry: entry('f1', '2026-08-21', 9_000_00) })
    s = applyEdit(s, { op: 'saveFgtsBalance', entry: entry('f2', '2026-09-22', 10_000_00) })
    expect(s.fgts?.entries.map((e) => e.id)).toEqual(['f2', 'f1'])
    s = applyEdit(s, { op: 'saveFgtsBalance', entry: entry('f1', '2026-10-21', 11_000_00) })
    expect(s.fgts?.entries).toEqual([entry('f1', '2026-10-21', 11_000_00), entry('f2', '2026-09-22', 10_000_00)])
    s = applyEdit(s, { op: 'deleteFgtsBalance', id: 'f2' })
    expect(s.fgts?.entries.map((e) => e.id)).toEqual(['f1'])
    expect(() => applyEdit(s, { op: 'deleteFgtsBalance', id: 'f2' })).toThrow(EditError)
    expect(applyEdit(s, validateEdit({ op: 'clearFgtsHistory' })).fgts?.entries).toEqual([])
  })

  it('refuses a negative, fractional or huge balance and a date that isn’t a real day', () => {
    for (const bad of [entry('f1', '2026-09-22', -1), entry('f1', '2026-09-22', 1.5), entry('f1', '2026-09-22', 100_000_000_01), entry('f1', '2026-02-30', 1), entry('f1', '22/09/2026', 1), entry('', '2026-09-22', 1)])
      expect(() => validateEdit({ op: 'saveFgtsBalance', entry: bad })).toThrow(EditError)
    expect(() => validateEdit({ op: 'setFgtsTracking', tracking: 'yes' })).toThrow(EditError)
  })
})

describe('previdência privada', () => {
  const entry = (id: string, date: string, balance: number) => ({ id, date, balance })
  const withPlan = () => applyEdit(snapshot(), validateEdit({ op: 'savePensionPlan', plan: { id: 'p1', name: '  Previdência   Exemplo ', type: 'PGBL' } }))

  it('adds, renames and deletes plans; tracking keeps them', () => {
    let s = withPlan()
    expect(s.pension).toEqual({ tracking: false, plans: [{ id: 'p1', name: 'Previdência Exemplo', type: 'PGBL', entries: [] }] })
    s = applyEdit(s, validateEdit({ op: 'savePensionPlan', plan: { id: 'p2', name: 'Plano Modelo', type: null } }))
    s = applyEdit(s, validateEdit({ op: 'savePensionPlan', plan: { id: 'p1', name: 'Plano Exemplo', type: 'VGBL' } }))
    expect(s.pension?.plans.map((p) => [p.id, p.name, p.type])).toEqual([['p1', 'Plano Exemplo', 'VGBL'], ['p2', 'Plano Modelo', null]])
    s = applyEdit(s, validateEdit({ op: 'setPensionTracking', tracking: true }))
    s = applyEdit(s, validateEdit({ op: 'deletePensionPlan', id: 'p2' }))
    expect(s.pension?.tracking).toBe(true)
    expect(s.pension?.plans.map((p) => p.id)).toEqual(['p1'])
    expect(() => applyEdit(s, { op: 'deletePensionPlan', id: 'p2' })).toThrow(EditError)
  })

  it('keeps each plan’s balances newest first, corrected by ID, deleted one by one', () => {
    let s = withPlan()
    s = applyEdit(s, validateEdit({ op: 'savePensionBalance', planId: 'p1', entry: entry('b1', '2026-08-10', 20_000_00) }))
    s = applyEdit(s, validateEdit({ op: 'savePensionBalance', planId: 'p1', entry: entry('b2', '2026-09-10', 20_300_00) }))
    s = applyEdit(s, validateEdit({ op: 'savePensionBalance', planId: 'p1', entry: entry('b1', '2026-08-10', 20_100_00) }))
    expect(s.pension?.plans[0].entries).toEqual([entry('b2', '2026-09-10', 20_300_00), entry('b1', '2026-08-10', 20_100_00)])
    s = applyEdit(s, validateEdit({ op: 'deletePensionBalance', planId: 'p1', id: 'b2' }))
    expect(s.pension?.plans[0].entries.map((e) => e.id)).toEqual(['b1'])
    expect(() => applyEdit(s, { op: 'deletePensionBalance', planId: 'p1', id: 'b2' })).toThrow(EditError)
    expect(() => applyEdit(s, { op: 'savePensionBalance', planId: 'nope', entry: entry('b3', '2026-09-10', 1) })).toThrow(EditError)
  })

  it('refuses an empty or long name, an unknown type and a bad balance', () => {
    for (const plan of [{ id: 'p1', name: '   ', type: null }, { id: 'p1', name: 'x'.repeat(41), type: null }, { id: 'p1', name: 'Plano', type: 'IRPF' }, { id: '', name: 'Plano', type: null }])
      expect(() => validateEdit({ op: 'savePensionPlan', plan })).toThrow(EditError)
    expect(validateEdit({ op: 'savePensionPlan', plan: { id: 'p1', name: 'x'.repeat(40), type: null } })).toMatchObject({ plan: { name: 'x'.repeat(40) } })
    for (const e of [entry('b1', '2026-09-10', -1), entry('b1', '2026-02-30', 1), entry('b1', '2026-09-10', 100_000_000_01)])
      expect(() => validateEdit({ op: 'savePensionBalance', planId: 'p1', entry: e })).toThrow(EditError)
  })
})

