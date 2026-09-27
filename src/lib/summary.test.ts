import { describe, expect, it } from 'vitest'
import { buildSeed, categories } from '../data/seed'
import type { Transaction } from '../data/types'
import { balances, expensesByCategory, totals } from './summary'
import { formatMoney, convertToBRL } from './money'
import { lastMonths } from './dates'
import { filterTransactions } from '../pages/Transactions'

const byId = new Map(categories.map((c) => [c.id, c]))
const tx = (amount: number, categoryId: string, extra: Partial<Transaction> = {}): Transaction => ({
  id: String(Math.random()),
  accountId: 'a',
  date: '2026-09-10',
  description: 'x',
  amount,
  categoryId,
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
})

describe('expensesByCategory', () => {
  it('groups and sorts by amount', () => {
    const r = expensesByCategory([tx(-10_00, 'food'), tx(-50_00, 'groceries'), tx(-15_00, 'food'), tx(99_00, 'salary')], byId)
    expect(r.map((c) => [c.category.id, c.amount])).toEqual([
      ['groceries', 50_00],
      ['food', 25_00],
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

  it('has unique transaction ids and known categories', () => {
    expect(new Set(seed.transactions.map((t) => t.id)).size).toBe(seed.transactions.length)
    expect(seed.transactions.every((t) => byId.has(t.categoryId))).toBe(true)
  })

  it('card payments balance out: paid from checking and received on the card', () => {
    const payments = seed.transactions.filter((t) => t.categoryId === 'card-payment')
    expect(payments.length).toBeGreaterThan(0)
    expect(payments.reduce((s, t) => s + t.amount, 0)).toBe(0)
  })

  it('card bills equal the unpaid purchases and fit the limit', () => {
    for (const card of seed.accounts.filter((a) => a.type === 'CREDIT')) {
      const all = seed.transactions.filter((t) => t.accountId === card.id)
      expect(card.balance).toBe(-all.reduce((s, t) => s + t.amount, 0))
      expect(card.creditData!.availableCreditLimit).toBe(card.creditData!.creditLimit - card.balance)
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
    tx(-10_00, 'food', { description: 'iFood', date: '2026-09-01', accountId: 'n' }),
    tx(1000_00, 'salary', { description: 'Salário', date: '2026-08-05', accountId: 'i' }),
  ]
  const kindOf = (id: string) => byId.get(id)?.kind
  it('filters by month, account, kind and text', () => {
    expect(filterTransactions(list, kindOf, { month: '2026-09' })).toHaveLength(1)
    expect(filterTransactions(list, kindOf, { accountId: 'i' })[0].description).toBe('Salário')
    expect(filterTransactions(list, kindOf, { kind: 'income' })).toHaveLength(1)
    expect(filterTransactions(list, kindOf, { query: 'IFOOD' })).toHaveLength(1)
    expect(filterTransactions(list, kindOf, {})).toHaveLength(2)
  })
})
