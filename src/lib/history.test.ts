import { describe, expect, it } from 'vitest'
import { buildSeed, MONTHS_OF_HISTORY } from '../data/seed'
import type { Account, Transaction } from '../data/types'
import { balances } from './summary'
import { balanceHistory, cashByCurrency, cashByInstitution } from './history'
import { lastMonths } from './dates'

const tx = (accountId: string, date: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: `${accountId}-${date}-${amount}`,
  accountId,
  date,
  description: 'x',
  amount,
  categoryId: 'other-expense',
  status: 'POSTED',
  ...extra,
})

describe('balanceHistory', () => {
  const accounts: Account[] = [
    { id: 'chk', institutionId: 'b', name: 'Checking', type: 'BANK', subtype: 'CHECKING_ACCOUNT', balance: 1_000_00 },
    { id: 'card', institutionId: 'b', name: 'Card', type: 'CREDIT', subtype: 'CREDIT_CARD', balance: 300_00 },
    {
      id: 'usd',
      institutionId: 'w',
      name: 'USD',
      type: 'BANK',
      subtype: 'CHECKING_ACCOUNT',
      balance: 550_00,
      foreign: { currency: 'USD', balance: 100_00, rate: 5.5 },
    },
  ]
  const transactions = [
    tx('chk', '2026-09-05', 400_00), // Sept salary
    tx('chk', '2026-08-05', 400_00),
    tx('card', '2026-09-10', -300_00), // Sept purchase, still owed
    tx('usd', '2026-09-15', 250_00, { foreign: { currency: 'USD', amount: 50_00 } }), // 5.0 BRL/USD
  ]

  it('leaves hidden transactions out: they never move the line', () => {
    const hidden = [...transactions, tx('chk', '2026-09-20', -5_000_00, { hidden: true }), tx('card', '2026-09-21', -900_00, { hidden: true })]
    const months = ['2026-08', '2026-09']
    expect(balanceHistory(accounts, hidden, months)).toEqual(balanceHistory(accounts, transactions, months))
  })

  it('rebuilds month-end balances backwards from today', () => {
    const [jul, aug, sep] = balanceHistory(accounts, transactions, ['2026-07', '2026-08', '2026-09'])
    expect(sep).toEqual({ month: '2026-09', cash: 1_550_00, cardDebt: 300_00, net: 1_250_00 })
    // End of August: before Sept salary and card purchase; USD 50 at today's rate (no Aug USD txs).
    expect(aug).toEqual({ month: '2026-08', cash: 600_00 + 275_00, cardDebt: 0, net: 875_00 })
    expect(jul.cash).toBe(200_00 + 275_00)
  })

  it('converts a foreign balance at the rate of that month when there were transactions', () => {
    const withAugUsd = [...transactions, tx('usd', '2026-08-20', 90_00, { foreign: { currency: 'USD', amount: 20_00 } })]
    const [jul, aug] = balanceHistory(accounts, withAugUsd, ['2026-07', '2026-08'])
    expect(aug.cash - 600_00).toBe(Math.round(50_00 * 4.5)) // USD 50 at Aug's 4.5
    expect(jul.cash - 200_00).toBe(Math.round(30_00 * 5.5)) // USD 30, no Jul txs -> today's rate
  })
})

describe('balance history of the demo data', () => {
  const today = new Date(2026, 8, 27)
  const seed = buildSeed(today)
  const months = lastMonths('2026-09', MONTHS_OF_HISTORY)
  const history = balanceHistory(seed.accounts, seed.transactions, months)

  it('ends at today’s balances', () => {
    const now = balances(seed.accounts)
    expect(history.at(-1)).toMatchObject({ cash: now.cash, cardDebt: now.cardDebt, net: now.net })
  })

  it('never shows a negative bank balance at a month end', () => {
    for (const month of months) {
      for (const a of seed.accounts.filter((x) => x.type === 'BANK')) {
        const [point] = balanceHistory([a], seed.transactions, [month])
        expect(point.cash, `${a.id} ${month}`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('splits cash by institution and currency, adding up to the total', () => {
    const names = new Map(seed.institutions.map((i) => [i.id, i.name]))
    const cash = balances(seed.accounts).cash
    expect(cashByInstitution(seed.accounts, names).reduce((s, x) => s + x.amount, 0)).toBe(cash)
    const currencies = cashByCurrency(seed.accounts)
    expect(currencies.map((c) => c.id).sort()).toEqual(['BRL', 'USD'])
    expect(currencies.reduce((s, x) => s + x.amount, 0)).toBe(cash)
  })
})
