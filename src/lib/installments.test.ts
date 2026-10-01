import { describe, expect, it } from 'vitest'
import { buildSeed } from '../data/seed'
import type { Transaction } from '../data/types'
import { installmentPlans, purchaseDescription, remainingByAccount, upcomingByMonth } from './installments'

const inst = (number: number, date: string, amount: number): Transaction => ({
  id: `t${number}`,
  accountId: 'card',
  date,
  description: 'Geladeira',
  amount: -amount,
  categoryId: 'shopping',
  status: 'POSTED',
  installment: { number, total: 12, totalAmount: 4_299_90, purchaseDate: '2026-04-14' },
})

describe('installmentPlans', () => {
  // 4.299,90 in 12x: first installment 358,38, the rest 358,32.
  const charged = [inst(1, '2026-04-14', 358_38), inst(2, '2026-05-14', 358_32), inst(3, '2026-06-14', 358_32)]
  const [plan] = installmentPlans(charged, new Date(2026, 5, 20))

  it('rebuilds the purchase from its charged installments', () => {
    expect(plan.charged).toBe(3)
    expect(plan.count).toBe(12)
    expect(plan.chargedAmount).toBe(1_075_02)
    expect(plan.remaining).toBe(4_299_90 - 1_075_02)
  })

  it('projects the remaining installments month by month, summing exactly', () => {
    expect(plan.upcoming).toHaveLength(9)
    expect(plan.upcoming[0]).toMatchObject({ number: 4, month: '2026-07' })
    expect(plan.upcoming.at(-1)).toMatchObject({ number: 12, month: '2027-03' })
    expect(plan.upcoming.reduce((s, u) => s + u.amount, 0)).toBe(plan.remaining)
  })

  it('works out what is left when earlier installments are outside the fetched history', () => {
    // Only 7/12 and 8/12 were fetched; 1..6 were charged before the window.
    const [p] = installmentPlans([inst(7, '2026-10-14', 358_32), inst(8, '2026-11-14', 358_32)])
    expect(p.charged).toBe(8)
    expect(p.remaining).toBe(4 * 358_32)
    expect(p.chargedAmount + p.remaining).toBe(p.totalAmount)
    expect(p.upcoming).toHaveLength(4)
    expect(p.upcoming.reduce((s, u) => s + u.amount, 0)).toBe(p.remaining)
  })

  it('treats a fully charged purchase as paid off', () => {
    const done = installmentPlans([
      { ...inst(1, '2026-01-10', 150_00), installment: { number: 1, total: 2, totalAmount: 300_00, purchaseDate: '2026-01-10' } },
      { ...inst(2, '2026-02-10', 150_00), installment: { number: 2, total: 2, totalAmount: 300_00, purchaseDate: '2026-01-10' } },
    ])
    expect(done[0].remaining).toBe(0)
    expect(done[0].upcoming).toEqual([])
  })
})

describe('installments whose description carries the number ("LOJA EXEMPLO 04/10")', () => {
  // Some banks put the number in the description, send no purchase date (so
  // each falls back to its own charge date), and the charge days drift.
  // Made-up shop and amounts.
  const inst = (number: number, date: string, id = `i${number}`): Transaction => ({
    id,
    accountId: 'card',
    date,
    description: `LOJA EXEMPLO ${String(number).padStart(2, '0')}/10`,
    amount: -150_00,
    categoryId: 'shopping',
    status: 'POSTED',
    installment: { number, total: 10, totalAmount: 10 * 150_00, purchaseDate: date },
  })
  const today = new Date(2026, 7, 15)
  const plans = installmentPlans([inst(4, '2026-05-28'), inst(5, '2026-07-02'), inst(6, '2026-08-01')], today)

  it('counts 04/10, 05/10 and 06/10 as one purchase', () => {
    expect(plans).toHaveLength(1)
    expect(plans[0]).toMatchObject({ description: 'LOJA EXEMPLO', count: 10, charged: 6 })
  })

  it('owes the installments left once, not once per installment', () => {
    expect(plans[0].remaining).toBe(4 * 150_00)
    expect(plans[0].upcoming).toHaveLength(4)
    expect(plans[0].upcoming.at(-1)!.month).toBe('2026-12')
  })

  it('keeps two purchases apart when the same shop has the same installment twice', () => {
    const two = installmentPlans([inst(5, '2026-07-02', 'a5'), inst(6, '2026-08-01', 'a6'), inst(5, '2026-08-01', 'b5'), inst(6, '2026-09-01', 'b6')], new Date(2026, 8, 15))
    expect(two).toHaveLength(2)
    expect(two.reduce((s, p) => s + p.remaining, 0)).toBe(2 * 4 * 150_00)
  })

  it('keeps purchases bought months apart apart', () => {
    expect(installmentPlans([inst(2, '2026-03-05', 'x'), inst(2, '2026-08-05', 'y')])).toHaveLength(2)
  })

  it('strips the common installment markers, and only the matching numbers', () => {
    const d = (description: string, number: number, total: number) =>
      purchaseDescription({ ...inst(number, '2026-01-01'), description, installment: { number, total, totalAmount: 0, purchaseDate: '2026-01-01' } })
    expect(d('LOJA EXEMPLO 04/10', 4, 10)).toBe('LOJA EXEMPLO')
    expect(d('MAGAZINE PARC 4/10', 4, 10)).toBe('MAGAZINE')
    expect(d('Geladeira (3 de 12)', 3, 12)).toBe('Geladeira')
    expect(d('LOJA 14/18', 4, 18)).toBe('LOJA 14/18') // a different number is left alone
    expect(d('Geladeira', 3, 12)).toBe('Geladeira')
  })
})

