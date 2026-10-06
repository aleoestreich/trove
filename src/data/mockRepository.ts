import type { Repository } from './repository'
import { buildSeed } from './seed'
import { applyOverrides, clearOverrides, saveIgnored, saveOverride } from './overrides'

/** Hardcoded demo data. The owner's edits are kept in localStorage. */
export function createMockRepository(today: Date = new Date()): Repository {
  return {
    async load() {
      return applyOverrides(buildSeed(today))
    },
    async setTransactionCategory(transactionId, categoryId) {
      saveOverride(transactionId, categoryId)
    },
    async setTransactionIgnored(transactionId, ignored) {
      saveIgnored(transactionId, ignored)
    },
  }
}

export function resetMockData() {
  clearOverrides()
}
