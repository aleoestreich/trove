// Minimal Pluggy API client (fetch-based). Endpoints and auth match the
// official SDK: POST /auth -> apiKey, then `X-API-KEY` on every request.

import type { CursorPageResponse, PageResponse, PluggyAccount, PluggyBill, PluggyConnectorInfo, PluggyItem, PluggyTransaction } from './types.js'

/** API credentials (server-side only, from Vercel environment variables). */
export interface PluggyCredentials {
  clientId: string
  clientSecret: string
  baseUrl: string
}

export interface PluggyConfig extends PluggyCredentials {
  /** Item IDs to read (the Meu Pluggy connection). */
  itemIds: string[]
}

type Env = Record<string, string | undefined>

/** Credentials only (enough to create a Connect token). Null when missing, so callers fail closed. */
export function readPluggyCredentials(env: Env): PluggyCredentials | null {
  const clientId = env.PLUGGY_CLIENT_ID?.trim()
  const clientSecret = env.PLUGGY_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret, baseUrl: 'https://api.pluggy.ai' }
}

/** Credentials plus the items to read. Null when anything is missing, so the endpoint fails closed. */
export function readPluggyConfig(env: Env): PluggyConfig | null {
  const credentials = readPluggyCredentials(env)
  const itemIds = (env.PLUGGY_ITEM_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!credentials || itemIds.length === 0) return null
  return { ...credentials, itemIds }
}

export class PluggyError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

/** Safety limit for cursor paging (500 transactions per page). */
const MAX_PAGES = 40

export class PluggyClient {
  private apiKey: { value: string; expiresAt: number } | null = null

  constructor(
    private readonly config: PluggyCredentials,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async key(): Promise<string> {
    if (this.apiKey && Date.now() < this.apiKey.expiresAt) return this.apiKey.value
    const res = await this.fetchFn(`${this.config.baseUrl}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: this.config.clientId, clientSecret: this.config.clientSecret, nonExpiring: false }),
    })
    if (!res.ok) throw new PluggyError(res.status, `Pluggy refused the credentials (HTTP ${res.status}).`)
    const { apiKey } = (await res.json()) as { apiKey?: string }
    if (!apiKey) throw new PluggyError(502, 'Pluggy did not return an API key.')
    // Pluggy API keys last 2 hours; refresh a little earlier.
    this.apiKey = { value: apiKey, expiresAt: Date.now() + 100 * 60 * 1000 }
    return apiKey
  }

  private async get<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T> {
    const url = new URL(`${this.config.baseUrl}/${path}`)
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v)
    const res = await this.fetchFn(url, { headers: { 'X-API-KEY': await this.key(), Accept: 'application/json' } })
    if (!res.ok) throw new PluggyError(res.status, `Pluggy request failed: GET /${path} (HTTP ${res.status}).`)
    return (await res.json()) as T
  }


  /**
   * Short-lived token that lets the browser open Pluggy Connect without ever
   * seeing the Client ID or Secret (POST /connect_token, as in the SDK).
   */
  async createConnectToken(options: { clientUserId?: string } = {}): Promise<string> {
    const res = await this.fetchFn(`${this.config.baseUrl}/connect_token`, {
      method: 'POST',
      headers: { 'X-API-KEY': await this.key(), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ options }),
    })
    if (!res.ok) throw new PluggyError(res.status, `Pluggy request failed: POST /connect_token (HTTP ${res.status}).`)
    const { accessToken } = (await res.json()) as { accessToken?: string }
    if (!accessToken) throw new PluggyError(502, 'Pluggy did not return a Connect token.')
    return accessToken
  }

  /** Connectors whose name matches `name` (GET /connectors?name=, as in the SDK). */
  async findConnectors(name: string): Promise<PluggyConnectorInfo[]> {
    const page = await this.get<PageResponse<PluggyConnectorInfo>>('connectors', { name })
    return page.results
  }

  getItem(id: string): Promise<PluggyItem> {
    return this.get<PluggyItem>(`items/${encodeURIComponent(id)}`)
  }

  async getAccounts(itemId: string): Promise<PluggyAccount[]> {
    const page = await this.get<PageResponse<PluggyAccount>>('accounts', { itemId, pageSize: '500' })
    return page.results
  }

  /** A credit card account's closed bills (GET /bills?accountId=). */
  async getBills(accountId: string): Promise<PluggyBill[]> {
    const page = await this.get<PageResponse<PluggyBill>>('bills', { accountId, pageSize: '500' })
    return page.results
  }

  /** All transactions of an account since `dateFrom` (YYYY-MM-DD), following the cursor. */
  async getTransactions(accountId: string, dateFrom: string): Promise<PluggyTransaction[]> {
    const all: PluggyTransaction[] = []
    let after: string | undefined
    for (let i = 0; i < MAX_PAGES; i++) {
      const page = await this.get<CursorPageResponse<PluggyTransaction>>('v2/transactions', { accountId, dateFrom, after })
      all.push(...page.results)
      if (!page.next) return all
      after = new URL(page.next, this.config.baseUrl).searchParams.get('after') ?? undefined
      if (!after) return all
    }
    throw new PluggyError(502, `Too many transaction pages for one account (over ${MAX_PAGES * 500}).`)
  }
}
