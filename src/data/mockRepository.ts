import type { Repository } from './repository'
import { DEMO_SUBCATEGORIES, buildSeed } from './seed'
import { applyEdit, checkBulk, defaultCategories } from './edits'
import { DEFAULT_CATEGORIES } from './categoryCatalog'
import type { Category, Snapshot, Subcategory } from './types'

const KEY = 'trove.demoOwner'

/** What the database would hold for the demo: categories and each transaction's category. */
interface DemoOwner {
  categories: Category[]
  subcategories: Subcategory[]
  stored: Record<string, { categoryId: string | null; subcategoryId: string | null; hidden: boolean }>
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
  return {
    ...seed,
    categories: owner.categories,
    subcategories: owner.subcategories,
    transactions: seed.transactions.map((t) => {
      if (t.transfer) return t
      const s = owner.stored[t.id]
      if (s) return { ...t, categoryId: s.categoryId, subcategoryId: s.subcategoryId, hidden: s.hidden || undefined }
      return t.categoryId && !known.has(t.categoryId) ? { ...t, categoryId: null } : t
    }),
  }
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
        if (!t.transfer) stored[t.id] = { categoryId: t.categoryId, subcategoryId: t.subcategoryId ?? null, hidden: !!t.hidden }
      }
      write({ categories: next.categories, subcategories: next.subcategories, stored })
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
