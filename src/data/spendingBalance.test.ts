import { describe, expect, it } from 'vitest'
import { applyEdit, defaultCategories, EditError, validateEdit } from './edits'
import { NO_FILTER } from './incomeAverage'
import { DEFAULT_TARGET, expectedIncome, balanceStatus, hasGroups, isTarget, monthBalance, monthBalances, roundedShares, suggestGroup, worstDeviation } from './spendingBalance'
import type { Category, Snapshot, Subcategory, Transaction } from './types'

const defaults = defaultCategories((c, i) => `${c}-${i}`)
// Moradia and Mercado are Essencial, Restaurantes and Transporte's "Apps de corrida" Estilo de vida; the rest has no group.
const categories: Category[] = defaults.categories.map((c) =>
  c.id === 'home' || c.id === 'groceries' || c.id === 'transport' ? { ...c, group: 'essential' } : c.id === 'restaurants' ? { ...c, group: 'lifestyle' } : c,
)
const subcategories: Subcategory[] = defaults.subcategories.map((s) => (s.id === 'transport-0' ? { ...s, group: 'lifestyle' } : s))
const tx = (id: string, date: string, amount: number, over: Partial<Transaction> = {}): Transaction => ({
  id, accountId: 'a', date, description: 'LOJA EXEMPLO', amount, categoryId: null, status: 'POSTED', ...over,
})
const september: Transaction[] = [
  tx('salary', '2026-09-05', 10_000_00, { categoryId: 'salary' }),
  tx('rent', '2026-09-06', -4_000_00, { categoryId: 'home' }),
  tx('market', '2026-09-07', -1_500_00, { categoryId: 'groceries' }),
  tx('market-refund', '2026-09-08', 200_00, { categoryId: 'groceries' }),
  tx('bus', '2026-09-09', -300_00, { categoryId: 'transport', subcategoryId: 'transport-1' }),
  tx('ride', '2026-09-10', -150_00, { categoryId: 'transport', subcategoryId: 'transport-0' }),
  tx('dinner', '2026-09-11', -2_550_00, { categoryId: 'restaurants' }),
  tx('shop', '2026-09-12', -120_00, { categoryId: 'shopping' }),
  tx('unknown', '2026-09-13', -180_00),
  tx('own', '2026-09-14', -3_000_00, { transfer: 'own' }),
  tx('bill', '2026-09-15', -2_000_00, { transfer: 'card-payment' }),
  tx('hidden', '2026-09-16', -9_000_00, { categoryId: 'home', hidden: true }),
  tx('installment', '2026-09-17', -100_00, { categoryId: 'restaurants', installment: { number: 2, total: 3, totalAmount: 300_00, purchaseDate: '2026-08-17' } }),
]
const balance = (txs = september, month = '2026-09') => monthBalance(txs, categories, subcategories, NO_FILTER, month)

