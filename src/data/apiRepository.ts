import type { Repository } from './repository'
import type { Snapshot, SyncInfo, SyncJob } from './types'
import { messages } from '../i18n/messages'
import type { BulkResult } from './edits'

/** Pluggy or the database isn't configured on the server yet (see docs/pluggy-setup.md, docs/neon-setup.md). */
export class NotConfiguredError extends Error {}

/** A sync couldn't start: the HTTP status of POST /api/sync, or 0 without a response. */
export class SyncStartError extends Error {
  constructor(readonly status: number) {
    super(status ? `Sync couldn't start (HTTP ${status}).` : "Sync couldn't start: no response.")
  }
}

/** Configured, but nothing has been synced yet: the app shows demo data with a Sync button. */
export class NeverSyncedError extends Error {
  constructor(readonly sync: SyncInfo) {
    super('Nothing synced yet.')
  }
}

type Fetch = typeof fetch

async function request(fetchFn: Fetch, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetchFn(url, { credentials: 'same-origin', ...init, headers: { Accept: 'application/json', ...init.headers } })
  if (res.status === 401) {
    // Session expired: log in again and come back.
    window.location.assign('/api/auth/login')
    return new Promise(() => {})
  }
  return res
}

/**
 * An error code (the API's, or an EditError's) as a message for the UI. The
 * server's own text is technical and in English, so it is never shown.
 */
export function errorMessage(code: string | undefined, status?: number, reason?: string): string {
  const e = messages.errors
  const bulk: Record<string, string> = {
    transfer: e.bulkTransfer,
    mixed_types: e.bulkMixedTypes,
    category_type: e.bulkCategoryType,
    subcategory_category: e.bulkSubcategory,
    nothing_selected: e.nothingSelected,
    not_income: e.notIncome,
  }
  if (reason && bulk[reason]) return bulk[reason]
  const byCode: Record<string, string> = {
    database: e.database,
    schema_outdated: e.schemaOutdated,
    missing_rate: e.missingRate,
    invalid: e.invalid,
    not_found: e.notFound,
    name_taken: e.nameTaken,
  }
  return byCode[code ?? ''] ?? e.http(status ?? 0)
}

async function failure(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { error?: string; reason?: string } | null
  return new Error(errorMessage(body?.error, res.status, body?.reason))
}

/**
 * Data from Trove's database, via the server (behind the login):
 * GET /api/finance reads it, POST /api/edits saves changes, POST /api/sync
 * starts a background sync and GET /api/sync reports its progress.
 */
export function createApiRepository(fetchFn: Fetch = (...a) => fetch(...a)): Repository {
  const post = (url: string, body: unknown) =>
    request(fetchFn, url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return {
    async load(): Promise<Snapshot> {
      const res = await request(fetchFn, '/api/finance')
      if (res.status === 503) throw new NotConfiguredError('Not configured.')
      if (res.status === 409) {
        const body = (await res.json()) as { sync: SyncInfo }
        throw new NeverSyncedError(body.sync)
      }
      if (!res.ok) throw await failure(res)
      return (await res.json()) as Snapshot
    },
    async edit(e) {
      // The income filter has its own route (it answers with the recalculated average, unused here).
      const res =
        e.op === 'setIncomeFilter'
          ? await request(fetchFn, '/api/settings/income-average-filter', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(e.filter),
            })
          : await post('/api/edits', e)
      if (!res.ok) throw await failure(res)
      return e.op === 'categorizeMany' ? ((await res.json()) as BulkResult) : null
    },
    async startSync(connectionIds) {
      const res = await post('/api/sync', connectionIds ? { connectionIds } : {}).catch(() => null)
      if (!res || !res.ok) throw new SyncStartError(res?.status ?? 0)
      return (await res.json()) as SyncJob
    },
    async syncStatus() {
      const res = await request(fetchFn, '/api/sync')
      if (res.status === 503) return null
      if (!res.ok) throw await failure(res)
      return ((await res.json()) as { job: SyncJob | null }).job
    },
  }
}

/**
 * Live data, or demo data while the server isn't configured or nothing has
 * been synced yet (then the demo carries the connections to sync). Syncing
 * always goes to the live side; edits go where the data came from.
 */
export function withDemoFallback(live: Repository, demo: Repository): Repository {
  let usingDemo = false
  return {
    async load() {
      try {
        const s = await live.load()
        usingDemo = false
        return s
      } catch (e) {
        if (e instanceof NeverSyncedError) {
          usingDemo = true
          return { ...(await demo.load()), sync: e.sync }
        }
        if (!(e instanceof NotConfiguredError)) throw e
        usingDemo = true
        return demo.load()
      }
    },
    edit(e) {
      return (usingDemo ? demo : live).edit(e)
    },
    startSync(ids) {
      return live.startSync(ids)
    },
    syncStatus() {
      return live.syncStatus()
    },
  }
}
