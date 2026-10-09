// TEMPORARY (debug screen): everything Meu Pluggy returns for one bank
// connection, through GET /api/debug/pluggy one call at a time: the item,
// its accounts, every page of each account's transactions, each card's
// bills, identity, investments with every page of their movements, and
// loans. A product the bank doesn't share keeps Pluggy's error as returned.

/** One call's answer, as the debug route gives it. */
export interface Answer {
  /** The call to Pluggy ("GET /accounts?itemId=…"), or null when the route itself refused. */
  request: string | null
  /** Pluggy's HTTP status (or the route's, when it refused). */
  status: number
  body: unknown
}

export interface Dump {
  itemId: string
  fetchedAt: string
  item: Answer
  accounts: Answer
  /** Per account ID: every page, in order. */
  transactions: Record<string, Answer[]>
  /** Per credit card account ID. */
  bills: Record<string, Answer>
  identity: Answer
  investments: Answer
  /** Per investment ID: every page, in order. */
  investmentTransactions: Record<string, Answer[]>
  loans: Answer
}

export type Call = (params: Record<string, string | undefined>) => Promise<Answer>

/** Safety limit on pages per account or investment (500 rows per page). */
const MAX_PAGES = 40

const results = (a: Answer) => ((a.body as { results?: unknown } | null)?.results as Record<string, unknown>[] | undefined) ?? []

/** The `after` cursor from a v2 transactions page's `next` link. */
export function nextCursor(body: unknown): string | undefined {
  const next = (body as { next?: unknown } | null)?.next
  if (typeof next !== 'string' || !next) return undefined
  return new URL(next, 'https://api.pluggy.ai').searchParams.get('after') ?? undefined
}

/** Everything for one item; `onCall` counts the calls made, for progress. */
export async function loadEverything(itemId: string, call: Call, onCall: () => void = () => {}, now = new Date()): Promise<Dump> {
  const get = async (params: Record<string, string | undefined>) => {
    const a = await call({ itemId, ...params })
    onCall()
    return a
  }
  const item = await get({ endpoint: 'item' })
  const accounts = await get({ endpoint: 'accounts' })
  const transactions: Dump['transactions'] = {}
  const bills: Dump['bills'] = {}
  for (const account of results(accounts)) {
    const accountId = String(account.id)
    const pages: Answer[] = []
    let after: string | undefined
    for (let i = 0; i < MAX_PAGES; i++) {
      const page = await get({ endpoint: 'transactions', accountId, after })
      pages.push(page)
      after = page.status === 200 ? nextCursor(page.body) : undefined
      if (!after) break
    }
    transactions[accountId] = pages
    if (account.type === 'CREDIT') bills[accountId] = await get({ endpoint: 'bills', accountId })
  }
  const identity = await get({ endpoint: 'identity' })
  const investments = await get({ endpoint: 'investments' })
  const investmentTransactions: Dump['investmentTransactions'] = {}
  for (const investment of results(investments)) {
    const investmentId = String(investment.id)
    const pages: Answer[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const a = await get({ endpoint: 'investmentTransactions', investmentId, page: String(page) })
      pages.push(a)
      const total = (a.body as { totalPages?: unknown } | null)?.totalPages
      if (a.status !== 200 || typeof total !== 'number' || page >= total) break
    }
    investmentTransactions[investmentId] = pages
  }
  const loans = await get({ endpoint: 'loans' })
  return { itemId, fetchedAt: now.toISOString(), item, accounts, transactions, bills, identity, investments, investmentTransactions, loans }
}
