// Trove's database: Postgres on Neon (docs/neon-setup.md), through `pg`.
//
// The connection string is a secret: it comes only from the environment and
// is never logged or returned. Without it, the routes that need the database
// refuse with 503 (fail closed).

import pg from 'pg'
import { attachDatabasePool } from '@vercel/functions'

type Env = Record<string, string | undefined>

/** The pooled connection string: DATABASE_URL, else the name Vercel Storage creates with the TROVE_DATABASE prefix. */
export function readDatabaseUrl(env: Env): string | null {
  return env.DATABASE_URL?.trim() || env.TROVE_DATABASE_DATABASE_URL?.trim() || null
}

/** What the data code needs from a connection (a pool or a client in a transaction). */
export interface Db {
  query<R extends pg.QueryResultRow = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>
}

const pools = new Map<string, pg.Pool>()

/** One small pool per server instance; Neon's pooler does the rest. */
export function getPool(url: string): pg.Pool {
  let pool = pools.get(url)
  if (!pool) {
    pool = new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 8_000 })
    // Errors on idle connections (e.g. Neon closing them) must not crash the function.
    pool.on('error', () => {})
    try {
      // On Vercel: lets idle connections close before the instance is suspended.
      attachDatabasePool(pool)
    } catch {
      // Not on Vercel (tests, local).
    }
    pools.set(url, pool)
  }
  return pool
}

/** Runs `fn` in one database transaction: all of it is saved, or none. */
export async function inTransaction<T>(pool: pg.Pool, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

/** A message safe to return: database errors can quote values, so only their code is kept. */
export function dbErrorMessage(e: unknown): string {
  const code = (e as { code?: unknown })?.code
  if (code === '42P01' || code === '42703') return 'The database tables are out of date: run db/migrations/002_categories_and_sync.sql (docs/neon-setup.md).'
  return typeof code === 'string' ? `Database error (${code}).` : 'Database unavailable.'
}
