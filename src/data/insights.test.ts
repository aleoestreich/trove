import { describe, expect, it } from 'vitest'
import { applyEdit, defaultCategories, validateEdit } from './edits'
import { detectRecurring, merchantKey } from './recurring'
import { unusualCategories } from './unusual'
import { monthEndProjection } from './projection'
import { computeInsights } from './insights'
import type { Account, ProjectionSettings, RecurringOverride, Snapshot, Transaction } from './types'

const { categories, subcategories } = defaultCategories((c, i) => `${c}-${i}`)
let seq = 0
const tx = (date: string, amount: number, over: Partial<Transaction> = {}): Transaction => ({
  id: `t${++seq}`,
  accountId: 'chk',
  date,
  description: 'LOJA EXEMPLO',
  amount,
  categoryId: null,
  status: 'POSTED',
  ...over,
})
const checking: Account = { id: 'chk', institutionId: 'bank', name: 'Conta corrente', type: 'BANK', subtype: 'CHECKING_ACCOUNT', balance: 10_000_00 }
const card: Account = {
  id: 'card',
  institutionId: 'bank',
  name: 'Cartão',
  type: 'CREDIT',
  subtype: 'CREDIT_CARD',
  balance: 0,
  creditData: { creditLimit: 10_000_00, availableCreditLimit: 10_000_00, balanceCloseDate: '2026-10-03', balanceDueDate: '2026-10-10' },
}
const savings: Account = { id: 'sav', institutionId: 'bank', name: 'Poupança', type: 'BANK', subtype: 'SAVINGS_ACCOUNT', balance: 50_000_00 }
const accounts = [checking, card, savings]
const TODAY = '2026-10-06'

/** One charge on `day` of each month. */
const monthly = (months: string[], day: string, amount: number, over: Partial<Transaction>) => months.map((m) => tx(`${m}-${day}`, amount, over))

