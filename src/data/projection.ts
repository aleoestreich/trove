// Month-end projection ("Previsão do fim do mês"): how much is likely left
// in the chosen accounts on the last day of the current month, or of the
// next one (settings.horizon 'nextMonth'). Shared by the app and the server
// (GET /api/insights/projection).
//
//   fim = saldo hoje + receitas previstas − faturas − recorrentes − dia a dia
//
// - Saldo hoje: the chosen accounts' balances (default: checking accounts in BRL).
// - Receitas previstas: the salary's monthly average over the last 6
//   complete months, minus what came in this month. It is expected on its
//   pay schedule, learnt from the last 3 months: each payment's usual day
//   (counted from the end of the month when it comes in its last days;
//   a payday on a weekend or a national bank holiday falls on the working
//   day before, src/lib/holidays.ts) and
//   its share of the month, so a salary paid in two parts (e.g. on the 15th
//   and the last day) is expected in two parts. What already came in this
//   month covers the earliest parts first. Freelance the same way, when
//   turned on. Only income into the chosen accounts counts.
//   Over two months, next month's paydays get the whole average.
// - Faturas: card bills due from today to the end, not paid yet. They
//   already hold the card's installments and subscriptions, so those are
//   never subtracted again. A bill whose cycle is still open counts at least
//   the card's average of its last 3 bills (src/lib/bills.ts).
// - Recorrentes: active recurring charges paid from the chosen accounts
//   (not by card), each time they're expected from today to the end, not
//   charged yet.
// - Dia a dia: the average spent per day from the chosen accounts over the
//   last 3 complete months, without recurring charges, transfers, bill
//   payments and hidden transactions, times the days left (when turned on).
//
// - 13º e férias (CLT, when turned on, src/data/extraPay.ts): the 13º's
//   parts and the vacation pay due before the end count as income, and a
//   month's salary is smaller by its vacation days (paid in advance). The
//   salary's average is then the median month, so a past month with 13º or
//   vacation pay in it doesn't raise it.
//
// Each value is counted once. The daily series is the real balance up to
// today, then the day-to-day spending each day plus each dated event. The
// range widens to the salary's standard deviation plus 20% of the
// day-to-day spending at the end of the month.

import { inBill, upcomingBills } from '../lib/bills.js'
import { installmentPlans } from '../lib/installments.js'
import { addDays, addMonths, daysFrom, daysInMonth, fromISO, lastMonths, monthKey } from '../lib/dates.js'
import { businessDayOnOrBefore } from '../lib/holidays.js'
import { kindOf } from './categories.js'
import { merchantKey, type PaymentMethod, type RecurringItem } from './recurring.js'
import { extraPayments, salaryCut } from './extraPay.js'
import type { Account, Category, Cents, ExtraPay, ProjectionSettings, Transaction } from './types.js'

export const DEFAULT_PROJECTION_SETTINGS: ProjectionSettings = { accountIds: null, includeDaily: true, includeFreelance: false, horizon: 'month' }

/** Months of salary in the average, and of its usual day. */
const SALARY_MONTHS = 6
const SALARY_DAY_MONTHS = 3
/** Months of day-to-day spending in the daily average. */
const DAILY_MONTHS = 3
/** The day-to-day spending's share of the range. */
const DAILY_SPREAD = 0.2

export type ProjectionEvent =
  | { date: string; kind: 'bill'; accountId: string; amount: Cents; installments: Cents; /** The cycle is still open: the card's recent average. */ estimated?: boolean }
  | { date: string; kind: 'recurring'; recurringId: string; name: string; paymentMethod: PaymentMethod; amount: Cents }
  | { date: string; kind: 'salary' | 'freelance'; amount: Cents }
  | { date: string; kind: 'thirteenth'; part: 1 | 2; amount: Cents }
  | { date: string; kind: 'vacation'; days: number; sold: boolean; amount: Cents }

export interface ProjectionPoint {
  day: string
  value: Cents
  lo: Cents
  hi: Cents
  /** A real balance (today and before); later days are projected. */
  actual: boolean
}

