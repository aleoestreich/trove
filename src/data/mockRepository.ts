import type { Repository } from './repository'
import { buildSeed } from './seed'

const OVERRIDES_KEY = 'trove.categoryOverrides'

function readOverrides(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(OVERRIDES_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function writeOverrides(overrides: Record<string, string>) {
  try {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides))
  } catch {
    // Storage unavailable (private mode); edits last until reload.
  }
}

/** Hardcoded demo data. Category edits are kept in localStorage. */
export function createMockRepository(today: Date = new Date()): Repository {
  return {
    async load() {
      const snapshot = buildSeed(today)
      const overrides = readOverrides()
      snapshot.transactions = snapshot.transactions.map((t) =>
        overrides[t.id] ? { ...t, categoryId: overrides[t.id] } : t,
      )
      return snapshot
    },
    async setTransactionCategory(transactionId, categoryId) {
      writeOverrides({ ...readOverrides(), [transactionId]: categoryId })
    },
  }
}

export function resetMockData() {
  try {
    localStorage.removeItem(OVERRIDES_KEY)
  } catch {
    // ignore
  }
}
