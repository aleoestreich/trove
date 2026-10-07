import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PluggyClient, PluggyError, readPluggyConfig, readPluggyCredentials, type PluggyConfig } from './client.js'
import { connectToken } from './connectToken.js'
import { pluggyWebhook, readWebhookConfig, WEBHOOK_SECRET_HEADER } from './webhook.js'
import { bankOf, brazilDate, categoryFor, itemBankName, toSnapshot, type PluggyData } from './map.js'
import { clearRateCache, ratesToBRL } from './rates.js'
import { clearFinanceCache, finance, historyStart } from './finance.js'
import type { PluggyAccount, PluggyItem, PluggyTransaction } from './types.js'
import { defaultCategories } from '../../src/data/edits.js'
import { incomeAverage, NO_FILTER } from '../../src/data/incomeAverage.js'
import type { Transaction } from '../../src/data/types.js'

const config: PluggyConfig = { clientId: 'cid', clientSecret: 'super-secret', itemIds: ['item-1'], baseUrl: 'https://api.pluggy.ai' }
const categoriesById = new Map(defaultCategories((c, i) => `${c}-${i}`).categories.map((c) => [c.id, c]))

/** Income and expenses the way the app counts them (src/lib/summary.ts): transfers excluded, uncategorized by sign. */
function totals(txs: Transaction[]) {
  let income = 0
  let expenses = 0
  for (const t of txs) {
    if (t.transfer || t.hidden) continue
    const type = (t.categoryId && categoriesById.get(t.categoryId)?.type) || (t.amount > 0 ? 'income' : 'expense')
    if (type === 'income') income += t.amount
    else expenses -= t.amount
  }
  return { income, expenses, net: income - expenses }
}

const item: PluggyItem = { id: 'item-1', connector: { id: 1, name: 'Nubank', primaryColor: '8a05be' }, status: 'UPDATED' }
const checking: PluggyAccount = { id: 'acc-chk', itemId: 'item-1', type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: 'Conta', balance: 1234.56, currencyCode: 'BRL' }
const card: PluggyAccount = {
  id: 'acc-card', itemId: 'item-1', type: 'CREDIT', subtype: 'CREDIT_CARD', name: 'Cartão', marketingName: 'Nubank Ultravioleta',
  balance: 850.1, currencyCode: 'BRL',
  creditData: { creditLimit: 5000, availableCreditLimit: 3000, balanceCloseDate: '2026-10-02T03:00:00.000Z', balanceDueDate: '2026-10-09T03:00:00.000Z' },
}
const usd: PluggyAccount = { id: 'acc-usd', itemId: 'item-1', type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: 'Wise USD', balance: 100, currencyCode: 'USD' }

const tx = (over: Partial<PluggyTransaction>): PluggyTransaction => ({
  id: Math.random().toString(36).slice(2),
  accountId: 'acc-chk',
  date: '2026-09-15T15:00:00.000Z',
  description: 'x',
  type: 'DEBIT',
  amount: 10,
  currencyCode: 'BRL',
  category: null,
  ...over,
})

const data = (transactions: PluggyTransaction[], accounts = [checking, card, usd]): PluggyData => ({
  items: [item],
  accounts,
  transactions,
  rates: { USD: 5.5 },
  fetchedAt: '2026-09-29T12:00:00.000Z',
})

// ---------------------------------------------------------------------------

describe('config', () => {
  it('needs client ID, secret and at least one item (fails closed)', () => {
    const env = { PLUGGY_CLIENT_ID: 'a', PLUGGY_CLIENT_SECRET: 'b', PLUGGY_ITEM_IDS: ' i1, i2 ,' }
    expect(readPluggyConfig(env)?.itemIds).toEqual(['i1', 'i2'])
    for (const k of Object.keys(env)) expect(readPluggyConfig({ ...env, [k]: '' }), k).toBeNull()
  })
})

describe('client', () => {
  it('authenticates once, sends X-API-KEY, and follows the transaction cursor', async () => {
    const calls: string[] = []
    const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      calls.push(`${init?.method ?? 'GET'} ${url.pathname}${url.search}`)
      if (url.pathname === '/auth') {
        expect(JSON.parse(String(init?.body))).toMatchObject({ clientId: 'cid', clientSecret: 'super-secret' })
        return Response.json({ apiKey: 'KEY' })
      }
      expect(new Headers(init?.headers).get('X-API-KEY')).toBe('KEY')
      if (url.pathname === '/v2/transactions') {
        return url.searchParams.get('after')
          ? Response.json({ results: [tx({ id: 't2' })], next: null })
          : Response.json({ results: [tx({ id: 't1' })], next: '/v2/transactions?accountId=a&after=CUR' })
      }
      return Response.json({ results: [checking], page: 1, total: 1, totalPages: 1 })
    })
    const client = new PluggyClient(config, fetchFn as typeof fetch)
    expect((await client.getTransactions('a', '2026-04-01')).map((t) => t.id)).toEqual(['t1', 't2'])
    await client.getAccounts('item-1')
    expect(calls.filter((c) => c.startsWith('POST /auth'))).toHaveLength(1)
    expect(calls).toContain('GET /v2/transactions?accountId=a&dateFrom=2026-04-01&after=CUR')
  })

  it('reports errors without leaking the secret', async () => {
    const client = new PluggyClient(config, (async () => new Response('nope', { status: 401 })) as typeof fetch)
    const err = await client.getItem('x').catch((e) => e)
    expect(err).toBeInstanceOf(PluggyError)
    expect(err.message).not.toContain('super-secret')
  })
})