export interface Projection {
  asOf: string
  endDate: string
  end: Cents
  /** The lowest projected balance (today on), and when. */
  low: { value: Cents; date: string }
  range: { min: Cents; max: Cents }
  breakdown: {
    saldoHoje: Cents
    receitasPrevistas: Cents
    faturas: Cents
    recorrentes: Cents
    diaADia: Cents
    /** Installments inside the bills above (already counted in faturas). */
    parcelasDentroDasFaturas: Cents
  }
  daily: ProjectionPoint[]
  /** By date. Signed: income positive, payments negative. */
  events: ProjectionEvent[]
  /** The accounts counted. */
  accountIds: string[]
  /** Average spent per day (day-to-day), and over how many months. */
  dailyAverage: Cents
  /** The salary's monthly average and the days it usually comes in, in this month (one per payment). */
  salary: { average: Cents; days: number[] }
  /** With 13º e férias on: the monthly salary its estimates use (set by hand, or the average). */
  extraPaySalary: Cents | null
  settings: ProjectionSettings
}

/** Checking accounts in BRL: the default accounts. */
export function defaultProjectionAccounts(accounts: Account[]): string[] {
  return accounts.filter((a) => a.type === 'BANK' && a.subtype === 'CHECKING_ACCOUNT' && !a.foreign).map((a) => a.id)
}

/** The accounts the settings choose (only ones that exist). */
export function projectionAccounts(accounts: Account[], settings: ProjectionSettings): string[] {
  if (!settings.accountIds) return defaultProjectionAccounts(accounts)
  const known = new Set(accounts.filter((a) => a.type === 'BANK').map((a) => a.id))
  return settings.accountIds.filter((id) => known.has(id))
}

const plain = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

/** The income category with this default ID, or else this name (salary: "Salário"). */
function incomeCategory(categories: Category[], id: string, name: string): Category | undefined {
  return categories.find((c) => c.type === 'income' && c.id === id) ?? categories.find((c) => c.type === 'income' && plain(c.name) === name)
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null
}

/** Population standard deviation. */
const stdDev = (xs: number[]) => {
  if (!xs.length) return 0
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length
  return Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length)
}

/** One payment of a pay schedule: its day and its share of the month. */
interface Payday {
  /** Day of the month, or days before its last day when `fromEnd`. */
  day: number
  fromEnd: boolean
  share: number
}

interface Expected {
  average: Cents
  /** Its payments, earliest first; empty without any. */
  schedule: Payday[]
  /** Monthly totals over the average's months. */
  totals: Cents[]
  /** Months with any of it. */
  monthsWith: number
  /** What already came in this month. */
  received: Cents
}

/** Payments a few days apart are one payment (split transfers, a weekend in between). */
const SAME_PAYMENT_DAYS = 3
/** A payment in the last days of its month is "on the last day" (it moves with the month's length). */
const MONTH_END_DAYS = 3
/** Smaller payments than this share of the month don't make a payday of their own. */
const MIN_PAYMENT_SHARE = 0.1

/** A month's payments: transactions a few days apart merged, small ones left out. */
function paymentsOf(month: Transaction[]): { day: number; amount: Cents }[] {
  const sorted = [...month].sort((a, b) => a.date.localeCompare(b.date))
  const out: { day: number; amount: Cents }[] = []
  for (const t of sorted) {
    const day = Number(t.date.slice(8, 10))
    const last = out[out.length - 1]
    if (last && day - last.day <= SAME_PAYMENT_DAYS) last.amount += t.amount
    else out.push({ day, amount: t.amount })
  }
  const total = out.reduce((s, p) => s + p.amount, 0)
  return out.filter((p) => p.amount >= total * MIN_PAYMENT_SHARE)
}

/**
 * The pay schedule over `months` (most recent last): how many payments a
 * month usually has (ties: the most recent), then each one's median day and
 * share, from the months with that many.
 */