describe('recurring charges', () => {
  const streaming = [
    ...monthly(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'], '24', -39_90, { accountId: 'card', description: 'STREAMING EXEMPLO', categoryId: 'subscriptions' }),
    tx('2026-09-24', -44_90, { accountId: 'card', description: 'STREAMING EXEMPLO', categoryId: 'subscriptions' }),
  ]
  const newService = [
    tx('2026-08-12', -110_00, { accountId: 'card', description: 'SERVICO NOVO*AB12', foreign: { currency: 'USD', amount: -20_00 } }),
    tx('2026-09-12', -112_00, { accountId: 'card', description: 'SERVICO NOVO*CD34', foreign: { currency: 'USD', amount: -20_00 } }),
  ]
  const gym = monthly(['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'], '05', -129_90, { accountId: 'card', description: 'ACADEMIA EXEMPLO' })
  const yearly = [tx('2025-03-10', -166_80, { accountId: 'card', description: 'CLUBE ANUAL' }), tx('2026-03-12', -166_80, { accountId: 'card', description: 'CLUBE ANUAL' })]
  // An app used every week: similar orders a month apart are a coincidence.
  const orders: Record<string, number[]> = { '2026-07': [45_00, 52_00, 59_00, 66_00], '2026-08': [80_00, 33_00, 95_00, 27_00], '2026-09': [47_00, 70_00, 40_00, 110_00] }
  const delivery = Object.entries(orders).flatMap(([m, amounts]) =>
    ['03', '10', '17', '24'].map((d, i) => tx(`${m}-${d}`, -amounts[i], { accountId: 'card', description: 'APP DELIVERY' })),
  )
  const excluded = [
    ...monthly(['2026-07', '2026-08', '2026-09'], '15', -500_00, { description: 'TRANSFERENCIA PROPRIA', transfer: 'own' }),
    ...monthly(['2026-07', '2026-08', '2026-09'], '16', -80_00, { description: 'OCULTA EXEMPLO', hidden: true }),
    ...['2026-07', '2026-08', '2026-09'].map((m, i) =>
      tx(`${m}-20`, -300_00, { accountId: 'card', description: 'LOJA PARCELADA', installment: { number: i + 1, total: 5, totalAmount: 1_500_00, purchaseDate: '2026-07-20' } }),
    ),
  ]
  const all = [...streaming, ...newService, ...gym, ...yearly, ...delivery, ...excluded]
  const detect = (overrides: Record<string, RecurringOverride> = {}, txs = all, today = TODAY) => detectRecurring(txs, accounts, categories, overrides, today)
  const find = (r: ReturnType<typeof detect>, id: string) => [...r.active, ...r.stopped].find((i) => i.id === id)

  it('groups by merchant, without codes, accents and processors', () => {
    expect(merchantKey('PG *Serviço Novo*AB12 04/10')).toBe('servico novo')
    expect(merchantKey('Streaming.com.br')).toBe('streaming')
  })

  it('finds monthly and yearly charges, and nothing else', () => {
    const r = detect()
    expect(r.active.map((i) => i.id).sort()).toEqual(['clube-anual', 'servico-novo', 'streaming-exemplo'])
    expect(r.stopped.map((i) => i.id)).toEqual(['academia-exemplo'])
    expect(find(r, 'clube-anual')).toMatchObject({ cadence: 'yearly', amount: 166_80, monthly: 13_90, nextDate: '2027-03-12' })
    expect(find(r, 'streaming-exemplo')).toMatchObject({ cadence: 'monthly', day: 24, nextDate: '2026-10-24', paymentMethod: 'card', status: 'active' })
  })

  it('flags a price increase above 2%, and not a smaller change', () => {
    const r = detect()
    expect(find(r, 'streaming-exemplo')!.priceChange).toEqual({ from: 39_90, to: 44_90, date: '2026-09-24', currency: 'BRL' })
    expect(r.alerts).toContainEqual({ type: 'price_up', recurringId: 'streaming-exemplo' })
    const small = [...streaming.slice(0, 5), tx('2026-09-24', -40_50, { accountId: 'card', description: 'STREAMING EXEMPLO' })]
    expect(find(detect({}, small), 'streaming-exemplo')!.priceChange).toBeNull()
    // A bill that varies every month has no stable price to rise from.
    const varying = [60_00, 75_00, 68_00, 82_00].map((a, i) => tx(`2026-0${6 + i}-12`, -a, { description: 'CONTA DE LUZ EXEMPLO' }))
    expect(find(detect({}, varying), 'conta-de-luz-exemplo')).toMatchObject({ priceChange: null, increaseAlert: false })
  })

  it('compares foreign charges in their currency and shows the BRL charged', () => {
    const item = find(detect(), 'servico-novo')!
    expect(item).toMatchObject({ status: 'new', amount: 112_00, foreign: { currency: 'USD', amount: 20_00 }, priceChange: null })
  })

  it('marks charges as new, and as stopped after 2 missing cycles', () => {
    const r = detect()
    expect(r.alerts).toContainEqual({ type: 'new', recurringId: 'servico-novo' })
    expect(r.alerts).toContainEqual({ type: 'stopped', recurringId: 'academia-exemplo' })
    // A month later the gym was still within its 2 cycles.
    expect(find(detect({}, all, '2026-09-08'), 'academia-exemplo')!.status).toBe('active')
  })

  it('totals exclude stopped charges and divide yearly ones by 12', () => {
    const r = detect()
    expect(r.monthTotal).toBe(44_90 + 112_00 + 13_90)
    expect(r.yearTotal).toBe(r.monthTotal * 12)
  })

  it('keeps hand-set answers when detection runs again', () => {
    const at = '2026-10-06'
    let overrides: Record<string, RecurringOverride> = {}
    const answer = (id: string, action: 'confirm' | 'not_recurring' | 'cancelled' | 'still_active' | 'dismiss_increase') => {
      const s = applyEdit({ recurringOverrides: overrides } as Snapshot, validateEdit({ op: 'recurringAction', id, action, at }))
      overrides = s.recurringOverrides!
    }
    answer('servico-novo', 'confirm')
    answer('clube-anual', 'not_recurring')
    answer('streaming-exemplo', 'dismiss_increase')
    answer('academia-exemplo', 'still_active')
    // New data comes in (the next sync): the answers still hold.
    const later = [...all, tx('2026-10-05', -45_00, { accountId: 'card', description: 'APP DELIVERY' })]
    const r = detect(overrides, later)
    expect(find(r, 'servico-novo')!.status).toBe('active')
    expect(find(r, 'clube-anual')).toBeUndefined()
    expect(find(r, 'streaming-exemplo')!.increaseAlert).toBe(false)
    expect(find(r, 'academia-exemplo')!.status).toBe('active')
    expect(r.alerts).toEqual([])
    // A later increase (after 44,90 held for 2 months) is flagged again.
    const raised = [
      ...later,
      tx('2026-10-24', -44_90, { accountId: 'card', description: 'STREAMING EXEMPLO' }),
      tx('2026-11-24', -49_90, { accountId: 'card', description: 'STREAMING EXEMPLO' }),
    ]
    expect(find(detect(overrides, raised, '2026-11-25'), 'streaming-exemplo')!.priceChange).toMatchObject({ from: 44_90, to: 49_90 })
    expect(find(detect(overrides, raised, '2026-11-25'), 'streaming-exemplo')!.increaseAlert).toBe(true)
  })

  it('a cancelled charge is stopped until it charges again', () => {
    const overrides = { 'streaming-exemplo': { status: 'cancelled' as const, statusAt: '2026-10-06' } }
    expect(find(detect(overrides), 'streaming-exemplo')!.status).toBe('stopped')
    const charged = [...all, tx('2026-10-24', -44_90, { accountId: 'card', description: 'STREAMING EXEMPLO' })]
    expect(find(detect(overrides, charged, '2026-10-25'), 'streaming-exemplo')!.status).toBe('active')
  })
})

describe('unusual categories', () => {
  const history = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']
  const restaurants = categories.find((c) => c.id === 'restaurants')!
  const [delivery, dining] = subcategories.filter((s) => s.categoryId === restaurants.id)
  const base = [
    ...history.flatMap((m) => [
      tx(`${m}-05`, -600_00, { categoryId: 'restaurants', subcategoryId: delivery.id }),
      tx(`${m}-12`, -400_00, { categoryId: 'restaurants', subcategoryId: dining.id }),
      tx(`${m}-08`, -2_000_00, { categoryId: 'groceries' }),
      tx(`${m}-09`, -50_00, { categoryId: 'health' }),
    ]),
    tx('2026-09-05', -960_00, { categoryId: 'restaurants', subcategoryId: delivery.id }),
    tx('2026-09-12', -490_00, { categoryId: 'restaurants', subcategoryId: dining.id }),
    tx('2026-09-08', -2_040_00, { categoryId: 'groceries' }),
    tx('2026-09-09', -300_00, { categoryId: 'health' }),
    tx('2026-09-10', -900_00, { categoryId: 'groceries', hidden: true }),
  ]

  it('compares the last complete month with the 6 before it (until day 10)', () => {
    const r = unusualCategories(base, categories, TODAY)!
    expect(r).toMatchObject({ mode: 'month', month: '2026-09', compareFrom: '2026-03', compareTo: '2026-08' })
    expect(r.unusual.map((c) => c.categoryId)).toEqual(['restaurants'])
    const c = r.unusual[0]
    expect(c).toMatchObject({ now: 1_450_00, avg: 1_000_00, delta: 450_00 })
    expect(c.pct).toBeCloseTo(0.45)
    expect(c.subs[0]).toMatchObject({ subcategoryId: delivery.id, now: 960_00, avg: 600_00, delta: 360_00 })
    expect(c.counts).toEqual({ now: 2, avg: 2 })
    // Groceries +2% is normal; health averages under R$ 100, so it's left out; hidden spending never counts.
    expect(r.normal.map((n) => n.categoryId)).toEqual(['groceries'])
  })

  it('compares the month so far with the same days of earlier months (from day 11)', () => {
    const txs = [
      ...['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].flatMap((m) => [
        tx(`${m}-05`, -150_00, { categoryId: 'transport' }),
        tx(`${m}-25`, -850_00, { categoryId: 'transport' }),
      ]),
      tx('2026-10-05', -150_00, { categoryId: 'transport' }),
    ]
    const r = unusualCategories(txs, categories, '2026-10-20')!
    expect(r).toMatchObject({ mode: 'mtd', month: '2026-10', days: 20 })
    // Days 1–20 only: R$ 150 vs R$ 150, not vs the R$ 1.000 whole months.
    expect(r.normal[0]).toMatchObject({ categoryId: 'transport', now: 150_00, avg: 150_00, avgFull: 1_000_00 })
    expect(r.unusual).toEqual([])
  })

  it('needs 3 months of history', () => {
    const recent = base.filter((t) => t.date >= '2026-07')
    expect(unusualCategories(recent, categories, TODAY)).toBeNull()
  })
})

