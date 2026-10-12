// Unusual categories ("Fora do padrão"): each expense category's spending
// compared with its own average. Shared by the app and the server
// (GET /api/insights/unusual-categories), so it imports only types and date math.
//
// - Until day 10, the last complete month is compared with the average of
//   the 6 months before it.
// - From day 11, the month so far is compared with the same number of days
//   at the start of each of the 6 months before it (month to date).
// - Months before the first month with any data don't count; at least 3 must.
// - Unusual: more than 15% above or below the average. Categories averaging
//   under R$ 100 are left out. Hidden transactions never count; refunds
//   reduce spending.

import { countedAmount, kindOf } from './categories.js'
import { daysInMonth, lastMonths, monthKey } from '../lib/dates.js'
import type { Category, Cents, Transaction } from './types.js'

/** Months in the average. */
export const UNUSUAL_MONTHS = 6
/** Fewer months with data than this: no comparison. */
export const UNUSUAL_MIN_MONTHS = 3
/** Beyond ±15% of the average: unusual. */
export const UNUSUAL_BAND = 0.15
/** Categories averaging under R$ 100 are left out. */
export const UNUSUAL_MIN_AVERAGE: Cents = 100_00
/** Up to this day of the month, the last complete month is compared. */
export const MONTH_TO_DATE_FROM_DAY = 11

export interface SubcategoryComparison {
  /** Null: the category's spending without a subcategory. */
  subcategoryId: string | null
  now: Cents
  avg: Cents
  delta: Cents
  /** (now − avg) / avg; null when the average is zero. */
  pct: number | null
  counts: { now: number; avg: number }
}

export interface CategoryComparison {
  categoryId: string
  now: Cents
  /** Average over the comparison months, on the same days. */
  avg: Cents
  /** now − avg. */
  delta: Cents
  /** (now − avg) / avg. */
  pct: number
  /** The average of whole months (for "next month, about…"). */
  avgFull: Cents
  /** The comparison months then the compared one, oldest first, on the same days. */
  series: { month: string; amount: Cents }[]
  /** Largest increase first. */
  subs: SubcategoryComparison[]
  /** Transactions now vs the monthly average. */
  counts: { now: number; avg: number }
}

export interface UnusualResult {
  /** 'month': a complete month; 'mtd': the current month so far. */
  mode: 'month' | 'mtd'
  /** The month compared (YYYY-MM). */
  month: string
  /** Month to date: the days compared (1 to `days`). */
  days: number | null
  /** First and last month of the average. */
  compareFrom: string
  compareTo: string
  /** Outside ±15%, the largest change in reais first. */
  unusual: CategoryComparison[]
  /** Inside ±15%, the largest average first. */
  normal: CategoryComparison[]
}

interface Bucket {
  amount: Cents
  count: number
}

/** The comparison as of `today` (ISO date), or null with fewer than 3 months of data. */
export function unusualCategories(transactions: Transaction[], categories: Category[], today: string): UnusualResult | null {
  const day = Number(today.slice(8, 10))
  const mtd = day >= MONTH_TO_DATE_FROM_DAY
  const current = monthKey(today)
  const months = lastMonths(current, UNUSUAL_MONTHS + 2)
  const month = mtd ? current : months[months.length - 2]
  const compared = lastMonths(month, UNUSUAL_MONTHS + 1)
  const first = transactions.reduce((min, t) => (!t.hidden && t.date < min ? t.date : min), '9999-12')
  const history = compared.slice(0, -1).filter((m) => m >= monthKey(first))
  if (history.length < UNUSUAL_MIN_MONTHS) return null

  const categoriesById = new Map(categories.map((c) => [c.id, c]))
  const inScope = new Set([...history, month])
  // category → month → (subcategory → bucket), on the compared days and in whole months.
  const sameDays = new Map<string, Map<string, Map<string | null, Bucket>>>()
  const whole = new Map<string, Map<string, Cents>>()
  for (const t of transactions) {
    const m = monthKey(t.date)
    if (!inScope.has(m) || t.hidden || !t.categoryId || t.date > today) continue
    const category = categoriesById.get(t.categoryId)
    if (!category || category.type !== 'expense' || kindOf(t, categoriesById) !== 'expense') continue
    const spent = -countedAmount(t)
    if (spent === 0) continue
    const w = whole.get(category.id) ?? new Map<string, Cents>()
    w.set(m, (w.get(m) ?? 0) + spent)
    whole.set(category.id, w)
    if (mtd && Number(t.date.slice(8, 10)) > Math.min(day, daysInMonth(m))) continue
    const byMonth = sameDays.get(category.id) ?? new Map<string, Map<string | null, Bucket>>()
    const bySub = byMonth.get(m) ?? new Map<string | null, Bucket>()
    const key = t.subcategoryId ?? null
    const b = bySub.get(key) ?? { amount: 0, count: 0 }
    b.amount += spent
    b.count += 1
    bySub.set(key, b)
    byMonth.set(m, bySub)
    sameDays.set(category.id, byMonth)
  }

  const n = history.length
  const results: CategoryComparison[] = []
  for (const [categoryId, byMonth] of sameDays) {
    const total = (m: string) => [...(byMonth.get(m)?.values() ?? [])].reduce((s, b) => s + b.amount, 0)
    const count = (m: string) => [...(byMonth.get(m)?.values() ?? [])].reduce((s, b) => s + b.count, 0)
    const avg = Math.round(history.reduce((s, m) => s + total(m), 0) / n)
    if (avg < UNUSUAL_MIN_AVERAGE) continue
    const now = total(month)
    const subIds = new Set<string | null>()
    for (const m of inScope) for (const id of byMonth.get(m)?.keys() ?? []) subIds.add(id)
    const subs = [...subIds]
      .map((id): SubcategoryComparison => {
        const b = (m: string) => byMonth.get(m)?.get(id) ?? { amount: 0, count: 0 }
        const subAvg = Math.round(history.reduce((s, m) => s + b(m).amount, 0) / n)
        const subNow = b(month).amount
        return {
          subcategoryId: id,
          now: subNow,
          avg: subAvg,
          delta: subNow - subAvg,
          pct: subAvg > 0 ? (subNow - subAvg) / subAvg : null,
          counts: { now: b(month).count, avg: history.reduce((s, m) => s + b(m).count, 0) / n },
        }
      })
      .filter((s) => s.now > 0 || s.avg > 0)
      .sort((a, b) => b.delta - a.delta)
    const w = whole.get(categoryId)
    results.push({
      categoryId,
      now,
      avg,
      delta: now - avg,
      pct: (now - avg) / avg,
      avgFull: Math.round(history.reduce((s, m) => s + (w?.get(m) ?? 0), 0) / n),
      series: [...history, month].map((m) => ({ month: m, amount: total(m) })),
      subs,
      counts: { now: count(month), avg: history.reduce((s, m) => s + count(m), 0) / n },
    })
  }

  const isUnusual = (c: CategoryComparison) => Math.abs(c.pct) > UNUSUAL_BAND
  return {
    mode: mtd ? 'mtd' : 'month',
    month,
    days: mtd ? day : null,
    compareFrom: history[0],
    compareTo: history[history.length - 1],
    unusual: results.filter(isUnusual).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    normal: results.filter((c) => !isUnusual(c)).sort((a, b) => b.avg - a.avg),
  }
}
