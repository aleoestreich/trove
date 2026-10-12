import type { Account, Category, Cents, Transaction } from '../data/types'
import { countedAmount, kindOf } from '../data/categories'
import { monthKey } from './dates'

export interface Totals {
  income: Cents
  /** Positive number: money spent (refunds reduce it). */
  expenses: Cents
  net: Cents
}

/** What a transaction counts as (shared with the server: src/data/categories.ts). */
export { kindOf }

/** Transactions that count: everything except hidden ones. */
export const visible = (transactions: Transaction[]): Transaction[] => transactions.filter((t) => !t.hidden)

/**
 * Income and expenses for a set of transactions. Transfers between your own
 * accounts and credit-card bill payments are excluded, so money moving
 * between accounts is never counted twice. Card purchases count as expenses
 * on the day they happen, not when the bill is paid. Hidden transactions are
 * left out.
 */
export function totals(transactions: Transaction[], categoriesById: Map<string, Category>): Totals {
  let income = 0
  let expenses = 0
  for (const t of transactions) {
    if (t.hidden) continue
    const kind = kindOf(t, categoriesById)
    if (kind === 'income') income += countedAmount(t)
    else if (kind === 'expense') expenses -= countedAmount(t)
  }
  return { income, expenses, net: income - expenses }
}

export function inMonth(transactions: Transaction[], month: string): Transaction[] {
  return transactions.filter((t) => monthKey(t.date) === month)
}

export interface CategoryTotal {
  /** Null: the uncategorized expenses. */
  category: Category | null
  amount: Cents
}

/** Expenses per category, largest first, with uncategorized ones as `category: null` (hidden ones left out). */
export function expensesByCategory(transactions: Transaction[], categoriesById: Map<string, Category>): CategoryTotal[] {
  const sums = new Map<string | null, Cents>()
  for (const t of transactions) {
    if (t.hidden || kindOf(t, categoriesById) !== 'expense') continue
    const key = t.categoryId && categoriesById.has(t.categoryId) ? t.categoryId : null
    sums.set(key, (sums.get(key) ?? 0) - countedAmount(t))
  }
  return [...sums]
    .map(([id, amount]) => ({ category: id ? categoriesById.get(id)! : null, amount }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount)
}

export interface SubcategoryTotal {
  /** Null: the category's expenses without a subcategory. */
  subcategoryId: string | null
  amount: Cents
}

/**
 * One category's expenses by subcategory, largest first, with those without
 * one last as `null`. Empty when none has a subcategory.
 */
export function expensesBySubcategory(transactions: Transaction[], categoryId: string): SubcategoryTotal[] {
  const sums = new Map<string | null, Cents>()
  let anySub = false
  for (const t of transactions) {
    if (t.hidden || t.transfer || t.categoryId !== categoryId) continue
    if (t.subcategoryId) anySub = true
    const key = t.subcategoryId ?? null
    sums.set(key, (sums.get(key) ?? 0) - countedAmount(t))
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
