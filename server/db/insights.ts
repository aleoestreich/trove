// The insight routes (all behind the login middleware), read from the
// database with the same calculations as the app (src/data/insights.ts):
//
//   GET  /api/insights/projection            the month-end projection
//        200 { available: true, asOf, endDate, end, low, range, breakdown, daily, events, settings }
//        200 { available: false, asOf, settings } without 2 months of salary history
//   PUT  /api/insights/projection/settings   { accountIds, includeDaily, includeFreelance }
//        200 the recalculated projection · 400 invalid
//   GET  /api/insights/unusual-categories    { month, compareFrom, compareTo, mode, days, unusual, normal }
//        (unusual: null fields when there aren't 3 months of history)
//   GET  /api/recurring                      { monthTotal, yearTotal, active, stopped, alerts }
//   POST /api/recurring/:id/action           { action: confirm | not_recurring | cancelled | still_active | dismiss_increase }
//        200 the recalculated recurring list · 400 invalid
//
// These and the average income routes are one Vercel Function,
// api/insights.ts, through vercel.json rewrites (the Hobby plan allows 12).
// Fail closed (503) without the database or Pluggy settings. Responses are
// no-store; errors carry codes only, never amounts or descriptions.

import { EditError, validateEdit, type Edit } from '../../src/data/edits.js'
import { computeInsights } from '../../src/data/insights.js'
import type { Projection } from '../../src/data/projection.js'
import type { RecurringItem } from '../../src/data/recurring.js'
import type { Snapshot } from '../../src/data/types.js'
import { describeEvent, paymentLabel } from '../../src/lib/insightText.js'
import { brazilDate } from '../pluggy/map.js'
import { applyEditSql, ensureSeeded } from './categories.js'
import { dbErrorCode, dbErrorMessage, getPool } from './connection.js'
import { incomeRoutes, type DbConfig, type HandlerDeps } from './handlers.js'
import { analysisStart, readSnapshot } from './read.js'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' },
  })
}

const failed = (e: unknown) =>
  e instanceof Error && e.message.startsWith('Missing exchange rate')
    ? json(500, { error: 'missing_rate', message: e.message })
    : json(500, { error: dbErrorCode(e), message: dbErrorMessage(e) })

/** Today in Brazil (YYYY-MM-DD). */
const todayOf = (deps: Partial<HandlerDeps>) => brazilDate((deps.now?.() ?? new Date()).toISOString())

async function snapshotOf(config: DbConfig, deps: Partial<HandlerDeps>): Promise<Snapshot | Response> {
  if (!config.pluggy || !config.databaseUrl) return json(503, { error: 'not_configured' })
  const pool = getPool(config.databaseUrl)
  await ensureSeeded(pool)
  const s = await readSnapshot(pool, config.pluggy.itemIds, analysisStart(deps.now?.() ?? new Date()))
  return s ?? json(409, { error: 'never_synced' })
}

export function projectionPayload(s: Snapshot, today: string) {
  const insights = computeInsights(s, today)
  const p: Projection | null = insights.projection
  const settings = s.projectionSettings
  if (!p) return { available: false, asOf: today, settings }
  return {
    available: true,
    asOf: p.asOf,
    endDate: p.endDate,
    end: p.end,
    low: p.low,
    range: p.range,
    breakdown: p.breakdown,
    daily: p.daily,
    events: p.events.map((e) => ({ date: e.date, ...describeEvent(e, s.accounts, s.institutions), amount: e.amount })),
    settings: p.settings,
  }
}

export function unusualPayload(s: Snapshot, today: string) {
  const u = computeInsights(s, today).unusual
  if (!u) return { month: null, compareFrom: null, compareTo: null, mode: null, days: null, unusual: [], normal: [] }
  return {
    month: u.month,
    compareFrom: u.compareFrom,
    compareTo: u.compareTo,
    mode: u.mode,
    days: u.days,
    unusual: u.unusual.map((c) => ({ categoryId: c.categoryId, now: c.now, avg: c.avg, pct: c.pct, delta: c.delta, subs: c.subs, counts: c.counts })),
    normal: u.normal.map((c) => ({ categoryId: c.categoryId, pct: c.pct })),
  }
}

