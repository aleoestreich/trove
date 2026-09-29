// Trove's categories. Shared by the demo data and the Pluggy mapping
// (server/pluggy/map.ts), so it must only import types.

import type { Category } from './types.js'

export const categories: Category[] = [
  { id: 'salary', name: 'Salary', kind: 'income' },
  { id: 'freelance', name: 'Freelance', kind: 'income' },
  { id: 'investments', name: 'Investment income', kind: 'income' },
  { id: 'other-income', name: 'Other income', kind: 'income' },
  { id: 'housing', name: 'Housing', kind: 'expense' },
  { id: 'utilities', name: 'Bills & utilities', kind: 'expense' },
  { id: 'groceries', name: 'Groceries', kind: 'expense' },
  { id: 'food', name: 'Restaurants & delivery', kind: 'expense' },
  { id: 'transport', name: 'Transport', kind: 'expense' },
  { id: 'subscriptions', name: 'Subscriptions', kind: 'expense' },
  { id: 'shopping', name: 'Shopping', kind: 'expense' },
  { id: 'health', name: 'Health & fitness', kind: 'expense' },
  { id: 'leisure', name: 'Leisure', kind: 'expense' },
  { id: 'travel', name: 'Travel', kind: 'expense' },
  { id: 'education', name: 'Education', kind: 'expense' },
  { id: 'taxes', name: 'Taxes & fees', kind: 'expense' },
  { id: 'other-expense', name: 'Other expenses', kind: 'expense' },
  { id: 'transfer', name: 'Transfer between accounts', kind: 'transfer' },
  { id: 'card-payment', name: 'Credit card payment', kind: 'transfer' },
]
