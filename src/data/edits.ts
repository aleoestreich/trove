// Changes to categories and transactions, and the rules they
// follow. Shared by the app (instant updates), the demo repository (which
// stores them) and the server, which applies the same rules in SQL
// (server/db/edits.ts). Imports only types and data, so the server can use it.

import { kindOf } from './categories.js'
import { CATEGORY_COLORS, CATEGORY_ICONS, DEFAULT_CATEGORIES } from './categoryCatalog.js'
import { hasSelection, normalizeIncomeFilter, pruneIncomeFilter } from './incomeAverage.js'
import { RECURRING_ACTIONS, applyRecurringAction, type RecurringAction } from './recurring.js'
import { FGTS_MAX, NO_FGTS, sortFgts, type FgtsEntry } from './fgts.js'
import { NO_PENSION, PENSION_MAX, PLAN_NAME_MAX, PLAN_TYPES, sortPensionEntries, type Pension, type PlanType } from './pension.js'
import { SPENDING_GROUPS, isTarget } from './spendingBalance.js'
import { isLayout, normalizeLayout } from './overviewLayout.js'
import { isExtraPay, normalizeExtraPay } from './extraPay.js'
import { PERSON_MAX, RECEIVABLE_MAX, canBeOwed, canRepay, owedOf, received, sortPayments, usedOf, type Receivable } from './receivables.js'
import type { BalanceTarget, Category, ExtraPay, OverviewLayout, CategoryType, IncomeFilter, ProjectionHorizon, ProjectionSettings, Snapshot, SpendingGroup, Subcategory, Transaction, TransferOverride } from './types.js'

export type Edit =
  /** Sets a transaction's category and subcategory (null: uncategorized / none). */
  | { op: 'categorize'; transactionId: string; categoryId: string | null; subcategoryId: string | null }
  | { op: 'hide'; transactionId: string; hidden: boolean }
  | { op: 'createCategory'; category: { id: string; name: string; type: CategoryType; color: string; icon: string } }
  | { op: 'updateCategory'; id: string; changes: { name?: string; type?: CategoryType; color?: string; icon?: string } }
  /** Its subcategories go too; its transactions become uncategorized. */
  | { op: 'deleteCategory'; id: string }
  | { op: 'createSubcategory'; subcategory: { id: string; categoryId: string; name: string } }
  | { op: 'renameSubcategory'; id: string; name: string }
  /** Its transactions keep their category, without a subcategory. */
  | { op: 'deleteSubcategory'; id: string }
  /** Moves a subcategory to another category, with every transaction that uses it. */
  | { op: 'linkSubcategory'; id: string; categoryId: string }
  /**
   * Sets the same category and subcategory on many transactions, all or none
   * (see checkBulk), or leaves them all uncategorized (both null). The server
   * answers with a BulkResult, for undo.
   */
  | { op: 'categorizeMany'; transactionIds: string[]; categoryId: string | null; subcategoryId: string | null }
  /** Puts back what categorizeMany replaced (its BulkResult's `previous`). */
  | { op: 'restoreCategories'; items: PreviousCategory[] }
  /** Marks a transaction as an own transfer ('own'), a card bill payment ('card-payment') or an investment move ('investment'), or says it is none of them ('none'). */
  | { op: 'setTransferOverride'; transactionId: string; value: TransferOverride }
  /** Which income categories count in the average income (stored as exclusions). */
  | { op: 'setIncomeFilter'; filter: IncomeFilter }
  /** What the month-end projection counts. */
  | { op: 'setProjectionSettings'; settings: ProjectionSettings }
  /** A hand-set answer about a detected recurring charge, given on `at` (ISO date). */
  | { op: 'recurringAction'; id: string; action: RecurringAction; at: string }
  /** Names an account or card in Trove; null goes back to the bank's name. */
  | { op: 'renameAccount'; accountId: string; name: string | null }
  /** Sets a card's closing and due days (1–31); null goes back to the bank's dates (or the bills'). */
  | { op: 'setCardDays'; accountId: string; days: { close: number; due: number } | null }
  /** Shows or hides the FGTS balance (src/data/fgts.ts); hiding keeps its history. */
  | { op: 'setFgtsTracking'; tracking: boolean }
  /** Adds an FGTS balance, or corrects one with the same ID. */
  | { op: 'saveFgtsBalance'; entry: FgtsEntry }
  | { op: 'deleteFgtsBalance'; id: string }
  /** Deletes every FGTS balance. */
  | { op: 'clearFgtsHistory' }
  /** Shows or hides the previdência privada plans (src/data/pension.ts); hiding keeps them. */
  | { op: 'setPensionTracking'; tracking: boolean }
  /** Adds a plan, or renames one / changes its type, by ID. */
  | { op: 'savePensionPlan'; plan: { id: string; name: string; type: PlanType | null } }
  /** Deletes a plan with its whole history. */
  | { op: 'deletePensionPlan'; id: string }
  /** Adds a plan's balance, or corrects one with the same ID. */
  | { op: 'savePensionBalance'; planId: string; entry: FgtsEntry }
  | { op: 'deletePensionBalance'; planId: string; id: string }
  /**
   * Puts expense categories in a group of the "Equilíbrio do mês" (null: none
   * yet), all or none. Organizing them all at once, and its undo.
   */
  | { op: 'setCategoryGroups'; groups: { categoryId: string; group: SpendingGroup | null }[] }
  /** Puts a subcategory of an expense category in a group of its own (null: it follows its category). */
  | { op: 'setSubcategoryGroup'; id: string; group: SpendingGroup | null }
  /** The "Equilíbrio do mês" target (whole percents that add up to 100). */
  | { op: 'setBalanceTarget'; target: BalanceTarget }
  /** The Visão geral's order and hidden cards (every card listed once in `order`). */
  | { op: 'setOverviewLayout'; layout: OverviewLayout }
  /** "13º e férias": on or off, the salary, the 13º's 1st part and the planned vacations. */
  | { op: 'setExtraPay'; extraPay: ExtraPay }
  | ReceivableEdit

