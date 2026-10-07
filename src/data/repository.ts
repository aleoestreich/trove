import type { BulkResult, Edit } from './edits'
import type { Snapshot, SyncJob, Transaction } from './types'
import type { TransactionQuery } from './transactionFilter'

/**
 * Everything the UI reads or writes goes through this interface.
 * - `mockRepository`: demo data, with edits kept on this device.
 * - `apiRepository`: data from Trove's database (deployed site).
 */
export interface Repository {
  load(): Promise<Snapshot>
  /**
   * Saves one change (see src/data/edits.ts); rejects if it can't.
   * categorizeMany resolves with what it replaced (for undo); others with null.
   */
  edit(edit: Edit): Promise<BulkResult | null>
  /**
   * Starts a background sync of these connections (default: all), or returns
   * the one already running. The server keeps going with the app closed.
   */
  startSync(connectionIds?: string[]): Promise<SyncJob>
  /** The latest sync job, for progress (null if there was none). */
  syncStatus(): Promise<SyncJob | null>
  /**
   * Stored transactions of a month, or of every stored month ("all"), with
   * Transações' filters: for months older than `load()` returns.
   */
  transactions(query: TransactionQuery): Promise<Transaction[]>
}
