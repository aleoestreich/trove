// "13º e férias": the extra pay of a CLT job (carteira assinada), off by
// default. Shared by the app and the server, so it imports dates and types only.
//
// Amounts are estimates from the net monthly salary (what lands in the
// account; by default the salary Trove detects):
// - 13º salário in two parts: the 1st (half) by the 30th of November, or
//   an earlier month, or together with the vacation pay; the 2nd (the rest)
//   by December 20. A payday that isn't a business day moves to the one
//   before.
// - Férias: paid 2 days before they start: the salary for the days off plus
//   one third (terço constitucional), and, when 10 days are sold (abono
//   pecuniário), those 10 days plus one third too.
// - The month's salary is smaller by the vacation days that fall in it,
//   since the vacation pay covered them in advance.

import { addDays, daysInMonth, monthKey } from '../lib/dates.js'
import { businessDayOnOrBefore } from '../lib/holidays.js'
import type { Cents, ExtraPay, Vacation } from './types.js'

export type { ExtraPay, Vacation }

export const DEFAULT_EXTRA_PAY: ExtraPay = { enabled: false, salary: null, firstPart: 11, vacations: [] }

/** Planned vacation periods kept (the law allows up to three a year). */
export const VACATIONS_MAX = 12
/** Days off in one period (the law's shortest is 5; 30 a year). */
export const VACATION_DAYS = { min: 5, max: 30 } as const
/** Days sold with "abono pecuniário". */
export const SOLD_DAYS = 10
/** The months the 13º's 1st part may come in (February to November). */
export const FIRST_PART_MONTHS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const
/** The highest salary accepted (R$ 10 milhões a month), so a typo can't break the forecast. */
export const SALARY_MAX = 1_000_000_000

/** A real calendar day (YYYY-MM-DD; not 30 February). */
const isDate = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

/** Whether a vacation period is valid: a date, 5–30 days, at most 20 when 10 are sold. */
export function isVacation(v: unknown): v is Vacation {
  const x = (v ?? {}) as Partial<Vacation>
  if (typeof x.id !== 'string' || !x.id || x.id.length > 100 || !isDate(x.start) || typeof x.sold !== 'boolean') return false
  if (!Number.isInteger(x.days) || x.days! < VACATION_DAYS.min || x.days! > VACATION_DAYS.max) return false
  return !x.sold || x.days! <= VACATION_DAYS.max - SOLD_DAYS
}

/** Whether a value is complete, valid settings (what an edit must carry). */
export function isExtraPay(v: unknown): v is ExtraPay {
  const x = (v ?? {}) as Partial<ExtraPay>
  if (typeof x.enabled !== 'boolean') return false
  if (x.salary !== null && !(Number.isInteger(x.salary) && x.salary! > 0 && x.salary! <= SALARY_MAX)) return false
  if (x.firstPart !== 'vacation' && !(FIRST_PART_MONTHS as readonly unknown[]).includes(x.firstPart)) return false
  if (!Array.isArray(x.vacations) || x.vacations.length > VACATIONS_MAX || !x.vacations.every(isVacation)) return false
  return new Set(x.vacations.map((v) => v.id)).size === x.vacations.length
}

/** Stored settings made whole: anything invalid falls back to the default; vacations by start date. */
export function normalizeExtraPay(v: unknown): ExtraPay {
  if (!isExtraPay(v)) return DEFAULT_EXTRA_PAY
  return {
    enabled: v.enabled,
    salary: v.salary,
    firstPart: v.firstPart,
    vacations: [...v.vacations].map(({ id, start, days, sold }) => ({ id, start, days, sold })).sort((a, b) => a.start.localeCompare(b.start)),
  }
}

/** The vacation's last day off. */
export const vacationEnd = (v: Vacation) => addDays(v.start, v.days - 1)

export type ExtraPayment =
  | { date: string; kind: 'thirteenth'; part: 1 | 2; amount: Cents }
  | { date: string; kind: 'vacation'; vacationId: string; days: number; sold: boolean; amount: Cents }

/** The vacation pay: the days off plus a third, and the 10 days sold plus a third. */
export function vacationPay(v: Vacation, salary: Cents): Cents {
  return Math.round(((salary * (v.days + (v.sold ? SOLD_DAYS : 0))) / 30) * (4 / 3))
}

/** When the vacation pay comes: 2 days before the vacation starts, on a business day. */
export const vacationPayday = (v: Vacation) => businessDayOnOrBefore(addDays(v.start, -2))

/** The 13º's 1st part in `year`: by the 30th of its month (the last day in February), or with the year's first vacation before December. */
export function firstPartDate(ep: ExtraPay, year: number): string {
  if (ep.firstPart === 'vacation') {
    const v = ep.vacations.find((x) => x.start.startsWith(`${year}-`) && Number(x.start.slice(5, 7)) <= 11 && vacationPayday(x).startsWith(`${year}-`))
    if (v) return vacationPayday(v)
  }
  const month = `${year}-${String(ep.firstPart === 'vacation' ? 11 : ep.firstPart).padStart(2, '0')}`
  return businessDayOnOrBefore(`${month}-${String(Math.min(30, daysInMonth(month))).padStart(2, '0')}`)
}

/** The 13º's 2nd part in `year`: by December 20, on a business day. */
export const secondPartDate = (year: number) => businessDayOnOrBefore(`${year}-12-20`)

/** Every extra payment from `from` to `to` (ISO dates, both included), by date. Nothing when off or without a salary. */
export function extraPayments(ep: ExtraPay, salary: Cents, from: string, to: string): ExtraPayment[] {
  if (!ep.enabled || salary <= 0) return []
  const out: ExtraPayment[] = []
  const first = Math.round(salary / 2)
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
    out.push({ date: firstPartDate(ep, year), kind: 'thirteenth', part: 1, amount: first })
    out.push({ date: secondPartDate(year), kind: 'thirteenth', part: 2, amount: salary - first })
  }
  for (const v of ep.vacations) out.push({ date: vacationPayday(v), kind: 'vacation', vacationId: v.id, days: v.days, sold: v.sold, amount: vacationPay(v, salary) })
  return out.filter((p) => p.date >= from && p.date <= to).sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'vacation' ? -1 : 1))
}

/** Vacation days in `month` (YYYY-MM). */
export function vacationDaysIn(ep: ExtraPay, month: string): number {
  const start = `${month}-01`
  const end = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
  let days = 0
  for (const v of ep.vacations) {
    const a = v.start > start ? v.start : start
    const last = vacationEnd(v)
    const b = last < end ? last : end
    if (a <= b) days += Number(b.slice(8, 10)) - Number(a.slice(8, 10)) + 1
  }
  return Math.min(30, days)
}

/** How much smaller the month's salary is: its vacation days, paid in advance (a 30-day month, as payroll counts). */
export function salaryCut(ep: ExtraPay, salary: Cents, month: string): Cents {
  if (!ep.enabled || salary <= 0) return 0
  return Math.min(salary, Math.round((salary * vacationDaysIn(ep, month)) / 30))
}

/** The months from `from` to `to` (ISO dates) whose salary is smaller, and by how much. */
export function salaryCuts(ep: ExtraPay, salary: Cents, from: string, to: string): { month: string; days: number; amount: Cents }[] {
  const out: { month: string; days: number; amount: Cents }[] = []
  for (let m = monthKey(from); m <= monthKey(to); m = nextMonth(m)) {
    const amount = salaryCut(ep, salary, m)
    if (amount > 0) out.push({ month: m, days: vacationDaysIn(ep, m), amount })
  }
  return out
}

const nextMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
}
