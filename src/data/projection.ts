// Month-end projection ("Previsão do fim do mês"): how much is likely left
// in the chosen accounts on the last day of the current month. Shared by the
// app and the server (GET /api/insights/projection).
//
//   fim = saldo hoje + receitas previstas − faturas − recorrentes − dia a dia
//
// - Saldo hoje: the chosen accounts' balances (default: checking accounts in BRL).
// - Receitas previstas: the salary's monthly average over the last 6
//   complete months, minus what came in this month, on the day it usually
//   arrives (the last 3 months). Freelance the same way, when turned on.
//   Only income into the chosen accounts counts.
// - Faturas: card bills due from today to the end of the month, not paid
//   yet. They already hold the card's installments and subscriptions, so
//   those are never subtracted again.
// - Recorrentes: active recurring charges paid from the chosen accounts
//   (not by card), expected after today and not charged yet this month.
// - Dia a dia: the average spent per day from the chosen accounts over the
//   last 3 complete months, without recurring charges, transfers, bill
//   payments and hidden transactions, times the days left (when turned on).
//
// Each value is counted once. The daily series is the real balance up to
// today, then the day-to-day spending each day plus each dated event. The
// range widens to the salary's standard deviation plus 20% of the
// day-to-day spending at the end of the month.

import { currentBill, inBill } from '../lib/bills.js'
import { installmentPlans } from '../lib/installments.js'
import { addDays, daysFrom, daysInMonth, fromISO, lastMonths, monthKey } from '../lib/dates.js'
import { kindOf } from './categories.js'
import { merchantKey, type PaymentMethod, type RecurringItem } from './recurring.js'
import type { Account, Category, Cents, ProjectionSettings, Transaction } from './types.js'

export const DEFAULT_PROJECTION_SETTINGS: ProjectionSettings = { accountIds: null, includeDaily: true, includeFreelance: false }

/** Months of salary in the average, and of its usual day. */
const SALARY_MONTHS = 6
const SALARY_DAY_MONTHS = 3
/** Months of day-to-day spending in the daily average. */
const DAILY_MONTHS = 3
/** The day-to-day spending's share of the range. */
const DAILY_SPREAD = 0.2

export type ProjectionEvent =
  | { date: string; kind: 'bill'; accountId: string; amount: Cents; installments: Cents }
  | { date: string; kind: 'recurring'; recurringId: string; name: string; paymentMethod: PaymentMethod; amount: Cents }
  | { date: string; kind: 'salary' | 'freelance'; amount: Cents }

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
  /** The salary's monthly average and the day it usually comes in. */
  salary: { average: Cents; day: number | null }
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

interface Expected {
  average: Cents
  /** What is still to come this month. */
  remaining: Cents
  day: number | null
  /** Monthly totals over the average's months. */
  totals: Cents[]
  /** Months with any of it. */
  monthsWith: number
}

/** A category's income into the chosen accounts: average, still to come and usual day. */
function expectedIncome(txs: Transaction[], categoryId: string | undefined, accounts: Set<string>, months: string[], current: string): Expected {
  const mine = categoryId ? txs.filter((t) => t.categoryId === categoryId && t.amount > 0 && !t.hidden && !t.transfer && accounts.has(t.accountId)) : []
  const byMonth = new Map<string, Cents>()
  const biggest = new Map<string, Transaction>()
  for (const t of mine) {
    const m = monthKey(t.date)
    byMonth.set(m, (byMonth.get(m) ?? 0) + t.amount)
    if (!biggest.has(m) || biggest.get(m)!.amount < t.amount) biggest.set(m, t)
  }
  const totals = months.map((m) => byMonth.get(m) ?? 0)
  const average = totals.length ? Math.round(totals.reduce((s, x) => s + x, 0) / totals.length) : 0
  const withIt = months.filter((m) => byMonth.has(m))
  const day = median(withIt.slice(-SALARY_DAY_MONTHS).map((m) => Number(biggest.get(m)!.date.slice(8, 10))))
  return { average, remaining: Math.max(0, average - (byMonth.get(current) ?? 0)), day, totals, monthsWith: withIt.length }
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
  today: string
}): Projection | null {
  const { accounts, transactions, categories, recurring, today } = input
  const settings = input.settings ?? DEFAULT_PROJECTION_SETTINGS
  const categoriesById = new Map(categories.map((c) => [c.id, c]))
  const accountIds = projectionAccounts(accounts, settings)
  const chosen = new Set(accountIds)
  const current = monthKey(today)
  const endDate = `${current}-${String(daysInMonth(today)).padStart(2, '0')}`
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
  const salary = expectedIncome(transactions, salaryCategory?.id, chosen, complete, current)
  if (salary.monthsWith < 2) return null
  const freelance = settings.includeFreelance
    ? expectedIncome(transactions, incomeCategory(categories, 'freelance', 'freelance')?.id, chosen, complete, current)
    : null

  const events: ProjectionEvent[] = []
  const incomeEvent = (kind: 'salary' | 'freelance', e: Expected) => {
    // Nothing more comes in once the month is over.
    if (e.remaining <= 0 || daysLeft === 0 || e.day === null) return
    const day = `${current}-${String(Math.min(e.day, daysInMonth(today))).padStart(2, '0')}`
    events.push({ date: onOrAfterTomorrow(day), kind, amount: e.remaining })
  }
  incomeEvent('salary', salary)
  if (freelance) incomeEvent('freelance', freelance)

  // Card bills due from today to the end of the month, still to be paid.
  const todayDate = fromISO(today)
  const plans = installmentPlans(transactions, todayDate)
  let parcelas = 0
  for (const card of accounts) {
    if (card.type !== 'CREDIT') continue
    const bill = currentBill(card, transactions, plans, todayDate)
    if (!bill?.dueDate || bill.dueDate < today || bill.dueDate > endDate || bill.amount <= 0) continue
    const installments = transactions.filter((t) => t.installment && inBill(t, card.id, bill)).reduce((s, t) => s - t.amount, 0) + bill.expected
    parcelas += installments
    events.push({ date: onOrAfterTomorrow(bill.dueDate), kind: 'bill', accountId: card.id, amount: -bill.amount, installments })
  }

  // Recurring charges from the chosen accounts (cards' are in their bills), not charged yet this month.
  for (const r of recurring) {
    if (r.status === 'stopped' || r.paymentMethod === 'card' || !chosen.has(r.accountId)) continue
    if (monthKey(r.lastDate) === current || monthKey(r.nextDate) > current || daysLeft === 0) continue
    events.push({ date: onOrAfterTomorrow(r.nextDate), kind: 'recurring', recurringId: r.id, name: r.merchant, paymentMethod: r.paymentMethod, amount: -r.amount })
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
  const receitasPrevistas = sum(['salary', 'freelance'])
  const faturas = -sum(['bill'])
  const recorrentes = -sum(['recurring'])
  const end = saldoHoje + receitasPrevistas - faturas - recorrentes - diaADia

  // Real balances up to today: today's balance minus what happened after each day.
  const days = Array.from({ length: daysInMonth(today) }, (_, i) => `${current}-${String(i + 1).padStart(2, '0')}`)
  const after = new Map<string, Cents>()
  for (const t of transactions) {
    if (!chosen.has(t.accountId) || monthKey(t.date) !== current || t.date > today) continue
    after.set(t.date, (after.get(t.date) ?? 0) + t.amount)
  }
  const width = stdDev(salary.totals) + DAILY_SPREAD * diaADia
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
    salary: { average: salary.average, day: salary.day },
    settings,
  }
}
