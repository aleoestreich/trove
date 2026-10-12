// "Equilíbrio do mês": how a month's income splits between Essencial,
// Estilo de vida and Futuro, against a target (50/30/20 by default). Shared
// by the app and the server's edits (the target's rules), so it imports only
// types, data and date math.
//
// - Each expense category is in a group, Essencial or Estilo de vida, or in
//   none yet ("Sem grupo"). A subcategory may be in another group than its
//   category; otherwise it follows it.
// - Income: the month's income under the average income's filter (the same
//   "renda" as Renda média). For the month in progress it's the income
//   expected: the average of the last 3 complete months (or what already
//   came in, when that's more), since some income only arrives at the end
//   of the month.
// - Spending: expenses (kindOf), not hidden, so own transfers and card bill
//   payments never count, refunds reduce them, and an installment counts in
//   the month it's charged. Uncategorized expenses and those of a category
//   with no group are "Sem grupo".
// - Futuro = income − Essencial − Estilo de vida. "Sem grupo" sits inside
//   it until it's classified (so Futuro looks bigger than it is), and it
//   goes negative when those two groups pass the income.
// - Spending above the income (all three spending groups) is "Acima da renda".

import { kindOf } from './categories.js'
import { incomeByMonth } from './incomeAverage.js'
import { daysInMonth, lastMonths, monthKey } from '../lib/dates.js'
import type { BalanceTarget, Category, Cents, IncomeFilter, SpendingGroup, Subcategory, Transaction } from './types.js'

export type { BalanceTarget, SpendingGroup }
export const SPENDING_GROUPS: readonly SpendingGroup[] = ['essential', 'lifestyle']

export const DEFAULT_TARGET: BalanceTarget = { essential: 50, lifestyle: 30, future: 20 }

/** The ready-made targets, in the sheet's order. */
export const TARGET_PRESETS: readonly BalanceTarget[] = [
  { essential: 50, lifestyle: 30, future: 20 },
  { essential: 60, lifestyle: 20, future: 20 },
  { essential: 70, lifestyle: 20, future: 10 },
]

/** Within this many points of the target (above it for the spending groups, below it for Futuro): on target. */
export const ON_TARGET_POINTS = 5

/** "Sem grupo" above this share of the income: the split is incomplete. */
export const UNGROUPED_SHARE = 0.1

/** A target's shape: whole percents from 0 to 100 that add up to 100. */
export function isTarget(v: unknown): v is BalanceTarget {
  if (!v || typeof v !== 'object') return false
  const t = v as Record<string, unknown>
  const parts = [t.essential, t.lifestyle, t.future]
  return parts.every((p) => Number.isInteger(p) && (p as number) >= 0 && (p as number) <= 100) && parts.reduce((s: number, p) => s + (p as number), 0) === 100
}

export const sameTarget = (a: BalanceTarget, b: BalanceTarget) => a.essential === b.essential && a.lifestyle === b.lifestyle && a.future === b.future

/** Where a transaction's spending goes: 'ungrouped' for "Sem grupo". */
export type Bucket = SpendingGroup | 'ungrouped'

/** A row of a group's breakdown: a category, or one of its subcategories that went to another group. */
export interface BalanceItem {
  /** Null: uncategorized expenses. */
  categoryId: string | null
  /** Set when this row is a subcategory in another group than its category. */
  subcategoryId: string | null
  amount: Cents
  count: number
}

export interface MonthBalance {
  month: string
  /** The income the split is measured against: what came in, or for the month in progress the income expected. */
  income: Cents
  /** What came in during the month (so far). */
  received: Cents
  /** The month in progress: the income expected (average of the last 3 complete months); null for other months. */
  expected: Cents | null
  essential: Cents
  lifestyle: Cents
  /** "Sem grupo": inside the Futuro until classified. */
  ungrouped: Cents
  /** income − essential − lifestyle; negative when those pass the income. */
  future: Cents
  /** Spending above the income (essential + lifestyle + ungrouped − income), or 0. */
  overIncome: Cents
  /** Each group's rows, largest first (rows that add up to nothing or less are left out). */
  items: Record<Bucket, BalanceItem[]>
}

const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((i) => [i.id, i]))

/** The group a category's (or subcategory's) spending goes to. */
export function bucketOf(t: Pick<Transaction, 'categoryId' | 'subcategoryId'>, categoriesById: Map<string, Category>, subcategoriesById: Map<string, Subcategory>): Bucket {
  const category = t.categoryId ? categoriesById.get(t.categoryId) : undefined
  if (!category) return 'ungrouped'
  const sub = t.subcategoryId ? subcategoriesById.get(t.subcategoryId) : undefined
  if (sub && sub.categoryId === category.id && sub.group) return sub.group
  return category.group ?? 'ungrouped'
}

/** Complete months averaged for the income expected in the month in progress. */
export const EXPECTED_INCOME_MONTHS = 3