describe('month-end projection', () => {
  const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
  const salary = monthly(months, '20', 10_000_00, { description: 'SALARIO EXEMPLO', categoryId: 'salary' })
  const rent = monthly(months, '10', -3_000_00, { description: 'Pix enviado ALUGUEL EXEMPLO', categoryId: 'home' })
  // Day-to-day: R$ 920 a month from checking, at different places (not recurring).
  const daily = [
    tx('2026-07-03', -920_00, { description: 'PADARIA A' }),
    tx('2026-08-17', -920_00, { description: 'PADARIA B' }),
    tx('2026-09-28', -920_00, { description: 'PADARIA C' }),
    tx('2026-09-29', -5_000_00, { description: 'OCULTA', hidden: true }),
    tx('2026-09-30', -2_000_00, { description: 'Pagamento fatura', transfer: 'card-payment' }),
  ]
  // The card: a subscription and an installment inside the bill due on the 10th.
  const cardTxs = [
    tx('2026-08-24', -44_90, { accountId: 'card', description: 'STREAMING EXEMPLO' }),
    tx('2026-09-24', -44_90, { accountId: 'card', description: 'STREAMING EXEMPLO' }),
    tx('2026-09-15', -500_00, { accountId: 'card', description: 'LOJA EXEMPLO' }),
    tx('2026-09-20', -300_00, { accountId: 'card', description: 'LOJA PARCELADA', installment: { number: 2, total: 5, totalAmount: 1_500_00, purchaseDate: '2026-08-20' } }),
  ]
  const october = [tx('2026-10-02', -200_00, { description: 'MERCADO EXEMPLO' })]
  const txs = [...salary, ...rent, ...daily, ...cardTxs, ...october]
  const project = (settings: ProjectionSettings = { accountIds: null, includeDaily: true, includeFreelance: false }, list = txs) => {
    const recurring = detectRecurring(list, accounts, categories, {}, TODAY)
    return monthEndProjection({ accounts, transactions: list, categories, settings, recurring: [...recurring.active, ...recurring.stopped], today: TODAY })!
  }

  it('adds the expected salary and subtracts bills, recurring and day-to-day spending once each', () => {
    const p = project()
    expect(p.accountIds).toEqual(['chk'])
    expect(p.breakdown).toEqual({
      saldoHoje: 10_000_00,
      receitasPrevistas: 10_000_00,
      // The bill holds the subscription and the installment: never subtracted again.
      faturas: 844_90,
      recorrentes: 3_000_00,
      // R$ 2.760 over 92 days = R$ 30 a day, 25 days left.
      diaADia: 750_00,
      parcelasDentroDasFaturas: 300_00,
    })
    expect(p.end).toBe(10_000_00 + 10_000_00 - 844_90 - 3_000_00 - 750_00)
    expect(p.events.map((e) => [e.date, e.kind, e.amount])).toEqual([
      ['2026-10-10', 'bill', -844_90],
      ['2026-10-10', 'recurring', -3_000_00],
      ['2026-10-20', 'salary', 10_000_00],
    ])
  })

  it('draws real balances to today, then the projection to the end of the month', () => {
    const p = project()
    expect(p.daily).toHaveLength(31)
    expect(p.daily[0]).toMatchObject({ day: '2026-10-01', value: 10_200_00, actual: true })
    expect(p.daily[5]).toMatchObject({ day: '2026-10-06', value: 10_000_00, actual: true })
    expect(p.daily[30]).toMatchObject({ day: '2026-10-31', value: p.end, actual: false })
    // Lowest just before the salary.
    expect(p.low.date).toBe('2026-10-19')
    expect(p.range.min).toBeLessThan(p.end)
    expect(p.range.max - p.end).toBe(p.end - p.range.min)
  })

  it('follows the settings', () => {
    expect(project({ accountIds: null, includeDaily: false, includeFreelance: false }).breakdown.diaADia).toBe(0)
    // Savings only: no salary there, so no projection.
    expect(project({ accountIds: ['sav'], includeDaily: true, includeFreelance: false })).toBeNull()
  })

  it('expects a salary paid in two parts on each of its days, the last one on the month\'s last business day', () => {
    const lastDay: Record<string, string> = { '2026-04': '30', '2026-05': '29', '2026-06': '30', '2026-07': '31', '2026-08': '31', '2026-09': '30' }
    const split = [
      ...monthly(months, '15', 4_000_00, { description: 'ADIANTAMENTO EXEMPLO', categoryId: 'salary' }),
      // Paid on the month's last day (a business day earlier in May).
      ...months.map((m) => tx(`${m}-${lastDay[m]}`, 6_000_00, { description: 'SALARIO EXEMPLO', categoryId: 'salary' })),
    ]
    const list = [...split, ...rent, ...daily, ...cardTxs, ...october]
    const p = project(undefined, list)
    // 31 October 2026 is a Saturday: Friday the 30th.
    expect(p.events.filter((e) => e.kind === 'salary').map((e) => [e.date, e.amount])).toEqual([
      ['2026-10-15', 4_000_00],
      ['2026-10-30', 6_000_00],
    ])
    expect(p.salary.days).toEqual([15, 30])
    expect(p.breakdown.receitasPrevistas).toBe(10_000_00)
    // The balance rises mid-month too, not only at the end.
    expect(p.daily[14].value).toBeGreaterThan(p.daily[13].value)
    // What already came in covers the first part.
    const early = project(undefined, [...list, tx('2026-10-03', 4_000_00, { description: 'ADIANTAMENTO EXEMPLO', categoryId: 'salary' })])
    expect(early.events.filter((e) => e.kind === 'salary').map((e) => [e.date, e.amount])).toEqual([['2026-10-30', 6_000_00]])
  })

  it('moves any payday on a weekend to the Friday before', () => {
    // Paid on the 17th: 17 October 2026 is a Saturday, so Friday the 16th.
    const list = [...monthly(months, '17', 10_000_00, { description: 'SALARIO EXEMPLO', categoryId: 'salary' }), ...rent, ...daily, ...cardTxs, ...october]
    expect(project(undefined, list).events.filter((e) => e.kind === 'salary').map((e) => e.date)).toEqual(['2026-10-16'])
  })

  it('moves a payday on a national holiday to the working day before', () => {
    // Paid on the 12th: 12 October (Nossa Senhora Aparecida) is a holiday, and TODAY is before it.
    const list = [...monthly(months, '12', 10_000_00, { description: 'SALARIO EXEMPLO', categoryId: 'salary' }), ...rent, ...daily, ...cardTxs, ...october]
    expect(project(undefined, list).events.filter((e) => e.kind === 'salary').map((e) => e.date)).toEqual(['2026-10-09'])
  })

  it('looks to the end of next month when asked: its bills, paydays and recurring charges too', () => {
    const p = project({ accountIds: null, includeDaily: true, includeFreelance: false, horizon: 'nextMonth' })
    expect(p.endDate).toBe('2026-11-30')
    expect(p.daily).toHaveLength(61)
    expect(p.events.map((e) => [e.date, e.kind, e.amount])).toEqual([
      ['2026-10-10', 'bill', -844_90],
      ['2026-10-10', 'recurring', -3_000_00],
      ['2026-10-20', 'salary', 10_000_00],
      // Next month's bill: the installment due in its cycle (more than the card's recent bills).
      ['2026-11-10', 'bill', -300_00],
      ['2026-11-10', 'recurring', -3_000_00],
      // 20 November is Black Consciousness Day: the working day before.
      ['2026-11-19', 'salary', 10_000_00],
    ])
    // R$ 30 a day from today to 30 November: 55 days.
    expect(p.breakdown.diaADia).toBe(1_650_00)
    expect(p.end).toBe(10_000_00 + 20_000_00 - 1_144_90 - 6_000_00 - 1_650_00)
    expect(p.daily[60]).toMatchObject({ day: '2026-11-30', value: p.end })
    // The default still stops at the end of this month.
    expect(project().endDate).toBe('2026-10-31')
  })

  it('needs 2 months of salary', () => {
    expect(project(undefined, txs.filter((t) => t.categoryId !== 'salary' || t.date >= '2026-09'))).toBeNull()
  })

  it('comes out the same through computeInsights', () => {
    const i = computeInsights({ accounts, transactions: txs, categories, projectionSettings: undefined, recurringOverrides: {} }, TODAY)
    expect(i.projection!.end).toBe(project().end)
  })
})

