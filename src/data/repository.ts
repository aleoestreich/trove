import type { Edit } from './edits'
import type { Snapshot, SyncResult } from './types'

/**
 * Everything the UI reads or writes goes through this interface.
 * - `mockRepository`: demo data, with edits kept on this device.
 * - `apiRepository`: data from Trove's database (deployed site).
 */
export interface Repository {
  load(): Promise<Snapshot>
  /** Saves one change (see src/data/edits.ts); rejects if it can't. */
  edit(edit: Edit): Promise<void>
  /** Fetches one bank connection from Meu Pluggy into the database. */
  sync(connectionId: string): Promise<SyncResult>
}