/**
 * "A receber" (src/data/receivables.ts): marks part or all of an expense as
 * owed by someone, or changes who and how much (by ID; its expense stays);
 * deletes one with its payments; records a payment back (by ID: a correction),
 * from an incoming transaction or typed in by hand (transactionId null); or
 * deletes a payment. The rules: applyReceivableEdit.
 */
export type ReceivableEdit =
  | { op: 'saveReceivable'; receivable: { id: string; transactionId: string; person: string; amount: number } }
  | { op: 'deleteReceivable'; id: string }
  | { op: 'saveReceivablePayment'; receivableId: string; payment: { id: string; date: string; amount: number; transactionId: string | null } }
  | { op: 'deleteReceivablePayment'; receivableId: string; id: string }

export const RECEIVABLE_OPS: readonly ReceivableEdit['op'][] = ['saveReceivable', 'deleteReceivable', 'saveReceivablePayment', 'deleteReceivablePayment']
export const isReceivableEdit = (e: Edit): e is ReceivableEdit => (RECEIVABLE_OPS as readonly string[]).includes(e.op)

/** A transaction's category before a bulk change. `editedAt`: when it was last set by hand (server only). */
export interface PreviousCategory {
  id: string
  categoryId: string | null
  subcategoryId: string | null
  editedAt?: string | null
}

/** What categorizeMany changed: the count, and the values it replaced. */
export interface BulkResult {
  updated: number
  previous: PreviousCategory[]
}

/** Why a bulk change is refused (EditError.reason), for the app to explain. */
export type BulkReason = 'transfer' | 'mixed_types' | 'category_type' | 'subcategory_category' | 'nothing_selected' | 'not_income'

/**
 * Why a receivable edit is refused: the transaction isn't money out (or, for
 * a payment, money in); more than the expense would be owed; a payment would
 * go beyond what's owed, or beyond what came in; what's owed would drop below
 * what was already paid back; or its expense would change.
 */
export type ReceivableReason = 'not_expense' | 'not_money_in' | 'over_expense' | 'over_owed' | 'over_received' | 'below_received' | 'other_transaction'

/** The most transactions one bulk change may touch. */
export const BULK_MAX = 2000

export class EditError extends Error {
  constructor(
    readonly code: 'not_found' | 'invalid' | 'name_taken',
    message: string,
    readonly reason?: BulkReason | ReceivableReason,
  ) {
    super(message)
  }
}

export const NAME_MAX = 40
/** Longest name set in Trove for an account or card. */
export const NICKNAME_MAX = 30
const ID = /^[A-Za-z0-9_-]{1,64}$/
/** A real calendar day, YYYY-MM-DD. */
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v

/** A name as stored: trimmed, single spaces. */
export const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ')
const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0

