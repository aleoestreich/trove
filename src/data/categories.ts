// Turns Trove's category guesses into categories. Shared by the
// demo data and the Pluggy mapping (server/pluggy/map.ts), so it must only
// import types and data.
//
// The guessing rules (server/pluggy/map.ts) still use a fixed set of IDs
// ("food", "housing"…). Those that match a default category map to it; the
// rest stay uncategorized until one is chosen; transfers, card bill payments
// and money moved into or out of investments become transfers, which have no
// category.

import type { Category, CategoryKind, Transaction } from './types.js'

/** Guess ID → default category ID (src/data/categoryCatalog.ts). */
const TO_DEFAULT: Record<string, string> = {
  housing: 'home',
  utilities: 'home',
  groceries: 'groceries',
  food: 'restaurants',
  transport: 'transport',
  shopping: 'shopping',
  subscriptions: 'subscriptions',
  health: 'health',
  travel: 'travel',
  education: 'education',
  leisure: 'leisure',
  taxes: 'taxes',
  salary: 'salary',
  freelance: 'freelance',
  'investment-income': 'yields',
}

/** A guess as a category, or a transfer. `known`: the category IDs that exist (deleted ones aren't used). */
export function fromGuess(guess: string, known?: Set<string>): Pick<Transaction, 'categoryId' | 'transfer'> {
  if (guess === 'transfer') return { categoryId: null, transfer: 'own' }
  if (guess === 'card-payment') return { categoryId: null, transfer: 'card-payment' }
  if (guess === 'investment') return { categoryId: null, transfer: 'investment' }
  const id = TO_DEFAULT[guess] ?? null
  return { categoryId: id && (!known || known.has(id)) ? id : null }
}

/**
 * What a transaction counts for in income and spending: its amount, less the
 * part of an expense others owe ("A receber", `shared`) and the part of money
 * in that pays someone's debt back (`repaid`). Balances, bills and lists keep
 * the bank's amount.
 */
export function countedAmount(t: Pick<Transaction, 'amount' | 'shared' | 'repaid'>): number {
  return t.amount + (t.shared ?? 0) - (t.repaid ?? 0)
}

/**
 * What a transaction counts as: a transfer between connected accounts, else
 * its category's type, else (uncategorized) income when money came in and an
 * expense when it went out.
 */
export function kindOf(t: Pick<Transaction, 'transfer' | 'categoryId' | 'amount'>, categoriesById: Map<string, Category>): CategoryKind {
  if (t.transfer) return 'transfer'
  const category = t.categoryId ? categoriesById.get(t.categoryId) : undefined
  if (category) return category.type
  return t.amount > 0 ? 'income' : 'expense'
}
