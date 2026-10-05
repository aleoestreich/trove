/**
 * Hides the values in a Pluggy response so a screenshot of the debug screen
 * shows its shape (IDs, types, dates, statuses) but no amounts, descriptions or
 * names. Only keys known to be safe keep their value; everything else is
 * replaced, so a field Pluggy adds later stays hidden by default.
 */
const SAFE_KEYS = new Set([
  'id',
  'type',
  'subtype',
  'date',
  'status',
  'executionStatus',
  'statusDetail',
  'currencyCode',
  'category',
  'operationType',
  'installmentNumber',
  'totalInstallments',
  'total',
  'totalPages',
  'page',
  'next',
  'code',
  'message',
])

const isSafe = (key: string) => SAFE_KEYS.has(key) || /(Id|Ids|At|Date)$/.test(key)

export const HIDDEN = '•••'

export function redact(value: unknown, key = ''): unknown {
  if (value === null || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map((v) => redact(v, key))
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redact(v, k)]))
  }
  return isSafe(key) ? value : HIDDEN
}
