// GET /api/finance: the owner's data from Pluggy, in Trove's model.
// Protected by the login middleware like every other route.
//
// Responses:
//   200 Snapshot (JSON)
//   503 { error: 'not_configured' }   Pluggy settings missing -> app shows demo data
//   502 { error: 'upstream', message } Pluggy or the exchange-rate service failed
//
// GET /api/finance?summary returns a diagnostic report instead (connections,
// account types and currencies, Pluggy categories and how they were mapped),
// with no amounts or descriptions, to check the mapping against real data.

import { MONTHS_OF_HISTORY } from '../../src/data/types.js'
import { PluggyClient, PluggyError, type PluggyConfig } from './client.js'
import { categoryFor, isEmptyBankAccount, isMeuPluggy, itemBankName, toSnapshot } from './map.js'
import type { PluggyAccount, PluggyItem, PluggyTransaction } from './types.js'
import { ratesToBRL } from './rates.js'

export interface FinanceDeps {
  fetch: typeof fetch
  now: () => Date
}

/** Short cache per server instance so tab changes and reloads don't hit Pluggy each time. */
const CACHE_MS = 5 * 60 * 1000
let cache: { at: number; body: string } | null = null
const clients = new Map<string, PluggyClient>()

export function clearFinanceCache() {
  cache = null
  clients.clear()
}

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', ...extra },
  })
}

/** First day of the oldest month the app shows, as YYYY-MM-DD. */
export function historyStart(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth() - (MONTHS_OF_HISTORY - 1), 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export async function finance(request: Request, config: PluggyConfig | null, deps: Partial<FinanceDeps> = {}): Promise<Response> {
  if (!config) return json(503, { error: 'not_configured' })
  const fetchFn = deps.fetch ?? fetch
  const now = deps.now?.() ?? new Date()
  const params = new URL(request.url).searchParams
  const summary = params.has('summary')
  if (!summary && !params.has('refresh') && cache && Date.now() - cache.at < CACHE_MS) return json(200, cache.body)

  const key = `${config.clientId}|${config.itemIds.join(',')}`
  let client = clients.get(key)
  if (!client || deps.fetch) {
    client = new PluggyClient(config, fetchFn)
    if (!deps.fetch) clients.set(key, client)
  }

  try {
    const items = await Promise.all(config.itemIds.map((id) => client.getItem(id)))
    const accounts = (await Promise.all(items.map((i) => client.getAccounts(i.id)))).flat()
    const from = historyStart(now)
    const transactions = (await Promise.all(accounts.map((a) => client.getTransactions(a.id, from)))).flat()
    if (summary) return json(200, summarize(items, accounts, transactions))
    // Rates only for what's shown: empty, hidden balances (e.g. a Wise EUR
    // account at zero) don't need one, so they can't fail the load.
    const withTransactions = new Set(transactions.map((t) => t.accountId))
    const shown = accounts.filter((a) => !isEmptyBankAccount(a, withTransactions))
    const currencies = [...shown.map((a) => a.currencyCode), ...transactions.map((t) => t.currencyCode)].filter(Boolean)
    const rates = await ratesToBRL(currencies, fetchFn)
    const body = JSON.stringify(toSnapshot({ items, accounts, transactions, rates, fetchedAt: now.toISOString() }))
    cache = { at: Date.now(), body }
    return json(200, body)
  } catch (e) {
    // Messages never include credentials (see client.ts).
    const message = e instanceof PluggyError || e instanceof Error ? e.message : 'Unknown error'
    return json(502, { error: 'upstream', message })
  }
}

/** Diagnostic report without amounts or descriptions. */
export function summarize(items: PluggyItem[], accounts: PluggyAccount[], transactions: PluggyTransaction[]) {
  const categories = new Map<string, { pluggyCategory: string; type: string; count: number; mappedTo: string }>()
  for (const t of transactions) {
    const name = t.category ?? '(none)'
    const key = `${name}|${t.type}`
    const entry = categories.get(key) ?? { pluggyCategory: name, type: t.type, count: 0, mappedTo: categoryFor(t) }
    entry.count++
    categories.set(key, entry)
  }
  const withTransactions = new Set(transactions.map((t) => t.accountId))
  return {
    items: items.map((i) => ({ connector: i.connector.name, status: i.status, lastUpdatedAt: i.lastUpdatedAt ?? null })),
    accounts: accounts.map((a) => ({
      name: a.name,
      marketingName: a.marketingName ?? null,
      // The bank Trove names this account's item after (Meu Pluggy items only).
      bank: items.some((i) => i.id === a.itemId && isMeuPluggy(i)) ? itemBankName(accounts.filter((x) => x.itemId === a.itemId)) : null,
      type: a.type,
      subtype: a.subtype,
      currencyCode: a.currencyCode,
      transactions: transactions.filter((t) => t.accountId === a.id).length,
      transactionCurrencies: [...new Set(transactions.filter((t) => t.accountId === a.id).map((t) => t.currencyCode))],
      hasCreditData: Boolean(a.creditData),
      // Left out of the app: a bank account at zero with no transactions.
      hiddenAsEmpty: isEmptyBankAccount(a, withTransactions),
    })),
    installments: transactions.filter((t) => (t.creditCardMetadata?.totalInstallments ?? 0) > 1).length,
    pending: transactions.filter((t) => t.status === 'PENDING').length,
    categories: [...categories.values()].sort((a, b) => b.count - a.count),
  }
}
