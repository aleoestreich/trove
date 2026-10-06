// Why a sync failed, from the code stored with it (server/db/syncJobs.ts):
// "pluggy_<HTTP status>", "timeout", a Postgres error code, or "error". Also
// which Pluggy connection statuses need the bank reconnected in Meu Pluggy.

export type SyncProblem =
  /** Pluggy refused the API credentials (401/403): PLUGGY_CLIENT_ID / SECRET in Vercel. */
  | 'credentials'
  /** The connection doesn't exist in Pluggy (404): wrong or deleted item ID. */
  | 'notFound'
  /** Too many requests (429): retry later. */
  | 'rateLimited'
  /** Pluggy or the bank failed (5xx). */
  | 'unavailable'
  /** The sync took too long and was stopped. */
  | 'timeout'
  /** The database refused the write (e.g. a migration not run). */
  | 'database'
  /** Pluggy or the database isn't configured on the server. */
  | 'notConfigured'
  /** The app couldn't reach the server. */
  | 'network'
  | 'unknown'

export function problemFromCode(code: string | null | undefined): SyncProblem {
  if (!code) return 'unknown'
  if (code === 'timeout') return 'timeout'
  const pluggy = /^pluggy_(\d{3})$/.exec(code)
  if (pluggy) {
    const status = Number(pluggy[1])
    if (status === 401 || status === 403) return 'credentials'
    if (status === 404) return 'notFound'
    if (status === 429) return 'rateLimited'
    return 'unavailable'
  }
  // Postgres error codes are five characters (SQLSTATE), e.g. 42P01.
  if (/^[0-9A-Z]{5}$/.test(code)) return 'database'
  return 'unknown'
}

/** The reason a sync couldn't start, from the HTTP status of POST /api/sync (0: no response). */
export function problemFromStatus(status: number): SyncProblem {
  if (status === 0) return 'network'
  if (status === 503) return 'notConfigured'
  // 403: a connection that isn't in PLUGGY_ITEM_IDS.
  if (status === 403) return 'notFound'
  if (status >= 500) return 'database'
  return 'unknown'
}

/**
 * Pluggy connection statuses that need the bank reconnected (in the Meu Pluggy
 * app): a sync still succeeds, but the bank's data stops updating.
 */
const RECONNECT = new Set(['LOGIN_ERROR', 'OUTDATED', 'WAITING_USER_INPUT', 'WAITING_USER_ACTION'])

export const needsReconnect = (status: string | null | undefined): boolean => !!status && RECONNECT.has(status)
