// The routes that use the database (all behind the login middleware):
//
//   GET  /api/finance  the app's data, read from the database
//        200 Snapshot · 409 { error: 'never_synced', sync } · 503 not_configured
//   POST /api/edits    one change to categories or transactions (src/data/edits.ts)
//        204 · 400 invalid · 404 not_found · 409 name_taken
//   POST /api/sync     { connectionId }: fetch that connection from Meu Pluggy and save it
//        200 SyncResult · 403 not one of PLUGGY_ITEM_IDS · 502 Pluggy failed
//
// All fail closed (503) without the database or Pluggy settings. Responses are
// no-store. Errors carry status codes and fixed messages, never amounts,
// descriptions, connection strings or credentials.

import { EditError, validateEdit } from '../../src/data/edits.js'
import { PluggyClient, PluggyError, type PluggyConfig } from '../pluggy/client.js'
import { historyStart } from '../pluggy/finance.js'
import { applyEditSql, ensureSeeded } from './categories.js'
import { dbErrorMessage, getPool } from './connection.js'
import { readSnapshot, readSyncInfo } from './read.js'
import { syncConnection } from './sync.js'

export interface DbConfig {
  pluggy: PluggyConfig | null
  databaseUrl: string | null
}

export interface HandlerDeps {
  fetch: typeof fetch
  now: () => Date
}

function json(status: number, body: unknown): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' },
  })
}

const notConfigured = () => json(503, { error: 'not_configured' })

/** The app's language, from the cookie the app sets (Portuguese by default), for seeding categories. */
export function requestLanguage(request: Request): 'en' | 'pt' {
  const cookie = request.headers.get('cookie') ?? ''
  return /(?:^|;\s*)trove_locale=en(?:;|$)/.test(cookie) ? 'en' : 'pt'
}

export async function financeFromDb(request: Request, config: DbConfig, deps: Partial<HandlerDeps> = {}): Promise<Response> {
  if (!config.pluggy || !config.databaseUrl) return notConfigured()
  const pool = getPool(config.databaseUrl)
  try {
    await ensureSeeded(pool, requestLanguage(request))
    const snapshot = await readSnapshot(pool, config.pluggy.itemIds, historyStart(deps.now?.() ?? new Date(), 1))
    if (!snapshot) return json(409, { error: 'never_synced', sync: await readSyncInfo(pool, config.pluggy.itemIds) })
    return json(200, snapshot)
  } catch (e) {
    return json(500, { error: 'database', message: e instanceof Error && e.message.startsWith('Missing exchange rate') ? e.message : dbErrorMessage(e) })
  }
}

export async function edits(request: Request, config: DbConfig): Promise<Response> {
  if (!config.databaseUrl) return notConfigured()
  let edit
  try {
    edit = validateEdit(await request.json())
  } catch (e) {
    return json(400, { error: 'invalid', message: e instanceof EditError ? e.message : 'Invalid JSON.' })
  }
  try {
    await applyEditSql(getPool(config.databaseUrl), edit)
    return json(204, null)
  } catch (e) {
    if (e instanceof EditError) return json(e.code === 'not_found' ? 404 : e.code === 'name_taken' ? 409 : 400, { error: e.code, message: e.message })
    return json(500, { error: 'database', message: dbErrorMessage(e) })
  }
}

export async function sync(request: Request, config: DbConfig, deps: Partial<HandlerDeps> = {}): Promise<Response> {
  if (!config.pluggy || !config.databaseUrl) return notConfigured()
  const body = (await request.json().catch(() => null)) as { connectionId?: unknown } | null
  const connectionId = typeof body?.connectionId === 'string' ? body.connectionId : ''
  if (!config.pluggy.itemIds.includes(connectionId)) return json(403, { error: 'connection_not_configured' })
  const fetchFn = deps.fetch ?? fetch
  try {
    const result = await syncConnection(getPool(config.databaseUrl), new PluggyClient(config.pluggy, fetchFn), connectionId, {
      now: deps.now?.(),
      fetch: fetchFn,
    })
    return json(200, result)
  } catch (e) {
    // Pluggy's messages carry a path and status, never credentials (see client.ts).
    if (e instanceof PluggyError) return json(502, { error: 'upstream', message: e.message })
    return json(500, { error: 'database', message: dbErrorMessage(e) })
  }
}