describe('exchange rates', () => {
  beforeEach(() => clearRateCache())

  it('fetches BRL rates for foreign currencies only', async () => {
    const fetchFn = vi.fn(async () => Response.json({ USDBRL: { bid: '5.4321' } }))
    expect(await ratesToBRL(['BRL', 'USD', 'usd'], fetchFn as typeof fetch)).toEqual({ USD: 5.4321 })
    expect(await ratesToBRL(['BRL'], fetchFn as typeof fetch)).toEqual({})
    expect(fetchFn).toHaveBeenCalledOnce()
  })

  it('fails loudly rather than guessing a rate', async () => {
    await expect(ratesToBRL(['USD'], (async () => Response.json({})) as typeof fetch)).rejects.toThrow(/USD/)
  })

  /** Each source answers with `status`, or its normal JSON when 200. */
  function sources(status: { awesome?: number; bcb?: number; er?: number }) {
    return vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('awesomeapi')) return status.awesome && status.awesome !== 200 ? new Response('slow down', { status: status.awesome }) : Response.json({ USDBRL: { bid: '5.40' } })
      if (url.includes('olinda.bcb.gov.br')) {
        if (status.bcb && status.bcb !== 200) return new Response('down', { status: status.bcb })
        return Response.json({
          value: [
            { cotacaoCompra: 5.3, dataHoraCotacao: '2026-09-29 13:00:00.000' },
            { cotacaoCompra: 5.35, dataHoraCotacao: '2026-09-30 13:00:00.000' },
          ],
        })
      }
      if (url.includes('open.er-api.com')) return status.er && status.er !== 200 ? new Response('down', { status: status.er }) : Response.json({ result: 'success', rates: { USD: 0.2 } })
      return new Response('not found', { status: 404 })
    })
  }
  const now = new Date('2026-10-01T15:00:00Z')

  it('falls back to Banco Central (latest PTAX in the last 10 days) when AwesomeAPI says 429', async () => {
    const fetchFn = sources({ awesome: 429 })
    expect(await ratesToBRL(['USD'], fetchFn as typeof fetch, now)).toEqual({ USD: 5.35 })
    const bcbUrl = String(fetchFn.mock.calls[1][0])
    expect(bcbUrl).toContain("@moeda='USD'")
    expect(bcbUrl).toContain("@dataInicial='09-21-2026'")
    expect(bcbUrl).toContain("@dataFinalCotacao='10-01-2026'")
  })

  it('then to ExchangeRate-API, inverting its per-BRL rate', async () => {
    const fetchFn = sources({ awesome: 429, bcb: 503 })
    expect(await ratesToBRL(['USD'], fetchFn as typeof fetch, now)).toEqual({ USD: 5 })
  })

  it('reuses the last good rate when every source fails', async () => {
    await ratesToBRL(['USD'], sources({}) as typeof fetch, now)
    const later = new Date(now.getTime() + 2 * 60 * 60 * 1000) // past the 1-hour cache
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await ratesToBRL(['USD'], sources({ awesome: 429, bcb: 500, er: 500 }) as typeof fetch, later)).toEqual({ USD: 5.4 })
  })

  it('names every failed source (status codes only) when there is no rate at all', async () => {
    await expect(ratesToBRL(['USD'], sources({ awesome: 429, bcb: 500, er: 502 }) as typeof fetch, now)).rejects.toThrow(
      'No exchange rate for USD (AwesomeAPI HTTP 429; Banco Central HTTP 500; ExchangeRate-API HTTP 502).',
    )
  })

  it('does not call the fallbacks when AwesomeAPI answers', async () => {
    const fetchFn = sources({})
    await ratesToBRL(['USD'], fetchFn as typeof fetch, now)
    expect(fetchFn).toHaveBeenCalledOnce()
  })
})

