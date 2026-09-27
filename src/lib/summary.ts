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
