import { describe, expect, it } from 'vitest'
import { defaultCategories } from './edits'
import { closedMonth, monthClose, showsClose } from './monthClose'
import type { Category, Transaction } from './types'

// Made-up data only.
const base = defaultCategories((c, i) => `${c}-${i}`)
let n = 0
const tx = (date: string, amount: number, categoryId: string | null, over: Partial<Transaction> = {}): Transaction => ({
  id: `t${++n}`, accountId: 'a', date, description: 'LOJA EXEMPLO', amount, categoryId, status: 'POSTED', ...over,
})
/** Six months of the same salary, rent and groceries, then September. */
function history(september: Transaction[]): Transaction[] {
  const out: Transaction[] = []
  for (const m of ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']) {
    out.push(tx(`${m}-05`, 10_000_00, 'salary'), tx(`${m}-10`, -3_000_00, 'home'), tx(`${m}-15`, -1_000_00, 'groceries'), tx(`${m}-20`, -500_00, 'restaurants'))
  }
  return [...out, ...september]
}
const input = (transactions: Transaction[], categories: Category[] = base.categories) => ({ transactions, categories, subcategories: base.subcategories })

describe('Fechamento do mês', () => {
  it('is the month before, shown on the Visão geral until the 10th', () => {
    expect(closedMonth('2026-10-12')).toBe('2026-09')
    expect(closedMonth('2026-01-03')).toBe('2025-12')
    expect([showsClose('2026-10-01'), showsClose('2026-10-10'), showsClose('2026-10-11')]).toEqual([true, true, false])
  })

  it('adds up what came in, went out and was kept, leaving out hidden ones and transfers', () => {
    const c = monthClose(
      input(
        history([
          tx('2026-09-05', 10_000_00, 'salary'),
          tx('2026-09-10', -3_000_00, 'home'),
          tx('2026-09-15', -2_500_00, 'groceries'),
          tx('2026-09-16', -999_00, 'groceries', { hidden: true }),
          tx('2026-09-17', -700_00, null, { transfer: 'own' }),
        ]),
      ),
      '2026-09',
    )!
    expect(c.figures).toEqual({ income: 10_000_00, expenses: 5_500_00, net: 4_500_00 })
    expect(c.keptPct).toBe(45)
    expect(c.count).toBe(3)
  })

  it('compares with the month before and the average of the 6 before', () => {
    const c = monthClose(input(history([tx('2026-09-05', 11_000_00, 'salary'), tx('2026-09-10', -3_000_00, 'home'), tx('2026-09-15', -2_500_00, 'groceries')])), '2026-09')!
    expect(c.previous).toEqual({ month: '2026-08', income: 10_000_00, expenses: 4_500_00, net: 5_500_00 })
    expect(c.average).toEqual({ income: 10_000_00, expenses: 4_500_00, net: 5_500_00, months: 6 })
    // Groceries went up most; restaurants went to zero.
    expect(c.changes.map((x) => [x.categoryId, x.delta])).toEqual([
      ['groceries', 1_500_00],
      ['restaurants', -500_00],
    ])
  })

  it('lists the biggest categories with their share, and the biggest expenses', () => {
    const c = monthClose(input(history([tx('2026-09-10', -3_000_00, 'home'), tx('2026-09-15', -600_00, 'groceries'), tx('2026-09-16', -400_00, 'groceries'), tx('2026-09-20', -50_00, null)])), '2026-09')!
    expect(c.topCategories.map((x) => [x.categoryId, x.amount, Math.round(x.share)])).toEqual([
      ['home', 3_000_00, 74],
      ['groceries', 1_000_00, 25],
      [null, 50_00, 1],
    ])
    expect(c.biggest.map((t) => t.amount)).toEqual([-3_000_00, -600_00, -400_00])
  })

  it('finds the unusual categories against their own 6-month average', () => {
    const c = monthClose(input(history([tx('2026-09-10', -3_000_00, 'home'), tx('2026-09-15', -2_000_00, 'groceries'), tx('2026-09-20', -500_00, 'restaurants')])), '2026-09')!
    expect(c.unusual!.map((u) => [u.categoryId, u.delta])).toEqual([['groceries', 1_000_00]])
    // Without 3 months before it, there's nothing to compare with.
    expect(monthClose(input([tx('2026-08-10', -10_00, 'home'), tx('2026-09-10', -10_00, 'home')]), '2026-09')!.unusual).toBeNull()
  })

  it('measures the Equilíbrio do mês against its target once categories are in groups', () => {
    const txs = history([tx('2026-09-05', 10_000_00, 'salary'), tx('2026-09-10', -5_000_00, 'home'), tx('2026-09-15', -3_000_00, 'restaurants')])
    expect(monthClose(input(txs), '2026-09')!.balance).toBeNull()
    const grouped = base.categories.map((c) => (c.id === 'home' ? { ...c, group: 'essential' as const } : c.id === 'restaurants' ? { ...c, group: 'lifestyle' as const } : c))
    const b = monthClose(input(txs, grouped), '2026-09')!.balance!
    expect(b.shares).toEqual({ essential: 50, lifestyle: 30, future: 20 })
    expect(b.status).toEqual({ kind: 'onTarget' })
  })

  it('is null for a month with nothing in it', () => {
    expect(monthClose(input(history([])), '2026-09')).toBeNull()
  })
})