describe('Meu Pluggy: one group per item, named after its checking account', () => {
  const meuItem = (id: string): PluggyItem => ({ id, connector: { id: 200, name: 'MeuPluggy', primaryColor: null }, status: 'UPDATED' })
  const acc = (id: string, itemId: string, name: string, over: Partial<PluggyAccount> = {}): PluggyAccount => ({
    id, itemId, type: 'BANK', subtype: 'CHECKING_ACCOUNT', name, balance: 100, currencyCode: 'BRL', ...over,
  })
  const card = (id: string, itemId: string, name: string, over: Partial<PluggyAccount> = {}) =>
    acc(id, itemId, name, { type: 'CREDIT', subtype: 'CREDIT_CARD', creditData: { creditLimit: 1000 }, ...over })
  const snap = (items: PluggyItem[], accounts: PluggyAccount[], transactions: PluggyTransaction[] = []) =>
    toSnapshot({ items, accounts, transactions, rates: { USD: 5 }, fetchedAt: '2026-10-01T00:00:00Z' })

  it('keeps an item\'s checking account and card together, named after the checking account', () => {
    const s = snap(
      [meuItem('nu'), meuItem('itau')],
      [
        // The card comes first and its name doesn't say "Nubank": the checking account still names the group.
        card('nu-card', 'nu', 'Mastercard Platinum (Cartão de Crédito)'),
        acc('nu-chk', 'nu', 'Nu Pagamentos S.A. - Instituição de Pagamento (Conta Pré-paga)'),
        acc('itau-chk', 'itau', 'Itaú Unibanco S.A. (Conta Corrente)'),
        card('itau-card', 'itau', 'Itaú Unibanco S.A. (Cartão de Crédito)'),
      ],
    )
    expect(s.institutions.map((i) => [i.id, i.name])).toEqual([
      ['nu', 'Nubank'],
      ['itau', 'Itaú'],
    ])
    expect(s.accounts.filter((a) => a.institutionId === 'nu').map((a) => a.id)).toEqual(['nu-card', 'nu-chk'])
    expect(s.accounts.filter((a) => a.institutionId === 'itau').map((a) => a.id)).toEqual(['itau-chk', 'itau-card'])
  })

  it('falls back to a savings account, then a card, then the legal name', () => {
    expect(itemBankName([card('c', 'x', 'Banco Inter S.A. (Cartão)'), acc('p', 'x', 'Wise Brasil Ltda (Conta USD)', { subtype: 'SAVINGS_ACCOUNT' })])).toBe('Wise')
    expect(itemBankName([card('c', 'x', 'Banco Inter S.A. (Cartão)')])).toBe('Inter')
    expect(itemBankName([acc('o', 'x', 'Cooperativa Exemplo de Crédito Ltda. - Conta')])).toBe('Cooperativa Exemplo de Crédito')
  })

  it('shortens account names to the kind of account, or uses the marketing name', () => {
    const s = snap(
      [meuItem('nu')],
      [acc('a', 'nu', 'Nu Pagamentos S.A. - Instituição de Pagamento (Conta Pré-paga)'), card('b', 'nu', 'Cartão', { marketingName: 'Nubank Ultravioleta' })],
    )
    expect(s.accounts.map((a) => a.name)).toEqual(['Conta Pré-paga', 'Nubank Ultravioleta'])
    expect(bankOf({ name: 'Cartão', marketingName: 'Nubank Ultravioleta' })).toBe('Nubank')
  })

  it('still names the group from a hidden (empty) checking account, and drops items left with nothing', () => {
    const s = snap(
      [meuItem('nu'), meuItem('safra')],
      [
        acc('nu-empty', 'nu', 'Nu Pagamentos S.A. (Conta Pré-paga)', { balance: 0 }),
        card('nu-card', 'nu', 'Mastercard (Cartão de Crédito)', { balance: 120 }),
        acc('safra-empty', 'safra', 'Banco Safra S.A. (Conta Corrente)', { balance: 0 }),
      ],
    )
    expect(s.accounts.map((a) => a.id)).toEqual(['nu-card'])
    expect(s.institutions.map((i) => i.name)).toEqual(['Nubank'])
  })

  it('hides credit cards with no bill and none of the limit in use, unless they had transactions', () => {
    const unused = card('unused', 'nu', 'Nu Pagamentos S.A. (Cartão de Crédito)', { balance: 0, creditData: { creditLimit: 1000, availableCreditLimit: 1000 } })
    const noLimitInfo = card('no-info', 'nu', 'Cartão Extra', { balance: 0, creditData: null })
    const installments = card('instal', 'nu', 'Cartão Parcelado', { balance: 0, creditData: { creditLimit: 1000, availableCreditLimit: 700 } })
    const billed = card('billed', 'nu', 'Cartão Principal', { balance: 250.4, creditData: { creditLimit: 1000, availableCreditLimit: 749.6 } })
    const paidOff = card('paid', 'nu', 'Cartão Quitado', { balance: 0, creditData: { creditLimit: 1000, availableCreditLimit: 1000 } })
    const s = snap([meuItem('nu')], [unused, noLimitInfo, installments, billed, paidOff], [tx({ accountId: 'paid', amount: 80 })])
    // Kept: future installments use part of the limit; a bill; spending in the window.
    expect(s.accounts.map((a) => a.id)).toEqual(['instal', 'billed', 'paid'])
  })

  it('keeps a zero-balance bank account that had transactions', () => {
    const s = snap([meuItem('itau')], [acc('used', 'itau', 'Itaú Unibanco S.A. (Conta Poupança)', { balance: 0.004 })], [
      tx({ accountId: 'used', type: 'CREDIT', amount: 50 }),
    ])
    expect(s.accounts.map((a) => a.id)).toEqual(['used'])
  })

  it('names an item with an unnamed USD account "Wise"', () => {
    const s = snap(
      [meuItem('nu'), meuItem('wise')],
      [
        acc('nu-chk', 'nu', 'Nu Pagamentos S.A. - Instituição de Pagamento (Conta Pré-paga)'),
        acc('usd', 'wise', '', { currencyCode: 'USD' }),
      ],
    )
    expect(s.institutions.map((i) => [i.id, i.name])).toEqual([
      ['nu', 'Nubank'],
      ['wise', 'Wise'],
    ])
    const usd = s.accounts.find((a) => a.id === 'usd')!
    expect(usd.name).toBe('') // the app shows "USD balance" / "Saldo em USD"
    expect(usd.foreign).toEqual({ currency: 'USD', balance: 10000, rate: 5 })
  })

  it('uses "Wise" for a USD account with only a generic name, but a named bank still wins', () => {
    expect(itemBankName([acc('u', 'x', 'Conta Internacional (Conta USD)', { currencyCode: 'USD' })])).toBe('Wise')
    expect(itemBankName([acc('u', 'x', 'Banco Inter S.A. (Conta Global)', { currencyCode: 'USD' })])).toBe('Inter')
    expect(itemBankName([acc('b', 'x', 'Banco Inter S.A. (Conta Corrente)'), acc('u', 'x', '', { currencyCode: 'USD' })])).toBe('Inter')
  })

  it('names a Wise item from its currency-named checking accounts ("USD", "BRL"…)', () => {
    const s = snap(
      [meuItem('nu'), meuItem('wise')],
      [
        acc('nu-chk', 'nu', 'Nu Pagamentos S.A. - Instituição de Pagamento (Conta Pré-paga)'),
        acc('w-brl', 'wise', 'BRL', { balance: 320.5 }),
        acc('w-usd', 'wise', 'USD', { currencyCode: 'USD', balance: 2500 }),
        acc('w-eur', 'wise', 'EUR', { currencyCode: 'EUR', balance: 0 }), // empty: hidden
      ],
    )
    expect(s.institutions.map((i) => [i.id, i.name])).toEqual([
      ['nu', 'Nubank'],
      ['wise', 'Wise'],
    ])
    expect(s.accounts.filter((a) => a.institutionId === 'wise').map((a) => [a.id, a.name, a.foreign?.currency ?? 'BRL'])).toEqual([
      ['w-brl', '', 'BRL'], // shown as "Saldo em BRL"
      ['w-usd', '', 'USD'], // shown as "Saldo em USD"
    ])
  })

  it('never uses a currency code as a bank name', () => {
    expect(itemBankName([acc('b', 'x', 'BRL')])).toBe('Wise')
    expect(bankOf({ name: 'EUR' })).toBeNull()
  })

  it('leaves items from other connectors named after the connector', () => {
    expect(toSnapshot(data([])).institutions).toEqual([{ id: 'item-1', name: 'Nubank', color: '#8a05be' }])
  })
})

