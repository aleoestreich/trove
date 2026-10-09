import { describe, expect, it } from 'vitest'
import { fgtsDue, fgtsLatest, type Fgts } from './fgts'

const on = (...entries: [string, number][]): Fgts => ({ tracking: true, entries: entries.map(([date, balance], i) => ({ id: `e${i}`, date, balance })) })

describe('FGTS', () => {
  it('gives the latest balance and the change since the one before', () => {
    expect(fgtsLatest(on(['2026-08-21', 10_000_00], ['2026-09-22', 10_850_00]))).toEqual({ latest: { id: 'e1', date: '2026-09-22', balance: 10_850_00 }, change: 850_00 })
    expect(fgtsLatest(on(['2026-09-22', 10_850_00]))?.change).toBeNull()
    expect(fgtsLatest(on())).toBeNull()
  })

  it('reminds from the 20th when the month has no balance yet', () => {
    const fgts = on(['2026-09-22', 10_000_00])
    expect(fgtsDue(fgts, '2026-10-19')).toBe(false)
    expect(fgtsDue(fgts, '2026-10-20')).toBe(true)
    expect(fgtsDue(on(['2026-10-02', 10_000_00]), '2026-10-25')).toBe(false) // already updated this month
  })

  it('reminds when the latest balance is more than a month old, whatever the day', () => {
    expect(fgtsDue(on(['2026-09-04', 10_000_00]), '2026-10-04')).toBe(false)
    expect(fgtsDue(on(['2026-09-04', 10_000_00]), '2026-10-05')).toBe(true)
  })

  it('reminds when tracking starts without a balance, and never when tracking is off', () => {
    expect(fgtsDue(on(), '2026-10-05')).toBe(true)
    expect(fgtsDue({ tracking: false, entries: [] }, '2026-10-25')).toBe(false)
  })
})
