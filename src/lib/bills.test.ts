import { describe, expect, it } from 'vitest'
import { buildSeed } from '../data/seed'
import type { Account, Transaction } from '../data/types'
import { currentBill, inBill, isIdleCard, upcomingBills } from './bills'
import { addMonths } from './dates'
import { installmentPlans } from './installments'

// Made-up card and amounts.
const card = (close: string | null, due: string | null): Account => ({
  id: 'card',
  institutionId: 'bank',
  name: 'Cartão',
  type: 'CREDIT',
  subtype: 'CREDIT_CARD',
  balance: 9_999_00, // everything owed on the card: not the bill
  creditData: { creditLimit: 20_000_00, availableCreditLimit: 10_001_00, balanceCloseDate: close, balanceDueDate: due },
})
/** `kind` "card-payment" makes a bill payment. */
const tx = (date: string, amount: number, kind = 'shopping'): Transaction => ({
  id: `${date}${amount}${kind}`,
  accountId: 'card',
  date,
  description: 'LOJA EXEMPLO',
  amount,
  ...(kind === 'card-payment' ? { categoryId: null, transfer: 'card-payment' as const } : { categoryId: kind }),
  status: 'POSTED',
})
const today = new Date(2026, 9, 1) // 1 Oct 2026

describe('current card bill (from the billing cycle)', () => {
  const txs = [
    tx('2026-09-20', -50_00), // previous bill (closing day)
    tx('2026-09-21', -100_00), // first day of this cycle
    tx('2026-10-01', -30_00),
    tx('2026-10-05', 20_00), // refund
    tx('2026-09-25', 400_00, 'card-payment'), // pays the previous bill
    tx('2026-10-21', -70_00), // next bill
  ]

  it('sums what is dated in the cycle, without bill payments', () => {
    const bill = currentBill(card('2026-10-20', '2026-10-27'), txs, [], today)
    expect(bill).toEqual({ amount: 110_00, closeDate: '2026-10-20', fromDate: '2026-09-20', expected: 0, dueDate: '2026-10-27', closed: false, paid: 0 })
  })

  it("picks out the bill's transactions: the card's, in the cycle, without bill payments", () => {
    const bill = currentBill(card('2026-10-20', '2026-10-27'), txs, [], today)!
    expect(txs.filter((t) => inBill(t, 'card', bill)).map((t) => t.date)).toEqual(['2026-09-21', '2026-10-01', '2026-10-05'])
    expect(inBill({ ...txs[1], accountId: 'other' }, 'card', bill)).toBe(false)
  })

  it('shows a closed bill until it is due', () => {
    const bill = currentBill(card('2026-09-28', '2026-10-05'), txs, [], today)!
    expect(bill.closed).toBe(true)
    expect(bill.amount).toBe(50_00 + 100_00) // 29 Aug to 28 Sep
  })

  it('moves stale dates forward to the bill that is not due yet', () => {
    const bill = currentBill(card('2026-07-20', '2026-07-27'), txs, [], today)!
    expect(bill).toMatchObject({ closeDate: '2026-10-20', dueDate: '2026-10-27', closed: false })
  })

  it('does not drift on month-end closing days', () => {
    // Closes on the 31st, due on the 7th: on 1 Oct the bill to pay is the one
    // that closed on 30 Sep (September has no 31st), due 7 Oct.
    const sep = [tx('2026-09-15', -80_00)]
    const bill = currentBill(card('2026-01-31', '2026-02-07'), sep, [], today)!
    expect(bill).toMatchObject({ closeDate: '2026-09-30', dueDate: '2026-10-07', closed: true, amount: 80_00 })
    // A month later it's back to the 31st, not the 30th.
    expect(currentBill(card('2026-01-31', '2026-02-07'), sep, [], new Date(2026, 9, 10))!.closeDate).toBe('2026-10-31')
  })

  it('adds installments expected in the cycle that are not in the data yet', () => {
    const inst = (number: number, date: string): Transaction => ({
      ...tx(date, -100_00),
      id: `i${number}`,
      installment: { number, total: 10, totalAmount: 1_000_00, purchaseDate: '2026-05-10' },
    })
    const plans = installmentPlans([inst(5, '2026-09-10')], today) // 6/10 expected on 10 Oct
    const bill = currentBill(card('2026-10-20', '2026-10-27'), [inst(5, '2026-09-10')], plans, today)!
    // 5/10 (10 Sep) belongs to the previous bill; 6/10 is expected on 10 Oct.
    expect(bill.amount).toBe(100_00)
    expect(bill.expected).toBe(100_00)
  })

  describe('a closed bill that has been paid', () => {
    // Closed 28 Sep, due 5 Oct; on 1 Oct it's waiting to be paid.
    const closedCard = card('2026-09-28', '2026-10-05')
    const cycleTxs = [tx('2026-09-10', -300_00), tx('2026-09-20', -200_00), tx('2026-09-30', -40_00)] // 500 closed, 40 open

    it('shows the closed bill while nothing has been paid', () => {
      expect(currentBill(closedCard, cycleTxs, [], today)).toMatchObject({ closeDate: '2026-09-28', closed: true, amount: 500_00, paid: 0 })
    })

    it('moves to the next cycle once it is paid, before the due date', () => {
      const paid = [...cycleTxs, tx('2026-09-30', 500_00, 'card-payment')]
      expect(currentBill(closedCard, paid, [], today)).toEqual({ amount: 40_00, closeDate: '2026-10-28', fromDate: '2026-09-28', expected: 0, dueDate: '2026-11-05', closed: false, paid: 0 })
    })

    it('allows a little rounding in the payment', () => {
      const paid = [...cycleTxs, tx('2026-09-30', 499_50, 'card-payment')]
      expect(currentBill(closedCard, paid, [], today)!.closed).toBe(false)
    })

    it("shows what's left when it's only partly paid", () => {
      const partly = [...cycleTxs, tx('2026-09-30', 200_00, 'card-payment')]
      expect(currentBill(closedCard, partly, [], today)).toMatchObject({ closed: true, amount: 300_00, paid: 200_00 })
    })

    it('ignores payments made before the bill closed (they paid the one before)', () => {
      const early = [...cycleTxs, tx('2026-09-27', 500_00, 'card-payment')]
      expect(currentBill(closedCard, early, [], today)).toMatchObject({ closed: true, amount: 500_00 })
    })
  })

  it('is null when the bank gives no closing date (the app then shows the balance)', () => {
    expect(currentBill(card(null, null), txs, [], today)).toBeNull()
  })

  it('matches the demo bills, which follow the same cycle rule', () => {
    // The demo balance is the unpaid bill; the bill also counts installments
    // still to post before it closes.
    const day = new Date(2026, 8, 27)
    const seed = buildSeed(day)
    const plans = installmentPlans(seed.transactions, day)
    for (const c of seed.accounts.filter((a) => a.type === 'CREDIT')) {
      const bill = currentBill(c, seed.transactions, plans, day)!
      const from = addMonths(bill.closeDate, -1)
      const expected = plans
        .filter((p) => p.accountId === c.id)
        .flatMap((p) => p.upcoming)
        .filter((u) => u.date > from && u.date <= bill.closeDate)
        .reduce((sum, u) => sum + u.amount, 0)
      expect(bill.amount).toBe(c.balance + expected)
    }
  })

})