describe('mapping to Trove', () => {
  it('maps the connection, accounts, balances and card data', () => {
    const s = toSnapshot(data([]))
    expect(s.source).toBe('pluggy')
    expect(s.institutions).toEqual([{ id: 'item-1', name: 'Nubank', color: '#8a05be' }])
    const byId = new Map(s.accounts.map((a) => [a.id, a]))
    expect(byId.get('acc-chk')).toMatchObject({ type: 'BANK', balance: 123456, institutionId: 'item-1' })
    expect(byId.get('acc-card')).toMatchObject({
      name: 'Nubank Ultravioleta',
      balance: 85010,
      creditData: { creditLimit: 500000, availableCreditLimit: 300000, balanceCloseDate: '2026-10-02', balanceDueDate: '2026-10-09' },
    })
  })

  it('shows a USD account in USD and in BRL', () => {
    const a = toSnapshot(data([])).accounts.find((x) => x.id === 'acc-usd')!
    expect(a.foreign).toEqual({ currency: 'USD', balance: 10000, rate: 5.5 })
    expect(a.balance).toBe(55000)
  })

  it('signs amounts from DEBIT/CREDIT, also on the credit card', () => {
    const s = toSnapshot(data([
      tx({ id: 'out', type: 'DEBIT', amount: 25.5 }),
      tx({ id: 'in', type: 'CREDIT', amount: -100, category: 'Salary' }), // sign in `amount` is ignored
      tx({ id: 'buy', accountId: 'acc-card', type: 'DEBIT', amount: 80, category: 'Groceries' }),
      tx({ id: 'refund', accountId: 'acc-card', type: 'CREDIT', amount: 20, category: 'Shopping' }),
    ]))
    const amount = (id: string) => s.transactions.find((t) => t.id === id)!.amount
    expect([amount('out'), amount('in'), amount('buy'), amount('refund')]).toEqual([-2550, 10000, -8000, 2000])
  })

  it('converts foreign transactions to BRL and keeps the original amount', () => {
    const s = toSnapshot(data([
      tx({ id: 'wise', accountId: 'acc-usd', type: 'CREDIT', amount: 1200, currencyCode: 'USD' }),
      tx({ id: 'abroad', accountId: 'acc-card', type: 'DEBIT', amount: 30, currencyCode: 'USD', amountInAccountCurrency: 170.4 }),
    ]))
    const get = (id: string) => s.transactions.find((t) => t.id === id)!
    expect(get('wise')).toMatchObject({ amount: 660000, foreign: { currency: 'USD', amount: 120000 } })
    // Uses the bank's own conversion when Pluggy provides it.
    expect(get('abroad')).toMatchObject({ amount: -17040, foreign: { currency: 'USD', amount: -3000 } })
  })

  it('maps installments (parcelas) and pending transactions', () => {
    const s = toSnapshot(data([
      tx({
        id: 'p', accountId: 'acc-card', amount: 600, status: 'PENDING',
        creditCardMetadata: { installmentNumber: 3, totalInstallments: 10, totalAmount: 6000, purchaseDate: '2026-07-22T12:00:00.000Z' },
      }),
      tx({ id: 'single', accountId: 'acc-card', amount: 50, creditCardMetadata: { installmentNumber: 1, totalInstallments: 1 } }),
    ]))
    const p = s.transactions.find((t) => t.id === 'p')!
    expect(p.status).toBe('PENDING')
    expect(p.installment).toEqual({ number: 3, total: 10, totalAmount: 600000, purchaseDate: '2026-07-22' })
    expect(s.transactions.find((t) => t.id === 'single')!.installment).toBeUndefined()
  })

  it('uses the Brazilian calendar date', () => {
    expect(brazilDate('2026-09-20T02:00:00.000Z')).toBe('2026-09-19')
    expect(brazilDate('2026-09-20')).toBe('2026-09-20')
  })

  it('matches Pluggy categories to Trove categories, with a safe fallback', () => {
    const cases: [string | null, 'DEBIT' | 'CREDIT', string][] = [
      ['Salary', 'CREDIT', 'salary'],
      ['Groceries', 'DEBIT', 'groceries'],
      ['Food delivery', 'DEBIT', 'food'],
      ['Taxi and ride-hailing', 'DEBIT', 'transport'],
      ['Video streaming', 'DEBIT', 'subscriptions'],
      ['Pharmacy', 'DEBIT', 'health'],
      ['Airport and airlines', 'DEBIT', 'travel'],
      ['Rent', 'DEBIT', 'housing'],
      ['Electricity', 'DEBIT', 'utilities'],
      ['Same person transfer', 'DEBIT', 'transfer'],
      ['Credit card payment', 'DEBIT', 'card-payment'],
      ['Something new', 'DEBIT', 'other-expense'],
      [null, 'CREDIT', 'other-income'],
    ]
    for (const [category, type, expected] of cases) expect(categoryFor({ category, type }), String(category)).toBe(expected)
  })

  it('treats bill payments and transfers between own accounts as transfers, not income or expenses', () => {
    const s = toSnapshot(data([
      tx({ id: 'salary', type: 'CREDIT', amount: 10000, category: 'Salary' }),
      tx({ id: 'bill-out', type: 'DEBIT', amount: 850, category: 'Credit card payment' }),
      tx({ id: 'bill-in', accountId: 'acc-card', type: 'CREDIT', amount: 850, category: 'Credit card payment' }),
      // A generic Pix out of checking with a matching deposit in the Wise account the same day.
      tx({ id: 'pix-out', type: 'DEBIT', amount: 550, category: 'Transfer - PIX', date: '2026-09-10T12:00:00Z' }),
      tx({ id: 'pix-in', accountId: 'acc-usd', type: 'CREDIT', amount: 100, currencyCode: 'USD', category: 'Transfer - PIX', date: '2026-09-10T18:00:00Z' }),
      // A Pix to someone else stays an expense.
      tx({ id: 'pix-friend', type: 'DEBIT', amount: 42, category: 'Transfer - PIX' }),
    ]))
    const of = (id: string) => {
      const t = s.transactions.find((x) => x.id === id)!
      return t.transfer ?? t.categoryId
    }
    // Transfers have no category; the Pix to someone else is an uncategorized expense.
    expect([of('bill-out'), of('bill-in'), of('pix-out'), of('pix-in'), of('pix-friend'), of('salary')]).toEqual([
      'card-payment', 'card-payment', 'own', 'own', null, 'salary',
    ])
    expect(totals(s.transactions)).toEqual({ income: 1000000, expenses: 4200, net: 995800 })
  })

  it('keeps an edited category over transfer detection', () => {
    const txs = [
      tx({ id: 'pix-out', type: 'DEBIT', amount: 550, category: 'Transfer - PIX', date: '2026-09-10T12:00:00Z' }),
      tx({ id: 'pix-in', accountId: 'acc-usd', type: 'CREDIT', amount: 100, currencyCode: 'USD', category: 'Transfer - PIX', date: '2026-09-10T18:00:00Z' }),
      tx({ id: 'bill-out', type: 'DEBIT', amount: 850, category: 'Credit card payment' }),
    ]
    const stored = new Map([
      ['pix-out', { categoryId: 'gifts', subcategoryId: null, hidden: false, edited: true }],
      ['pix-in', { categoryId: null, subcategoryId: null, hidden: false }],
      ['bill-out', { categoryId: 'housing', subcategoryId: null, hidden: false, edited: true }],
    ])
    const s = toSnapshot({ ...data(txs), owner: { categories: [], subcategories: [], stored } })
    const of = (id: string) => {
      const t = s.transactions.find((x) => x.id === id)!
      return t.transfer ?? t.categoryId
    }
    // The edited Pix is no longer paired, so its twin counts as income on its own.
    expect([of('pix-out'), of('pix-in'), of('bill-out')]).toEqual(['gifts', null, 'housing'])
  })

  it('counts USD income in the average income by its BRL value at the stored rate', () => {
    const { categories, subcategories } = defaultCategories((c, i) => `${c}-${i}`)
    const s = toSnapshot({
      ...data([
        tx({ id: 'aug', accountId: 'acc-usd', type: 'CREDIT', amount: 1000, currencyCode: 'USD', date: '2026-08-10T15:00:00.000Z' }),
        tx({ id: 'sep', accountId: 'acc-usd', type: 'CREDIT', amount: 2000, currencyCode: 'USD', date: '2026-09-10T15:00:00.000Z' }),
      ]),
      owner: { categories, subcategories, stored: new Map() },
    })
    // US$ 1.000 and US$ 2.000 at R$ 5,50: R$ 5.500 and R$ 11.000.
    expect(incomeAverage(s.transactions, categories, subcategories, NO_FILTER, '2026-10')!.average).toBe(8_250_00)
  })

  it('ignores accounts and transactions from connections that were not requested', () => {
    const other: PluggyAccount = { ...checking, id: 'x', itemId: 'someone-else' }
    const s = toSnapshot(data([tx({ accountId: 'x' })], [checking, other]))
    expect(s.accounts.map((a) => a.id)).toEqual(['acc-chk'])
    expect(s.transactions).toEqual([])
  })
})

