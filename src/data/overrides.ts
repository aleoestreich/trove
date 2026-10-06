// Category changes made in the app, kept in this browser's localStorage and
// applied on top of whatever data source is loaded.

import type { Snapshot } from './types'

const OVERRIDES_KEY = 'trove.categoryOverrides'

export function readOverrides(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(OVERRIDES_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function saveOverride(transactionId: string, categoryId: string) {
  try {
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify({ ...readOverrides(), [transactionId]: categoryId }))
  } catch {
    // Storage unavailable (private mode); edits last until reload.
  }
}

/** Drops the category changes that point at a category (when the owner deletes it). */
export function removeOverridesTo(categoryId: string) {
  try {
    const kept = Object.fromEntries(Object.entries(readOverrides()).filter(([, c]) => c !== categoryId))
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(kept))
  } catch {
    // Storage unavailable.
  }
}

export function applyOverrides(snapshot: Snapshot): Snapshot {
  const overrides = readOverrides()
  return {
    ...snapshot,
    transactions: snapshot.transactions.map((t) => (overrides[t.id] ? { ...t, categoryId: overrides[t.id] } : t)),
  }
}

export function clearOverrides() {
  try {
    localStorage.removeItem(OVERRIDES_KEY)
  } catch {
    // ignore
  }
}
