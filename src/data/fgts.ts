// FGTS (Fundo de Garantia do Tempo de Serviço) tracked by hand: there's no
// bank integration, so its total balance is typed in from the FGTS app, one
// entry per update, and kept as a history. Shared by the app, the demo
// repository and the server (no browser-only imports).
//
// It's kept apart from every total: it can only be withdrawn in specific
// cases, so it's shown as its own line under net worth and never counts in
// income, spending, insights or the projection.

import { addMonths } from '../lib/dates.js'
import type { Cents } from './types.js'

export interface FgtsEntry {
  id: string
  /** The day the balance refers to (YYYY-MM-DD). */
  date: string
  balance: Cents
}

export interface Fgts {
  /** Shown on Accounts and Visão geral; turning it off keeps the history. */
  tracking: boolean
  /** Newest first (see sortFgts). */
  entries: FgtsEntry[]
}

export const NO_FGTS: Fgts = { tracking: false, entries: [] }

/** Up to R$ 100 milhões: anything above is a typo. */
export const FGTS_MAX: Cents = 100_000_000_00

/** Employers deposit FGTS by the 20th: from then on, the month's balance is due. */
export const FGTS_REMINDER_DAY = 20

/** Newest first (by the balance's date; the same day by ID, to stay stable). */
export function sortFgts(entries: FgtsEntry[]): FgtsEntry[] {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
}

/** The latest balance, and how much it changed since the one before (null with a single entry). */
export function fgtsLatest(fgts: Fgts): { latest: FgtsEntry; change: Cents | null } | null {
  const [latest, previous] = sortFgts(fgts.entries)
  return latest ? { latest, change: previous ? latest.balance - previous.balance : null } : null
}

/**
 * Whether it's time to update the balance, on `today` (YYYY-MM-DD): while
 * tracking, when there's no balance yet; or the latest one is more than a
 * month old; or it's from an earlier month and the 20th has come (the
 * month's deposit is in).
 */
export function fgtsDue(fgts: Fgts, today: string): boolean {
  if (!fgts.tracking) return false
  const latest = fgtsLatest(fgts)?.latest
  if (!latest) return true
  if (latest.date < addMonths(today, -1)) return true
  return latest.date.slice(0, 7) < today.slice(0, 7) && Number(today.slice(8, 10)) >= FGTS_REMINDER_DAY
}