describe('GET /api/finance', () => {
  beforeEach(() => {
    clearFinanceCache()
    clearRateCache()
  })
  afterEach(() => vi.restoreAllMocks())

  /** Fake Pluggy + exchange-rate service. */
  function fakeUpstream(opts: { failAccounts?: boolean; extraAccounts?: PluggyAccount[] } = {}) {
    return vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.hostname === 'economia.awesomeapi.com.br') return Response.json({ USDBRL: { bid: '5.5' } })
      if (url.pathname === '/auth') return Response.json({ apiKey: 'KEY' })
      if (url.pathname === '/items/item-1') return Response.json(item)
      if (url.pathname === '/accounts') {
        const results = [checking, usd, ...(opts.extraAccounts ?? [])]
        return opts.failAccounts ? new Response('down', { status: 500 }) : Response.json({ results, page: 1, total: results.length, totalPages: 1 })
      }
      if (url.pathname === '/v2/transactions') {
        const acc = url.searchParams.get('accountId')!
        if (opts.extraAccounts?.some((a) => a.id === acc)) return Response.json({ results: [], next: null })
        return Response.json({ results: [tx({ id: `t-${acc}`, accountId: acc, category: 'Groceries', description: 'Pão de Açúcar' })], next: null })
      }
      return new Response('not found', { status: 404 })
    })
  }
  const req = (q = '') => new Request(`https://trove.vercel.app/api/finance${q}`)
  const now = () => new Date(2026, 8, 29)

  it('does not ask for exchange rates of hidden, empty balances (e.g. a Wise EUR account at zero)', async () => {
    const eur: PluggyAccount = { id: 'acc-eur', itemId: 'item-1', type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: 'EUR', balance: 0, currencyCode: 'EUR' }
    const fetchFn = fakeUpstream({ extraAccounts: [eur] })
    const res = await finance(req(), config, { fetch: fetchFn as typeof fetch, now })
    expect(res.status).toBe(200)
    const rateUrls = fetchFn.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('awesomeapi'))
    expect(rateUrls).toEqual(['https://economia.awesomeapi.com.br/json/last/USD-BRL'])
    expect((await res.json()).accounts.map((a: { id: string }) => a.id)).not.toContain('acc-eur')
  })

  it('returns 503 when Pluggy is not configured (the app then shows demo data)', async () => {
    const res = await finance(req(), null)
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'not_configured' })
  })

  it('returns the snapshot, fetching history from the start of the 6-month window', async () => {
    const fetchFn = fakeUpstream()
    const res = await finance(req(), config, { fetch: fetchFn as typeof fetch, now })
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('private')
    const s = await res.json()
    expect(s.source).toBe('pluggy')
    expect(s.accounts).toHaveLength(2)
    expect(s.transactions).toHaveLength(2)
    expect(historyStart(now())).toBe('2026-04-01')
    expect(fetchFn.mock.calls.some(([u]) => String(u).includes('dateFrom=2026-04-01'))).toBe(true)
  })

  it('summary: shows structure and category mapping, but no amounts or descriptions', async () => {
    const res = await finance(req('?summary'), config, { fetch: fakeUpstream() as typeof fetch, now })
    const text = await res.text()
    const body = JSON.parse(text)
    expect(body.items[0]).toMatchObject({ connector: 'Nubank', status: 'UPDATED' })
    expect(body.accounts.map((a: { currencyCode: string }) => a.currencyCode)).toEqual(['BRL', 'USD'])
    expect(body.categories[0]).toMatchObject({ pluggyCategory: 'Groceries', mappedTo: 'groceries', count: 2 })
    expect(text).not.toContain('Pão de Açúcar')
    expect(text).not.toMatch(/"(amount|balance)"/)
  })

  it('returns 502 with a readable message when Pluggy fails, without the secret', async () => {
    const res = await finance(req(), config, { fetch: fakeUpstream({ failAccounts: true }) as typeof fetch, now })
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toBe('upstream')
    expect(body.message).toContain('/accounts')
    expect(JSON.stringify(body)).not.toContain('super-secret')
  })
})