describe('insight edits', () => {
  it('validates projection settings', () => {
    expect(() => validateEdit({ op: 'setProjectionSettings', settings: { accountIds: [], includeDaily: true, includeFreelance: false } })).toThrow()
    expect(() => validateEdit({ op: 'setProjectionSettings', settings: { accountIds: null, includeDaily: 'yes', includeFreelance: false } })).toThrow()
    const e = validateEdit({ op: 'setProjectionSettings', settings: { accountIds: ['chk', 'chk'], includeDaily: false, includeFreelance: true } })
    expect(applyEdit({} as Snapshot, e).projectionSettings).toEqual({ accountIds: ['chk'], includeDaily: false, includeFreelance: true, horizon: 'month' })
    expect(() => validateEdit({ op: 'setProjectionSettings', settings: { accountIds: null, includeDaily: true, includeFreelance: false, horizon: 'year' } })).toThrow()
  })

  it('validates recurring actions', () => {
    expect(() => validateEdit({ op: 'recurringAction', id: 'x', action: 'delete', at: TODAY })).toThrow()
    expect(() => validateEdit({ op: 'recurringAction', id: 'has space', action: 'confirm', at: TODAY })).toThrow()
    expect(() => validateEdit({ op: 'recurringAction', id: 'x', action: 'confirm', at: 'today' })).toThrow()
  })
})

describe('saving from the app', () => {
  it('sends settings and answers to their routes', async () => {
    const { createApiRepository } = await import('./apiRepository')
    const calls: [string, string, unknown][] = []
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push([init.method ?? 'GET', url, JSON.parse(String(init.body))])
      return new Response('{}', { status: 200 })
    }) as unknown as typeof fetch
    const repo = createApiRepository(fetchFn)
    await repo.edit({ op: 'setProjectionSettings', settings: { accountIds: null, includeDaily: false, includeFreelance: false } })
    await repo.edit({ op: 'recurringAction', id: 'streaming-exemplo', action: 'confirm', at: TODAY })
    expect(calls).toEqual([
      ['PUT', '/api/insights/projection/settings', { accountIds: null, includeDaily: false, includeFreelance: false }],
      ['POST', '/api/recurring/streaming-exemplo/action', { action: 'confirm' }],
    ])
  })
})
