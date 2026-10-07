import type { Repository } from './repository'
import { DEMO_SUBCATEGORIES, buildSeed } from './seed'
import { applyEdit, checkBulk, defaultCategories, withAccountNames } from './edits'
import { DEFAULT_CATEGORIES } from './categoryCatalog'
import type { Category, IncomeFilter, ProjectionSettings, RecurringOverride, Snapshot, Subcategory, TransferOverride } from './types'

const KEY = 'trove.demoOwner'

/** What the database would hold for the demo: categories and each transaction's category. */
interface DemoOwner {
  categories: Category[]
  subcategories: Subcategory[]
  stored: Record<string, { categoryId: string | null; subcategoryId: string | null; hidden: boolean; transferOverride?: TransferOverride }>
  /** The average income's filter (the database keeps it in app_settings). */
  incomeFilter?: IncomeFilter
  /** The projection's settings and the answers about recurring charges (app_settings too). */
  projectionSettings?: ProjectionSettings
  recurringOverrides?: Record<string, RecurringOverride>
  /** Names set in Trove for accounts and cards (app_settings too). */
  accountNames?: Record<string, string>
}

function read(): DemoOwner | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as DemoOwner | null
    return raw && Array.isArray(raw.categories) && Array.isArray(raw.subcategories) && raw.stored ? raw : null
  } catch {
    return null
  }
}

function write(owner: DemoOwner) {
  try {
    localStorage.setItem(KEY, JSON.stringify(owner))
  } catch {
    // Storage unavailable (private mode): edits last until reload.
  }
}

/** First run: the default categories, and demo subcategories by description. */
function initialOwner(seed: Snapshot): DemoOwner {
  const { categories, subcategories } = defaultCategories((c, i) => `${c}-${i}`)
  const stored: DemoOwner['stored'] = {}
  for (const t of seed.transactions) {
    const en = DEMO_SUBCATEGORIES[t.description]
    const def = DEFAULT_CATEGORIES.find((c) => c.id === t.categoryId)
    const index = def ? def.subcategories.findIndex((s) => s.en === en) : -1
    if (t.categoryId && index >= 0) stored[t.id] = { categoryId: t.categoryId, subcategoryId: `${t.categoryId}-${index}`, hidden: false }
  }
  return { categories, subcategories, stored }
}

/** The seed with the stored categories; guesses only point at categories that still exist. */
function withOwner(seed: Snapshot, owner: DemoOwner): Snapshot {
  const known = new Set(owner.categories.map((c) => c.id))
  return withAccountNames({
    ...seed,
    accountNames: owner.accountNames,
    categories: owner.categories,
    subcategories: owner.subcategories,
    incomeFilter: owner.incomeFilter,
    projectionSettings: owner.projectionSettings,
    recurringOverrides: owner.recurringOverrides,
    transactions: seed.transactions.map((t) => {
      const s = owner.stored[t.id]
      // A hand-set answer wins over the seed's own transfers.
      if (s?.transferOverride === 'own' || s?.transferOverride === 'card-payment')
        return { ...t, transfer: s.transferOverride, categoryId: null, subcategoryId: null, hidden: s.hidden || undefined, transferOverride: s.transferOverride }
      if (s?.transferOverride === 'none') {
        const { transfer: _seedTransfer, ...rest } = t
        return { ...rest, categoryId: s.categoryId, subcategoryId: s.subcategoryId, hidden: s.hidden || undefined, transferOverride: s.transferOverride }
      }
      if (t.transfer) return t
      if (s) return { ...t, categoryId: s.categoryId, subcategoryId: s.subcategoryId, hidden: s.hidden || undefined }
      return t.categoryId && !known.has(t.categoryId) ? { ...t, categoryId: null } : t
    }),
  })
}

/** Demo data. Categories and edits are kept in this browser's localStorage. */
export function createMockRepository(today: Date = new Date()): Repository {
  const load = (): Snapshot => {
    const seed = buildSeed(today)
    let owner = read()
    if (!owner) {
      owner = initialOwner(seed)
      write(owner)
    }
    return withOwner(seed, owner)
  }
  return {
    async load() {
      return load()
    },
    async edit(e) {
      const current = load()
      const previous = e.op === 'categorizeMany' ? checkBulk(current, e) : null
      const next = applyEdit(current, e)
      const stored: DemoOwner['stored'] = {}
      for (const t of next.transactions) {
        if (!t.transfer || t.transferOverride)
          stored[t.id] = { categoryId: t.categoryId, subcategoryId: t.subcategoryId ?? null, hidden: !!t.hidden, transferOverride: t.transferOverride }
      }
      write({
        categories: next.categories,
        subcategories: next.subcategories,
        stored,
        incomeFilter: next.incomeFilter,
        projectionSettings: next.projectionSettings,
        recurringOverrides: next.recurringOverrides,
        accountNames: next.accountNames,
      })
      return previous && { updated: previous.length, previous }
    },
    async startSync() {
      throw new Error('Demo data has nothing to sync.')
    },
    async syncStatus() {
      return null
    },
  }
}

export function resetMockData() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
