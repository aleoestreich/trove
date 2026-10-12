import { describe, expect, it } from 'vitest'
import { bankHolidays, businessDayOnOrBefore, easter, isBusinessDay } from './holidays'

describe('Brazilian bank holidays', () => {
  it('finds Easter', () => {
    expect(easter(2024)).toBe('2024-03-31')
    expect(easter(2025)).toBe('2025-04-20')
    expect(easter(2026)).toBe('2026-04-05')
    expect(easter(2027)).toBe('2027-03-28')
  })

  it('lists the national holidays, Carnival and Corpus Christi', () => {
    expect([...bankHolidays(2026)].sort()).toEqual([
      '2026-01-01',
      '2026-02-16', // Carnival Monday
      '2026-02-17', // Carnival Tuesday
      '2026-04-03', // Good Friday
      '2026-04-21',
      '2026-05-01',
      '2026-06-04', // Corpus Christi
      '2026-09-07',
      '2026-10-12',
      '2026-11-02',
      '2026-11-15',
      '2026-11-20',
      '2026-12-25',
    ])
    // Black Consciousness Day is national from 2024.
    expect(bankHolidays(2023).has('2023-11-20')).toBe(false)
  })

  it('falls back to the working day before', () => {
    expect(isBusinessDay('2026-10-13')).toBe(true)
    expect(businessDayOnOrBefore('2026-10-13')).toBe('2026-10-13')
    // Monday the 12th is a holiday: Friday the 9th.
    expect(businessDayOnOrBefore('2026-10-12')).toBe('2026-10-09')
    // Sunday 5 April 2026, after Good Friday: Thursday the 2nd.
    expect(businessDayOnOrBefore('2026-04-05')).toBe('2026-04-02')
    // Ash Wednesday's eve: back past Carnival to Friday 13 February.
    expect(businessDayOnOrBefore('2026-02-17')).toBe('2026-02-13')
  })
})
