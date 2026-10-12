// The average income and its category filter. Shared by the app (the card
// and the picker's live preview) and the server (/api/overview/income-average,
// the saved filter), so both count the same way. Imports only types and data.
//
// What counts: income (kindOf, so own transfers, card bill payments and
// expenses never do), not hidden, in the categories and subcategories the
// filter keeps. Amounts are in BRL (foreign ones converted at the stored rate
// when read). The average covers the complete months among the last 6
// (from the first month with any data); the current month is only compared.

import { countedAmount, kindOf } from './categories.js'
import type { Category, Cents, IncomeFilter, Subcategory, Transaction } from './types.js'

/** Complete months in the average. */
export const AVERAGE_MONTHS = 6

export const NO_FILTER: IncomeFilter = { excludedCategoryIds: [], excludedSubcategoryIds: [], excludeUncategorized: false }

export interface MonthTotal {
  month: string
  total: Cents
}

export interface IncomeAverage {
  /** Monthly average over `months` (filtered), in cents. */
  average: Cents
  /** The complete months, oldest first. */
  months: MonthTotal[]
  lowest: MonthTotal
  highest: MonthTotal
  /** The month in progress, and how it compares with the average (%). */
  currentMonth: MonthTotal & { vsAverage: number }
  /** The average with every income category included. */
  allAverage: Cents
}

const monthOf = (iso: string) => iso.slice(0, 7)

/** Month keys ending at `end`, oldest first. */
function monthsBack(end: string, count: number): string[] {
  const [y, m] = end.split('-').map(Number)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (count - 1 - i), 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  })
}

/** The months the average looks at: up to 6 complete ones from the first month with data, then the current one. */
export function averageMonths(transactions: Transaction[], currentMonth: string): string[] {
  const first = transactions.reduce((min, t) => (!t.hidden && t.date < min ? t.date : min), '9999-12')
  return monthsBack(currentMonth, AVERAGE_MONTHS + 1).filter((m) => m >= monthOf(first))
}

/**
 * Which part of the filter a transaction belongs to: its income category and
 * subcategory, or uncategorized. Null when it isn't income that can count.
 */
function slotOf(t: Transaction, categoriesById: Map<string, Category>, subcategoriesById: Map<string, Subcategory>) {
  if (t.hidden || kindOf(t, categoriesById) !== 'income') return null
  const category = t.categoryId ? categoriesById.get(t.categoryId) : undefined
  if (!category) return { categoryId: null, subcategoryId: null }
  const sub = t.subcategoryId ? subcategoriesById.get(t.subcategoryId) : undefined
  return { categoryId: category.id, subcategoryId: sub && sub.categoryId === category.id ? sub.id : null }
}

/** Whether a slot counts under the filter. */
function counts(slot: { categoryId: string | null; subcategoryId: string | null }, filter: IncomeFilter): boolean {
  if (!slot.categoryId) return !filter.excludeUncategorized
  if (filter.excludedCategoryIds.includes(slot.categoryId)) return false
  return !slot.subcategoryId || !filter.excludedSubcategoryIds.includes(slot.subcategoryId)
}

const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((i) => [i.id, i]))

/** Income per month under the filter, for `months`. */
export function incomeByMonth(
  transactions: Transaction[],
  categories: Category[],
  subcategories: Subcategory[],
  filter: IncomeFilter,
  months: string[],
): MonthTotal[] {
  const categoriesById = byId(categories)
  const subcategoriesById = byId(subcategories)
  const sums = new Map(months.map((m) => [m, 0]))
  for (const t of transactions) {
    const month = monthOf(t.date)
    if (!sums.has(month)) continue
    const slot = slotOf(t, categoriesById, subcategoriesById)
    if (slot && counts(slot, filter)) sums.set(month, sums.get(month)! + countedAmount(t))
  }
  return months.map((month) => ({ month, total: sums.get(month)! }))
}

const averageOf = (totals: Cents[]) => (totals.length ? Math.round(totals.reduce((s, x) => s + x, 0) / totals.length) : 0)

