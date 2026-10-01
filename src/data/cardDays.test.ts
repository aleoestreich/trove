import { describe, expect, it } from 'vitest'
import { applyCardDays, billDates } from './cardDays'
import { currentBill } from '../lib/bills'
import type { Account, Transaction } from './types'

const oct1 = new Date(2026, 9, 1)

describe('bill dates from the closing and due days', () => {
  it('points at the open bill once the previous one is past due', () => {
    expect(billDates({ close: 20, due: 27 }, oct1)).toEqual({ close: '2026-10-20', due: '2026-10-27' })
  })

  it('points at the closed bill while it is still to be paid (due day in the next month)', () => {
    expect(billDates({ close: 28, due: 5 }, oct1)).toEqual({ close: '2026-09-28', due: '2026-10-05' })
  })

  it('keeps the bill on its due day itself', () => {
    expect(billDates({ close: 28, due: 5 }, new Date(2026, 9, 5))).toEqual({ close: '2026-09-28', due: '2026-10-05' })
    expect(billDates({ close: 28, due: 5 }, new Date(2026, 9, 6))).toEqual({ close: '2026-10-28', due: '2026-11-05' })
  })

  it('clamps day 31 in short months', () => {
    expect(billDates({ close: 31, due: 7 }, new Date(2026, 9, 10))).toEqual({ close: '2026-10-31', due: '2026-11-07' })
    expect(billDates({ close: 31, due: 7 }, oct1)).toEqual({ close: '2026-09-30', due: '2026-10-07' })
  })
})

describe('applying the days to cards', () => {
  // Made-up card whose bank sends no dates.
  const card: Account = {
    id: 'card',
    institutionId: 'bank',
    name: 'Cartão',
    type: 'CREDIT',
    subtype: 'CREDIT_CARD',
    balance: 9_000_00,
    creditData: { creditLimit: 20_000_00, availableCreditLimit: 11_000_00, balanceCloseDate: null, balanceDueDate: null },
  }
  const bank: Account = { id: 'chk', institutionId: 'bank', name: 'Conta', type: 'BANK', subtype: 'CHECKING_ACCOUNT', balance: 100_00 }

  it("replaces the bank's dates on that card only", () => {
    const [c, b] = applyCardDays([card, bank], { card: { close: 20, due: 27 }, chk: { close: 1, due: 2 } }, oct1)
    expect(c.creditData).toMatchObject({ balanceCloseDate: '2026-10-20', balanceDueDate: '2026-10-27', userDays: { close: 20, due: 27 } })
    expect(b).toBe(bank)
  })

  it('lets the bill be worked out where it otherwise could not', () => {
    const tx: Transaction = { id: 't', accountId: 'card', date: '2026-09-25', description: 'LOJA EXEMPLO', amount: -150_00, categoryId: 'shopping', status: 'POSTED' }
    expect(currentBill(card, [tx], [], oct1)).toBeNull() // no dates: the app would show the whole balance
    const [withDays] = applyCardDays([card], { card: { close: 20, due: 27 } }, oct1)
    expect(currentBill(withDays, [tx], [], oct1)).toMatchObject({ amount: 150_00, closeDate: '2026-10-20', dueDate: '2026-10-27' })
  })
})
