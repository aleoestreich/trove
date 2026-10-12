// "Fechamento do mês": a short summary of a month once it ends. What came in
// and went out and what was kept, compared with the month before and the
// average of the ones before it; the categories that moved most; the biggest
// spending; the unusual categories (src/data/unusual.ts); and the
// "Equilíbrio do mês" against its target (src/data/spendingBalance.ts), the
// goal the app keeps. Hidden transactions never count, as everywhere.
// Shared by the app and the server, so it imports only types, data and date math.

import { countedAmount, kindOf } from './categories.js'
import { DEFAULT_TARGET, balanceStatus, hasGroups, monthBalance, roundedShares, type BalanceStatus, type MonthBalance } from './spendingBalance.js'
import { unusualCategories, type CategoryComparison } from './unusual.js'
import { NO_FILTER } from './incomeAverage.js'
import { addMonths, lastMonths, monthKey } from '../lib/dates.js'
import type { BalanceTarget, Category, Cents, IncomeFilter, Subcategory, Transaction } from './types.js'

/** The Visão geral shows the month just closed from the 1st to this day. */
export const CLOSE_CARD_DAYS = 10
/** Complete months before the closed one in its average. */
export const CLOSE_AVERAGE_MONTHS = 6
/** How many categories, transactions and unusual categories the summary lists. */
export const CLOSE_TOP = 3

export interface Figures {
  income: Cents
  /** Positive: money spent (refunds reduce it). */
  expenses: Cents
  /** income − expenses: what was kept (negative: spent more than came in). */
  net: Cents
}

export interface CategoryChange {
  /** Null: uncategorized expenses. */
  categoryId: string | null
  now: Cents
  before: Cents
  /** now − before. */
  delta: Cents
}

export interface MonthClose {
  month: string
  figures: Figures
  /** Share of the income kept, in percent; null without income. */
  keptPct: number | null
  /** The month before, when it has data. */
  previous: (Figures & { month: string }) | null
  /** The average of up to 6 complete months before (those with data), when there's at least one. */
  average: (Figures & { months: number }) | null
  /** Categories whose spending moved most from the month before (in reais, up or down). */
  changes: CategoryChange[]
  /** Where most of the money went: the largest categories, with their share of the spending. */
  topCategories: { categoryId: string | null; amount: Cents; share: number }[]
  /** The largest single expenses. */
  biggest: Transaction[]
  /** Unusual categories against their own average (null: not enough history to compare). */
  unusual: CategoryComparison[] | null
  /** The "Equilíbrio do mês": the split and its verdict; null while no category is in a group. */
  balance: { split: MonthBalance; target: BalanceTarget; shares: BalanceTarget | null; status: BalanceStatus } | null
  /** Transactions that counted. */
  count: number
}

export interface MonthCloseInput {
  transactions: Transaction[]
  categories: Category[]
  subcategories: Subcategory[]
  incomeFilter?: IncomeFilter
  balanceTarget?: BalanceTarget
}

/** The month that just closed, as of `today` (ISO date). */
export const closedMonth = (today: string) => addMonths(`${monthKey(today)}-01`, -1).slice(0, 7)

/** Whether the Visão geral shows the month just closed (its first days). */
export const showsClose = (today: string) => Number(today.slice(8, 10)) <= CLOSE_CARD_DAYS

/** Income and expenses of one month's transactions (hidden ones left out; transfers are neither). */
function figuresOf(txs: Transaction[], categoriesById: Map<string, Category>): Figures {
  let income = 0
  let expenses = 0
  for (const t of txs) {
    if (t.hidden) continue
    const kind = kindOf(t, categoriesById)
    if (kind === 'income') income += countedAmount(t)
    else if (kind === 'expense') expenses -= countedAmount(t)
  }
  return { income, expenses, net: income - expenses }
}

/** Expenses by category (null: uncategorized). */
function spendingByCategory(txs: Transaction[], categoriesById: Map<string, Category>): Map<string | null, Cents> {
  const out = new Map<string | null, Cents>()
  for (const t of txs) {
    if (t.hidden || kindOf(t, categoriesById) !== 'expense') continue
    const key = t.categoryId && categoriesById.has(t.categoryId) ? t.categoryId : null
    out.set(key, (out.get(key) ?? 0) - countedAmount(t))
  }
  return out
}