/** Checks an edit's shape (IDs, names, colour and icon keys) without looking at any data. */
export function validateEdit(e: unknown): Edit {
  const bad = (what: string): never => {
    throw new EditError('invalid', `Invalid edit: ${what}.`)
  }
  const id = (v: unknown, what: string) => (typeof v === 'string' && ID.test(v) ? v : bad(what))
  const optId = (v: unknown, what: string) => (v === null ? null : id(v, what))
  const name = (v: unknown) => {
    const n = typeof v === 'string' ? cleanName(v) : ''
    return n && n.length <= NAME_MAX ? n : bad('name')
  }
  const type = (v: unknown) => (v === 'expense' || v === 'income' ? v : bad('type'))
  const color = (v: unknown) => ((CATEGORY_COLORS as readonly unknown[]).includes(v) ? (v as string) : bad('color'))
  const icon = (v: unknown) => ((CATEGORY_ICONS as readonly unknown[]).includes(v) ? (v as string) : bad('icon'))
  const cents = (v: unknown) => (Number.isSafeInteger(v) && (v as number) > 0 && (v as number) <= RECEIVABLE_MAX ? (v as number) : bad('amount'))
  const spendingGroup = (v: unknown) => (v === null ? null : (SPENDING_GROUPS as readonly unknown[]).includes(v) ? (v as SpendingGroup) : bad('group'))
  if (!e || typeof e !== 'object') return bad('body')
  const x = e as Record<string, unknown>
  switch (x.op) {
    case 'categorize': {
      const categoryId = optId(x.categoryId, 'category')
      const subcategoryId = optId(x.subcategoryId, 'subcategory')
      if (subcategoryId && !categoryId) bad('subcategory without a category')
      return { op: 'categorize', transactionId: id(x.transactionId, 'transaction'), categoryId, subcategoryId }
    }
    case 'hide':
      if (typeof x.hidden !== 'boolean') bad('hidden')
      return { op: 'hide', transactionId: id(x.transactionId, 'transaction'), hidden: x.hidden as boolean }
    case 'createCategory': {
      const c = (x.category ?? {}) as Record<string, unknown>
      return { op: 'createCategory', category: { id: id(c.id, 'id'), name: name(c.name), type: type(c.type), color: color(c.color), icon: icon(c.icon) } }
    }
    case 'updateCategory': {
      const c = (x.changes ?? {}) as Record<string, unknown>
      const changes: { name?: string; type?: CategoryType; color?: string; icon?: string } = {}
      if (c.name !== undefined) changes.name = name(c.name)
      if (c.type !== undefined) changes.type = type(c.type)
      if (c.color !== undefined) changes.color = color(c.color)
      if (c.icon !== undefined) changes.icon = icon(c.icon)
      return { op: 'updateCategory', id: id(x.id, 'id'), changes }
    }
    case 'deleteCategory':
      return { op: 'deleteCategory', id: id(x.id, 'id') }
    case 'createSubcategory': {
      const s = (x.subcategory ?? {}) as Record<string, unknown>
      return { op: 'createSubcategory', subcategory: { id: id(s.id, 'id'), categoryId: id(s.categoryId, 'category'), name: name(s.name) } }
    }
    case 'renameSubcategory':
      return { op: 'renameSubcategory', id: id(x.id, 'id'), name: name(x.name) }
    case 'deleteSubcategory':
      return { op: 'deleteSubcategory', id: id(x.id, 'id') }
    case 'linkSubcategory':
      return { op: 'linkSubcategory', id: id(x.id, 'id'), categoryId: id(x.categoryId, 'category') }
    case 'categorizeMany': {
      const ids = Array.isArray(x.transactionIds) ? x.transactionIds.map((v) => id(v, 'transaction')) : bad('transactions')
      if (ids.length === 0 || ids.length > BULK_MAX || new Set(ids).size !== ids.length) bad('transactions')
      // Uncategorized: both null. Otherwise a category, with one of its subcategories or none.
      if (x.categoryId === null && x.subcategoryId === null) return { op: 'categorizeMany', transactionIds: ids, categoryId: null, subcategoryId: null }
      return {
        op: 'categorizeMany',
        transactionIds: ids,
        categoryId: id(x.categoryId, 'category'),
        subcategoryId: x.subcategoryId === null ? null : id(x.subcategoryId, 'subcategory'),
      }
    }
    case 'restoreCategories': {
      const items = Array.isArray(x.items) ? x.items : bad('items')
      if (items.length === 0 || items.length > BULK_MAX) bad('items')
      const out = items.map((v): PreviousCategory => {
        const i = (v ?? {}) as Record<string, unknown>
        const categoryId = optId(i.categoryId, 'category')
        const subcategoryId = optId(i.subcategoryId, 'subcategory')
        if (subcategoryId && !categoryId) bad('subcategory without a category')
        const editedAt = i.editedAt == null ? null : typeof i.editedAt === 'string' && !Number.isNaN(Date.parse(i.editedAt)) ? i.editedAt : bad('editedAt')
        return { id: id(i.id, 'transaction'), categoryId, subcategoryId, editedAt }
      })
      if (new Set(out.map((i) => i.id)).size !== out.length) bad('items')
      return { op: 'restoreCategories', items: out }
    }
    case 'setTransferOverride':
      if (x.value !== 'own' && x.value !== 'card-payment' && x.value !== 'investment' && x.value !== 'none') bad('value')
      return { op: 'setTransferOverride', transactionId: id(x.transactionId, 'transaction'), value: x.value as TransferOverride }
    case 'setIncomeFilter': {
      const f = (x.filter ?? {}) as Record<string, unknown>
      const ids = (v: unknown, what: string) => {
        const list = Array.isArray(v) ? v.map((i) => id(i, what)) : bad(what)
        return list.length > 1000 ? bad(what) : [...new Set(list)]
      }
      if (typeof f.excludeUncategorized !== 'boolean') bad('excludeUncategorized')
      return {
        op: 'setIncomeFilter',
        filter: {
          excludedCategoryIds: ids(f.excludedCategoryIds, 'categories'),
          excludedSubcategoryIds: ids(f.excludedSubcategoryIds, 'subcategories'),
          excludeUncategorized: f.excludeUncategorized as boolean,
        },
      }
    }
    case 'setProjectionSettings': {
      const v = (x.settings ?? {}) as Record<string, unknown>
      if (typeof v.includeDaily !== 'boolean') bad('includeDaily')
      if (typeof v.includeFreelance !== 'boolean') bad('includeFreelance')
      let accountIds: string[] | null = null
      if (v.accountIds !== null) {
        const list = Array.isArray(v.accountIds) ? v.accountIds.map((a) => id(a, 'account')) : bad('accounts')
        // At least one account; a null list means the default ones.
        if (list.length === 0 || list.length > 100) bad('accounts')
        accountIds = [...new Set(list)]
      }
      if (v.horizon !== undefined && v.horizon !== 'month' && v.horizon !== 'nextMonth') bad('horizon')
      return {
        op: 'setProjectionSettings',
        settings: { accountIds, includeDaily: v.includeDaily as boolean, includeFreelance: v.includeFreelance as boolean, horizon: (v.horizon as ProjectionHorizon | undefined) ?? 'month' },
      }
    }
    case 'recurringAction': {
      if (!(RECURRING_ACTIONS as readonly unknown[]).includes(x.action)) bad('action')
      if (typeof x.at !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.at)) bad('at')
      return { op: 'recurringAction', id: id(x.id, 'recurring charge'), action: x.action as RecurringAction, at: x.at as string }
    }
    case 'renameAccount': {
      const n = typeof x.name === 'string' ? cleanName(x.name) : x.name === null ? null : bad('name')
      if (n !== null && n.length > NICKNAME_MAX) bad('name')
      return { op: 'renameAccount', accountId: id(x.accountId, 'account'), name: n || null }
    }
    case 'setFgtsTracking':
      if (typeof x.tracking !== 'boolean') bad('tracking')
      return { op: 'setFgtsTracking', tracking: x.tracking as boolean }
    case 'saveFgtsBalance': {
      const v = (x.entry ?? {}) as Record<string, unknown>
      if (!isDay(v.date)) bad('date')
      if (!Number.isSafeInteger(v.balance) || (v.balance as number) < 0 || (v.balance as number) > FGTS_MAX) bad('balance')
      return { op: 'saveFgtsBalance', entry: { id: id(v.id, 'id'), date: v.date as string, balance: v.balance as number } }
    }
    case 'deleteFgtsBalance':
      return { op: 'deleteFgtsBalance', id: id(x.id, 'id') }
    case 'clearFgtsHistory':
      return { op: 'clearFgtsHistory' }
    case 'setPensionTracking':
      if (typeof x.tracking !== 'boolean') bad('tracking')
      return { op: 'setPensionTracking', tracking: x.tracking as boolean }
    case 'savePensionPlan': {
      const v = (x.plan ?? {}) as Record<string, unknown>
      const n = typeof v.name === 'string' ? cleanName(v.name) : ''
      if (!n || n.length > PLAN_NAME_MAX) bad('name')
      if (v.type !== null && !(PLAN_TYPES as readonly unknown[]).includes(v.type)) bad('type')
      return { op: 'savePensionPlan', plan: { id: id(v.id, 'id'), name: n, type: v.type as PlanType | null } }
    }
    case 'deletePensionPlan':
      return { op: 'deletePensionPlan', id: id(x.id, 'id') }
    case 'savePensionBalance': {
      const v = (x.entry ?? {}) as Record<string, unknown>
      if (!isDay(v.date)) bad('date')
      if (!Number.isSafeInteger(v.balance) || (v.balance as number) < 0 || (v.balance as number) > PENSION_MAX) bad('balance')
      return { op: 'savePensionBalance', planId: id(x.planId, 'plan'), entry: { id: id(v.id, 'id'), date: v.date as string, balance: v.balance as number } }
    }
    case 'deletePensionBalance':
      return { op: 'deletePensionBalance', planId: id(x.planId, 'plan'), id: id(x.id, 'id') }
    case 'setCategoryGroups': {
      const list = Array.isArray(x.groups) ? x.groups : bad('groups')
      if (list.length === 0 || list.length > GROUPS_MAX) bad('groups')
      const groups = list.map((v) => {
        const g = (v ?? {}) as Record<string, unknown>
        return { categoryId: id(g.categoryId, 'category'), group: spendingGroup(g.group) }
      })
      if (new Set(groups.map((g) => g.categoryId)).size !== groups.length) bad('groups')
      return { op: 'setCategoryGroups', groups }
    }
    case 'setSubcategoryGroup':
      return { op: 'setSubcategoryGroup', id: id(x.id, 'id'), group: spendingGroup(x.group) }
    case 'setBalanceTarget': {
      if (!isTarget(x.target)) bad('target')
      const t = x.target as BalanceTarget
      return { op: 'setBalanceTarget', target: { essential: t.essential, lifestyle: t.lifestyle, future: t.future } }
    }
    case 'setExtraPay': {
      if (!isExtraPay(x.extraPay)) bad('extraPay')
      return { op: 'setExtraPay', extraPay: normalizeExtraPay(x.extraPay) }
    }
    case 'setOverviewLayout': {
      if (!isLayout(x.layout)) bad('layout')
      return { op: 'setOverviewLayout', layout: normalizeLayout(x.layout) }
    }
    case 'saveReceivable': {
      const r = (x.receivable ?? {}) as Record<string, unknown>
      const person = typeof r.person === 'string' ? cleanName(r.person) : ''
      if (!person || person.length > PERSON_MAX) bad('person')
      return { op: 'saveReceivable', receivable: { id: id(r.id, 'id'), transactionId: id(r.transactionId, 'transaction'), person, amount: cents(r.amount) } }
    }
    case 'deleteReceivable':
      return { op: 'deleteReceivable', id: id(x.id, 'id') }
    case 'saveReceivablePayment': {
      const p = (x.payment ?? {}) as Record<string, unknown>
      if (!isDay(p.date)) bad('date')
      return {
        op: 'saveReceivablePayment',
        receivableId: id(x.receivableId, 'receivable'),
        payment: { id: id(p.id, 'id'), date: p.date as string, amount: cents(p.amount), transactionId: optId(p.transactionId, 'transaction') },
      }
    }
    case 'deleteReceivablePayment':
      return { op: 'deleteReceivablePayment', receivableId: id(x.receivableId, 'receivable'), id: id(x.id, 'id') }
    case 'setCardDays': {
      if (x.days === null) return { op: 'setCardDays', accountId: id(x.accountId, 'account'), days: null }
      const d = (x.days ?? {}) as Record<string, unknown>
      const dayOf = (v: unknown, what: string) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 31 ? (v as number) : bad(what))
      return { op: 'setCardDays', accountId: id(x.accountId, 'account'), days: { close: dayOf(d.close, 'close'), due: dayOf(d.due, 'due') } }
    }
    default:
      return bad('op')
  }
}

