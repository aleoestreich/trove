// Changes the owner makes to transactions in the app (category, ignored), kept
// in this browser's localStorage and applied on top of whatever data source is
// loaded.

import type { Snapshot } from './types'

const OVERRIDES_KEY = 'trove.categoryOverrides'
const IGNORED_KEY = 'trove.ignoredTransactions'

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

/** IDs of the transactions the owner chose to ignore. */
export function readIgnored(): Set<string> {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(IGNORED_KEY) ?? '[]')
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

export function saveIgnored(transactionId: string, ignored: boolean) {
  const ids = readIgnored()
  if (ignored) ids.add(transactionId)
  else ids.delete(transactionId)
  try {
    localStorage.setItem(IGNORED_KEY, JSON.stringify([...ids]))
  } catch {
    // Storage unavailable (private mode); edits last until reload.
  }
}

export function applyOverrides(snapshot: Snapshot): Snapshot {
  const overrides = readOverrides()
  const ignored = readIgnored()
  return {
    ...snapshot,
    transactions: snapshot.transactions.map((t) => {
      const categoryId = overrides[t.id]
      if (!categoryId && !ignored.has(t.id)) return t
      return { ...t, ...(categoryId && { categoryId }), ...(ignored.has(t.id) && { ignored: true }) }
    }),
  }
}

export function clearOverrides() {
  try {
    localStorage.removeItem(OVERRIDES_KEY)
    localStorage.removeItem(IGNORED_KEY)
  } catch {
    // ignore
  }
}