describe('POST /api/connect-token', () => {
  const post = (body?: string) => new Request('https://trove.vercel.app/api/connect-token', { method: 'POST', body })

  /** Fake Pluggy: /auth then /connect_token; records the connect_token body. */
  function fakePluggy(opts: { fail?: boolean; connectors?: { id: number; name: string }[] } = {}) {
    const bodies: unknown[] = []
    const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      if (url.pathname === '/auth') return Response.json({ apiKey: 'KEY' })
      if (url.pathname === '/connectors') {
        expect(url.searchParams.get('name')).toBe('MeuPluggy')
        const results = opts.connectors ?? [{ id: 200, name: 'MeuPluggy' }, { id: 201, name: 'MeuPluggy Clone Bank' }]
        return Response.json({ results, page: 1, total: results.length, totalPages: 1 })
      }
      if (url.pathname === '/connect_token') {
        expect(init?.method).toBe('POST')
        expect(new Headers(init?.headers).get('X-API-KEY')).toBe('KEY')
        bodies.push(JSON.parse(String(init?.body)))
        return opts.fail ? new Response('down', { status: 500 }) : Response.json({ accessToken: 'CONNECT-TOKEN' })
      }
      return new Response('not found', { status: 404 })
    })
    return { fetchFn: fetchFn as unknown as typeof fetch, bodies }
  }

  it('only needs the Client ID and Secret (no item yet)', () => {
    expect(readPluggyCredentials({ PLUGGY_CLIENT_ID: 'a', PLUGGY_CLIENT_SECRET: 'b' })).toMatchObject({ clientId: 'a', clientSecret: 'b' })
    expect(readPluggyCredentials({ PLUGGY_CLIENT_ID: 'a' })).toBeNull()
  })

  it('returns a Connect token restricted to the MeuPluggy connector, passing clientUserId to Pluggy', async () => {
    const { fetchFn, bodies } = fakePluggy()
    const res = await connectToken(post(JSON.stringify({ clientUserId: 'trove-owner' })), config, fetchFn)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    // Only the exact "MeuPluggy" connector, not look-alikes.
    expect(await res.json()).toEqual({ accessToken: 'CONNECT-TOKEN', connectorIds: [200] })
    expect(bodies).toEqual([{ options: { clientUserId: 'trove-owner' } }])
  })

  it('works without a body (clientUserId is optional)', async () => {
    const { fetchFn, bodies } = fakePluggy()
    expect((await connectToken(post(), config, fetchFn)).status).toBe(200)
    expect(bodies).toEqual([{ options: {} }])
  })

  it('rejects a body that is not JSON or an invalid clientUserId, without calling Pluggy', async () => {
    const { fetchFn } = fakePluggy()
    for (const body of ['not json', JSON.stringify({ clientUserId: 42 }), JSON.stringify({ clientUserId: '' }), JSON.stringify({ clientUserId: 'x'.repeat(129) })]) {
      expect((await connectToken(post(body), config, fetchFn)).status, body).toBe(400)
    }
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('issues no token when the MeuPluggy connector is not available (stays on the free path)', async () => {
    const { fetchFn, bodies } = fakePluggy({ connectors: [{ id: 5, name: 'Nubank' }] })
    const res = await connectToken(post(), config, fetchFn)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('meupluggy_not_found')
    expect(bodies).toEqual([])
  })

  it('fails closed when the credentials are missing', async () => {
    const res = await connectToken(post(), null)
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'not_configured' })
  })

  it('reports a Pluggy failure without leaking the credentials', async () => {
    const res = await connectToken(post(), config, fakePluggy({ fail: true }).fetchFn)
    expect(res.status).toBe(502)
    const text = await res.text()
    expect(text).toContain('/connect_token')
    expect(text).not.toContain('super-secret')
    expect(text).not.toContain('cid')
  })
})

