import { describe, expect, it } from 'vitest'
import { buildSeed } from '../data/seed'
import { balances } from './summary'
import { cashByCurrency, cashByInstitution } from './history'

describe('where the money is (demo data)', () => {
  const seed = buildSeed(new Date(2026, 8, 27))

  it('splits cash by institution and currency, adding up to the total', () => {
    const names = new Map(seed.institutions.map((i) => [i.id, i.name]))
    const cash = balances(seed.accounts).cash
    expect(cashByInstitution(seed.accounts, names).reduce((s, x) => s + x.amount, 0)).toBe(cash)
    const currencies = cashByCurrency(seed.accounts)
    expect(currencies.map((c) => c.id).sort()).toEqual(['BRL', 'USD'])
    expect(currencies.reduce((s, x) => s + x.amount, 0)).toBe(cash)
  })

  it('net worth is the accounts’ balances minus the cards’ bills', () => {
    const b = balances(seed.accounts)
    const cash = seed.accounts.filter((a) => a.type === 'BANK').reduce((s, a) => s + a.balance, 0)
    const debt = seed.accounts.filter((a) => a.type === 'CREDIT').reduce((s, a) => s + a.balance, 0)
    expect(b).toEqual({ cash, cardDebt: debt, net: cash - debt })
  })
})
