import { describe, expect, it } from 'vitest'
import { defaultCategories } from '../data/edits'
import type { Transaction } from '../data/types'
import { filterTransactions, newestFirst } from '../pages/Transactions'
import { groupState, rangeIds, selectAllIds, summarize, toggleGroup } from './selection'

const { categories } = defaultCategories((c, i) => `${c}-${i}`)
const categoriesById = new Map(categories.map((c) => [c.id, c]))
const tx = (id: string, over: Partial<Transaction> = {}): Transaction => ({
  id, accountId: 'a', date: '2026-10-01', description: 'LOJA EXEMPLO', amount: -100_00, categoryId: null, status: 'POSTED', ...over,
})
const list = [
  tx('t1', { categoryId: 'groceries', subcategoryId: 'groceries-0' }),
  tx('t2', { description: 'MERCADO EXEMPLO' }),
  tx('own', { transfer: 'own', amount: 500_00 }),
  tx('t3', { date: '2026-09-30', amount: -50_00, foreign: { currency: 'USD', amount: -10_00 } }),
  tx('pay', { date: '2026-09-30', amount: 3000_00 }),
]

describe('bulk selection', () => {
  it('"Selecionar tudo" selects every selectable row shown, respecting the search and filters', () => {
    expect(selectAllIds(list)).toEqual(['t1', 't2', 't3', 'pay'])
    const uncategorized = filterTransactions(list, categoriesById, { categoryId: 'none' })
    expect(selectAllIds(uncategorized)).toEqual(['t2', 't3', 'pay'])
    const searched = filterTransactions(list, categoriesById, { query: 'mercado' })
    expect(selectAllIds(searched)).toEqual(['t2'])
    const hidden = filterTransactions([...list, tx('h', { hidden: true })], categoriesById, {})
    expect(selectAllIds(hidden)).not.toContain('h')
  })

  it('a day’s checkbox is empty, checked or mixed, and never counts transfers', () => {
    const day = list.slice(0, 3)
    expect(groupState(day, new Set())).toBe('off')
    expect(groupState(day, new Set(['t1']))).toBe('mixed')
    expect(groupState(day, new Set(['t1', 't2']))).toBe('on')
    expect(groupState([list[2]], new Set())).toBe('disabled')
    expect([...toggleGroup(day, new Set(['t1']))]).toEqual(['t1', 't2'])
    expect([...toggleGroup(day, new Set(['t1', 't2', 'x']))]).toEqual(['x'])
  })

  it('shift + click selects the range in the order shown, skipping transfers', () => {
    expect(rangeIds(list, 't3', 't1')).toEqual(['t1', 't2', 't3'])
    expect(rangeIds(list, 'gone', 't2')).toEqual(['t2'])
  })

  it('sums in BRL and tells one kind from a mix', () => {
    const s = summarize([list[0], list[1], list[3]], categoriesById)
    expect(s).toMatchObject({ count: 3, total: -250_00, kind: 'expense' })
    expect(s.current).toEqual([
      { categoryId: null, subcategoryId: null, count: 2 },
      { categoryId: 'groceries', subcategoryId: 'groceries-0', count: 1 },
    ])
    expect(summarize([list[0], list[4]], categoriesById).kind).toBeNull()
  })
})

describe('transactions page order', () => {
  it('shows the newest day first and keeps the order within a day', () => {
    const list = [tx('a', { date: '2026-09-01' }), tx('b', { date: '2026-10-02' }), tx('c', { date: '2026-10-02' }), tx('d', { date: '2026-09-30' })]
    expect(newestFirst(list).map((t) => t.id)).toEqual(['b', 'c', 'd', 'a'])
  })
})
