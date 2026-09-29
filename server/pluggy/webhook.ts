// POST /api/webhooks/pluggy: receives Pluggy webhook events
// (item/created, item/updated, item/error, transactions/*...).
//
// Pluggy can't log in with Auth0, so the login middleware lets this one path
// through and the handler checks its own secret instead: the webhook is
// registered in Pluggy with the header `X-Trove-Webhook-Secret` set to the
// value of PLUGGY_WEBHOOK_SECRET (a Vercel environment variable). Fails
// closed: no secret configured -> 503; wrong or missing header -> 401.
//
// Pluggy requires a 2XX within 5 seconds, and Trove keeps no database, so the
// work here is small and synchronous: refresh Trove's cache when data changed,
// and log what happened (event type and IDs only; never amounts or messages).

import { createHash, timingSafeEqual } from 'node:crypto'
import { clearFinanceCache } from './finance.js'

export const WEBHOOK_PATH = '/api/webhooks/pluggy'
export const WEBHOOK_SECRET_HEADER = 'X-Trove-Webhook-Secret'

export interface WebhookConfig {
  secret: string
  /** Items Trove reads (PLUGGY_ITEM_IDS); events for other items are ignored. Empty = not set up yet. */
  itemIds: string[]
}

type Env = Record<string, string | undefined>

export function readWebhookConfig(env: Env): WebhookConfig | null {
  const secret = env.PLUGGY_WEBHOOK_SECRET?.trim()
  if (!secret) return null
  const itemIds = (env.PLUGGY_ITEM_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return { secret, itemIds }
}

interface PluggyEvent {
  event?: string
  eventId?: string
  itemId?: string
  error?: { code?: string }
}

/** Compares secrets in constant time (hashing first makes the lengths equal). */
function sameSecret(given: string | null, expected: string): boolean {
  if (!given) return false
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
}

export type Log = (message: string, details: Record<string, string | undefined>) => void
const defaultLog: Log = (message, details) => console.info(`[pluggy webhook] ${message}`, details)

export async function pluggyWebhook(request: Request, config: WebhookConfig | null, log: Log = defaultLog): Promise<Response> {
  if (!config) return json(503, { error: 'not_configured' })
  if (!sameSecret(request.headers.get(WEBHOOK_SECRET_HEADER), config.secret)) return json(401, { error: 'unauthorized' })

  let event: PluggyEvent
  try {
    event = (await request.json()) as PluggyEvent
  } catch {
    return json(400, { error: 'bad_request' })
  }
  const ids = { event: event.event, eventId: event.eventId, itemId: event.itemId }

  // Events for connections Trove doesn't read are acknowledged (so Pluggy doesn't retry) but ignored.
  if (event.itemId && config.itemIds.length > 0 && !config.itemIds.includes(event.itemId)) {
    log('ignored: item not in PLUGGY_ITEM_IDS', ids)
    return json(200, { received: true })
  }

  switch (event.event) {
    case 'item/created':
      log('new connection; add its itemId to PLUGGY_ITEM_IDS if Trove should read it', ids)
      break
    case 'item/updated':
    case 'transactions/created':
    case 'transactions/updated':
    case 'transactions/deleted':
      clearFinanceCache()
      log('data changed; cache cleared', ids)
      break
    case 'item/error':
      // Only the code: the message may contain details from the bank.
      log('connection error', { ...ids, code: event.error?.code })
      break
    default:
      log('received', ids)
  }

  return json(200, { received: true })
}