/**
 * The income expected in `month`: the average of up to 3 complete months
 * before it (from the first month with any data); 0 without any.
 */
export function expectedIncome(transactions: Transaction[], categories: Category[], subcategories: Subcategory[], filter: IncomeFilter, month: string): Cents {
  const first = transactions.reduce((min, t) => (!t.hidden && t.date < min ? t.date : min), '9999-12')
  const before = lastMonths(month, EXPECTED_INCOME_MONTHS + 1)
    .slice(0, -1)
    .filter((m) => m >= monthKey(first))
  if (!before.length) return 0
  const totals = incomeByMonth(transactions, categories, subcategories, filter, before).map((m) => m.total)
  return Math.round(totals.reduce((s, x) => s + x, 0) / totals.length)
}

/** One month's split. `today` (ISO date): the month in progress is measured against the income expected. */
export function monthBalance(
  transactions: Transaction[],
  categories: Category[],
  subcategories: Subcategory[],
  filter: IncomeFilter,
  month: string,
  today?: string,
): MonthBalance {
  return monthBalances(transactions, categories, subcategories, filter, [month], today)[0]
}

/** The split of each of `months`. */
export function monthBalances(
  transactions: Transaction[],
  categories: Category[],
  subcategories: Subcategory[],
  filter: IncomeFilter,
  months: string[],
  today?: string,
): MonthBalance[] {
  const categoriesById = byId(categories)
  const subcategoriesById = byId(subcategories)
  const incomes = new Map(incomeByMonth(transactions, categories, subcategories, filter, months).map((m) => [m.month, m.total]))
  const current = today ? monthKey(today) : null
  // month → bucket → row key → row
  const rows = new Map(months.map((m) => [m, new Map<Bucket, Map<string, BalanceItem>>()]))
  for (const t of transactions) {
    const perBucket = rows.get(monthKey(t.date))
    if (!perBucket || t.hidden || kindOf(t, categoriesById) !== 'expense') continue
    const bucket = bucketOf(t, categoriesById, subcategoriesById)
    const category = t.categoryId ? categoriesById.get(t.categoryId) : undefined
    const sub = t.subcategoryId ? subcategoriesById.get(t.subcategoryId) : undefined
    // A subcategory in another group than its category gets its own row.
    const moved = category && sub && sub.categoryId === category.id && sub.group && sub.group !== (category.group ?? null) ? sub.id : null
    const key = `${category?.id ?? ''}/${moved ?? ''}`
    const items = perBucket.get(bucket) ?? new Map<string, BalanceItem>()
    const item = items.get(key) ?? { categoryId: category?.id ?? null, subcategoryId: moved, amount: 0, count: 0 }
    item.amount -= t.amount
    item.count += 1
    items.set(key, item)
    perBucket.set(bucket, items)
  }
  return months.map((month) => {
    const perBucket = rows.get(month)!
    const sum = (b: Bucket) => [...(perBucket.get(b)?.values() ?? [])].reduce((s, i) => s + i.amount, 0)
    const list = (b: Bucket) => [...(perBucket.get(b)?.values() ?? [])].filter((i) => i.amount > 0).sort((a, b) => b.amount - a.amount)
    const received = incomes.get(month) ?? 0
    const expected = month === current ? expectedIncome(transactions, categories, subcategories, filter, month) : null
    const income = expected === null ? received : Math.max(received, expected)
    const essential = Math.max(0, sum('essential'))
    const lifestyle = Math.max(0, sum('lifestyle'))
    const ungrouped = Math.max(0, sum('ungrouped'))
    return {
      month,
      income,
      received,
      expected,
      essential,
      lifestyle,
      ungrouped,
      future: income - essential - lifestyle,
      overIncome: Math.max(0, essential + lifestyle + ungrouped - Math.max(0, income)),
      items: { essential: list('essential'), lifestyle: list('lifestyle'), ungrouped: list('ungrouped') },
    }
  })
}

/** Each group's share of the income, in percent (unrounded); null without income. */
export function shares(b: MonthBalance): BalanceTarget | null {
  if (b.income <= 0) return null
  const pct = (v: Cents) => (v / b.income) * 100
  return { essential: pct(b.essential), lifestyle: pct(b.lifestyle), future: pct(b.future) }
}

/** Rounded shares that still add up to 100 (Futuro takes the rounding). */
export function roundedShares(b: MonthBalance): BalanceTarget | null {
  const s = shares(b)
  if (!s) return null
  const essential = Math.round(s.essential)
  const lifestyle = Math.round(s.lifestyle)
  return { essential, lifestyle, future: 100 - essential - lifestyle }
}

/** The group furthest from its target, in points (positive: above for spending, below for Futuro). */
export interface Deviation {
  group: SpendingGroup | 'future'
  points: number
}

