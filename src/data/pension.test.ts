import { describe, expect, it } from 'vitest'
import { pensionDue, pensionTotal, planDue, planLatest, type Pension, type PensionPlan } from './pension'

const plan = (id: string, ...entries: [string, number][]): PensionPlan => ({
  id,
  name: `Plano ${id}`,
  type: null,
  entries: entries.map(([date, balance], i) => ({ id: `${id}-${i}`, date, balance })),
})

describe('previdência privada', () => {
  it('gives each plan’s latest balance and its change', () => {
    expect(planLatest(plan('a', ['2026-08-10', 20_000_00], ['2026-09-10', 20_300_00]))).toEqual({ latest: { id: 'a-1', date: '2026-09-10', balance: 20_300_00 }, change: 300_00 })
    expect(planLatest(plan('a'))).toBeNull()
  })

  it('adds up the plans’ latest balances, up to the newest of their dates', () => {
    const p: Pension = { tracking: true, plans: [plan('a', ['2026-08-10', 1_000_00], ['2026-09-10', 2_000_00]), plan('b', ['2026-09-02', 500_00]), plan('c')] }
    expect(pensionTotal(p)).toEqual({ total: 2_500_00, upTo: '2026-09-10', plans: 2 })
    expect(pensionTotal({ tracking: true, plans: [plan('c')] })).toBeNull()
  })

  it('asks for an update when a plan has no balance, or its latest is more than a month old', () => {
    expect(planDue(plan('a', ['2026-09-09', 1_000_00]), '2026-10-09')).toBe(false)
    expect(planDue(plan('a', ['2026-09-08', 1_000_00]), '2026-10-09')).toBe(true)
    expect(planDue(plan('a'), '2026-10-09')).toBe(true)
  })

  it('lists the plans to update only while tracking', () => {
    const plans = [plan('a', ['2026-09-20', 1_000_00]), plan('b', ['2026-08-01', 1_000_00])]
    expect(pensionDue({ tracking: true, plans }, '2026-10-09').map((p) => p.id)).toEqual(['b'])
    expect(pensionDue({ tracking: false, plans }, '2026-10-09')).toEqual([])
  })
})