describe('Equilíbrio do mês', () => {
  it('splits the income into the groups; transfers, bill payments and hidden ones never count', () => {
    const b = balance()
    expect(b.income).toBe(10_000_00)
    // Moradia 4.000 + Mercado 1.500 − 200 + Transporte 300
    expect(b.essential).toBe(5_600_00)
    // Restaurantes 2.550 + this month's installment 100 + Apps de corrida 150
    expect(b.lifestyle).toBe(2_800_00)
    // Compras (no group) 120 + uncategorized 180
    expect(b.ungrouped).toBe(300_00)
    // Sem grupo stays inside the Futuro until it's classified.
    expect(b.future).toBe(1_600_00)
    expect(b.overIncome).toBe(0)
    expect(roundedShares(b)).toEqual({ essential: 56, lifestyle: 28, future: 16 })
  })

  it('lists each group by category, with a subcategory in another group on its own row', () => {
    const b = balance()
    expect(b.items.essential.map((i) => [i.categoryId, i.subcategoryId, i.amount])).toEqual([
      ['home', null, 4_000_00],
      ['groceries', null, 1_300_00],
      ['transport', null, 300_00],
    ])
    expect(b.items.lifestyle.map((i) => [i.categoryId, i.subcategoryId, i.amount])).toEqual([
      ['restaurants', null, 2_650_00],
      ['transport', 'transport-0', 150_00],
    ])
    expect(b.items.ungrouped.map((i) => [i.categoryId, i.amount, i.count])).toEqual([
      [null, 180_00, 1],
      ['shopping', 120_00, 1],
    ])
  })

  it('uses the average income filter for the income', () => {
    const txs = [...september, tx('free', '2026-09-20', 5_000_00, { categoryId: 'freelance' })]
    expect(monthBalance(txs, categories, subcategories, NO_FILTER, '2026-09').income).toBe(15_000_00)
    expect(monthBalance(txs, categories, subcategories, { ...NO_FILTER, excludedCategoryIds: ['freelance'] }, '2026-09').income).toBe(10_000_00)
  })

  it('goes negative, with the amount above the income, when spending passes it', () => {
    const b = balance([...september, tx('trip', '2026-09-20', -2_000_00, { categoryId: 'restaurants' })])
    expect(b.future).toBe(-400_00)
    expect(b.overIncome).toBe(700_00)
    expect(balanceStatus(b, DEFAULT_TARGET, '2026-10-12')).toEqual({ kind: 'overIncome', amount: 700_00 })
  })

  it('measures the month in progress against the income expected, not what came in so far', () => {
    // July to September: R$ 8.000, 10.000 and 12.000; October so far: R$ 4.000 (the rest comes at the end of the month).
    const history = [
      tx('jul', '2026-07-30', 8_000_00, { categoryId: 'salary' }),
      tx('aug', '2026-08-31', 10_000_00, { categoryId: 'salary' }),
      ...september,
      tx('sep-2', '2026-09-30', 2_000_00, { categoryId: 'salary' }),
      tx('oct-1', '2026-10-15', 4_000_00, { categoryId: 'salary' }),
      tx('oct-rent', '2026-10-06', -4_000_00, { categoryId: 'home' }),
    ]
    expect(expectedIncome(history, categories, subcategories, NO_FILTER, '2026-10')).toBe(10_000_00)
    const october = monthBalance(history, categories, subcategories, NO_FILTER, '2026-10', '2026-10-16')
    expect(october).toMatchObject({ income: 10_000_00, received: 4_000_00, expected: 10_000_00, essential: 4_000_00, future: 6_000_00, overIncome: 0 })
    expect(roundedShares(october)).toEqual({ essential: 40, lifestyle: 0, future: 60 })
    // More than usual already came in: that's the income.
    const bonus = monthBalance([...history, tx('oct-bonus', '2026-10-16', 9_000_00, { categoryId: 'salary' })], categories, subcategories, NO_FILTER, '2026-10', '2026-10-16')
    expect(bonus.income).toBe(13_000_00)
    // Closed months keep what came in; without `today`, the month in progress too.
    expect(monthBalance(history, categories, subcategories, NO_FILTER, '2026-09', '2026-10-16')).toMatchObject({ income: 12_000_00, expected: null })
    expect(monthBalance(history, categories, subcategories, NO_FILTER, '2026-10').income).toBe(4_000_00)
    // No history: nothing expected.
    expect(expectedIncome([tx('only', '2026-10-02', -100_00)], categories, subcategories, NO_FILTER, '2026-10')).toBe(0)
  })

  it('expects only the income Renda média counts: its filter leaves the rest out', () => {
    const salarySubs = subcategories.filter((x) => x.categoryId === 'salary')
    const months = ['2026-07', '2026-08', '2026-09']
    const history = months.flatMap((m) => [
      tx(`base-${m}`, `${m}-30`, 10_000_00, { categoryId: 'salary', subcategoryId: salarySubs[0].id }),
      tx(`extra-${m}`, `${m}-20`, 1_000_00, { categoryId: 'salary', subcategoryId: salarySubs[1].id }),
      tx(`free-${m}`, `${m}-10`, 3_000_00, { categoryId: 'freelance' }),
      tx(`pix-${m}`, `${m}-12`, 500_00),
    ])
    const filter = { excludedCategoryIds: ['freelance'], excludedSubcategoryIds: [salarySubs[1].id], excludeUncategorized: true }
    expect(expectedIncome(history, categories, subcategories, NO_FILTER, '2026-10')).toBe(14_500_00)
    expect(expectedIncome(history, categories, subcategories, filter, '2026-10')).toBe(10_000_00)
    // What came in this month is filtered the same way.
    const october = [...history, tx('oct-free', '2026-10-05', 3_000_00, { categoryId: 'freelance' })]
    expect(monthBalance(october, categories, subcategories, filter, '2026-10', '2026-10-16')).toMatchObject({ income: 10_000_00, received: 0, expected: 10_000_00 })
  })

  it('tells each state apart', () => {
    const today = '2026-10-12'
    expect(balanceStatus(balance(), DEFAULT_TARGET, today)).toEqual({ kind: 'attention', worst: { group: 'essential', points: 6 } })
    expect(balanceStatus(balance(), { essential: 55, lifestyle: 30, future: 15 }, today)).toEqual({ kind: 'onTarget' })
    expect(balanceStatus(balance([]), DEFAULT_TARGET, today)).toEqual({ kind: 'noIncome' })
    const october = september.map((t) => ({ ...t, date: t.date.replace('2026-09', '2026-10') }))
    expect(balanceStatus(balance(october, '2026-10'), DEFAULT_TARGET, today)).toEqual({ kind: 'partial', early: true })
    expect(balanceStatus(balance(october, '2026-10'), DEFAULT_TARGET, '2026-10-20')).toEqual({ kind: 'partial', early: false })
    // More than 10% of the income without a group.
    const unsorted = balance([...september, tx('more', '2026-09-21', -900_00)])
    expect(balanceStatus(unsorted, DEFAULT_TARGET, today)).toEqual({ kind: 'incomplete', amount: 1_200_00 })
  })

  it('points at the group furthest past its target', () => {
    const b = balance()
    expect(worstDeviation(b, { essential: 60, lifestyle: 20, future: 20 })).toEqual({ group: 'lifestyle', points: 8 })
    expect(worstDeviation(b, { essential: 60, lifestyle: 30, future: 10 })).toEqual({ group: 'lifestyle', points: -2 })
  })

  it('works out several months at once', () => {
    const txs = [...september, tx('aug', '2026-08-05', 8_000_00, { categoryId: 'salary' })]
    expect(monthBalances(txs, categories, subcategories, NO_FILTER, ['2026-08', '2026-09']).map((b) => b.income)).toEqual([8_000_00, 10_000_00])
  })

  it('suggests a group from the name, then the icon', () => {
    const guess = (name: string, icon = 'more') => suggestGroup({ name, icon })
    expect(guess('Moradia')).toBe('essential')
    expect(guess('Farmácia')).toBe('essential')
    expect(guess('Escola das crianças')).toBe('essential')
    expect(guess('Restaurantes')).toBe('lifestyle')
    expect(guess('Viagem')).toBe('lifestyle')
    expect(guess('Barbearia')).toBeNull()
    expect(guess('Academia')).toBeNull()
    expect(guess('Água e luz', 'droplet')).toBe('essential')
    expect(guess('Jogos online', 'game')).toBe('lifestyle')
    expect(guess('Coisas', 'plane')).toBe('lifestyle')
    // Every default expense category gets a suggestion.
    expect(defaults.categories.filter((c) => c.type === 'expense').map((c) => [c.id, suggestGroup(c)])).toEqual([
      ['home', 'essential'],
      ['groceries', 'essential'],
      ['restaurants', 'lifestyle'],
      ['transport', 'essential'],
      ['shopping', 'lifestyle'],
      ['subscriptions', 'lifestyle'],
      ['health', 'essential'],
      ['travel', 'lifestyle'],
    ])
  })

  it('knows when nothing is in a group yet', () => {
    expect(hasGroups(defaults.categories, defaults.subcategories)).toBe(false)
    expect(hasGroups(categories, defaults.subcategories)).toBe(true)
  })

  it('checks a target: whole percents that add up to 100', () => {
    expect(isTarget({ essential: 50, lifestyle: 30, future: 20 })).toBe(true)
    expect(isTarget({ essential: 75, lifestyle: 25, future: 0 })).toBe(true)
    expect(isTarget({ essential: 50, lifestyle: 30, future: 30 })).toBe(false)
    expect(isTarget({ essential: 50.5, lifestyle: 29.5, future: 20 })).toBe(false)
    expect(isTarget({ essential: -10, lifestyle: 90, future: 20 })).toBe(false)
    expect(isTarget(null)).toBe(false)
  })
})