export function recurringPayload(s: Snapshot, today: string) {
  const r = computeInsights(s, today).recurring
  const item = (i: RecurringItem) => ({
    id: i.id,
    merchant: i.merchant,
    categoryId: i.categoryId,
    cadence: i.cadence,
    day: i.day,
    nextDate: i.nextDate,
    amount: i.amount,
    ...(i.foreign?.currency === 'USD' ? { usdAmount: i.foreign.amount } : {}),
    account: paymentLabel(i.paymentMethod, i.accountId, s.accounts, s.institutions),
    paymentMethod: i.paymentMethod,
    status: i.status,
    priceHistory: i.priceHistory,
  })
  const byId = new Map([...r.active, ...r.stopped].map((i) => [i.id, i]))
  return {
    monthTotal: r.monthTotal,
    yearTotal: r.yearTotal,
    active: r.active.map(item),
    stopped: r.stopped.map(item),
    alerts: r.alerts.map((a) => {
      const i = byId.get(a.recurringId)!
      if (a.type === 'price_up') return { ...a, from: i.priceChange!.from, to: i.priceChange!.to, currency: i.priceChange!.currency, since: i.priceChange!.date }
      if (a.type === 'stopped') return { ...a, lastDate: i.lastDate }
      return { ...a, firstDate: i.firstDate }
    }),
  }
}

/** Saves one validated edit, then answers with `then`. */
async function saveThen(config: DbConfig, deps: Partial<HandlerDeps>, edit: () => Edit, then: (s: Snapshot, today: string) => unknown): Promise<Response> {
  if (!config.pluggy || !config.databaseUrl) return json(503, { error: 'not_configured' })
  let e: Edit
  try {
    e = edit()
  } catch (err) {
    return json(400, { error: 'invalid', message: err instanceof EditError ? err.message : 'Invalid JSON.' })
  }
  try {
    await applyEditSql(getPool(config.databaseUrl), e)
    const s = await snapshotOf(config, deps)
    return s instanceof Response ? s : json(200, then(s, todayOf(deps)))
  } catch (err) {
    if (err instanceof EditError) return json(400, { error: err.code, message: err.message })
    return failed(err)
  }
}

async function read(config: DbConfig, deps: Partial<HandlerDeps>, payload: (s: Snapshot, today: string) => unknown): Promise<Response> {
  try {
    const s = await snapshotOf(config, deps)
    return s instanceof Response ? s : json(200, payload(s, todayOf(deps)))
  } catch (e) {
    return failed(e)
  }
}

/** Which route a request is for: vercel.json's `view` parameter, or the public path. */
function routeOf(url: URL): { view: string | null; id: string | null } {
  const view = url.searchParams.get('view')
  if (view) return { view, id: url.searchParams.get('id') }
  const p = url.pathname.replace(/\/+$/, '')
  const action = p.match(/^\/api\/recurring\/([^/]+)\/action$/)
  if (action) return { view: 'recurring-action', id: decodeURIComponent(action[1]) }
  const paths: Record<string, string> = {
    '/api/insights/projection': 'projection',
    '/api/insights/projection/settings': 'projection-settings',
    '/api/insights/unusual-categories': 'unusual',
    '/api/recurring': 'recurring',
  }
  return { view: paths[p] ?? null, id: null }
}

/**
 * Every insight route, and the average income ones, in one function
 * (api/insights.ts). Anything else goes to the income routes, which answer
 * 405 for what they don't serve.
 */
export async function insightRoutes(request: Request, config: DbConfig, deps: Partial<HandlerDeps> = {}): Promise<Response> {
  const { view, id } = routeOf(new URL(request.url))
  const method = request.method
  switch (view) {
    case 'projection':
      return method === 'GET' ? read(config, deps, projectionPayload) : json(405, { error: 'method_not_allowed' })
    case 'projection-settings': {
      if (method !== 'PUT') return json(405, { error: 'method_not_allowed' })
      const body = await request.json().catch(() => null)
      return saveThen(config, deps, () => validateEdit({ op: 'setProjectionSettings', settings: body }), projectionPayload)
    }
    case 'unusual':
      return method === 'GET' ? read(config, deps, unusualPayload) : json(405, { error: 'method_not_allowed' })
    case 'recurring':
      return method === 'GET' ? read(config, deps, recurringPayload) : json(405, { error: 'method_not_allowed' })
    case 'recurring-action': {
      if (method !== 'POST') return json(405, { error: 'method_not_allowed' })
      const body = (await request.json().catch(() => null)) as { action?: unknown } | null
      return saveThen(config, deps, () => validateEdit({ op: 'recurringAction', id, action: body?.action, at: todayOf(deps) }), recurringPayload)
    }
    default:
      return incomeRoutes(request, config, deps)
  }
}
