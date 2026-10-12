import { describe, expect, it } from 'vitest'
import { applyEdit, EditError, validateEdit } from './edits'
import {
  DEFAULT_EXTRA_PAY,
  extraPayments,
  firstPartDate,
  isExtraPay,
  normalizeExtraPay,
  salaryCut,
  salaryCuts,
  secondPartDate,
  vacationPay,
  vacationPayday,
} from './extraPay'
import type { ExtraPay, Snapshot, Vacation } from './types'

const SALARY = 6_000_00
const vacation = (start: string, days = 30, sold = false, id = start): Vacation => ({ id, start, days, sold })
const on = (over: Partial<ExtraPay> = {}): ExtraPay => ({ ...DEFAULT_EXTRA_PAY, enabled: true, ...over })

describe('13º e férias', () => {
  it('is off by default and expects nothing while off', () => {
    expect(DEFAULT_EXTRA_PAY.enabled).toBe(false)
    expect(extraPayments({ ...DEFAULT_EXTRA_PAY, vacations: [vacation('2026-11-02')] }, SALARY, '2026-01-01', '2027-12-31')).toEqual([])
    expect(salaryCut({ ...DEFAULT_EXTRA_PAY, vacations: [vacation('2026-11-02')] }, SALARY, '2026-11')).toBe(0)
  })

  it('pays the 13º in two halves: by 30 November and by 20 December, on business days', () => {
    expect(firstPartDate(on(), 2026)).toBe('2026-11-30')
    // 20 December 2026 is a Sunday.
    expect(secondPartDate(2026)).toBe('2026-12-18')
    // An earlier month; February has no 30th.
    expect(firstPartDate(on({ firstPart: 7 }), 2026)).toBe('2026-07-30')
    expect(firstPartDate(on({ firstPart: 2 }), 2026)).toBe('2026-02-27')
    expect(extraPayments(on(), 6_000_01, '2026-01-01', '2026-12-31').map((p) => [p.date, p.kind, p.amount])).toEqual([
      ['2026-11-30', 'thirteenth', 3_000_01],
      ['2026-12-18', 'thirteenth', 3_000_00],
    ])
  })

  it('pays the vacation 2 days before it starts, with a third more, and the 10 days sold', () => {
    // 2 November 2026 is a Monday: 31 October is a Saturday, so Friday the 30th.
    expect(vacationPayday(vacation('2026-11-02'))).toBe('2026-10-30')
    expect(vacationPay(vacation('2026-11-02', 30), SALARY)).toBe(8_000_00)
    expect(vacationPay(vacation('2026-11-02', 15), SALARY)).toBe(4_000_00)
    expect(vacationPay(vacation('2026-11-02', 20, true), SALARY)).toBe(8_000_00)
  })

  it('takes the 13º\'s 1st part with the vacation pay when asked, else in November', () => {
    const ep = on({ firstPart: 'vacation', vacations: [vacation('2026-07-06', 20)] })
    expect(firstPartDate(ep, 2026)).toBe(vacationPayday(ep.vacations[0]))
    expect(firstPartDate(ep, 2027)).toBe('2027-11-30')
    // A December vacation doesn't bring it.
    expect(firstPartDate(on({ firstPart: 'vacation', vacations: [vacation('2026-12-07')] }), 2026)).toBe('2026-11-30')
  })

  it('makes the salary smaller by the vacation days in each month', () => {
    const ep = on({ vacations: [vacation('2026-11-20', 20)] })
    // 20–30 November: 11 days; 1–9 December: 9 days.
    expect(salaryCut(ep, SALARY, '2026-11')).toBe(2_200_00)
    expect(salaryCut(ep, SALARY, '2026-12')).toBe(1_800_00)
    expect(salaryCut(ep, SALARY, '2026-10')).toBe(0)
    expect(salaryCuts(ep, SALARY, '2026-10-12', '2027-10-11')).toEqual([
      { month: '2026-11', days: 11, amount: 2_200_00 },
      { month: '2026-12', days: 9, amount: 1_800_00 },
    ])
    // A whole month off: no salary that month, never less.
    expect(salaryCut(on({ vacations: [vacation('2027-01-01', 30), vacation('2027-01-31', 5, false, 'b')] }), SALARY, '2027-01')).toBe(SALARY)
  })

  it('accepts only valid settings', () => {
    const good = on({ salary: SALARY, firstPart: 'vacation', vacations: [vacation('2026-12-01', 20, true), vacation('2026-07-01', 10)] })
    expect(isExtraPay(good)).toBe(true)
    // Vacations come back by start date.
    expect(validateEdit({ op: 'setExtraPay', extraPay: good })).toEqual({ op: 'setExtraPay', extraPay: { ...good, vacations: [good.vacations[1], good.vacations[0]] } })
    const bad: unknown[] = [
      { ...good, enabled: 'yes' },
      { ...good, salary: 0 },
      { ...good, salary: 10.5 },
      { ...good, firstPart: 12 },
      { ...good, firstPart: 1 },
      { ...good, vacations: [vacation('2026-07-01', 4)] },
      { ...good, vacations: [vacation('2026-07-01', 31)] },
      // Selling 10 days leaves at most 20 off.
      { ...good, vacations: [vacation('2026-07-01', 21, true)] },
      { ...good, vacations: [vacation('2026-02-30')] },
      { ...good, vacations: [vacation('2026-07-01'), vacation('2026-08-01', 30, false, '2026-07-01')] },
      { ...good, vacations: Array.from({ length: 13 }, (_, i) => vacation(`2027-01-${String(i + 1).padStart(2, '0')}`, 5)) },
      null,
    ]
    for (const extraPay of bad) expect(() => validateEdit({ op: 'setExtraPay', extraPay }), JSON.stringify(extraPay)).toThrow(EditError)
    expect(normalizeExtraPay({ enabled: 'x' })).toEqual(DEFAULT_EXTRA_PAY)
    expect(normalizeExtraPay(undefined)).toEqual(DEFAULT_EXTRA_PAY)
  })

  it('applies the edit to the snapshot', () => {
    const s: Snapshot = { institutions: [], accounts: [], categories: [], subcategories: [], transactions: [], source: 'demo' }
    expect(applyEdit(s, { op: 'setExtraPay', extraPay: on() }).extraPay).toEqual(on())
  })
})
