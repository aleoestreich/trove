import { describe, expect, it } from 'vitest'
import { buildSeed } from '../data/seed'
import { defaultCategories } from '../data/edits'
import type { Transaction } from '../data/types'
import { balances, expensesByCategory, expensesBySubcategory, kindOf, totals, averageIncome } from './summary'
import { formatMoney, convertToBRL } from './money'
import { lastMonths } from './dates'
import { filterTransactions } from '../pages/Transactions'

// The default categories (made-up transactions below).
const { categories } = defaultCategories('en', (c, i) => `${c}-${i}`)
const byId = new Map(categories.map((c) => [c.id, c]))
/** `categoryId` "transfer" / "card-payment" make a transfer; null, an uncategorized transaction. */
const tx = (amount: number, categoryId: string | null, extra: Partial<Transaction> = {}): Transaction => ({
  id: String(Math.random()),
  accountId: 'a',
  date: '2026-09-10',
  description: 'x',
  amount,
  ...(categoryId === 'transfer' ? { categoryId: null, transfer: 'own' as const } : categoryId === 'card-payment' ? { categoryId: null, transfer: 'card-payment' as const } : { categoryId }),
  status: 'POSTED',
  ...extra,
})

describe('totals', () => {
  it('sums income and expenses and excludes transfers and card payments', () => {
    const t = totals(
      [tx(1000_00, 'salary'), tx(-200_00, 'groceries'), tx(-500_00, 'transfer'), tx(500_00, 'transfer'), tx(-300_00, 'card-payment')],
      byId,
    )
    expect(t).toEqual({ income: 1000_00, expenses: 200_00, net: 800_00 })
  })

  it('treats refunds in an expense category as reducing expenses', () => {
    expect(totals([tx(-100_00, 'shopping'), tx(40_00, 'shopping')], byId).expenses).toBe(60_00)
  })

  it('counts uncategorized money in as income and money out as an expense', () => {
    expect(totals([tx(300_00, null), tx(-120_00, null)], byId)).toEqual({ income: 300_00, expenses: 120_00, net: 180_00 })
    expect(kindOf(tx(-1, null), byId)).toBe('expense')
    expect(kindOf(tx(-1, 'card-payment'), byId)).toBe('transfer')
  })

  it('leaves hidden transactions out of every total', () => {
    const hidden = { hidden: true }
    expect(totals([tx(1000_00, 'salary'), tx(500_00, 'salary', hidden), tx(-150_00, 'shopping', hidden)], byId)).toEqual({
      income: 1000_00,
      expenses: 0,
      net: 1000_00,
    })
    expect(expensesByCategory([tx(-150_00, 'shopping', hidden), tx(-10_00, 'restaurants')], byId).map((c) => c.category?.id)).toEqual(['restaurants'])
    expect(expensesBySubcategory([tx(-150_00, 'transport', { subcategoryId: 'transport-1', hidden: true })], 'transport')).toEqual([])
  })

  it('counts a transaction again once it is unhidden', () => {
    const t = tx(-150_00, 'shopping', { hidden: true })
    expect(totals([t], byId).expenses).toBe(0)
    expect(totals([{ ...t, hidden: false }], byId).expenses).toBe(150_00)
  })
})

describe('expensesByCategory', () => {
  it('groups and sorts by amount', () => {
    const r = expensesByCategory([tx(-10_00, 'restaurants'), tx(-50_00, 'groceries'), tx(-15_00, 'restaurants'), tx(99_00, 'salary'), tx(-5_00, null)], byId)
    expect(r.map((c) => [c.category?.id ?? null, c.amount])).toEqual([
      ['groceries', 50_00],
      ['restaurants', 25_00],
      [null, 5_00],
    ])
  })

  it('splits a category by subcategory, largest first, with the rest last', () => {
    const r = expensesBySubcategory(
      [tx(-100_00, 'transport', { subcategoryId: 'fuel' }), tx(-30_00, 'transport'), tx(-150_00, 'transport', { subcategoryId: 'parking' })],
      'transport',
    )
    expect(r).toEqual([
      { subcategoryId: 'parking', amount: 150_00 },
      { subcategoryId: 'fuel', amount: 100_00 },
      { subcategoryId: null, amount: 30_00 },
    ])
  })
})

describe('money', () => {
  it('formats BRL and USD the Brazilian way', () => {
    expect(formatMoney(123456)).toBe('R$ 1.234,56')
    expect(formatMoney(-500, 'BRL', { signed: true })).toBe('-R$ 5,00')
    expect(formatMoney(341237, 'USD')).toBe('US$ 3.412,37')
  })

  it('converts foreign cents to BRL cents without float drift', () => {
    expect(convertToBRL(341237, 5.45)).toBe(1859742)
  })
})