/** The most categories one setCategoryGroups may set. */
export const GROUPS_MAX = 500

const nextOrder = (items: { sortOrder: number }[]) => items.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1

/**
 * Applies an edit to a snapshot, following the same rules as the database.
 * Throws EditError when it refers to something missing or a name is taken.
 */
export function applyEdit(s: Snapshot, e: Edit): Snapshot {
  const cat = (id: string) => s.categories.find((c) => c.id === id) ?? fail('not_found', 'category')
  const sub = (id: string) => s.subcategories.find((x) => x.id === id) ?? fail('not_found', 'subcategory')
  const tx = (id: string) => s.transactions.find((t) => t.id === id) ?? fail('not_found', 'transaction')
  const freeCategoryName = (name: string, except?: string) => {
    if (s.categories.some((c) => c.id !== except && same(c.name, name))) fail('name_taken', 'category name')
  }
  const freeSubName = (categoryId: string, name: string, except?: string) => {
    if (s.subcategories.some((x) => x.id !== except && x.categoryId === categoryId && same(x.name, name))) fail('name_taken', 'subcategory name')
  }
  const mapTx = (f: (t: Snapshot['transactions'][number]) => Snapshot['transactions'][number]) => s.transactions.map(f)

  switch (e.op) {
    case 'categorize': {
      tx(e.transactionId)
      if (e.categoryId) cat(e.categoryId)
      if (e.subcategoryId && sub(e.subcategoryId).categoryId !== e.categoryId) fail('invalid', 'subcategory of another category')
      return { ...s, transactions: mapTx((t) => (t.id === e.transactionId ? { ...t, categoryId: e.categoryId, subcategoryId: e.subcategoryId } : t)) }
    }
    case 'hide':
      tx(e.transactionId)
      return { ...s, transactions: mapTx((t) => (t.id === e.transactionId ? { ...t, hidden: e.hidden } : t)) }
    case 'createCategory': {
      if (s.categories.some((c) => c.id === e.category.id)) fail('invalid', 'category id in use')
      freeCategoryName(e.category.name)
      const created: Category = { ...e.category, sortOrder: nextOrder(s.categories) }
      return { ...s, categories: [...s.categories, created] }
    }
    case 'updateCategory': {
      cat(e.id)
      if (e.changes.name) freeCategoryName(e.changes.name, e.id)
      // An income category has no group, nor do its subcategories.
      const income = e.changes.type === 'income'
      return {
        ...s,
        categories: s.categories.map((c) => (c.id === e.id ? { ...c, ...e.changes, ...(income ? { group: null } : {}) } : c)),
        subcategories: income ? s.subcategories.map((x) => (x.categoryId === e.id ? { ...x, group: null } : x)) : s.subcategories,
      }
    }
    case 'deleteCategory': {
      cat(e.id)
      return withPrunedFilter({
        ...s,
        categories: s.categories.filter((c) => c.id !== e.id),
        subcategories: s.subcategories.filter((x) => x.categoryId !== e.id),
        transactions: mapTx((t) => (t.categoryId === e.id ? { ...t, categoryId: null, subcategoryId: null } : t)),
      })
    }
    case 'createSubcategory': {
      cat(e.subcategory.categoryId)
      if (s.subcategories.some((x) => x.id === e.subcategory.id)) fail('invalid', 'subcategory id in use')
      freeSubName(e.subcategory.categoryId, e.subcategory.name)
      const siblings = s.subcategories.filter((x) => x.categoryId === e.subcategory.categoryId)
      return { ...s, subcategories: [...s.subcategories, { ...e.subcategory, sortOrder: nextOrder(siblings) }] }
    }
    case 'renameSubcategory': {
      const x = sub(e.id)
      freeSubName(x.categoryId, e.name, e.id)
      return { ...s, subcategories: s.subcategories.map((y) => (y.id === e.id ? { ...y, name: e.name } : y)) }
    }
    case 'deleteSubcategory':
      sub(e.id)
      return withPrunedFilter({
        ...s,
        subcategories: s.subcategories.filter((x) => x.id !== e.id),
        transactions: mapTx((t) => (t.subcategoryId === e.id ? { ...t, subcategoryId: null } : t)),
      })
    case 'linkSubcategory': {
      const x = sub(e.id)
      cat(e.categoryId)
      if (x.categoryId === e.categoryId) return s
      freeSubName(e.categoryId, x.name, e.id)
      const siblings = s.subcategories.filter((y) => y.categoryId === e.categoryId)
      return {
        ...s,
        // Under an income category it has no group.
        subcategories: s.subcategories.map((y) =>
          y.id === e.id ? { ...y, categoryId: e.categoryId, sortOrder: nextOrder(siblings), ...(cat(e.categoryId).type === 'income' ? { group: null } : {}) } : y,
        ),
        transactions: mapTx((t) => (t.subcategoryId === e.id ? { ...t, categoryId: e.categoryId } : t)),
      }
    }
    case 'categorizeMany': {
      checkBulk(s, e)
      const ids = new Set(e.transactionIds)
      return { ...s, transactions: mapTx((t) => (ids.has(t.id) ? { ...t, categoryId: e.categoryId, subcategoryId: e.subcategoryId } : t)) }
    }
    case 'restoreCategories': {
      const byId = new Map(e.items.map((i) => [i.id, i]))
      for (const i of e.items) {
        tx(i.id)
        if (i.categoryId) cat(i.categoryId)
        if (i.subcategoryId && sub(i.subcategoryId).categoryId !== i.categoryId) fail('invalid', 'subcategory of another category')
      }
      return { ...s, transactions: mapTx((t) => (byId.has(t.id) ? { ...t, categoryId: byId.get(t.id)!.categoryId, subcategoryId: byId.get(t.id)!.subcategoryId } : t)) }
    }
    case 'setIncomeFilter':
      return { ...s, incomeFilter: checkIncomeFilter(s.categories, s.subcategories, e.filter) }
    case 'setProjectionSettings':
      return { ...s, projectionSettings: e.settings }
    case 'renameAccount': {
      if (!s.accounts.some((a) => a.id === e.accountId)) fail('not_found', 'account')
      const { [e.accountId]: _old, ...others } = s.accountNames ?? {}
      return withAccountNames({ ...s, accountNames: e.name ? { ...others, [e.accountId]: e.name } : others })
    }
    case 'setFgtsTracking':
      return { ...s, fgts: { ...(s.fgts ?? NO_FGTS), tracking: e.tracking } }
    case 'saveFgtsBalance': {
      const f = s.fgts ?? NO_FGTS
      return { ...s, fgts: { ...f, entries: sortFgts([...f.entries.filter((x) => x.id !== e.entry.id), e.entry]) } }
    }
    case 'deleteFgtsBalance': {
      const f = s.fgts ?? NO_FGTS
      if (!f.entries.some((x) => x.id === e.id)) fail('not_found', 'FGTS balance')
      return { ...s, fgts: { ...f, entries: f.entries.filter((x) => x.id !== e.id) } }
    }
    case 'clearFgtsHistory':
      return { ...s, fgts: { ...(s.fgts ?? NO_FGTS), entries: [] } }
    case 'setPensionTracking':
      return { ...s, pension: { ...(s.pension ?? NO_PENSION), tracking: e.tracking } }
    case 'savePensionPlan': {
      const p = s.pension ?? NO_PENSION
      const known = p.plans.some((x) => x.id === e.plan.id)
      const plans = known
        ? p.plans.map((x) => (x.id === e.plan.id ? { ...x, name: e.plan.name, type: e.plan.type } : x))
        : [...p.plans, { ...e.plan, entries: [] }]
      return { ...s, pension: { ...p, plans } }
    }
    case 'deletePensionPlan': {
      const p = s.pension ?? NO_PENSION
      if (!p.plans.some((x) => x.id === e.id)) fail('not_found', 'plan')
      return { ...s, pension: { ...p, plans: p.plans.filter((x) => x.id !== e.id) } }
    }
    case 'savePensionBalance':
      return withPlan(s, e.planId, (entries) => sortPensionEntries([...entries.filter((x) => x.id !== e.entry.id), e.entry]))
    case 'deletePensionBalance':
      return withPlan(s, e.planId, (entries) => {
        if (!entries.some((x) => x.id === e.id)) fail('not_found', 'balance')
        return entries.filter((x) => x.id !== e.id)
      })
    case 'setCategoryGroups': {
      const groups = new Map(e.groups.map((g) => [g.categoryId, g.group]))
      for (const id of groups.keys()) if (cat(id).type !== 'expense') fail('invalid', 'group of an income category')
      return { ...s, categories: s.categories.map((c) => (groups.has(c.id) ? { ...c, group: groups.get(c.id)! } : c)) }
    }
    case 'setSubcategoryGroup': {
      if (cat(sub(e.id).categoryId).type !== 'expense') fail('invalid', 'group of an income subcategory')
      return { ...s, subcategories: s.subcategories.map((x) => (x.id === e.id ? { ...x, group: e.group } : x)) }
    }
    case 'setBalanceTarget':
      return { ...s, balanceTarget: e.target }
    case 'setOverviewLayout':
      return { ...s, overviewLayout: e.layout }
    case 'setExtraPay':
      return { ...s, extraPay: e.extraPay }
    case 'setCardDays': {
      if (!s.accounts.some((a) => a.id === e.accountId && a.type === 'CREDIT')) fail('not_found', 'card')
      const { [e.accountId]: _old, ...others } = s.cardDays ?? {}
      return { ...s, cardDays: e.days ? { ...others, [e.accountId]: e.days } : others }
    }
    case 'saveReceivable':
    case 'deleteReceivable':
    case 'saveReceivablePayment':
    case 'deleteReceivablePayment': {
      const byId = new Map(s.transactions.map((t) => [t.id, t]))
      return { ...s, receivables: applyReceivableEdit(s.receivables ?? [], e, (id) => byId.get(id)) }
    }
    case 'recurringAction': {
      const overrides = s.recurringOverrides ?? {}
      return { ...s, recurringOverrides: { ...overrides, [e.id]: applyRecurringAction(overrides[e.id], e.action, e.at) } }
    }
    case 'setTransferOverride': {
      tx(e.transactionId)
      // A transfer has no category; "neither" leaves it uncategorized until one is chosen.
      return {
        ...s,
        transactions: mapTx((t) => {
          if (t.id !== e.transactionId) return t
          const { transfer: _old, ...rest } = t
          return e.value === 'none'
            ? { ...rest, transferOverride: e.value }
            : { ...rest, transfer: e.value, categoryId: null, subcategoryId: null, transferOverride: e.value }
        }),
      }
    }
  }
}