function paySchedule(byMonth: Map<string, Transaction[]>, months: string[]): Payday[] {
  const seen = months.filter((m) => byMonth.has(m)).map((m) => ({ month: m, payments: paymentsOf(byMonth.get(m)!) }))
  if (!seen.length) return []
  const counts = new Map<number, number>()
  for (const s of seen) counts.set(s.payments.length, (counts.get(s.payments.length) ?? 0) + 1)
  const best = Math.max(...counts.values())
  const n = [...seen].reverse().find((s) => counts.get(s.payments.length) === best)!.payments.length
  const like = seen.filter((s) => s.payments.length === n)
  const schedule = Array.from({ length: n }, (_, i) => {
    const slot = like.map((s) => ({ day: s.payments[i].day, last: daysInMonth(s.month), share: s.payments[i].amount / s.payments.reduce((t, p) => t + p.amount, 0) }))
    const fromEnd = slot.every((x) => x.last - x.day < MONTH_END_DAYS)
    return {
      day: median(slot.map((x) => (fromEnd ? x.last - x.day : x.day)))!,
      fromEnd,
      share: median(slot.map((x) => x.share))!,
    }
  })
  const sum = schedule.reduce((t, p) => t + p.share, 0)
  return schedule.map((p) => ({ ...p, share: p.share / sum }))
}

/**
 * A payday's date in `month` (YYYY-MM). On a weekend or a national bank
 * holiday it falls on the working day before, within the month (a payday on
 * the 1st that isn't a working day stays on the 1st).
 */
const paydayIn = (p: Payday, month: string) => {
  const last = daysInMonth(month)
  const date = `${month}-${String(p.fromEnd ? last - p.day : Math.min(p.day, last)).padStart(2, '0')}`
  const before = businessDayOnOrBefore(date)
  return monthKey(before) === month ? before : `${month}-01`
}

/** A category's income into the chosen accounts: average, pay schedule, and what came in this month. */
function expectedIncome(txs: Transaction[], categoryId: string | undefined, accounts: Set<string>, months: string[], current: string, useMedian = false): Expected {
  const mine = categoryId ? txs.filter((t) => t.categoryId === categoryId && t.amount > 0 && !t.hidden && !t.transfer && accounts.has(t.accountId)) : []
  const byMonth = new Map<string, Transaction[]>()
  for (const t of mine) {
    const m = monthKey(t.date)
    byMonth.set(m, [...(byMonth.get(m) ?? []), t])
  }
  const total = (m: string) => (byMonth.get(m) ?? []).reduce((s, t) => s + t.amount, 0)
  const totals = months.map(total)
  const average = !totals.length ? 0 : useMedian ? Math.round(median(totals)!) : Math.round(totals.reduce((s, x) => s + x, 0) / totals.length)
  const withIt = months.filter((m) => byMonth.has(m))
  return { average, schedule: paySchedule(byMonth, withIt.slice(-SALARY_DAY_MONTHS)), totals, monthsWith: withIt.length, received: total(current) }
}

/**
 * Each payment still to come this month: the average split by the schedule's
 * shares (the last takes the rounding), with what already came in covering
 * the earliest payments first.
 */
function expectedPayments(e: Expected, current: string): { date: string; amount: Cents }[] {
  let left = e.received
  let given = 0
  return e.schedule
    .map((p, i) => {
      const amount = i === e.schedule.length - 1 ? e.average - given : Math.round(e.average * p.share)
      given += amount
      const covered = Math.min(Math.max(0, left), amount)
      left -= covered
      return { date: paydayIn(p, current), amount: amount - covered }
    })
    .filter((p) => p.amount > 0)
}

/**
 * The projection as of `today` (ISO date), or null without enough salary
 * history (fewer than 2 of the last complete months with salary).
 */
