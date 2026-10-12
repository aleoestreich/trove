import { describe, expect, it } from 'vitest'
import { applyEdit, defaultCategories, EditError } from './edits'
import { filterLabel, incomeAverage, incomeOptions, NO_FILTER, previewAverage, summarizeIncomeFilter } from './incomeAverage'
import type { IncomeFilter, Snapshot, Transaction } from './types'

const { categories, subcategories } = defaultCategories((c, i) => `${c}-${i}`)
// Salário (2 subcategories in the catalog) and Freelance are the income categories.
const salarySubs = subcategories.filter((s) => s.categoryId === 'salary')
const tx = (id: string, date: string, amount: number, over: Partial<Transaction> = {}): Transaction => ({
  id, accountId: 'a', date, description: 'EXEMPLO', amount, categoryId: null, status: 'POSTED', ...over,
})
// Six complete months (2026-04 … 2026-09) and October in progress.
const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
const transactions: Transaction[] = [
  ...months.flatMap((m, i) => [
    tx(`base-${m}`, `${m}-05`, 10_000_00, { categoryId: 'salary', subcategoryId: salarySubs[0].id }),
    tx(`bonus-${m}`, `${m}-06`, 1_000_00 * i, { categoryId: 'salary', subcategoryId: salarySubs[1].id }),
    tx(`free-${m}`, `${m}-10`, 3_000_00, { categoryId: 'freelance' }),
    tx(`pix-${m}`, `${m}-12`, 100_00),
    tx(`spend-${m}`, `${m}-15`, -500_00, { categoryId: 'groceries' }),
    tx(`own-${m}`, `${m}-16`, 7_000_00, { transfer: 'own' }),
    tx(`hidden-${m}`, `${m}-17`, 9_000_00, { categoryId: 'freelance', hidden: true }),
  ]),
  tx('oct', '2026-10-05', 10_000_00, { categoryId: 'salary', subcategoryId: salarySubs[0].id }),
]
const avg = (filter: IncomeFilter, txs = transactions, cats = categories, subs = subcategories) =>
  incomeAverage(txs, cats, subs, filter, '2026-10')!
const filter = (over: Partial<IncomeFilter>): IncomeFilter => ({ ...NO_FILTER, ...over })