/**
 * The rules of "A receber", on the receivables and the transactions as the
 * app shows them (the server reads both first, then writes the change):
 * - a receivable's expense is money out and not a transfer, and stays the
 *   same; what all its receivables are owed is at most the expense, and what
 *   one is owed is at least what was paid back;
 * - a payment goes into a receivable that exists, and its payments add up to
 *   at most what's owed; when it came in through a transaction, that is money
 *   in, not a transfer, and its payments add up to at most what came in.
 * Returns the receivables after the edit. Throws EditError (with a `reason`).
 * `find`: a transaction by ID (undefined when there's no such live one).
 */
export function applyReceivableEdit(list: Receivable[], e: ReceivableEdit, find: (id: string) => Transaction | undefined): Receivable[] {
  const refuse = (reason: ReceivableReason): never => {
    throw new EditError('invalid', `Invalid receivable edit: ${reason}.`, reason)
  }
  const receivable = (id: string) => list.find((r) => r.id === id) ?? fail('not_found', 'receivable')
  switch (e.op) {
    case 'saveReceivable': {
      const v = e.receivable
      const known = list.find((r) => r.id === v.id)
      if (known && known.transactionId !== v.transactionId) refuse('other_transaction')
      const tx = find(v.transactionId) ?? fail('not_found', 'transaction')
      if (!canBeOwed(tx)) refuse('not_expense')
      if (owedOf(list, tx.id, v.id) + v.amount > -tx.amount) refuse('over_expense')
      if (known && v.amount < received(known)) refuse('below_received')
      return known
        ? list.map((r) => (r.id === v.id ? { ...r, person: v.person, amount: v.amount, date: tx.date } : r))
        : [...list, { id: v.id, transactionId: tx.id, date: tx.date, person: v.person, amount: v.amount, payments: [] }]
    }
    case 'deleteReceivable':
      receivable(e.id)
      return list.filter((r) => r.id !== e.id)
    case 'saveReceivablePayment': {
      const r = receivable(e.receivableId)
      const p = e.payment
      if (list.some((x) => x.id !== r.id && x.payments.some((y) => y.id === p.id))) fail('invalid', 'payment id in use')
      const others = r.payments.filter((x) => x.id !== p.id)
      if (others.reduce((sum, x) => sum + x.amount, 0) + p.amount > r.amount) refuse('over_owed')
      if (p.transactionId) {
        const tx = find(p.transactionId) ?? fail('not_found', 'transaction')
        if (!canRepay(tx)) refuse('not_money_in')
        if (usedOf(list, tx.id, p.id) + p.amount > tx.amount) refuse('over_received')
      }
      return list.map((x) => (x.id === r.id ? { ...x, payments: sortPayments([...others, { ...p }]) } : x))
    }
    case 'deleteReceivablePayment': {
      const r = receivable(e.receivableId)
      if (!r.payments.some((x) => x.id === e.id)) fail('not_found', 'payment')
      return list.map((x) => (x.id === r.id ? { ...x, payments: x.payments.filter((y) => y.id !== e.id) } : x))
    }
  }
}

