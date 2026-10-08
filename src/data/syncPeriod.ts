// Where an advanced sync starts reading, shared by the server (which reads
// from there) and the app (which shows it). Imports only what the server can use.

import { lastMonths } from '../lib/dates.js'
import type { SyncPeriod } from './types.js'

/** Where "all" reads from: before any bank's history, so Pluggy returns all it has. */
export const ALL_HISTORY = '2000-01-01'

/** Months each chosen period covers, the current one included. */
export const PERIOD_MONTHS = { '3m': 3, '6m': 6, '1y': 12 } as const

/**
 * The first day a chosen period reads (YYYY-MM-DD), given today's date: the
 * 1st of the month that makes 3, 6 or 12 months with the current one, or
 * ALL_HISTORY.
 */
export function periodStart(period: Exclude<SyncPeriod, 'default'>, today: string): string {
  if (period === 'all') return ALL_HISTORY
  return `${lastMonths(today.slice(0, 7), PERIOD_MONTHS[period])[0]}-01`
}