describe('Equilíbrio edits', () => {
  const snapshot = (): Snapshot => ({ institutions: [], accounts: [], categories: defaults.categories, subcategories: defaults.subcategories, source: 'demo', transactions: [] })

  it('validates them', () => {
    expect(validateEdit({ op: 'setCategoryGroups', groups: [{ categoryId: 'home', group: 'essential' }, { categoryId: 'travel', group: null }] })).toEqual({
      op: 'setCategoryGroups',
      groups: [
        { categoryId: 'home', group: 'essential' },
        { categoryId: 'travel', group: null },
      ],
    })
    expect(validateEdit({ op: 'setBalanceTarget', target: { essential: 60, lifestyle: 20, future: 20, extra: 1 } })).toEqual({
      op: 'setBalanceTarget',
      target: { essential: 60, lifestyle: 20, future: 20 },
    })
    const bad = [
      { op: 'setCategoryGroups', groups: [] },
      { op: 'setCategoryGroups', groups: [{ categoryId: 'home', group: 'future' }] },
      { op: 'setCategoryGroups', groups: [{ categoryId: 'home', group: null }, { categoryId: 'home', group: 'essential' }] },
      { op: 'setSubcategoryGroup', id: 'home-0', group: 'luxury' },
      { op: 'setBalanceTarget', target: { essential: 60, lifestyle: 30, future: 20 } },
    ]
    for (const e of bad) expect(() => validateEdit(e), JSON.stringify(e)).toThrow(EditError)
  })

  it('sets and clears groups, expense categories only', () => {
    let s = applyEdit(snapshot(), { op: 'setCategoryGroups', groups: [{ categoryId: 'home', group: 'essential' }, { categoryId: 'travel', group: 'lifestyle' }] })
    expect(s.categories.filter((c) => c.group).map((c) => [c.id, c.group])).toEqual([
      ['home', 'essential'],
      ['travel', 'lifestyle'],
    ])
    s = applyEdit(s, { op: 'setCategoryGroups', groups: [{ categoryId: 'travel', group: null }] })
    expect(s.categories.find((c) => c.id === 'travel')!.group).toBeNull()
    expect(() => applyEdit(s, { op: 'setCategoryGroups', groups: [{ categoryId: 'salary', group: 'essential' }] })).toThrow(EditError)
    expect(() => applyEdit(s, { op: 'setCategoryGroups', groups: [{ categoryId: 'nope', group: 'essential' }] })).toThrow(EditError)
  })

  it('puts a subcategory in its own group, and clears groups when a category becomes income', () => {
    let s = applyEdit(snapshot(), { op: 'setCategoryGroups', groups: [{ categoryId: 'transport', group: 'essential' }] })
    s = applyEdit(s, { op: 'setSubcategoryGroup', id: 'transport-0', group: 'lifestyle' })
    expect(s.subcategories.find((x) => x.id === 'transport-0')!.group).toBe('lifestyle')
    expect(() => applyEdit(s, { op: 'setSubcategoryGroup', id: 'salary-0', group: 'lifestyle' })).toThrow(EditError)
    s = applyEdit(s, { op: 'updateCategory', id: 'transport', changes: { type: 'income' } })
    expect(s.categories.find((c) => c.id === 'transport')!.group).toBeNull()
    expect(s.subcategories.find((x) => x.id === 'transport-0')!.group).toBeNull()
  })

  it('moving a subcategory under an income category drops its group', () => {
    let s = applyEdit(snapshot(), { op: 'setSubcategoryGroup', id: 'transport-0', group: 'lifestyle' })
    s = applyEdit(s, { op: 'linkSubcategory', id: 'transport-0', categoryId: 'salary' })
    expect(s.subcategories.find((x) => x.id === 'transport-0')!.group).toBeNull()
  })

  it('stores the target', () => {
    expect(applyEdit(snapshot(), { op: 'setBalanceTarget', target: { essential: 70, lifestyle: 20, future: 10 } }).balanceTarget).toEqual({ essential: 70, lifestyle: 20, future: 10 })
  })
})
