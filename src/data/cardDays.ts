// Closing and due days set by hand per card, for banks that don't report a
// card's dates (or report wrong ones). Stored in Trove's database (the
// setCardDays edit; the demo keeps them on the device) and applied on top of
// the bank's dates. Older versions kept them in this browser's localStorage:
// `deviceCardDays` reads what's left there, to move it to the database.

import { addMonths, dayOfMonth, toISO } from '../lib/dates'
import type { Account } from './types'

export interface CardDays {
  /** Day of the month the bill closes (1–31; short months use their last day). */
  close: number
  /** Day of the month the bill is due. */
  due: number
}

const KEY = 'trove.cardDays'

/** Days still kept on this device by an older version (moved to the database on load). */
export function deviceCardDays(): Record<string, CardDays> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, CardDays>
    // Keep only well-formed entries.
    return Object.fromEntries(Object.entries(raw).filter(([, d]) => validDay(d?.close) && validDay(d?.due)))
  } catch {
    return {}
  }
}

/** Forgets a card's days on this device, once they're in the database. */
export function forgetDeviceCardDays(accountId: string) {
  try {
    const all = deviceCardDays()
    delete all[accountId]
    if (Object.keys(all).length) localStorage.setItem(KEY, JSON.stringify(all))
    else localStorage.removeItem(KEY)
  } catch {
    // Storage unavailable: nothing to forget.
  }
}

const validDay = (d: unknown): d is number => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 31

/**
 * The bill to look at on `today`: the one whose due date hasn't passed yet.
 * Its closing date is `close` in some month; it's due on `due` in the same
 * month, or the next one when the due day comes before the closing day.
 */
export function billDates(days: CardDays, today: Date): { close: string; due: string } {
  const todayISO = toISO(today)
  // Start from last month's closing: its bill may still be waiting to be paid.
  for (let offset = -1; offset <= 1; offset++) {
    const close = dayOfMonth(today, offset, days.close)
    const due = dayOfMonth(new Date(Number(close.slice(0, 4)), Number(close.slice(5, 7)) - 1, 1), days.due > days.close ? 0 : 1, days.due)
    if (due >= todayISO) return { close, due }
  }
  const close = dayOfMonth(today, 2, days.close)
  return { close, due: addMonths(close, 1) }
}

/**
 * Accounts with the closing and due days set by hand in place of the bank's
 * dates. A card with neither uses the days estimated from its last bills.
 */
export function applyCardDays(accounts: Account[], days: Record<string, CardDays>, today: Date = new Date()): Account[] {
  return accounts.map((a) => {
    if (a.type !== 'CREDIT' || !a.creditData) return a
    const d = days[a.id]
    if (d) {
      const { close, due } = billDates(d, today)
      return { ...a, creditData: { ...a.creditData, balanceCloseDate: close, balanceDueDate: due, userDays: d } }
    }
    const guess = a.creditData.estimatedDays
    if (a.creditData.balanceCloseDate || !guess) return a
    const { close, due } = billDates(guess, today)
    return { ...a, creditData: { ...a.creditData, balanceCloseDate: close, balanceDueDate: due, estimated: true } }
  })
}