describe('average income with a category filter', () => {
  it('counts income only: no transfers, hidden transactions or expenses', () => {
    // 10.000 + bonus (0…5.000, avg 2.500) + 3.000 + 100
    const a = avg(NO_FILTER)
    expect(a.average).toBe(15_600_00)
    expect(a.allAverage).toBe(15_600_00)
    expect(a.months.map((m) => m.month)).toEqual(months)
    expect(a.lowest).toEqual({ month: '2026-04', total: 13_100_00 })
    expect(a.highest).toEqual({ month: '2026-09', total: 18_100_00 })
    expect(a.currentMonth).toMatchObject({ month: '2026-10', total: 10_000_00 })
  })

  it('needs a complete month, and compares the current month with the average', () => {
    expect(incomeAverage([tx('only', '2026-10-02', 100_00)], categories, subcategories, NO_FILTER, '2026-10')).toBeNull()
    const half = avg(filter({ excludedCategoryIds: ['freelance'], excludedSubcategoryIds: [salarySubs[1].id], excludeUncategorized: true }), [
      ...transactions,
      tx('oct-2', '2026-10-06', -5_000_00, { categoryId: 'groceries' }),
    ])
    expect(half.currentMonth.vsAverage).toBe(0)
    const low = incomeAverage(
      [tx('a', '2026-08-01', 10_000_00), tx('b', '2026-09-01', 10_000_00), tx('c', '2026-10-01', 5_000_00)],
      categories,
      subcategories,
      NO_FILTER,
      '2026-10',
    )!
    expect(low.currentMonth.vsAverage).toBe(-50)
  })

  it('leaves out deselected categories, subcategories and uncategorized income', () => {
    expect(avg(filter({ excludedCategoryIds: ['freelance'] })).average).toBe(12_600_00)
    expect(avg(filter({ excludedSubcategoryIds: [salarySubs[1].id] })).average).toBe(13_100_00)
    expect(avg(filter({ excludeUncategorized: true })).average).toBe(15_500_00)
    const only = avg(filter({ excludedCategoryIds: ['freelance'], excludedSubcategoryIds: [salarySubs[1].id], excludeUncategorized: true }))
    expect(only.average).toBe(10_000_00)
    expect(only.allAverage).toBe(15_600_00)
    expect(only.currentMonth.vsAverage).toBe(0)
  })

  it('counts an income category created later, as nothing excludes it', () => {
    const cats = [...categories, { id: 'rent-in', name: 'Aluguel recebido', type: 'income' as const, color: 'mint', icon: 'home', sortOrder: 99 }]
    const txs = [...transactions, ...months.map((m) => tx(`rent-${m}`, `${m}-20`, 600_00, { categoryId: 'rent-in' }))]
    expect(avg(filter({ excludedCategoryIds: ['freelance'] }), txs, cats).average).toBe(13_200_00)
  })

  it('the live preview matches the full calculation for any filter', () => {
    const options = incomeOptions(transactions, categories, subcategories, '2026-10')
    expect(options.categories.map((c) => [c.id, c.average])).toEqual([
      ['salary', 12_500_00],
      ['freelance', 3_000_00],
      ['yields', 0],
    ])
    expect(options.uncategorized.average).toBe(100_00)
    for (const f of [
      NO_FILTER,
      filter({ excludedCategoryIds: ['freelance'] }),
      filter({ excludedSubcategoryIds: [salarySubs[0].id], excludeUncategorized: true }),
      filter({ excludedCategoryIds: ['salary', 'freelance', 'yields'] }),
    ])
      expect(previewAverage(options, f)).toBe(avg(f).average)
  })

  it('labels the pill', () => {
    const words = { all: 'Todas as receitas', partial: '(parcial)' }
    const label = (f: IncomeFilter) => {
      const s = summarizeIncomeFilter(f, categories, subcategories, 'Sem categoria')
      return `${filterLabel(s, words)} · ${s.included.length} de ${s.total}`
    }
    expect(label(NO_FILTER)).toBe('Todas as receitas · 4 de 4')
    expect(label(filter({ excludeUncategorized: true }))).toBe('Salário, Freelance, Rendimentos · 3 de 4')
    expect(label(filter({ excludedSubcategoryIds: [salarySubs[1].id], excludedCategoryIds: ['freelance', 'yields'], excludeUncategorized: true }))).toBe(
      'Salário (parcial) · 1 de 4',
    )
  })
})

describe('saving the filter (setIncomeFilter)', () => {
  const snapshot = (): Snapshot => ({ institutions: [], accounts: [], categories, subcategories, transactions, source: 'demo' })
  const reason = (f: () => unknown) => {
    try {
      f()
      return 'none'
    } catch (e) {
      return e instanceof EditError ? (e.reason ?? e.code) : 'other'
    }
  }

  it('refuses a filter that leaves nothing selected, or that names expense categories', () => {
    const none = filter({ excludedCategoryIds: ['salary', 'freelance', 'yields'], excludeUncategorized: true })
    expect(reason(() => applyEdit(snapshot(), { op: 'setIncomeFilter', filter: none }))).toBe('nothing_selected')
    // Every subcategory of every category unticked is the same as nothing.
    const allSubs = filter({ excludedSubcategoryIds: subcategories.filter((s) => ['salary', 'freelance', 'yields'].includes(s.categoryId)).map((s) => s.id), excludeUncategorized: true })
    expect(reason(() => applyEdit(snapshot(), { op: 'setIncomeFilter', filter: allSubs }))).toBe('nothing_selected')
    expect(reason(() => applyEdit(snapshot(), { op: 'setIncomeFilter', filter: filter({ excludedCategoryIds: ['groceries'] }) }))).toBe('not_income')
  })

  it('deleting an excluded category or subcategory drops it from the filter', () => {
    let s = applyEdit(snapshot(), { op: 'setIncomeFilter', filter: filter({ excludedCategoryIds: ['freelance'], excludedSubcategoryIds: [salarySubs[1].id] }) })
    s = applyEdit(s, { op: 'deleteCategory', id: 'freelance' })
    expect(s.incomeFilter!.excludedCategoryIds).toEqual([])
    s = applyEdit(s, { op: 'deleteSubcategory', id: salarySubs[1].id })
    expect(s.incomeFilter!.excludedSubcategoryIds).toEqual([])
  })
})