/** A plan's balances changed by `change`; refused for a plan that doesn't exist. */
function withPlan(s: Snapshot, planId: string, change: (entries: Pension['plans'][number]['entries']) => Pension['plans'][number]['entries']): Snapshot {
  const p = s.pension ?? NO_PENSION
  if (!p.plans.some((x) => x.id === planId)) fail('not_found', 'plan')
  return { ...s, pension: { ...p, plans: p.plans.map((x) => (x.id === planId ? { ...x, entries: change(x.entries) } : x)) } }
}

/** The accounts with the names set in Trove (the bank's name when none is). */
export function withAccountNames(s: Snapshot): Snapshot {
  const names = s.accountNames ?? {}
  return {
    ...s,
    accounts: s.accounts.map((a) => {
      const { nickname: _old, ...bank } = a
      return names[a.id] ? { ...bank, nickname: names[a.id] } : bank
    }),
  }
}

/** A deleted category or subcategory leaves the income filter (the server does the same). */
function withPrunedFilter(s: Snapshot): Snapshot {
  return s.incomeFilter ? { ...s, incomeFilter: pruneIncomeFilter(s.incomeFilter, s.categories, s.subcategories) } : s
}

/**
 * The rules of the income filter: only income categories and their
 * subcategories, and at least one option left counted. Returns it in
 * canonical form (see normalizeIncomeFilter).
 */
