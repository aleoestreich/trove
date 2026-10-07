// The Transações filters, shared by the app (the list) and the server
// (GET /api/transactions, which applies them when fetching older months).
// Imports only types and helpers the server can use.

import { kindOf } from './categories.js'
import { monthKey } from '../lib/dates.js'
import type { Category, CategoryKind, Transaction } from './types.js'

export interface TransactionFilters {
  month?: string
  accountId?: string
  /** A category ID, or "none" for uncategorized. */
  categoryId?: string
  kind?: CategoryKind
  query?: string
}

/** What GET /api/transactions fetches: a month ("YYYY-MM") or every stored month ("all"), with the other filters. */
export interface TransactionQuery extends Omit<TransactionFilters, 'month'> {
  month: string
}

/** The transactions matching the filters. Hidden ones are left out (they have their own view). */
export function filterTransactions(transactions: Transaction[], categoriesById: Map<string, Category>, f: TransactionFilters): Transaction[] {
  const q = f.query?.trim().toLowerCase()
  return transactions.filter(
    (t) =>
      !t.hidden &&
      (!f.month || monthKey(t.date) === f.month) &&
      (!f.accountId || t.accountId === f.accountId) &&
      (!f.categoryId || (f.categoryId === 'none' ? !t.transfer && !(t.categoryId && categoriesById.has(t.categoryId)) : t.categoryId === f.categoryId)) &&
      (!f.kind || kindOf(t, categoriesById) === f.kind) &&
      (!q || t.description.toLowerCase().includes(q)),
  )
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const KINDS: readonly string[] = ['income', 'expense', 'transfer']

/** A query from URL parameters (month, account, category, type, q); null when invalid. */
export function parseTransactionQuery(p: URLSearchParams): TransactionQuery | null {
  const month = p.get('month') ?? ''
  if (month !== 'all' && !MONTH.test(month)) return null
  const kind = p.get('type') || undefined
  if (kind && !KINDS.includes(kind)) return null
  const query = p.get('q')?.slice(0, 100) || undefined
  return { month, accountId: p.get('account') || undefined, categoryId: p.get('category') || undefined, kind: kind as CategoryKind | undefined, query }
}

/** The URL parameters for a query (the inverse of parseTransactionQuery). */
export function transactionQueryParams(q: TransactionQuery): URLSearchParams {
  const p = new URLSearchParams({ month: q.month })
  if (q.accountId) p.set('account', q.accountId)
  if (q.categoryId) p.set('category', q.categoryId)
  if (q.kind) p.set('type', q.kind)
  if (q.query) p.set('q', q.query)
  return p
}
