import type { Repository } from './repository'
import type { Snapshot } from './types'
import { applyOverrides, saveIgnored, saveOverride } from './overrides'

/** Pluggy isn't configured on the server yet (see docs/pluggy-setup.md). */
export class NotConfiguredError extends Error {}

/**
 * Live data: the owner's accounts via Pluggy, from /api/finance (server-side,
 * behind the login). The owner's edits are kept in localStorage.
 */
export function createPluggyRepository(fetchFn: typeof fetch = (...a) => fetch(...a)): Repository {
  return {
    async load(): Promise<Snapshot> {
      const res = await fetchFn('/api/finance', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      if (res.status === 401) {
        // Session expired: log in again and come back.
        window.location.assign('/api/auth/login')
        return new Promise(() => {})
      }
      if (res.status === 503) throw new NotConfiguredError('Pluggy is not configured.')
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null
        throw new Error(body?.message ?? `HTTP ${res.status}`)
      }
      return applyOverrides((await res.json()) as Snapshot)
    },
    async setTransactionCategory(transactionId, categoryId) {
      saveOverride(transactionId, categoryId)
    },
    async setTransactionIgnored(transactionId, ignored) {
      saveIgnored(transactionId, ignored)
    },
  }
}

/** Live data, or demo data while Pluggy isn't configured yet. */
export function withDemoFallback(live: Repository, demo: Repository): Repository {
  let usingDemo = false
  return {
    async load() {
      try {
        return await live.load()
      } catch (e) {
        if (!(e instanceof NotConfiguredError)) throw e
        usingDemo = true
        return demo.load()
      }
    },
    setTransactionCategory(id, categoryId) {
      return (usingDemo ? demo : live).setTransactionCategory(id, categoryId)
    },
    setTransactionIgnored(id, ignored) {
      return (usingDemo ? demo : live).setTransactionIgnored(id, ignored)
    },
  }
}