export type BalanceStatus =
  /** No income in the month: amounts only, no percentages. */
  | { kind: 'noIncome' }
  /** Spending passed the income. */
  | { kind: 'overIncome'; amount: Cents }
  /** The current month, so far. */
  | { kind: 'partial'; early: boolean }
  /** Too much "Sem grupo" to judge. */
  | { kind: 'incomplete'; amount: Cents }
  | { kind: 'onTarget' }
  | { kind: 'attention'; worst: Deviation }

/** Before this day, the month in progress is "at the start". */
const EARLY_UNTIL_DAY = 15

/** The month's verdict. `today`: the current day (ISO), to tell the month in progress. */
export function balanceStatus(b: MonthBalance, target: BalanceTarget, today: string): BalanceStatus {
  if (b.income <= 0) return { kind: 'noIncome' }
  if (b.overIncome > 0) return { kind: 'overIncome', amount: b.overIncome }
  if (b.month === monthKey(today)) return { kind: 'partial', early: Number(today.slice(8, 10)) <= EARLY_UNTIL_DAY }
  if (b.ungrouped > b.income * UNGROUPED_SHARE) return { kind: 'incomplete', amount: b.ungrouped }
  const worst = worstDeviation(b, target)
  return worst && worst.points > ON_TARGET_POINTS ? { kind: 'attention', worst } : { kind: 'onTarget' }
}

/** The group furthest past its target (spending above it, Futuro below it); null without income. */
export function worstDeviation(b: MonthBalance, target: BalanceTarget): Deviation | null {
  const s = roundedShares(b)
  if (!s) return null
  const candidates: Deviation[] = [
    { group: 'essential', points: s.essential - target.essential },
    { group: 'lifestyle', points: s.lifestyle - target.lifestyle },
    { group: 'future', points: target.future - s.future },
  ]
  return candidates.reduce((w, c) => (c.points > w.points ? c : w))
}

/** Days of the month so far: "12 de 31". */
export function daysSoFar(month: string, today: string): { day: number; of: number } {
  return { day: Number(today.slice(8, 10)), of: daysInMonth(month) }
}

/** The months the trend shows, oldest first: the last `count` complete ones. */
export function trendMonths(today: string, count: number): string[] {
  return lastMonths(monthKey(today), count + 1).slice(0, -1)
}

/** Whether any expense category (or subcategory) is in a group yet. */
export function hasGroups(categories: Category[], subcategories: Subcategory[]): boolean {
  const expense = new Set(categories.filter((c) => c.type === 'expense').map((c) => c.id))
  return categories.some((c) => c.type === 'expense' && c.group) || subcategories.some((s) => s.group && expense.has(s.categoryId))
}

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Words in a category's name that suggest a group (accents and case ignored). */
const NAME_HINTS: [SpendingGroup, RegExp][] = [
  [
    'essential',
    /\b(moradia|casa|aluguel|condominio|energia|luz\b|agua|gas\b|internet|telefone|celular|contas?\b|mercado|supermercado|feira|saude|farmacia|medic|dentista|hospital|exame|transporte|combustivel|onibus|metro|educacao|escola|faculdade|creche|filhos?|seguros?|impostos?|iptu|ipva|taxas?|financiamento|emprestimo)/,
  ],
  [
    'lifestyle',
    /\b(restaurante|delivery|ifood|lanche|bar\b|bares\b|cafe|lazer|viage|passeio|compras|shopping|roupas?|assinatura|streaming|cinema|jogos?|games?|hobb|presentes?|beleza|eletronico|festa|show)/,
  ],
]

/** Icons that suggest a group, when the name says nothing. */
const ICON_HINTS: Record<string, SpendingGroup> = {
  home: 'essential',
  bolt: 'essential',
  droplet: 'essential',
  flame: 'essential',
  wifi: 'essential',
  phone: 'essential',
  cart: 'essential',
  heart: 'essential',
  pill: 'essential',
  stethoscope: 'essential',
  tooth: 'essential',
  bus: 'essential',
  fuel: 'essential',
  backpack: 'essential',
  book: 'essential',
  stroller: 'essential',
  shield: 'essential',
  receipt: 'essential',
  fork: 'lifestyle',
  coffee: 'lifestyle',
  pizza: 'lifestyle',
  beer: 'lifestyle',
  delivery: 'lifestyle',
  bag: 'lifestyle',
  shirt: 'lifestyle',
  package: 'lifestyle',
  gift: 'lifestyle',
  lipstick: 'lifestyle',
  laptop: 'lifestyle',
  game: 'lifestyle',
  film: 'lifestyle',
  music: 'lifestyle',
  repeat: 'lifestyle',
  ball: 'lifestyle',
  plane: 'lifestyle',
  suitcase: 'lifestyle',
  beach: 'lifestyle',
}

/** A suggested group for a category, from its name, then its icon; null when neither says. */
export function suggestGroup(category: Pick<Category, 'name' | 'icon'>): SpendingGroup | null {
  const name = normalize(category.name)
  for (const [group, re] of NAME_HINTS) if (re.test(name)) return group
  return ICON_HINTS[category.icon] ?? null
}