describe('cards with nothing in the current or future cycles', () => {
  const inst = (number: number, date: string): Transaction => ({
    ...tx(date, -100_00),
    id: `i${number}`,
    installment: { number, total: 10, totalAmount: 1_000_00, purchaseDate: '2026-02-10' },
  })
  const open = card('2026-10-20', '2026-10-27')

  it('hides a card with no bill and no installments to come', () => {
    expect(isIdleCard(open, [tx('2026-08-10', -90_00)], [], today)).toBe(true) // only old spending
  })

  it('keeps a card with something on the current bill', () => {
    expect(isIdleCard(open, [tx('2026-09-25', -90_00)], [], today)).toBe(false)
  })

  it('keeps a card with installments still to come, even with nothing on this bill', () => {
    const plans = installmentPlans([inst(5, '2026-09-10')], today)
    expect(isIdleCard(open, [], plans, today)).toBe(false)
  })

  it('keeps a card with a closed bill still to be paid', () => {
    expect(isIdleCard(card('2026-09-28', '2026-10-05'), [tx('2026-09-15', -90_00)], [], today)).toBe(false)
  })

  it('hides it once that closed bill is paid and nothing new came in', () => {
    const paid = [tx('2026-09-15', -90_00), tx('2026-09-30', 90_00, 'card-payment')]
    expect(isIdleCard(card('2026-09-28', '2026-10-05'), paid, [], today)).toBe(true)
  })

  it('uses the balance when the bank gives no closing date', () => {
    expect(isIdleCard({ ...card(null, null), balance: 0 }, [], [], today)).toBe(true)
    expect(isIdleCard(card(null, null), [], [], today)).toBe(false) // balance 9.999,00
  })

  it('never hides bank accounts', () => {
    expect(isIdleCard({ ...card(null, null), type: 'BANK', subtype: 'CHECKING_ACCOUNT', balance: 0, creditData: undefined }, [], [], today)).toBe(false)
  })
})

describe('upcoming bills', () => {
  const card: Account = {
    id: 'c',
    institutionId: 'b',
    name: 'Cartão',
    type: 'CREDIT',
    subtype: 'CREDIT_CARD',
    balance: 0,
    creditData: { creditLimit: 0, availableCreditLimit: 0, balanceCloseDate: '2026-10-22', balanceDueDate: '2026-11-01' },
  }
  const buy = (date: string, amount: number): Transaction => ({ id: date, accountId: 'c', date, description: 'LOJA EXEMPLO', amount, categoryId: null, status: 'POSTED' })
  // Bills of R$ 1.000 closing on the 22nd of July, August and September; R$ 200 so far in the open one.
  const txs = [buy('2026-07-10', -1_000_00), buy('2026-08-10', -1_000_00), buy('2026-09-10', -1_000_00), buy('2026-10-05', -200_00)]

  it('estimates a bill still open from the last 3, and lists the ones due up to the date', () => {
    const today = new Date('2026-10-12T12:00:00')
    expect(upcomingBills(card, txs, [], today, '2026-10-31')).toEqual([])
    const bills = upcomingBills(card, txs, [], today, '2026-12-01')
    expect(bills.map((b) => [b.dueDate, b.amount, b.estimated])).toEqual([
      ['2026-11-01', 1_000_00, true],
      ['2026-12-01', 1_000_00, true],
    ])
    // More than the average so far: what's in it.
    const big = upcomingBills(card, [...txs, buy('2026-10-06', -1_500_00)], [], today, '2026-11-30')
    expect(big.map((b) => [b.dueDate, b.amount, b.estimated])).toEqual([['2026-11-01', 1_700_00, false]])
  })
})
