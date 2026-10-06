// Closing and due days set by hand per card, for banks that don't report a
// card's dates (or report wrong ones). Kept in this browser's localStorage,
// like category edits, and applied on top of whatever data source is loaded.

import { addMonths, dayOfMonth, toISO } from '../lib/dates'
import type { Account } from './types'

export interface CardDays {
  /** Day of the month the bill closes (1–31; short months use their last day). */
  close: number
  /** Day of the month the bill is due. */
  due: number
}

const KEY = 'trove.cardDays'

export function readCardDays(): Record<string, CardDays> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, CardDays>
    // Keep only well-formed entries.
    return Object.fromEntries(Object.entries(raw).filter(([, d]) => validDay(d?.close) && validDay(d?.due)))
  } catch {
    return {}
  }
}

export function saveCardDays(accountId: string, days: CardDays | null) {
  try {
    const all = readCardDays()
    if (days) all[accountId] = days
    else delete all[accountId]
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // Storage unavailable (private mode): the setting lasts until reload.
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

/** Accounts with the closing and due days set by hand in place of the bank's dates. */
export function applyCardDays(accounts: Account[], days: Record<string, CardDays>, today: Date = new Date()): Account[] {
  return accounts.map((a) => {
    const d = days[a.id]
    if (a.type !== 'CREDIT' || !a.creditData || !d) return a
    const { close, due } = billDates(d, today)
    return { ...a, creditData: { ...a.creditData, balanceCloseDate: close, balanceDueDate: due, userDays: d } }
  })
}