export function checkIncomeFilter(categories: Category[], subcategories: Subcategory[], filter: IncomeFilter): IncomeFilter {
  const income = new Set(categories.filter((c) => c.type === 'income').map((c) => c.id))
  const subsById = new Map(subcategories.map((x) => [x.id, x]))
  if (!filter.excludedCategoryIds.every((id) => income.has(id))) throw new EditError('invalid', 'Only income categories can be excluded.', 'not_income')
  if (!filter.excludedSubcategoryIds.every((id) => income.has(subsById.get(id)?.categoryId ?? '')))
    throw new EditError('invalid', 'Only subcategories of income categories can be excluded.', 'not_income')
  const normalized = normalizeIncomeFilter(filter, categories, subcategories)
  if (!hasSelection(normalized, categories, subcategories)) throw new EditError('invalid', 'Selecione pelo menos uma categoria', 'nothing_selected')
  return normalized
}

/**
 * The rules of a bulk change, checked against the transactions as the app
 * shows them (the server builds the same view first):
 * - every transaction exists;
 * - none is a transfer (own transfer or card bill payment: no category);
 * - to leave them uncategorized (category null), nothing else;
 * - otherwise all are of one kind, expenses or income, the category is of
 *   that kind, and the subcategory (if any) belongs to it.
 * Returns the previous values. Throws EditError with a `reason`.
 */