describe('POST /api/webhooks/pluggy', () => {
  const secret = 'a-long-random-webhook-secret'
  const cfg = { secret, itemIds: ['item-1'] }
  const hook = (body: unknown, header: string | null = secret) =>
    new Request('https://trove.vercel.app/api/webhooks/pluggy', {
      method: 'POST',
      headers: header === null ? {} : { [WEBHOOK_SECRET_HEADER]: header },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  const logs: { message: string; details: Record<string, string | undefined> }[] = []
  const log = (message: string, details: Record<string, string | undefined>) => void logs.push({ message, details })
  beforeEach(() => {
    logs.length = 0
    clearFinanceCache()
  })

  it('reads its secret from PLUGGY_WEBHOOK_SECRET (fails closed without it)', () => {
    expect(readWebhookConfig({ PLUGGY_WEBHOOK_SECRET: 's', PLUGGY_ITEM_IDS: 'a,b' })).toEqual({ secret: 's', itemIds: ['a', 'b'] })
    expect(readWebhookConfig({})).toBeNull()
  })

  it('refuses requests without the right secret, and everything when not configured', async () => {
    const event = { event: 'item/updated', eventId: 'e1', itemId: 'item-1' }
    expect((await pluggyWebhook(hook(event, null), cfg, log)).status).toBe(401)
    expect((await pluggyWebhook(hook(event, 'wrong'), cfg, log)).status).toBe(401)
    expect((await pluggyWebhook(hook(event), null, log)).status).toBe(503)
    expect(logs).toEqual([])
  })

  it('acknowledges item/updated with 2XX and clears the cache so the next load is fresh', async () => {
    let pluggyCalls = 0
    const upstream = (async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.hostname === 'api.pluggy.ai') pluggyCalls++
      if (url.pathname === '/auth') return Response.json({ apiKey: 'K' })
      if (url.pathname.startsWith('/items/')) return Response.json(item)
      if (url.pathname === '/accounts') return Response.json({ results: [checking], page: 1, total: 1, totalPages: 1 })
      return Response.json({ results: [], next: null })
    }) as typeof fetch
    const load = () => finance(new Request('https://t/api/finance'), config, { fetch: upstream })

    await load()
    const afterFirst = pluggyCalls
    await load()
    expect(pluggyCalls).toBe(afterFirst) // served from the cache

    const res = await pluggyWebhook(hook({ event: 'item/updated', eventId: 'e1', itemId: 'item-1' }), cfg, log)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    expect(logs[0].message).toMatch(/cache cleared/)

    await load()
    expect(pluggyCalls).toBeGreaterThan(afterFirst) // fetched again after the webhook
  })

  it('logs item/created with its ID, and item/error with its code only', async () => {
    await pluggyWebhook(hook({ event: 'item/created', eventId: 'e2', itemId: 'item-1' }), cfg, log)
    await pluggyWebhook(hook({ event: 'item/error', eventId: 'e3', itemId: 'item-1', error: { code: 'INVALID_CREDENTIALS', message: 'Senha incorreta para CPF 123' } }), cfg, log)
    expect(logs[0].details).toMatchObject({ event: 'item/created', itemId: 'item-1' })
    expect(logs[1].details).toMatchObject({ event: 'item/error', code: 'INVALID_CREDENTIALS' })
    expect(JSON.stringify(logs)).not.toContain('Senha')
  })

  it('acknowledges but ignores events for connections Trove does not read', async () => {
    const res = await pluggyWebhook(hook({ event: 'item/updated', eventId: 'e4', itemId: 'someone-else' }), cfg, log)
    expect(res.status).toBe(200)
    expect(logs[0].message).toMatch(/ignored/)
  })

  it('rejects a body that is not JSON', async () => {
    expect((await pluggyWebhook(hook('not json'), cfg, log)).status).toBe(400)
  })
})
