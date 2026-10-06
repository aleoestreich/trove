import { describe, expect, it } from 'vitest'
import { buildSeed } from '../data/seed'
import type { Account, Transaction } from '../data/types'
import { currentBill, inBill, isIdleCard } from './bills'
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
const tx = (date: string, amount: number, categoryId = 'shopping'): Transaction => ({
  id: `${date}${amount}${categoryId}`,
  accountId: 'card',
  date,
  description: 'LOJA EXEMPLO',
  amount,
  categoryId,
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
    expect(bill).toEqual({ amount: 110_00, closeDate: '2026-10-20', fromDate: '2026-09-20', expected: 0, dueDate: '2026-10-27', closed: false, paid: 0, source: 'cycle' })
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
      expect(currentBill(closedCard, paid, [], today)).toEqual({ amount: 40_00, closeDate: '2026-10-28', fromDate: '2026-09-28', expected: 0, dueDate: '2026-11-05', closed: false, paid: 0, source: 'cycle' })
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

  describe("the bank's own bills", () => {
    // Without the 25 Sep bill payment, so the bank's bill starts unpaid.
    const unpaid = txs.filter((t) => t.categoryId !== 'card-payment')
    const withBill = (close: string, due: string, lastBill: { id: string; dueDate: string; amount: number }): Account => {
      const c = card(close, due)
      return { ...c, creditData: { ...c.creditData!, lastBill } }
    }

    it("uses the bank's closed bill total while it isn't due yet", () => {
      // The dates point at the open cycle, but a bill closed on 20 Sep is due on 5 Oct: that's what to pay now.
      const c = withBill('2026-10-20', '2026-10-27', { id: 'bill-sep', dueDate: '2026-10-05', amount: 1_234_00 })
      expect(currentBill(c, unpaid, [], today)).toEqual({
        amount: 1_234_00, closeDate: '2026-09-20', fromDate: '2026-08-20', expected: 0, dueDate: '2026-10-05', closed: true, paid: 0, source: 'bank-bill', billId: 'bill-sep',
      })
    })

    it('ignores a closed bill that is already due', () => {
      const c = withBill('2026-10-20', '2026-10-27', { id: 'bill-aug', dueDate: '2026-09-27', amount: 1_234_00 })
      expect(currentBill(c, txs, [], today)!.source).toBe('cycle')
    })

    it("moves on once the bank's bill is paid, and shows what's left when partly paid", () => {
      const c = withBill('2026-10-20', '2026-10-27', { id: 'bill-sep', dueDate: '2026-10-05', amount: 600_00 })
      const partly = [...unpaid, tx('2026-09-30', 200_00, 'card-payment')]
      expect(currentBill(c, partly, [], today)).toMatchObject({ source: 'bank-bill', amount: 400_00, paid: 200_00 })
      const paid = [...unpaid, tx('2026-09-30', 600_00, 'card-payment')]
      expect(currentBill(c, paid, [], today)).toMatchObject({ closed: false, closeDate: '2026-10-20', source: 'cycle' })
    })

    const tagged = [
      { ...tx('2026-09-10', -500_00), billId: 'bill-sep' }, // billed (previous)
      { ...tx('2026-09-12', -80_00), billId: 'bill-sep' },
      tx('2026-09-18', -40_00), // before the cycle by the dates, but not billed yet
      tx('2026-10-01', -30_00),
      tx('2026-09-25', 400_00, 'card-payment'),
    ]

    it('sums the transactions not on any bill yet, when the bank tags billed ones', () => {
      const bill = currentBill(card('2026-10-20', '2026-10-27'), tagged, [], today)!
      expect(bill).toMatchObject({ amount: 70_00, source: 'unbilled', closed: false, closeDate: '2026-10-20' })
      expect(tagged.filter((t) => inBill(t, 'card', bill)).map((t) => t.date)).toEqual(['2026-09-18', '2026-10-01'])
    })

    it("picks out the bank bill's transactions by its tag", () => {
      const c = withBill('2026-10-20', '2026-10-27', { id: 'bill-sep', dueDate: '2026-10-05', amount: 580_00 })
      const bill = currentBill(c, tagged, [], today)!
      expect(tagged.filter((t) => inBill(t, 'card', bill)).map((t) => t.date)).toEqual(['2026-09-10', '2026-09-12'])
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