/** The average income card's figures under the filter; null without a complete month. */
export function incomeAverage(
  transactions: Transaction[],
  categories: Category[],
  subcategories: Subcategory[],
  filter: IncomeFilter,
  currentMonth: string,
): IncomeAverage | null {
  const months = averageMonths(transactions, currentMonth)
  if (months.length < 2) return null
  const perMonth = incomeByMonth(transactions, categories, subcategories, filter, months)
  const complete = perMonth.slice(0, -1)
  const current = perMonth.at(-1)!
  const average = averageOf(complete.map((m) => m.total))
  const sorted = [...complete].sort((a, b) => a.total - b.total)
  const all = incomeByMonth(transactions, categories, subcategories, NO_FILTER, months.slice(0, -1))
  return {
    average,
    months: complete,
    lowest: sorted[0],
    highest: sorted[sorted.length - 1],
    currentMonth: { ...current, vsAverage: average > 0 ? ((current.total - average) / average) * 100 : 0 },
    allAverage: averageOf(all.map((m) => m.total)),
  }
}

/** One option of the picker: its monthly average, and its income per complete month (for the live preview). */
export interface IncomeOptionAmounts {
  average: Cents
  totals: Cents[]
}

export interface IncomeOptions {
  /** The complete months the amounts cover, oldest first. */
  months: string[]
  categories: (IncomeOptionAmounts & {
    id: string
    /** Its transactions without a subcategory. */
    unassigned: Cents[]
    subcategories: (IncomeOptionAmounts & { id: string })[]
  })[]
  uncategorized: IncomeOptionAmounts
}

/** Every income category, its subcategories and "uncategorized", each with its income per complete month and average. */
export function incomeOptions(transactions: Transaction[], categories: Category[], subcategories: Subcategory[], currentMonth: string): IncomeOptions {
  const months = averageMonths(transactions, currentMonth).slice(0, -1)
  const index = new Map(months.map((m, i) => [m, i]))
  const categoriesById = byId(categories)
  const subcategoriesById = byId(subcategories)
  const zeros = () => months.map(() => 0)
  const income = categories.filter((c) => c.type === 'income')
  const perCategory = new Map(income.map((c) => [c.id, { total: zeros(), unassigned: zeros() }]))
  const perSub = new Map<string, Cents[]>()
  const uncategorized = zeros()
  for (const t of transactions) {
    const i = index.get(monthOf(t.date))
    if (i === undefined) continue
    const slot = slotOf(t, categoriesById, subcategoriesById)
    if (!slot) continue
    const amount = countedAmount(t)
    if (!slot.categoryId) {
      uncategorized[i] += amount
      continue
    }
    const c = perCategory.get(slot.categoryId)
    if (!c) continue // income in a category of the other type: not an option
    c.total[i] += amount
    if (slot.subcategoryId) {
      const s = perSub.get(slot.subcategoryId) ?? zeros()
      s[i] += amount
      perSub.set(slot.subcategoryId, s)
    } else c.unassigned[i] += amount
  }
  const amounts = (totals: Cents[]): IncomeOptionAmounts => ({ average: averageOf(totals), totals })
  return {
    months,
    categories: income.map((c) => ({
      id: c.id,
      ...amounts(perCategory.get(c.id)!.total),
      unassigned: perCategory.get(c.id)!.unassigned,
      subcategories: subcategories.filter((s) => s.categoryId === c.id).map((s) => ({ id: s.id, ...amounts(perSub.get(s.id) ?? zeros()) })),
    })),
    uncategorized: amounts(uncategorized),
  }
}

/** The average a filter would give, from the options' monthly totals (no request needed). Matches incomeAverage. */
export function previewAverage(options: IncomeOptions, filter: IncomeFilter): Cents {
  const sums = options.months.map(() => 0)
  const add = (totals: Cents[]) => totals.forEach((v, i) => (sums[i] += v))
  if (!filter.excludeUncategorized) add(options.uncategorized.totals)
  for (const c of options.categories) {
    if (filter.excludedCategoryIds.includes(c.id)) continue
    add(c.unassigned)
    for (const s of c.subcategories) if (!filter.excludedSubcategoryIds.includes(s.id)) add(s.totals)
  }
  return averageOf(sums)
}