describe('dates', () => {
  it('lists months across a year boundary', () => {
    expect(lastMonths('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })
})

describe('demo data', () => {
  const today = new Date(2026, 8, 27)
  const seed = buildSeed(today)

  it('has 4 institutions, 3 of them with a checking account and a credit card', () => {
    expect(seed.institutions).toHaveLength(4)
    for (const id of ['nubank', 'itau', 'inter']) {
      const types = seed.accounts.filter((a) => a.institutionId === id).map((a) => a.subtype)
      expect(types.sort()).toEqual(['CHECKING_ACCOUNT', 'CREDIT_CARD'])
    }
  })

  it('shows the Wise USD balance with its BRL value', () => {
    const usd = seed.accounts.find((a) => a.foreign?.currency === 'USD')!
    expect(usd.institutionId).toBe('wise')
    expect(usd.balance).toBe(convertToBRL(usd.foreign!.balance, usd.foreign!.rate))
  })

  it('is deterministic and never dated in the future', () => {
    expect(buildSeed(today)).toEqual(seed)
    expect(seed.transactions.every((t) => t.date <= '2026-09-27')).toBe(true)
  })

  it('has unique transaction ids, and categories that are defaults or none', () => {
    expect(new Set(seed.transactions.map((t) => t.id)).size).toBe(seed.transactions.length)
    expect(seed.transactions.every((t) => t.categoryId === null || byId.has(t.categoryId))).toBe(true)
    expect(seed.transactions.filter((t) => t.transfer).every((t) => t.categoryId === null)).toBe(true)
  })

  it('card payments balance out: paid from checking and received on the card', () => {
    const payments = seed.transactions.filter((t) => t.transfer === 'card-payment')
    expect(payments.length).toBeGreaterThan(0)
    expect(payments.reduce((s, t) => s + t.amount, 0)).toBe(0)
  })

  it('card bills equal the unpaid purchases and fit the limit', () => {
    for (const card of seed.accounts.filter((a) => a.type === 'CREDIT')) {
      const all = seed.transactions.filter((t) => t.accountId === card.id)
      expect(card.balance).toBe(-all.reduce((s, t) => s + t.amount, 0))
      expect(card.creditData!.availableCreditLimit).toBeLessThanOrEqual(card.creditData!.creditLimit - card.balance)
      expect(card.balance).toBeGreaterThan(0)
    }
  })

  it('net balance = accounts minus card bills', () => {
    const b = balances(seed.accounts)
    expect(b.net).toBe(b.cash - b.cardDebt)
  })
})

describe('filterTransactions', () => {
  const list = [
    tx(-10_00, 'restaurants', { description: 'iFood', date: '2026-09-01', accountId: 'n' }),
    tx(1000_00, 'salary', { description: 'Salário', date: '2026-08-05', accountId: 'i' }),
    tx(-20_00, null, { description: 'LOJA EXEMPLO', date: '2026-09-02', accountId: 'n' }),
    tx(-30_00, 'restaurants', { description: 'Hidden one', date: '2026-09-03', hidden: true }),
  ]
  it('filters by month, account, kind, category and text, and leaves hidden ones out', () => {
    expect(filterTransactions(list, byId, { month: '2026-09' })).toHaveLength(2)
    expect(filterTransactions(list, byId, { accountId: 'i' })[0].description).toBe('Salário')
    expect(filterTransactions(list, byId, { kind: 'income' })).toHaveLength(1)
    expect(filterTransactions(list, byId, { query: 'IFOOD' })).toHaveLength(1)
    expect(filterTransactions(list, byId, { categoryId: 'none' }).map((t) => t.description)).toEqual(['LOJA EXEMPLO'])
    expect(filterTransactions(list, byId, {})).toHaveLength(3)
  })
})

describe('average income', () => {
  const m = (month: string, income: number) => ({ month, income })
  it('averages the complete months and compares the current one', () => {
    const a = averageIncome([m('2026-05', 10_000_00), m('2026-06', 12_000_00), m('2026-07', 8_000_00), m('2026-08', 10_000_00), m('2026-09', 10_000_00), m('2026-10', 5_000_00)])!
    expect(a.average).toBe(10_000_00)
    expect(a.months).toBe(5)
    expect(a.lowest).toEqual({ month: '2026-07', amount: 8_000_00 })
    expect(a.highest).toEqual({ month: '2026-06', amount: 12_000_00 })
    expect(a.current).toEqual({ month: '2026-10', amount: 5_000_00, vsAverage: -50 })
  })

  it('needs at least one complete month', () => {
    expect(averageIncome([m('2026-10', 1_00)])).toBeNull()
    expect(averageIncome([])).toBeNull()
  })
})
