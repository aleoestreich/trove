// The three insights from one snapshot: recurring charges, unusual
// categories and the month-end projection (which uses the recurring
// charges). Shared by the app and the server.

import { DEFAULT_PROJECTION_SETTINGS, monthEndProjection, type Projection } from './projection.js'
import { detectRecurring, type RecurringSummary } from './recurring.js'
import { unusualCategories, type UnusualResult } from './unusual.js'
import type { Snapshot } from './types.js'

export interface Insights {
  recurring: RecurringSummary
  unusual: UnusualResult | null
  projection: Projection | null
}

/** Everything as of `today` (ISO date). `snapshot.transactions` should hold MONTHS_OF_ANALYSIS months. */
export function computeInsights(s: Pick<Snapshot, 'accounts' | 'transactions' | 'categories' | 'projectionSettings' | 'recurringOverrides'>, today: string): Insights {
  const recurring = detectRecurring(s.transactions, s.accounts, s.categories, s.recurringOverrides ?? {}, today)
  return {
    recurring,
    unusual: unusualCategories(s.transactions, s.categories, today),
    projection: monthEndProjection({
      accounts: s.accounts,
      transactions: s.transactions,
      categories: s.categories,
      settings: s.projectionSettings ?? DEFAULT_PROJECTION_SETTINGS,
      recurring: [...recurring.active, ...recurring.stopped],
      today,
    }),
  }
}
