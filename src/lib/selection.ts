// Bulk selection on the Transactions screen: which rows can be selected, the
// state of a day's checkbox, ranges, and what a selection holds. Pure, so the
// rules are tested without a browser.

import { kindOf } from '../data/categories'
import type { Category, CategoryKind, Cents, Transaction } from '../data/types'

/** Transfers between own accounts and card bill payments have no category, so they can't be selected. */
export const selectable = (tx: Transaction) => !tx.transfer

export type CheckState = 'on' | 'off' | 'mixed' | 'disabled'

/** The IDs "Selecionar tudo" selects: every selectable row shown (the active search and filters apply). */
export const selectAllIds = (shown: Transaction[]): string[] => shown.filter(selectable).map((t) => t.id)

/** A group's checkbox (a day, or every row shown): all, none or some of its selectable rows. */
export function groupState(txs: Transaction[], selected: ReadonlySet<string>): CheckState {
  const ids = selectAllIds(txs)
  if (ids.length === 0) return 'disabled'
  const n = ids.filter((id) => selected.has(id)).length
  return n === 0 ? 'off' : n === ids.length ? 'on' : 'mixed'
}

/** Toggles a group: selects its selectable rows, or clears them when all are already selected. */
export function toggleGroup(txs: Transaction[], selected: ReadonlySet<string>): Set<string> {
  const next = new Set(selected)
  const ids = selectAllIds(txs)
  if (groupState(txs, selected) === 'on') for (const id of ids) next.delete(id)
  else for (const id of ids) next.add(id)
  return next
}

/** Shift + click: the selectable rows from `anchor` to `target` (in the order shown), both included. */
export function rangeIds(shown: Transaction[], anchor: string, target: string): string[] {
  const a = shown.findIndex((t) => t.id === anchor)
  const b = shown.findIndex((t) => t.id === target)
  if (a < 0 || b < 0) return [target]
  const [from, to] = a < b ? [a, b] : [b, a]
  return selectAllIds(shown.slice(from, to + 1))
}

export interface SelectionSummary {
  count: number
  /** Signed sum in BRL (foreign rows count by their BRL value). */
  total: Cents
  /** Expense or income when all selected rows are of one kind; null when mixed or empty. */
  kind: Exclude<CategoryKind, 'transfer'> | null
  /** What the selection is filed under today, most common first ("Hoje estão em"). */
  current: { categoryId: string | null; subcategoryId: string | null; count: number }[]
}

export function summarize(txs: Transaction[], categoriesById: Map<string, Category>): SelectionSummary {
  const kinds = new Set(txs.map((t) => kindOf(t, categoriesById)))
  const kind = kinds.size === 1 ? [...kinds][0] : null
  const groups = new Map<string, SelectionSummary['current'][number]>()
  for (const t of txs) {
    const categoryId = t.categoryId && categoriesById.has(t.categoryId) ? t.categoryId : null
    const subcategoryId = categoryId ? (t.subcategoryId ?? null) : null
    const key = `${categoryId}|${subcategoryId}`
    const g = groups.get(key) ?? { categoryId, subcategoryId, count: 0 }
    g.count++
    groups.set(key, g)
  }
  return {
    count: txs.length,
    total: txs.reduce((sum, t) => sum + t.amount, 0),
    kind: kind === 'transfer' ? null : kind,
    current: [...groups.values()].sort((a, b) => b.count - a.count),
  }
}

/**
 * The bulk sheet's chosen category and subcategory, while they still fit the
 * selection: the category is of the selection's kind and the subcategory is
 * one of its own. The selection can change after the pick (desktop rows stay
 * checkable), so a pick for expenses never applies to income.
 */
export function bulkPick<S extends { categoryId: string }>(
  kind: SelectionSummary['kind'],
  category: Category | undefined,
  sub: S | undefined,
): { category?: Category; sub?: S } {
  if (!category || category.type !== kind) return {}
  return { category, sub: sub?.categoryId === category.id ? sub : undefined }
}