export function checkBulk(s: Snapshot, e: { transactionIds: string[]; categoryId: string | null; subcategoryId: string | null }): PreviousCategory[] {
  const categoriesById = new Map(s.categories.map((c) => [c.id, c]))
  const byId = new Map(s.transactions.map((t) => [t.id, t]))
  const txs = e.transactionIds.map((id) => byId.get(id) ?? fail('not_found', 'transaction'))
  if (txs.some((t) => t.transfer)) throw new EditError('invalid', 'Transfers between own accounts and card bill payments have no category.', 'transfer')
  const previous = txs.map((t) => ({ id: t.id, categoryId: t.categoryId, subcategoryId: t.subcategoryId ?? null }))
  if (e.categoryId === null) return previous
  const kinds = new Set(txs.map((t) => kindOf(t, categoriesById)))
  if (kinds.size !== 1) throw new EditError('invalid', 'Select only expenses or only income.', 'mixed_types')
  const category = categoriesById.get(e.categoryId) ?? fail('not_found', 'category')
  if (category.type !== [...kinds][0]) throw new EditError('invalid', 'The category is not of the transactions’ type.', 'category_type')
  if (e.subcategoryId === null) return previous
  const sub = s.subcategories.find((x) => x.id === e.subcategoryId) ?? fail('not_found', 'subcategory')
  if (sub.categoryId !== e.categoryId) throw new EditError('invalid', 'The subcategory belongs to another category.', 'subcategory_category')
  return previous
}

function fail(code: EditError['code'], what: string): never {
  throw new EditError(code, code === 'not_found' ? `No such ${what}.` : code === 'name_taken' ? `That ${what} is taken.` : `Invalid ${what}.`)
}

/** The default categories and subcategories (pt-BR names), with the given subcategory IDs. */
export function defaultCategories(subId: (categoryId: string, index: number) => string): { categories: Category[]; subcategories: Subcategory[] } {
  return {
    categories: DEFAULT_CATEGORIES.map((c, i) => ({ id: c.id, name: c.name.pt, type: c.type, color: c.color, icon: c.icon, sortOrder: i })),
    subcategories: DEFAULT_CATEGORIES.flatMap((c) => c.subcategories.map((s, i) => ({ id: subId(c.id, i), categoryId: c.id, name: s.pt, sortOrder: i }))),
  }
}

/** A new ID for a category, subcategory or FGTS balance. */
export function newId(): string {
  // randomUUID needs a secure page; the dev server reached over Wi-Fi (plain http) isn't one.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}
