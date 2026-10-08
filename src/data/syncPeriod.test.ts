import { describe, expect, it } from 'vitest'
import { ALL_HISTORY, periodStart } from './syncPeriod'

describe('advanced sync period', () => {
  it('starts on the 1st of the month that makes 3, 6 or 12 months with the current one', () => {
    expect(periodStart('3m', '2026-10-08')).toBe('2026-08-01')
    expect(periodStart('6m', '2026-10-08')).toBe('2026-05-01')
    expect(periodStart('1y', '2026-10-08')).toBe('2025-11-01')
    expect(periodStart('3m', '2026-01-31')).toBe('2025-11-01')
  })

  it('reads everything the bank has for "all"', () => {
    expect(periodStart('all', '2026-10-08')).toBe(ALL_HISTORY)
    expect(ALL_HISTORY < '2025-01-01').toBe(true)
  })
})
