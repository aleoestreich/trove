// TEMPORARY. GET /api/debug/pluggy: Pluggy's raw responses for the debug
// screen (#/debug), an exception to "only Sync reaches Pluggy" while it
// exists. Served by api/sync.ts (vercel.json rewrite), so it adds no
// Vercel Function. Remove it (and its allowance in onlySync.test.ts) when
// it's no longer needed.
//
// Behind the login like every other route. Read-only, and limited to:
//   (no endpoint)                         -> { itemIds } configured in PLUGGY_ITEM_IDS
//   endpoint=item&itemId=                 -> GET /items/{id}
//   endpoint=accounts&itemId=             -> GET /accounts?itemId=
//   endpoint=transactions&itemId=&accountId=[&after=][&dateFrom=]  -> GET /v2/transactions (one page)
//   endpoint=transactionsV1&itemId=&accountId=[&page=][&dateFrom=]  -> GET /transactions (one page; the older
//                                         endpoint, to compare a card's list)
// Transactions are read from `dateFrom` (default ALL_HISTORY): without one,
// Pluggy applies its own default window, which can leave a card's list short.
//   endpoint=bills&itemId=&accountId=     -> GET /bills?accountId=
//   endpoint=identity&itemId=             -> GET /identity?itemId=
//   endpoint=investments&itemId=          -> GET /investments?itemId=
//   endpoint=investmentTransactions&itemId=&investmentId=[&page=]  -> GET /investments/{id}/transactions
//   endpoint=loans&itemId=                -> GET /loans?itemId=
// (A product the bank doesn't share answers with Pluggy's own error status.)
// Only the configured items, and only accounts that belong to them. This is
// the one place that returns amounts and descriptions (to the signed-in
// user only): responses are no-store, never cached on the server and never
// logged. Nothing is stored.

import { ALL_HISTORY } from '../../src/data/syncPeriod.js'
import { PluggyClient, PluggyError, type PluggyConfig } from './client.js'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' },
  })
}

const ENDPOINTS = ['item', 'accounts', 'transactions', 'transactionsV1', 'bills', 'identity', 'investments', 'investmentTransactions', 'loans'] as const
const DAY = /^\d{4}-\d{2}-\d{2}$/
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
    if (endpoint === 'identity') return reply(`GET /identity?itemId=${itemId}`, await client.raw('identity', { itemId }))
    if (endpoint === 'investments') return reply(`GET /investments?itemId=${itemId}`, await client.raw('investments', { itemId, pageSize: '500' }))
    if (endpoint === 'loans') return reply(`GET /loans?itemId=${itemId}`, await client.raw('loans', { itemId, pageSize: '500' }))
    if (endpoint === 'investmentTransactions') {
      // Only for an investment of this item.
      const investmentId = params.get('investmentId') ?? ''
      const investments = await client.raw('investments', { itemId, pageSize: '500' })
      const ids = ((investments.body as { results?: { id?: string }[] })?.results ?? []).map((x) => x.id)
      if (!investmentId || !ids.includes(investmentId)) return json(403, { error: 'investment_not_in_item' })
      const page = params.get('page') ?? undefined
      return reply(
        `GET /investments/${investmentId}/transactions${page ? `?page=${page}` : ''}`,
        await client.raw(`investments/${encodeURIComponent(investmentId)}/transactions`, { pageSize: '500', page }),
      )
    }

    // Transactions and bills: only for an account of this item.
    const accounts = await client.raw('accounts', { itemId, pageSize: '500' })
    const ids = ((accounts.body as { results?: { id?: string }[] })?.results ?? []).map((a) => a.id)
    if (!accountId || !ids.includes(accountId)) return json(403, { error: 'account_not_in_item' })
    const dateFrom = params.get('dateFrom') ?? ALL_HISTORY
    if (!DAY.test(dateFrom)) return json(400, { error: 'invalid_date' })
    if (endpoint === 'transactions') {
      return reply(
        `GET /v2/transactions?accountId=${accountId}&dateFrom=${dateFrom}${after ? '&after=…' : ''}`,
        await client.raw('v2/transactions', { accountId, dateFrom, after }),
      )
    }
    if (endpoint === 'transactionsV1') {
      const page = params.get('page') ?? undefined
      return reply(
        `GET /transactions?accountId=${accountId}&from=${dateFrom}${page ? `&page=${page}` : ''}`,
        await client.raw('transactions', { accountId, from: dateFrom, pageSize: '500', page }),
      )
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
