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
//   (The three income routes below share one function, api/insights.ts, with the insight routes in server/db/insights.ts, through vercel.json rewrites.)
//   GET  /api/overview/income-average             the average income card under the saved filter
//        200 { average, months, lowest, highest, currentMonth, allAverage, filter } (figures null before a complete month)
//   GET  /api/overview/income-average/categories  every income category and subcategory, and
//        uncategorized, with their monthly average and per-month totals (the picker's live preview)
//   PUT  /api/settings/income-average-filter      { excludedCategoryIds, excludedSubcategoryIds, excludeUncategorized }
//        200 the new income-average payload · 400 invalid (reason nothing_selected / not_income)
//
// All fail closed (503) without the database or Pluggy settings. Responses are
// no-store. Errors carry status codes and fixed messages, never amounts,
// descriptions, connection strings or credentials.

import { EditError, validateEdit } from '../../src/data/edits.js'
import { filterLabel, incomeAverage, incomeOptions, summarizeIncomeFilter, NO_FILTER } from '../../src/data/incomeAverage.js'
import type { Snapshot } from '../../src/data/types.js'
import { messages } from '../../src/i18n/messages.js'
import { brazilDate } from '../pluggy/map.js'
import { PluggyClient, type PluggyConfig } from '../pluggy/client.js'
import { applyEditSql, ensureSeeded } from './categories.js'
import { dbErrorCode, dbErrorMessage, getPool } from './connection.js'
import { analysisStart, readSnapshot, readSyncInfo } from './read.js'
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
    const snapshot = await readSnapshot(pool, config.pluggy.itemIds, analysisStart(deps.now?.() ?? new Date()))
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

/** The month in progress in Brazil (YYYY-MM). */
const currentMonthOf = (now: Date) => brazilDate(now.toISOString()).slice(0, 7)

/** GET /api/overview/income-average's body, from a snapshot. Also the answer to a saved filter. */
export function incomeAveragePayload(s: Snapshot, currentMonth: string) {
  const filter = s.incomeFilter ?? NO_FILTER
  const a = incomeAverage(s.transactions, s.categories, s.subcategories, filter, currentMonth)
  const f = messages.overview.avgIncome.filter
  const summary = summarizeIncomeFilter(filter, s.categories, s.subcategories, messages.transactions.uncategorized)
  return {
    average: a?.average ?? null,
    months: a?.months ?? [],
    lowest: a?.lowest ?? null,
    highest: a?.highest ?? null,
    currentMonth: a?.currentMonth ?? null,
    allAverage: a?.allAverage ?? null,
    filter: { ...filter, label: filterLabel(summary, f), included: summary.included.length, total: summary.total },
  }
}

/** Reads the snapshot (7 months, as the app) for the income routes; a Response when it can't. */
async function snapshotFor(config: DbConfig, deps: Partial<HandlerDeps>): Promise<Snapshot | Response> {
  if (!config.pluggy || !config.databaseUrl) return notConfigured()
  const pool = getPool(config.databaseUrl)
  await ensureSeeded(pool)
  const snapshot = await readSnapshot(pool, config.pluggy.itemIds, analysisStart(deps.now?.() ?? new Date()))
  return snapshot ?? json(409, { error: 'never_synced' })
}

const failed = (e: unknown) =>
  e instanceof Error && e.message.startsWith('Missing exchange rate')
    ? json(500, { error: 'missing_rate', message: e.message })
    : json(500, { error: dbErrorCode(e), message: dbErrorMessage(e) })

export async function incomeAverageRoute(_request: Request, config: DbConfig, deps: Partial<HandlerDeps> = {}): Promise<Response> {
  try {
    const s = await snapshotFor(config, deps)
    if (s instanceof Response) return s
    return json(200, incomeAveragePayload(s, currentMonthOf(deps.now?.() ?? new Date())))
  } catch (e) {
    return failed(e)
  }
}

export async function incomeCategoriesRoute(_request: Request, config: DbConfig, deps: Partial<HandlerDeps> = {}): Promise<Response> {
  try {
    const s = await snapshotFor(config, deps)
    if (s instanceof Response) return s
    const o = incomeOptions(s.transactions, s.categories, s.subcategories, currentMonthOf(deps.now?.() ?? new Date()))
    const cats = new Map(s.categories.map((c) => [c.id, c]))
    const subs = new Map(s.subcategories.map((x) => [x.id, x]))
    return json(200, {
      months: o.months,
      categories: o.categories.map((c) => ({
        ...c,
        name: cats.get(c.id)!.name,
        color: cats.get(c.id)!.color,
        icon: cats.get(c.id)!.icon,
        subcategories: c.subcategories.map((x) => ({ ...x, name: subs.get(x.id)!.name })),
      })),
      uncategorized: o.uncategorized,
    })
  } catch (e) {
    return failed(e)
  }
}

/** PUT /api/settings/income-average-filter: validates and saves the exclusions, then answers with the recalculated card. */
export async function saveIncomeFilterRoute(request: Request, config: DbConfig, deps: Partial<HandlerDeps> = {}): Promise<Response> {
  if (!config.pluggy || !config.databaseUrl) return notConfigured()
  let edit
  try {
    edit = validateEdit({ op: 'setIncomeFilter', filter: await request.json() })
  } catch (e) {
    return json(400, { error: 'invalid', message: e instanceof EditError ? e.message : 'Invalid JSON.' })
  }
  try {
    await applyEditSql(getPool(config.databaseUrl), edit)
  } catch (e) {
    if (e instanceof EditError) return json(400, { error: e.code, reason: e.reason, message: e.message })
    return failed(e)
  }
  return incomeAverageRoute(request, config, deps)
}

/**
 * The three average income routes in one Vercel Function (the Hobby plan
 * allows 12 per deployment, the login middleware included). vercel.json
 * rewrites the public paths to /api/insights?view=…; the original path
 * is also recognised, whichever one the request carries.
 */
export function incomeRoutes(request: Request, config: DbConfig, deps: Partial<HandlerDeps> = {}): Promise<Response> {
  const url = new URL(request.url)
  const view = url.searchParams.get('view') ?? (url.pathname.endsWith('/categories') ? 'categories' : url.pathname.endsWith('/income-average-filter') ? 'filter' : null)
  if (request.method === 'GET' && view === 'categories') return incomeCategoriesRoute(request, config, deps)
  if (request.method === 'GET' && view !== 'filter') return incomeAverageRoute(request, config, deps)
  if (request.method === 'PUT' && view === 'filter') return saveIncomeFilterRoute(request, config, deps)
  return Promise.resolve(json(405, { error: 'method_not_allowed' }))
}
