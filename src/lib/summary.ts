import type { Account, Category, Cents, Transaction } from '../data/types'
import { monthKey } from './dates'

export interface Totals {
  income: Cents
  /** Positive number: money spent (refunds reduce it). */
  expenses: Cents
  net: Cents
}

/**
 * Income and expenses for a set of transactions. Transfers between your own
 * accounts and credit-card bill payments are excluded, so money moving
 * between accounts is never counted twice. Card purchases count as expenses
 * on the day they happen, not when the bill is paid.
 */
export function totals(transactions: Transaction[], categoriesById: Map<string, Category>): Totals {
  let income = 0
  let expenses = 0
  for (const t of transactions) {
    const kind = categoriesById.get(t.categoryId)?.kind
    if (kind === 'income') income += t.amount
    else if (kind === 'expense') expenses -= t.amount
  }
  return { income, expenses, net: income - expenses }
}

export function inMonth(transactions: Transaction[], month: string): Transaction[] {
  return transactions.filter((t) => monthKey(t.date) === month)
}

export interface CategoryTotal {
  category: Category
  amount: Cents
}

/** Expenses per category, largest first. */
export function expensesByCategory(transactions: Transaction[], categoriesById: Map<string, Category>): CategoryTotal[] {
  const sums = new Map<string, Cents>()
  for (const t of transactions) {
    if (categoriesById.get(t.categoryId)?.kind !== 'expense') continue
    sums.set(t.categoryId, (sums.get(t.categoryId) ?? 0) - t.amount)
  }
  return [...sums]
    .map(([id, amount]) => ({ category: categoriesById.get(id)!, amount }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount)
}

export interface SubcategoryTotal {
  /** null: the category's expenses without a subcategory. */
  subcategoryId: string | null
  amount: Cents
}

/**
 * One category's expenses split by subcategory, largest first, with what has
 * no subcategory as `null`. Empty when none of them has a subcategory.
 */
export function expensesBySubcategory(transactions: Transaction[], categoryId: string): SubcategoryTotal[] {
  const sums = new Map<string | null, Cents>()
  let anySub = false
  for (const t of transactions) {
    if (t.categoryId !== categoryId) continue
    if (t.subcategoryId) anySub = true
    const key = t.subcategoryId ?? null
    sums.set(key, (sums.get(key) ?? 0) - t.amount)
  }
  if (!anySub) return []
  return [...sums]
    .map(([subcategoryId, amount]) => ({ subcategoryId, amount }))
    .filter((s) => s.amount > 0)
    .sort((a, b) => (a.subcategoryId === null ? 1 : b.subcategoryId === null ? -1 : b.amount - a.amount))
}

export interface Balances {
  /** Money in bank accounts (BRL, foreign balances converted). */
  cash: Cents
  /** Open credit-card bills. */
  cardDebt: Cents
  /** cash - cardDebt */
  net: Cents
}

export function balances(accounts: Account[]): Balances {
  let cash = 0
  let cardDebt = 0
  for (const a of accounts) {
    if (a.type === 'BANK') cash += a.balance
    else cardDebt += a.balance
  }
  return { cash, cardDebt, net: cash - cardDebt }
}

export interface AverageIncome {
  /** Average monthly income over the complete months. */
  average: Cents
  /** How many complete months it's based on. */
  months: number
  lowest: { month: string; amount: Cents }
  highest: { month: string; amount: Cents }
  /** Income so far in the current month, and how it compares with the average (%). */
  current: { month: string; amount: Cents; vsAverage: number }
}

/**
 * Average monthly income (transfers excluded) from per-month totals, oldest
 * first, the last being the current month. The current month is still in
 * progress, so it's left out of the average, lowest and highest, and only
 * compared with the average. Null without a complete month with data.
 */
export function averageIncome(perMonth: { month: string; income: Cents }[]): AverageIncome | null {
  const current = perMonth.at(-1)
  const complete = perMonth.slice(0, -1)
  if (!current || complete.length === 0) return null
  const average = Math.round(complete.reduce((s, m) => s + m.income, 0) / complete.length)
  const byAmount = [...complete].sort((a, b) => a.income - b.income)
  const pick = (m: { month: string; income: Cents }) => ({ month: m.month, amount: m.income })
  return {
    average,
    months: complete.length,
    lowest: pick(byAmount[0]),
    highest: pick(byAmount[byAmount.length - 1]),
    current: { ...pick(current), vsAverage: average > 0 ? ((current.income - average) / average) * 100 : 0 },
  }
}