/** A category's state in the picker: all of it, part of it (some subcategories), or none. */
export function categoryState(category: Category, subcategories: Subcategory[], filter: IncomeFilter): 'on' | 'mixed' | 'off' {
  if (filter.excludedCategoryIds.includes(category.id)) return 'off'
  const subs = subcategories.filter((s) => s.categoryId === category.id)
  const out = subs.filter((s) => filter.excludedSubcategoryIds.includes(s.id)).length
  return out === 0 ? 'on' : out === subs.length ? 'off' : 'mixed'
}

/**
 * The filter in canonical form: only existing income categories and their
 * subcategories; a category whose subcategories are all unticked is excluded
 * as a whole (so no "empty but counted" state).
 */
export function normalizeIncomeFilter(filter: IncomeFilter, categories: Category[], subcategories: Subcategory[]): IncomeFilter {
  const income = categories.filter((c) => c.type === 'income')
  const excludedCategoryIds = income
    .filter((c) => {
      if (filter.excludedCategoryIds.includes(c.id)) return true
      const subs = subcategories.filter((s) => s.categoryId === c.id)
      return subs.length > 0 && subs.every((s) => filter.excludedSubcategoryIds.includes(s.id))
    })
    .map((c) => c.id)
  const excludedSubcategoryIds = subcategories
    .filter((s) => filter.excludedSubcategoryIds.includes(s.id) && income.some((c) => c.id === s.categoryId) && !excludedCategoryIds.includes(s.categoryId))
    .map((s) => s.id)
  return { excludedCategoryIds, excludedSubcategoryIds, excludeUncategorized: filter.excludeUncategorized }
}

/** Whether a filter leaves at least one option counted. */
export function hasSelection(filter: IncomeFilter, categories: Category[], subcategories: Subcategory[]): boolean {
  if (!filter.excludeUncategorized) return true
  return categories.some((c) => c.type === 'income' && categoryState(c, subcategories, filter) !== 'off')
}

export interface FilterSummary {
  /** Nothing excluded. */
  all: boolean
  /** The options counted, in order: a category's name (partial when some subcategories are out), then uncategorized. */
  included: { name: string; partial: boolean }[]
  /** Options in all: the income categories and uncategorized. */
  total: number
}

/** What the filter keeps, for the card's pill (names come from the caller: "Sem categoria" is UI text). */
export function summarizeIncomeFilter(
  filter: IncomeFilter,
  categories: Category[],
  subcategories: Subcategory[],
  uncategorizedName: string,
): FilterSummary {
  const income = categories.filter((c) => c.type === 'income')
  const included: FilterSummary['included'] = []
  for (const c of income) {
    const state = categoryState(c, subcategories, filter)
    if (state !== 'off') included.push({ name: c.name, partial: state === 'mixed' })
  }
  if (!filter.excludeUncategorized) included.push({ name: uncategorizedName, partial: false })
  const total = income.length + 1
  return { all: included.length === total && included.every((i) => !i.partial), included, total }
}

/** Removes IDs of categories and subcategories that no longer exist (after a delete). */
export function pruneIncomeFilter(filter: IncomeFilter, categories: Category[], subcategories: Subcategory[]): IncomeFilter {
  const cats = new Set(categories.map((c) => c.id))
  const subs = new Set(subcategories.map((s) => s.id))
  return {
    excludedCategoryIds: filter.excludedCategoryIds.filter((id) => cats.has(id)),
    excludedSubcategoryIds: filter.excludedSubcategoryIds.filter((id) => subs.has(id)),
    excludeUncategorized: filter.excludeUncategorized,
  }
}

/** The pill's text: "Salário, Freelance", "Salário (parcial)", or "Todas as receitas". */
export function filterLabel(summary: FilterSummary, words: { all: string; partial: string }): string {
  if (summary.all) return words.all
  return summary.included.map((i) => (i.partial ? `${i.name} ${words.partial}` : i.name)).join(', ')
}

/** "A", "A e B", "A, B e C". */
export function joinNames(names: string[], and: string): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} ${and} ${names.at(-1)}`
}