export function monthEndProjection(input: {
  accounts: Account[]
  transactions: Transaction[]
  categories: Category[]
  settings?: ProjectionSettings
  /** Detected recurring charges (src/data/recurring.ts), active and stopped. */
  recurring: RecurringItem[]
  /** "13º e férias" (off when absent). */
  extraPay?: ExtraPay
  today: string
}): Projection | null {
  const { accounts, transactions, categories, recurring, today } = input
  const extraPay = input.extraPay?.enabled ? input.extraPay : null
  const settings = input.settings ?? DEFAULT_PROJECTION_SETTINGS
  const categoriesById = new Map(categories.map((c) => [c.id, c]))
  const accountIds = projectionAccounts(accounts, settings)
  const chosen = new Set(accountIds)
  const current = monthKey(today)
  const next = monthKey(addMonths(`${current}-01`, 1))
  const months = settings.horizon === 'nextMonth' ? [current, next] : [current]
  const lastMonth = months[months.length - 1]
  const endDate = `${lastMonth}-${String(daysInMonth(lastMonth)).padStart(2, '0')}`
  const daysLeft = daysFrom(today, endDate)
  const tomorrow = addDays(today, 1)
  /** An event's day: never before tomorrow (or today, on the last day). */
  const onOrAfterTomorrow = (date: string) => (date > today ? date : daysLeft > 0 ? tomorrow : today)

  // Complete months with any data, most recent last.
  const first = transactions.reduce((min, t) => (!t.hidden && t.date < min ? t.date : min), '9999-12')
  const complete = lastMonths(current, SALARY_MONTHS + 1)
    .slice(0, -1)
    .filter((m) => m >= monthKey(first))

  const salaryCategory = incomeCategory(categories, 'salary', 'salario')
  const salary = expectedIncome(transactions, salaryCategory?.id, chosen, complete, current, !!extraPay)
  if (salary.monthsWith < 2) return null
  const freelance = settings.includeFreelance
    ? expectedIncome(transactions, incomeCategory(categories, 'freelance', 'freelance')?.id, chosen, complete, current)
    : null

  const events: ProjectionEvent[] = []
  // With 13º e férias: the salary its estimates use, and each month's salary less its vacation days.
  const extraSalary = extraPay ? (extraPay.salary ?? salary.average) : null
  const cut = (m: string) => (extraPay && extraSalary ? salaryCut(extraPay, extraSalary, m) : 0)
  const incomeEvent = (kind: 'salary' | 'freelance', e: Expected) => {
    // Nothing more comes in once the projection is over.
    if (daysLeft === 0) return
    const less = (m: string) => (kind === 'salary' ? Math.max(0, e.average - cut(m)) : e.average)
    // This month: what hasn't come in yet; next month: all of it.
    const payments = [
      ...expectedPayments({ ...e, average: less(current) }, current),
      ...(months.length > 1 ? expectedPayments({ ...e, average: less(next), received: 0 }, next) : []),
    ]
    for (const p of payments) events.push({ date: onOrAfterTomorrow(p.date), kind, amount: p.amount })
  }
  incomeEvent('salary', salary)
  if (freelance) incomeEvent('freelance', freelance)
  // The 13º's parts and the vacation pay still to come (one due today counts as already in the balance).
  if (extraPay && extraSalary && daysLeft > 0) {
    for (const x of extraPayments(extraPay, extraSalary, tomorrow, endDate)) {
      events.push(x.kind === 'thirteenth' ? { date: x.date, kind: 'thirteenth', part: x.part, amount: x.amount } : { date: x.date, kind: 'vacation', days: x.days, sold: x.sold, amount: x.amount })
    }
  }

  // Card bills due from today to the end, still to be paid.
  const todayDate = fromISO(today)
  const plans = installmentPlans(transactions, todayDate)
  let parcelas = 0
  for (const card of accounts) {
    if (card.type !== 'CREDIT') continue
    for (const bill of upcomingBills(card, transactions, plans, todayDate, endDate)) {
      if (!bill.dueDate || bill.dueDate < today || bill.amount <= 0) continue
      const installments = transactions.filter((t) => t.installment && inBill(t, card.id, bill)).reduce((s, t) => s - t.amount, 0) + bill.expected
      parcelas += installments
      events.push({ date: onOrAfterTomorrow(bill.dueDate), kind: 'bill', accountId: card.id, amount: -bill.amount, installments, estimated: bill.estimated })
    }
  }

  // Recurring charges from the chosen accounts (cards' are in their bills): each one expected up to the end, not charged yet.
  for (const r of recurring) {
    if (r.status === 'stopped' || r.paymentMethod === 'card' || !chosen.has(r.accountId) || daysLeft === 0) continue
    const step = r.cadence === 'yearly' ? 12 : 1
    for (let date = r.nextDate, k = 0; date <= endDate && k < 24; k++, date = addMonths(r.nextDate, step * k)) {
      // Already charged this month, or not due before the end.
      if (monthKey(date) === current && monthKey(r.lastDate) === current) continue
      events.push({ date: onOrAfterTomorrow(date), kind: 'recurring', recurringId: r.id, name: r.merchant, paymentMethod: r.paymentMethod, amount: -r.amount })
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount)

  // Day-to-day spending: the last 3 complete months, per day.
  const dailyMonths = complete.slice(-DAILY_MONTHS)
  const recurringKeys = new Set(recurring.map((r) => r.key))
  const dailyDays = dailyMonths.reduce((s, m) => s + daysInMonth(m), 0)
  const inDaily = new Set(dailyMonths)
  let spent = 0
  for (const t of transactions) {
    if (!inDaily.has(monthKey(t.date)) || !chosen.has(t.accountId) || t.amount >= 0 || t.hidden || t.transfer || t.installment) continue
    if (kindOf(t, categoriesById) !== 'expense' || recurringKeys.has(merchantKey(t.description))) continue
    spent -= t.amount
  }
  const dailyAverage = dailyDays ? Math.round(spent / dailyDays) : 0
  const diaADia = settings.includeDaily && dailyDays ? Math.round((spent / dailyDays) * daysLeft) : 0

  const sum = (kind: ProjectionEvent['kind'][]) => events.filter((e) => kind.includes(e.kind)).reduce((s, e) => s + e.amount, 0)
  const saldoHoje = accounts.filter((a) => chosen.has(a.id)).reduce((s, a) => s + a.balance, 0)
  const receitasPrevistas = sum(['salary', 'freelance', 'thirteenth', 'vacation'])
  const faturas = -sum(['bill'])
  const recorrentes = -sum(['recurring'])
  const end = saldoHoje + receitasPrevistas - faturas - recorrentes - diaADia

  // Real balances up to today: today's balance minus what happened after each day.
  const days = months.flatMap((m) => Array.from({ length: daysInMonth(m) }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`))
  const after = new Map<string, Cents>()
  for (const t of transactions) {
    if (!chosen.has(t.accountId) || monthKey(t.date) !== current || t.date > today) continue
    after.set(t.date, (after.get(t.date) ?? 0) + t.amount)
  }
  // Each month of salary still to come adds its own spread.
  const width = stdDev(salary.totals) * months.length + DAILY_SPREAD * diaADia
  const daily: ProjectionPoint[] = []
  let balance = saldoHoje
  const actualDays = days.filter((d) => d <= today)
  const actualValues = new Map<string, Cents>()
  for (const d of [...actualDays].reverse()) {
    actualValues.set(d, balance)
    balance -= after.get(d) ?? 0
  }
  for (const d of actualDays) daily.push({ day: d, value: actualValues.get(d)!, lo: actualValues.get(d)!, hi: actualValues.get(d)!, actual: true })
  // Then the projection: the day-to-day spending spread evenly (rounded so it adds up), plus each event.
  let value = saldoHoje
  const spentBy = (k: number) => (daysLeft ? Math.round((diaADia * k) / daysLeft) : 0)
  days
    .filter((d) => d > today)
    .forEach((d, i) => {
      const k = i + 1
      value += -(spentBy(k) - spentBy(k - 1)) + events.filter((e) => e.date === d).reduce((s, e) => s + e.amount, 0)
      const w = Math.round((width * k) / daysLeft)
      daily.push({ day: d, value, lo: value - w, hi: value + w, actual: false })
    })
  // On the last day, events due today are all that's left.
  if (daysLeft === 0) {
    const last = daily[daily.length - 1]
    daily[daily.length - 1] = { ...last, value: end, lo: end, hi: end }
  }

  const ahead = daily.filter((p) => p.day >= today)
  const lowest = ahead.reduce((m, p) => (p.value < m.value ? p : m), ahead[0])
  const w = Math.round(width)
  return {
    asOf: today,
    endDate,
    end,
    low: { value: lowest.value, date: lowest.day },
    range: { min: end - w, max: end + w },
    breakdown: { saldoHoje, receitasPrevistas, faturas, recorrentes, diaADia, parcelasDentroDasFaturas: parcelas },
    daily,
    events,
    accountIds,
    dailyAverage,
    salary: { average: salary.average, days: salary.schedule.map((p) => Number(paydayIn(p, current).slice(8, 10))) },
    extraPaySalary: extraSalary,
    settings,
  }
}
