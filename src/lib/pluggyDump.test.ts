import { describe, expect, it } from 'vitest'
import { loadEverything, type Answer } from './pluggyDump'

/** Fake debug route: two accounts (one card), two transaction pages, one investment with two pages, loans not shared. */
function fakeRoute() {
  const calls: string[] = []
  const call = async (p: Record<string, string | undefined>): Promise<Answer> => {
    const key = [p.endpoint, p.accountId, p.after, p.investmentId, p.page].filter(Boolean).join(' ')
    calls.push(key)
    const ok = (body: unknown): Answer => ({ request: `GET ${p.endpoint}`, status: 200, body })
    switch (p.endpoint) {
      case 'item':
        return ok({ id: 'item-1' })
      case 'accounts':
        return ok({ results: [{ id: 'acc-1', type: 'BANK' }, { id: 'card-1', type: 'CREDIT' }] })
      case 'transactions':
        return p.accountId === 'acc-1' && !p.after
          ? ok({ results: [{ id: 't1' }], next: '/v2/transactions?accountId=acc-1&after=cur2' })
          : ok({ results: [{ id: `t-${p.accountId}-${p.after ?? 1}` }], next: null })
      case 'bills':
        return ok({ results: [{ id: 'bill-1' }] })
      case 'identity':
        return ok({ id: 'identity-1' })
      case 'investments':
        return ok({ results: [{ id: 'inv-1' }] })
      case 'investmentTransactions':
        return ok({ results: [{ id: `itx-${p.page}` }], page: Number(p.page), totalPages: 2 })
      default:
        return { request: `GET ${p.endpoint}`, status: 400, body: { message: 'not shared' } }
    }
  }
  return { calls, call }
}

describe('debug: everything for a bank', () => {
  it('reads every endpoint and every page, and keeps an unshared product’s error', async () => {
    const { calls, call } = fakeRoute()
    let counted = 0
    const dump = await loadEverything('item-1', call, () => counted++, new Date('2026-10-09T12:00:00Z'))
    expect(calls).toEqual([
      'item',
      'accounts',
      'transactions acc-1',
      'transactions acc-1 cur2',
      'transactions card-1',
      'bills card-1',
      'identity',
      'investments',
      'investmentTransactions inv-1 1',
      'investmentTransactions inv-1 2',
      'loans',
    ])
    expect(counted).toBe(calls.length)
    expect(dump.transactions['acc-1']).toHaveLength(2)
    expect(Object.keys(dump.bills)).toEqual(['card-1'])
    expect(dump.investmentTransactions['inv-1']).toHaveLength(2)
    expect(dump.loans.status).toBe(400)
    expect(dump.fetchedAt).toBe('2026-10-09T12:00:00.000Z')
  })
})
