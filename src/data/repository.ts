import type { Snapshot } from './types'

/**
 * Everything the UI reads or writes goes through this interface.
 * - `mockRepository`: hardcoded demo data (local development).
 * - `pluggyRepository`: the owner's real data via /api/finance (deployed site).
 */
export interface Repository {
  load(): Promise<Snapshot>
  setTransactionCategory(transactionId: string, categoryId: string): Promise<void>
}