describe('installments projected into months that have passed', () => {
  // The latest installment found is 4/10 in May; it's now October. 5/10 to
  // 8/10 would have been billed June to September: they count as charged.
  const inst = (number: number, date: string): Transaction => ({
    id: `p${number}`,
    accountId: 'card',
    date,
    description: 'LOJA EXEMPLO',
    amount: -100_00,
    categoryId: 'shopping',
    status: 'POSTED',
    installment: { number, total: 10, totalAmount: 1_000_00, purchaseDate: '2026-02-10' },
  })
  const october = new Date(2026, 9, 1)

  it('never projects an installment into a past month', () => {
    const [plan] = installmentPlans([inst(3, '2026-04-10'), inst(4, '2026-05-10')], october)
    expect(plan.upcoming.map((u) => [u.number, u.month])).toEqual([
      [9, '2026-10'],
      [10, '2026-11'],
    ])
    expect(upcomingByMonth([plan]).every((m) => m.month >= '2026-10')).toBe(true)
  })

  it('counts those installments as charged, so only what is still due is owed', () => {
    const [plan] = installmentPlans([inst(3, '2026-04-10'), inst(4, '2026-05-10')], october)
    expect(plan).toMatchObject({ charged: 8, assumedCharged: 4, remaining: 200_00 })
    expect(plan.chargedAmount + plan.remaining).toBe(plan.totalAmount)
  })

  it('moves a purchase whose last installment month has passed to paid off', () => {
    const [plan] = installmentPlans([inst(7, '2026-05-10')], october)
    expect(plan).toMatchObject({ charged: 10, remaining: 0, upcoming: [] })
  })

  it('keeps the current month as upcoming', () => {
    const [plan] = installmentPlans([inst(9, '2026-09-10')], october)
    expect(plan.upcoming).toEqual([{ number: 10, date: '2026-10-10', month: '2026-10', amount: 100_00 }])
    expect(plan.assumedCharged).toBe(0)
  })
})

describe('installments in the demo data', () => {
  const today = new Date(2026, 8, 27)
  const seed = buildSeed(today)
  const plans = installmentPlans(seed.transactions)

  it('has active and finished installment purchases', () => {
    expect(plans.some((p) => p.remaining > 0)).toBe(true)
    expect(plans.some((p) => p.remaining === 0)).toBe(true)
  })

  it('available card limit = limit - open bill - installments not charged yet', () => {
    const future = remainingByAccount(plans)
    for (const card of seed.accounts.filter((a) => a.type === 'CREDIT')) {
      const c = card.creditData!
      expect(c.availableCreditLimit).toBe(c.creditLimit - card.balance - (future.get(card.id) ?? 0))
    }
  })

  it('only projects future months', () => {
    expect(upcomingByMonth(plans).every((m) => m.month >= '2026-09')).toBe(true)
  })

  it('never charges more than the purchase total', () => {
    for (const p of plans) expect(p.chargedAmount + p.remaining).toBe(p.totalAmount)
  })
})
