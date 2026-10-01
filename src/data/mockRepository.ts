import type { Repository } from './repository'
import { buildSeed } from './seed'
import { applyOverrides, clearOverrides, saveOverride } from './overrides'

/** Hardcoded demo data. Category edits are kept in localStorage. */
export function createMockRepository(today: Date = new Date()): Repository {
  return {
    async load() {
      return applyOverrides(buildSeed(today))
    },
    async setTransactionCategory(transactionId, categoryId) {
      saveOverride(transactionId, categoryId)
    },
  }
}

export function resetMockData() {
  clearOverrides()
}
