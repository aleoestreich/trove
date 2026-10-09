// A card's closing and due days estimated from its last bills, for banks that
// don't report the card's closing date. Shared by the server (which reads the
// stored bills) and tests; no browser-only imports.
//
// When the bills carry their own closing date (Pluggy's billClosingDate), the
// last 3 give the days directly: the most common closing and due days (banks
// move a date off weekends and holidays). Otherwise they're estimated from the
// purchases:
//
// Each purchase on a card is charged to a bill (Pluggy's billId). For a closed
// bill, its purchases are dated up to its closing date and the next bills'
// purchases after it. For each of the last bills (up to 3), every gap between
// closing and due date (1 to 40 days) is scored by the purchases it would put
// in the wrong bill; the gap with the fewest, summed over those bills, wins
// (the middle one when several tie). Late postings and installments dated on
// the original purchase only add a few misses, so one odd purchase doesn't
// move the estimate. The closing day follows Trove's cycle: purchases dated
// on it belong to the bill (see src/lib/bills.ts).

import { addDays } from '../lib/dates.js'

export interface EstimatedCardDays {
  /** Day of the month the bill closes. */
  close: number
  /** Day of the month the bill is due. */
  due: number
  /** How many past bills it's estimated from. */
  bills: number
  /** From the bills' own closing dates, or estimated from the purchases charged to them. */
  source: 'closing' | 'purchases'
}

export interface StoredBill {
  id: string
  dueDate: string
  /** When the bill closed, if the bank reports it. */
  closingDate?: string | null
}

/** A purchase on the card (bill payments and refunds left out). */
export interface BilledPurchase {
  date: string
  /** The bill it was charged to; null when the bank doesn't say (or the bill is still open). */
  billId: string | null
}

/** How many past bills the estimate looks at. */
export const BILLS_USED = 3
const MAX_GAP = 40

/** Null when no bill reports its closing date and none has purchases both in it and after it. */
export function estimateCardDays(bills: StoredBill[], purchases: BilledPurchase[]): EstimatedCardDays | null {
  const sorted = [...bills].sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  // Newest first; only closings before their due date make sense.
  const closed = sorted.filter((b) => b.closingDate && b.closingDate < b.dueDate).reverse().slice(0, BILLS_USED)
  if (closed.length > 0)
    return { close: commonDay(closed.map((b) => b.closingDate!)), due: commonDay(closed.map((b) => b.dueDate)), bills: closed.length, source: 'closing' }

  const order = new Map(sorted.map((b, i) => [b.id, i]))
  // Purchases with an unknown bill ID can't be placed: left out.
  const placed = purchases.filter((p) => p.billId === null || order.has(p.billId))

  // The last bills with purchases on both sides of their closing.
  const used: { due: string; inside: string[]; after: string[] }[] = []
  for (let i = sorted.length - 1; i >= 0 && used.length < BILLS_USED; i--) {
    const due = sorted[i].dueDate
    const inside = placed.filter((p) => p.billId === sorted[i].id).map((p) => p.date)
    // Later bills, or not billed yet (only those dated before this due date can be misplaced).
    const after = placed.filter((p) => (p.billId === null ? p.date <= due : order.get(p.billId)! > i)).map((p) => p.date)
    if (inside.length > 0 && after.length > 0) used.push({ due, inside, after })
  }
  if (used.length === 0) return null

  const misses = (gap: number) =>
    used.reduce((sum, b) => {
      const close = addDays(b.due, -gap)
      return sum + b.inside.filter((d) => d > close).length + b.after.filter((d) => d <= close).length
    }, 0)
  const scores = Array.from({ length: MAX_GAP }, (_, i) => misses(i + 1))
  const fewest = Math.min(...scores)
  const best = scores.flatMap((s, i) => (s === fewest ? [i + 1] : []))
  const gap = best[Math.floor((best.length - 1) / 2)]

  // The latest bill sets the days; the due day is the most common one (banks move a due date off weekends).
  const latest = used[0].due
  return { close: day(addDays(latest, -gap)), due: commonDay(used.map((b) => b.due)), bills: used.length, source: 'purchases' }
}

const day = (iso: string) => Number(iso.slice(8, 10))

/** The most common day of the month; on a tie, the latest bill's. */
function commonDay(dates: string[]): number {
  const counts = new Map<number, number>()
  for (const d of dates) counts.set(day(d), (counts.get(day(d)) ?? 0) + 1)
  const most = Math.max(...counts.values())
  return day(dates.find((d) => counts.get(day(d)) === most)!)
}
