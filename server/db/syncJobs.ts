// Background sync jobs. A Sync creates a job with one item per bank
// connection and answers at once; a worker then works through the queued
// items after the response (Vercel's waitUntil), so the sync continues with
// the app closed. The app polls GET /api/sync for progress.
//
// - Items are claimed with FOR UPDATE SKIP LOCKED: two workers never take the
//   same item, and each connection is also locked while it saves (sync.ts).
// - A worker stops claiming before the function's time limit; what's left
//   stays queued, and the next GET /api/sync starts a worker for it.
// - An item left "running" by a worker that was stopped is marked failed
//   (`timeout`) after STALE_MS, so it can be retried.

import type pg from 'pg'
import type { SyncJob } from '../../src/data/types.js'
import { PluggyError, type PluggyClient } from '../pluggy/client.js'
import { syncConnection } from './sync.js'

/** Work a worker starts within one invocation (the function's limit is 60 s). */
export const RUN_BUDGET_MS = 40_000
/** A running item older than this belongs to a worker that was stopped. */
export const STALE_MS = 90_000

interface ItemRow {
  connection_id: string
  status: SyncJob['items'][number]['status']
  inserted: number | null
  updated: number | null
  removed: number | null
  error: string | null
  bank_name: string | null
}

/** The job's state; the latest job when `jobId` is omitted; null if there is none. */
export async function readJob(pool: pg.Pool, jobId?: string): Promise<SyncJob | null> {
  const job = await pool.query<{ id: string; created_at: Date; finished_at: Date | null }>(
    jobId
      ? `SELECT id, created_at, finished_at FROM sync_jobs WHERE id = $1`
      : `SELECT id, created_at, finished_at FROM sync_jobs ORDER BY created_at DESC LIMIT 1`,
    jobId ? [jobId] : [],
  )
  const row = job.rows[0]
  if (!row) return null
  await failStale(pool, row.id)
  const items = await pool.query<ItemRow>(
    `SELECT i.connection_id, i.status, i.inserted, i.updated, i.removed, i.error, c.bank_name
     FROM sync_job_items i LEFT JOIN bank_connections c ON c.id = i.connection_id
     WHERE i.job_id = $1 ORDER BY i.position`,
    [row.id],
  )
  const done = items.rows.every((i) => i.status === 'ok' || i.status === 'failed')
  if (done && !row.finished_at) await pool.query(`UPDATE sync_jobs SET finished_at = now() WHERE id = $1 AND finished_at IS NULL`, [row.id])
  return {
    id: row.id,
    createdAt: row.created_at.toISOString(),
    done,
    items: items.rows.map((i) => ({
      connectionId: i.connection_id,
      name: i.bank_name,
      status: i.status,
      inserted: i.inserted ?? 0,
      updated: i.updated ?? 0,
      removed: i.removed ?? 0,
      error: i.error,
    })),
  }
}

/** Marks items left running by a stopped worker as failed. */
async function failStale(pool: pg.Pool, jobId: string) {
  await pool.query(
    `UPDATE sync_job_items SET status = 'failed', error = 'timeout', finished_at = now()
     WHERE job_id = $1 AND status = 'running' AND started_at < now() - make_interval(secs => $2)`,
    [jobId, STALE_MS / 1000],
  )
}

/**
 * Starts a job for these connections, or returns the unfinished one (a second
 * press while syncing doesn't start another).
 */
export async function startJob(pool: pg.Pool, connectionIds: string[]): Promise<SyncJob> {
  const latest = await readJob(pool)
  if (latest && !latest.done) return latest
  const id = crypto.randomUUID()
  await pool.query(`INSERT INTO sync_jobs (id) VALUES ($1)`, [id])
  await pool.query(
    `INSERT INTO sync_job_items (job_id, connection_id, position)
     SELECT $1, c, p::smallint FROM unnest($2::text[]) WITH ORDINALITY AS t(c, p)`,
    [id, connectionIds],
  )
  return (await readJob(pool, id))!
}

/** Whether queued items wait with no worker on them. */
export const needsWorker = (job: SyncJob) => job.items.some((i) => i.status === 'queued') && !job.items.some((i) => i.status === 'running')

/** Claims the next queued item of a job, or null when none is left. */
async function claim(pool: pg.Pool, jobId: string): Promise<string | null> {
  const r = await pool.query<{ connection_id: string }>(
    `UPDATE sync_job_items SET status = 'running', started_at = now()
     WHERE (job_id, connection_id) = (
       SELECT job_id, connection_id FROM sync_job_items
       WHERE job_id = $1 AND status = 'queued' ORDER BY position LIMIT 1 FOR UPDATE SKIP LOCKED
     )
     RETURNING connection_id`,
    [jobId],
  )
  return r.rows[0]?.connection_id ?? null
}

/**
 * Works through a job's queued items, one connection at a time, until none is
 * left or the time budget runs out. Never throws: each item ends ok or failed.
 */
export async function runJob(
  pool: pg.Pool,
  client: PluggyClient,
  jobId: string,
  deps: { fetch?: typeof fetch; now?: () => Date; budgetMs?: number } = {},
): Promise<void> {
  const started = Date.now()
  const budget = deps.budgetMs ?? RUN_BUDGET_MS
  while (Date.now() - started < budget) {
    const connectionId = await claim(pool, jobId).catch(() => null)
    if (!connectionId) break
    try {
      const r = await syncConnection(pool, client, connectionId, { now: deps.now?.(), fetch: deps.fetch, trigger: 'manual' })
      await pool.query(
        `UPDATE sync_job_items SET status = 'ok', finished_at = now(), inserted = $3, updated = $4, removed = $5 WHERE job_id = $1 AND connection_id = $2`,
        [jobId, connectionId, r.inserted, r.updated, r.removed],
      )
    } catch (e) {
      // A status code only: Pluggy's HTTP status, or the database error code.
      const code = e instanceof PluggyError ? `pluggy_${e.status}` : String((e as { code?: unknown })?.code ?? 'error')
      await pool
        .query(`UPDATE sync_job_items SET status = 'failed', finished_at = now(), error = $3 WHERE job_id = $1 AND connection_id = $2`, [
          jobId,
          connectionId,
          code,
        ])
        .catch(() => {})
    }
  }
  await pool
    .query(
      `UPDATE sync_jobs SET finished_at = now() WHERE id = $1 AND finished_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM sync_job_items WHERE job_id = $1 AND status IN ('queued', 'running'))`,
      [jobId],
    )
    .catch(() => {})
}
