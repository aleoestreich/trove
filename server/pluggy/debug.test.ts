import { describe, expect, it } from 'vitest'
import type { PluggyConfig } from './client.js'
import { pluggyDebug } from './debug.js'

const config: PluggyConfig = { clientId: 'cid', clientSecret: 'super-secret', itemIds: ['item-1'], baseUrl: 'https://api.pluggy.ai' }

/** Fake Pluggy: records the paths it was asked for. */
function fakePluggy() {
  const calls: string[] = []
  const fetchFn = (async (input: string | URL) => {
    const url = new URL(String(input))
    calls.push(`${url.pathname}${url.search}`)
    if (url.pathname === '/auth') return Response.json({ apiKey: 'key' })
    if (url.pathname === '/accounts') return Response.json({ results: [{ id: 'acc-1', type: 'CREDIT' }] })
    if (url.pathname === '/items/item-1') return Response.json({ id: 'item-1', status: 'UPDATED' })
    if (url.pathname === '/v2/transactions') return Response.json({ results: [{ id: 'tx-1', amount: 150, description: 'LOJA EXEMPLO' }], next: null })
    if (url.pathname === '/bills') return Response.json({ results: [] })
    if (url.pathname === '/identity') return Response.json({ id: 'id-1', fullName: 'PESSOA EXEMPLO' })
    if (url.pathname === '/investments') return Response.json({ results: [{ id: 'inv-1', type: 'FIXED_INCOME' }] })
    if (url.pathname === '/investments/inv-1/transactions') return Response.json({ results: [{ id: 'itx-1' }], page: 1, totalPages: 1 })
    if (url.pathname === '/loans') return new Response('{"message":"product not available"}', { status: 400 })
    return new Response('{"message":"not found"}', { status: 404 })
  }) as typeof fetch
  return { calls, fetchFn }
}

const get = (qs = '') => new Request(`https://trove.example/api/debug/pluggy${qs}`)

describe('pluggy debug route', () => {
  it('refuses when Pluggy is not configured', async () => {
    expect((await pluggyDebug(get(), null)).status).toBe(503)
  })

  it('lists the configured items without calling Pluggy', async () => {
    const { calls, fetchFn } = fakePluggy()
    const res = await pluggyDebug(get(), config, fetchFn)
    expect(await res.json()).toEqual({ itemIds: ['item-1'] })
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(calls).toEqual([])
  })

  it('returns Pluggy’s raw answer for a configured item', async () => {
    const { fetchFn } = fakePluggy()
    const res = await pluggyDebug(get('?endpoint=item&itemId=item-1'), config, fetchFn)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ request: 'GET /items/item-1', status: 200, body: { id: 'item-1', status: 'UPDATED' } })
  })

  it('refuses items that are not configured and unknown endpoints', async () => {
    const { calls, fetchFn } = fakePluggy()
    expect((await pluggyDebug(get('?endpoint=item&itemId=other'), config, fetchFn)).status).toBe(403)
    expect((await pluggyDebug(get('?endpoint=connectors&itemId=item-1'), config, fetchFn)).status).toBe(400)
    expect(calls).toEqual([])
  })

  it('only reads transactions and bills of accounts that belong to the item', async () => {
    const { calls, fetchFn } = fakePluggy()
    expect((await pluggyDebug(get('?endpoint=transactions&itemId=item-1&accountId=acc-other'), config, fetchFn)).status).toBe(403)
    expect(calls.some((c) => c.startsWith('/v2/transactions'))).toBe(false)

    const res = await pluggyDebug(get('?endpoint=transactions&itemId=item-1&accountId=acc-1&after=abc'), config, fetchFn)
    expect(res.status).toBe(200)
    expect(calls).toContain('/v2/transactions?accountId=acc-1&after=abc')

    expect((await pluggyDebug(get('?endpoint=bills&itemId=item-1&accountId=acc-1'), config, fetchFn)).status).toBe(200)
    expect(calls).toContain('/bills?accountId=acc-1')
  })

  it('passes Pluggy errors through with their status, without the credentials', async () => {
    const fetchFn = (async (input: string | URL) =>
      new URL(String(input)).pathname === '/auth' ? Response.json({ apiKey: 'key' }) : new Response('{"message":"gone"}', { status: 404 })) as typeof fetch
    const res = await pluggyDebug(get('?endpoint=item&itemId=item-1'), config, fetchFn)
    const text = await res.text()
    expect(JSON.parse(text)).toMatchObject({ status: 404, body: { message: 'gone' } })
    expect(text).not.toContain('super-secret')
  })
})

describe('pluggy debug route: the other products', () => {
  it('returns identity, investments and loans for a configured item, Pluggy’s error status included', async () => {
    const { fetchFn } = fakePluggy()
    expect(await (await pluggyDebug(get('?endpoint=identity&itemId=item-1'), config, fetchFn)).json()).toMatchObject({ request: 'GET /identity?itemId=item-1', status: 200 })
    expect(await (await pluggyDebug(get('?endpoint=investments&itemId=item-1'), config, fetchFn)).json()).toMatchObject({ status: 200 })
    // A product the bank doesn't share: Pluggy's own status, shown as is.
    expect(await (await pluggyDebug(get('?endpoint=loans&itemId=item-1'), config, fetchFn)).json()).toMatchObject({ status: 400 })
    expect((await pluggyDebug(get('?endpoint=identity&itemId=other'), config, fetchFn)).status).toBe(403)
  })

  it('only reads transactions of an investment that belongs to the item', async () => {
    const { calls, fetchFn } = fakePluggy()
    expect((await pluggyDebug(get('?endpoint=investmentTransactions&itemId=item-1&investmentId=inv-other'), config, fetchFn)).status).toBe(403)
    expect(calls.some((c) => c.startsWith('/investments/inv-other'))).toBe(false)
    const res = await pluggyDebug(get('?endpoint=investmentTransactions&itemId=item-1&investmentId=inv-1&page=2'), config, fetchFn)
    expect(await res.json()).toMatchObject({ request: 'GET /investments/inv-1/transactions?page=2', status: 200 })
    expect(calls).toContain('/investments/inv-1/transactions?pageSize=500&page=2')
  })
})

describe('debug route through api/sync.ts', () => {
  it('serves /api/debug/pluggy (view=debug) from the sync function, failing closed without settings', async () => {
    const { GET } = await import('../../api/sync.js')
    const res = await GET(new Request('https://trove.example/api/sync?view=debug'))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'not_configured' })
  })
})
