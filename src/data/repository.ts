import type { Snapshot } from './seed'

/**
 * Everything the UI reads or writes goes through this interface.
 * Phase 1: `mockRepository` (hardcoded data + localStorage).
 * Phase 2: an API-backed implementation fed by Pluggy.
 */
export interface Repository {
  load(): Promise<Snapshot>
  setTransactionCategory(transactionId: string, categoryId: string): Promise<void>
}