/**
 * The summary of `month` (YYYY-MM, a complete one), or null when it has no
 * transaction that counts. `transactions` must cover the month and the 6
 * before it for the comparisons (fewer months compare with what there is).
 */
export function monthClose(input: MonthCloseInput, month: string): MonthClose | null {
  const { transactions, categories, subcategories } = input
  const categoriesById = new Map(categories.map((c) => [c.id, c]))
  const byMonth = new Map<string, Transaction[]>()
  for (const t of transactions) {
    if (t.hidden) continue
    const m = monthKey(t.date)
    byMonth.set(m, [...(byMonth.get(m) ?? []), t])
  }
  const own = byMonth.get(month) ?? []
  if (own.length === 0) return null

  const first = [...byMonth.keys()].sort()[0]
  const before = lastMonths(month, CLOSE_AVERAGE_MONTHS + 1)
    .slice(0, -1)
    .filter((m) => m >= first)
  const figures = figuresOf(own, categoriesById)
  const prevMonth = before[before.length - 1] === addMonths(`${month}-01`, -1).slice(0, 7) ? before[before.length - 1] : null
  const previous = prevMonth ? { month: prevMonth, ...figuresOf(byMonth.get(prevMonth) ?? [], categoriesById) } : null
  const average = before.length
    ? (() => {
        const all = before.map((m) => figuresOf(byMonth.get(m) ?? [], categoriesById))
        const avg = (k: keyof Figures) => Math.round(all.reduce((s, f) => s + f[k], 0) / all.length)
        return { income: avg('income'), expenses: avg('expenses'), net: avg('net'), months: all.length }
      })()
    : null

  const now = spendingByCategory(own, categoriesById)
  const prev = prevMonth ? spendingByCategory(byMonth.get(prevMonth) ?? [], categoriesById) : null
  const changes = prev
    ? [...new Set([...now.keys(), ...prev.keys()])]
        .map((categoryId) => ({ categoryId, now: now.get(categoryId) ?? 0, before: prev.get(categoryId) ?? 0, delta: (now.get(categoryId) ?? 0) - (prev.get(categoryId) ?? 0) }))
        .filter((c) => c.delta !== 0)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || (a.categoryId ?? '').localeCompare(b.categoryId ?? ''))
        .slice(0, CLOSE_TOP)
    : []
  const spent = [...now.values()].reduce((s, v) => s + Math.max(0, v), 0)
  const topCategories = [...now]
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, CLOSE_TOP)
    .map(([categoryId, amount]) => ({ categoryId, amount, share: spent > 0 ? (amount / spent) * 100 : 0 }))
  const biggest = own
    .filter((t) => countedAmount(t) < 0 && kindOf(t, categoriesById) === 'expense')
    .sort((a, b) => countedAmount(a) - countedAmount(b) || a.id.localeCompare(b.id))
    .slice(0, CLOSE_TOP)

  // As seen on the 1st of the next month: the closed month against the 6 before it.
  const nextDay = addMonths(`${month}-01`, 1)
  const u = unusualCategories(transactions, categories, nextDay)
  const unusual = u && u.month === month ? u.unusual.slice(0, CLOSE_TOP) : null

  let balance: MonthClose['balance'] = null
  if (hasGroups(categories, subcategories)) {
    const target = input.balanceTarget ?? DEFAULT_TARGET
    const split = monthBalance(transactions, categories, subcategories, input.incomeFilter ?? NO_FILTER, month)
    balance = { split, target, shares: roundedShares(split), status: balanceStatus(split, target, nextDay) }
  }

  return {
    month,
    figures,
    keptPct: figures.income > 0 ? (figures.net / figures.income) * 100 : null,
    previous,
    average,
    changes,
    topCategories,
    biggest,
    unusual,
    balance,
    count: own.filter((t) => kindOf(t, categoriesById) !== 'transfer').length,
  }
}
