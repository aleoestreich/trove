// The routes that use the database (all behind the login middleware):
//
//   GET  /api/finance  the app's data, read from the database
//        200 Snapshot · 409 { error: 'never_synced', sync } · 503 not_configured
//   POST /api/edits    one change to categories or transactions (src/data/edits.ts)
//        204 · 400 invalid (with a `reason` for bulk rules) · 404 not_found · 409 name_taken
//        categorizeMany: 200 { updated, previous }; restoreCategories: 200 { updated }
//   POST /api/sync     { connectionIds? }: start a background sync (default: every connection)
//        202 SyncJob (the running one if a sync is already in progress) · 403 not in PLUGGY_ITEM_IDS
//   GET  /api/sync     the latest sync job, for progress: 200 { job: SyncJob | null }
//
// All fail closed (503) without the database or Pluggy settings. Responses are
// no-store. Errors carry status codes and fixed messages, never amounts,
// descriptions, connection strings or credentials.

import { EditError, validateEdit } from '../../src/data/edits.js'
import { PluggyClient, type PluggyConfig } from '../pluggy/client.js'
import { historyStart } from '../pluggy/finance.js'
import { applyEditSql, ensureSeeded } from './categories.js'
import { dbErrorCode, dbErrorMessage, getPool } from './connection.js'
import { readSnapshot, readSyncInfo } from './read.js'
import { needsWorker, readJob, runJob, startJob } from './syncJobs.js'
import { waitUntil } from '@vercel/functions'

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

export async function financeFromDb(_request: Request, config: DbConfig, deps: Partial<HandlerDeps> = {}): Promise<Response> {
  if (!config.pluggy || !config.databaseUrl) return notConfigured()
  const pool = getPool(config.databaseUrl)
  try {
    await ensureSeeded(pool)
    const snapshot = await readSnapshot(pool, config.pluggy.itemIds, historyStart(deps.now?.() ?? new Date(), 1))
    if (!snapshot) return json(409, { error: 'never_synced', sync: await readSyncInfo(pool, config.pluggy.itemIds) })
    return json(200, snapshot)
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Missing exchange rate')) return json(500, { error: 'missing_rate', message: e.message })
    return json(500, { error: dbErrorCode(e), message: dbErrorMessage(e) })
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
  // Bulk edits only touch the configured connections' transactions.
  const bulk = edit.op === 'categorizeMany' || edit.op === 'restoreCategories'
  if (bulk && !config.pluggy) return notConfigured()
  try {
    const outcome = await applyEditSql(getPool(config.databaseUrl), edit, { itemIds: config.pluggy?.itemIds })
    return outcome ? json(200, outcome) : json(204, null)
  } catch (e) {
    if (e instanceof EditError)
      return json(e.code === 'not_found' ? 404 : e.code === 'name_taken' ? 409 : 400, { error: e.code, reason: e.reason, message: e.message })
    return json(500, { error: dbErrorCode(e), message: dbErrorMessage(e) })
  }
}

/** Runs work after the response (Vercel's waitUntil); injectable for tests. */
export type Background = (work: Promise<unknown>) => void

function startWorker(pool: ReturnType<typeof getPool>, config: DbConfig & { pluggy: PluggyConfig }, jobId: string, deps: Partial<HandlerDeps>, background: Background) {
  const fetchFn = deps.fetch ?? fetch
  background(runJob(pool, new PluggyClient(config.pluggy, fetchFn), jobId, { fetch: fetchFn, now: deps.now }))
}

/**
 * POST /api/sync { connectionIds? }: starts a background sync of these
 * connections (default: all of PLUGGY_ITEM_IDS), or returns the one already
 * running. Answers 202 with the job at once.
 */
export async function startSync(request: Request, config: DbConfig, deps: Partial<HandlerDeps> = {}, background: Background = waitUntil): Promise<Response> {
  if (!config.pluggy || !config.databaseUrl) return notConfigured()
  const body = (await request.json().catch(() => ({}))) as { connectionIds?: unknown }
  const all = config.pluggy.itemIds
  const wanted = Array.isArray(body?.connectionIds) ? body.connectionIds : all
  if (wanted.length === 0 || !wanted.every((id): id is string => typeof id === 'string' && all.includes(id))) {
    return json(403, { error: 'connection_not_configured' })
  }
  try {
    const pool = getPool(config.databaseUrl)
    const job = await startJob(pool, all.filter((id) => wanted.includes(id)))
    if (needsWorker(job)) startWorker(pool, { ...config, pluggy: config.pluggy }, job.id, deps, background)
    return json(202, job)
  } catch (e) {
    return json(500, { error: dbErrorCode(e), message: dbErrorMessage(e) })
  }
}

/**
 * GET /api/sync: the latest sync job (null if none). If items are queued with
 * no worker on them (the previous one hit its time limit), a worker resumes them.
 */
export async function syncStatus(_request: Request, config: DbConfig, deps: Partial<HandlerDeps> = {}, background: Background = waitUntil): Promise<Response> {
  if (!config.pluggy || !config.databaseUrl) return notConfigured()
  try {
    const pool = getPool(config.databaseUrl)
    const job = await readJob(pool)
    if (job && needsWorker(job)) startWorker(pool, { ...config, pluggy: config.pluggy }, job.id, deps, background)
    return json(200, { job })
  } catch (e) {
    return json(500, { error: dbErrorCode(e), message: dbErrorMessage(e) })
  }
}
