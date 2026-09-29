import { describe, expect, it } from 'vitest'
import { buildSeed } from '../data/seed'
import type { Transaction } from '../data/types'
import { installmentPlans, remainingByAccount, upcomingByMonth } from './installments'

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
  const [plan] = installmentPlans(charged)

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
