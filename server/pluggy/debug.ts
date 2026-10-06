// GET /api/debug/pluggy: Pluggy's raw responses for the debug screen.
//
// Behind the login like every other route. Read-only, and limited to:
//   (no endpoint)                         -> { itemIds } configured in PLUGGY_ITEM_IDS
//   endpoint=item&itemId=                 -> GET /items/{id}
//   endpoint=accounts&itemId=             -> GET /accounts?itemId=
//   endpoint=transactions&itemId=&accountId=[&after=]  -> GET /v2/transactions (one page)
//   endpoint=bills&itemId=&accountId=     -> GET /bills?accountId=
// Only the configured items, and only accounts that belong to them. This is
// the one place that returns amounts and descriptions (to a logged-in user
// only): responses are no-store, never cached on the server and never logged.

import { PluggyClient, PluggyError, type PluggyConfig } from './client.js'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' },
  })
}

const ENDPOINTS = ['item', 'accounts', 'transactions', 'bills'] as const
type Endpoint = (typeof ENDPOINTS)[number]

export async function pluggyDebug(request: Request, config: PluggyConfig | null, fetchFn: typeof fetch = fetch): Promise<Response> {
  if (!config) return json(503, { error: 'not_configured' })
  const params = new URL(request.url).searchParams
  const endpoint = params.get('endpoint')
  if (!endpoint) return json(200, { itemIds: config.itemIds })
  if (!ENDPOINTS.includes(endpoint as Endpoint)) return json(400, { error: 'unknown_endpoint' })

  const itemId = params.get('itemId') ?? ''
  if (!config.itemIds.includes(itemId)) return json(403, { error: 'item_not_configured' })
  const accountId = params.get('accountId') ?? ''
  const after = params.get('after') ?? undefined
  const client = new PluggyClient(config, fetchFn)

  try {
    if (endpoint === 'item') return reply(`GET /items/${itemId}`, await client.raw(`items/${encodeURIComponent(itemId)}`))
    if (endpoint === 'accounts') return reply(`GET /accounts?itemId=${itemId}`, await client.raw('accounts', { itemId, pageSize: '500' }))

    // Transactions and bills: only for an account of this item.
    const accounts = await client.raw('accounts', { itemId, pageSize: '500' })
    const ids = ((accounts.body as { results?: { id?: string }[] })?.results ?? []).map((a) => a.id)
    if (!accountId || !ids.includes(accountId)) return json(403, { error: 'account_not_in_item' })
    if (endpoint === 'transactions') {
      return reply(`GET /v2/transactions?accountId=${accountId}${after ? '&after=…' : ''}`, await client.raw('v2/transactions', { accountId, after }))
    }
    return reply(`GET /bills?accountId=${accountId}`, await client.raw('bills', { accountId }))
  } catch (e) {
    // Credentials never appear in these messages (see client.ts).
    const message = e instanceof PluggyError || e instanceof Error ? e.message : 'Unknown error'
    return json(502, { error: 'upstream', message })
  }
}

function reply(request: string, res: { status: number; body: unknown }): Response {
  return json(200, { request, status: res.status, body: res.body })
}
