import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditError, applyEdit, applyReceivableEdit, defaultCategories, validateEdit, type ReceivableEdit } from './edits'
import { createMockRepository } from './mockRepository'
import { knownPeople, owedByPerson, owedTotal, remaining, repaymentCandidates, type Receivable } from './receivables'
import type { Snapshot, Transaction } from './types'

// Made-up data only.
const { categories, subcategories } = defaultCategories((c, i) => `${c}-${i}`)
const tx = (id: string, over: Partial<Transaction> = {}): Transaction => ({
  id, accountId: 'a', date: '2026-10-01', description: 'LOJA EXEMPLO', amount: -150_00, categoryId: 'restaurants', status: 'POSTED', ...over,
})
const snapshot = (receivables: Receivable[] = []): Snapshot => ({
  institutions: [], accounts: [], categories, subcategories, source: 'demo', receivables,
  transactions: [
    tx('dinner'),
    tx('pix-in', { date: '2026-10-03', amount: 50_00, categoryId: null, description: 'PIX RECEBIDO EXEMPLO' }),
    tx('pix-in-2', { date: '2026-10-05', amount: 100_00, categoryId: null, description: 'PIX RECEBIDO EXEMPLO' }),
    tx('own', { amount: -300_00, categoryId: null, transfer: 'own' }),
    tx('salary', { amount: 5000_00, categoryId: 'salary' }),
  ],
})
const owe = (id: string, person: string, amount: number, transactionId = 'dinner'): ReceivableEdit => ({ op: 'saveReceivable', receivable: { id, transactionId, person, amount } })
const pay = (receivableId: string, id: string, amount: number, transactionId: string | null = null, date = '2026-10-04'): ReceivableEdit => ({
  op: 'saveReceivablePayment', receivableId, payment: { id, date, amount, transactionId },
})
const apply = (s: Snapshot, ...edits: ReceivableEdit[]) => edits.reduce((x, e) => applyEdit(x, e), s)
const reason = (f: () => unknown) => {
  try {
    f()
  } catch (e) {
    return e instanceof EditError ? (e.reason ?? e.code) : 'other'
  }
  return null
}

describe('receivables: rules', () => {
  it('marks part of an expense as owed, with its day', () => {
    const s = apply(snapshot(), owe('r1', 'Ana', 75_00))
    expect(s.receivables).toEqual([{ id: 'r1', transactionId: 'dinner', date: '2026-10-01', person: 'Ana', amount: 75_00, payments: [] }])
  })

  it('lets several people owe parts of one expense, up to its amount', () => {
    const s = apply(snapshot(), owe('r1', 'Ana', 75_00), owe('r2', 'Bruno', 75_00))
    expect(owedTotal(s.receivables!)).toBe(150_00)
    expect(reason(() => apply(s, owe('r3', 'Carla', 1)))).toBe('over_expense')
    expect(reason(() => apply(snapshot(), owe('r1', 'Ana', 150_01)))).toBe('over_expense')
  })

  it('refuses money in, transfers and missing transactions', () => {
    expect(reason(() => apply(snapshot(), owe('r1', 'Ana', 10_00, 'pix-in')))).toBe('not_expense')
    expect(reason(() => apply(snapshot(), owe('r1', 'Ana', 10_00, 'own')))).toBe('not_expense')
    expect(reason(() => apply(snapshot(), owe('r1', 'Ana', 10_00, 'nope')))).toBe('not_found')
  })

  it('changes who and how much, never its expense, never below what was paid back', () => {
    let s = apply(snapshot(), owe('r1', 'Ana', 100_00), pay('r1', 'p1', 40_00))
    s = apply(s, owe('r1', 'Ana Paula', 60_00))
    expect(s.receivables![0]).toMatchObject({ person: 'Ana Paula', amount: 60_00 })
    expect(reason(() => apply(s, owe('r1', 'Ana', 39_99)))).toBe('below_received')
    const other = { ...snapshot().transactions[0], id: 'lunch' }
    expect(reason(() => apply({ ...s, transactions: [...s.transactions, other] }, owe('r1', 'Ana', 60_00, 'lunch')))).toBe('other_transaction')
  })

  it('records payments back, by hand or from money that came in, up to what is owed', () => {
    let s = apply(snapshot(), owe('r1', 'Ana', 100_00), pay('r1', 'p1', 50_00, 'pix-in', '2026-10-03'))
    expect(remaining(s.receivables![0])).toBe(50_00)
    expect(reason(() => apply(s, pay('r1', 'p2', 50_01)))).toBe('over_owed')
    s = apply(s, pay('r1', 'p2', 50_00))
    expect(remaining(s.receivables![0])).toBe(0)
    expect(s.receivables![0].payments.map((p) => p.id)).toEqual(['p1', 'p2'])
    // A correction replaces it (by ID).
    s = apply(s, pay('r1', 'p2', 20_00))
    expect(remaining(s.receivables![0])).toBe(30_00)
  })

  it('a payment from a transaction is money in, and uses at most what came in', () => {
    const s = apply(snapshot(), owe('r1', 'Ana', 75_00), owe('r2', 'Bruno', 75_00), pay('r1', 'p1', 30_00, 'pix-in'))
    expect(reason(() => apply(s, pay('r2', 'p2', 20_01, 'pix-in')))).toBe('over_received')
    expect(apply(s, pay('r2', 'p2', 20_00, 'pix-in')).receivables![1].payments).toHaveLength(1)
    expect(reason(() => apply(s, pay('r2', 'p2', 10_00, 'dinner')))).toBe('not_money_in')
    expect(reason(() => apply(s, pay('r2', 'p1', 10_00)))).toBe('invalid')
    expect(reason(() => apply(s, pay('nope', 'p2', 10_00)))).toBe('not_found')
  })

  it('deletes a payment, or a receivable with its payments', () => {
    let s = apply(snapshot(), owe('r1', 'Ana', 100_00), pay('r1', 'p1', 40_00))
    s = applyEdit(s, { op: 'deleteReceivablePayment', receivableId: 'r1', id: 'p1' })
    expect(remaining(s.receivables![0])).toBe(100_00)
    expect(reason(() => applyEdit(s, { op: 'deleteReceivablePayment', receivableId: 'r1', id: 'p1' }))).toBe('not_found')
    s = applyEdit(s, { op: 'deleteReceivable', id: 'r1' })
    expect(s.receivables).toEqual([])
    expect(reason(() => applyEdit(s, { op: 'deleteReceivable', id: 'r1' }))).toBe('not_found')
  })

  it('applyReceivableEdit leaves the list it was given as it was', () => {
    const list: Receivable[] = [{ id: 'r1', transactionId: 'dinner', date: '2026-10-01', person: 'Ana', amount: 100_00, payments: [] }]
    const byId = new Map(snapshot().transactions.map((t) => [t.id, t]))
    applyReceivableEdit(list, pay('r1', 'p1', 10_00), (id) => byId.get(id))
    expect(list[0].payments).toEqual([])
  })
})

describe('receivables: summaries', () => {
  const list: Receivable[] = [
    { id: 'r1', transactionId: 't1', date: '2026-09-01', person: 'Ana', amount: 100_00, payments: [{ id: 'p', date: '2026-09-02', amount: 100_00, transactionId: null }] },
    { id: 'r2', transactionId: 't2', date: '2026-09-10', person: 'ana', amount: 40_00, payments: [{ id: 'q', date: '2026-09-12', amount: 10_00, transactionId: null }] },
    { id: 'r3', transactionId: 't3', date: '2026-10-01', person: 'Bruno', amount: 20_00, payments: [] },
    { id: 'r4', transactionId: 't4', date: '2026-08-01', person: 'Ana', amount: 25_00, payments: [] },
  ]

  it('adds up what is still owed, by person (whatever the case), most owed first', () => {
    expect(owedTotal(list)).toBe(75_00)
    expect(owedByPerson(list).map((p) => [p.person, p.remaining, p.open.map((r) => r.id)])).toEqual([
      ['ana', 55_00, ['r2', 'r4']],
      ['Bruno', 20_00, ['r3']],
    ])
  })

  it('suggests each name once, the latest first', () => {
    expect(knownPeople(list)).toEqual(['Bruno', 'ana'])
  })

  it('suggests money that came in on or after the expense (not before), the amounts that match first', () => {
    const r: Receivable = { id: 'r1', transactionId: 'dinner', date: '2026-10-02', person: 'Ana', amount: 100_00, payments: [] }
    const txs = snapshot().transactions
    expect(repaymentCandidates([r], r, txs).map((c) => [c.tx.id, c.free])).toEqual([
      ['pix-in-2', 100_00],
      ['pix-in', 50_00],
    ])
  })
})

describe('receivables: edits from outside', () => {
  it('accepts well-formed edits and cleans names', () => {
    expect(validateEdit({ op: 'saveReceivable', receivable: { id: 'r1', transactionId: 't1', person: '  Ana   Paula ', amount: 10_00 } })).toEqual({
      op: 'saveReceivable',
      receivable: { id: 'r1', transactionId: 't1', person: 'Ana Paula', amount: 10_00 },
    })
    expect(validateEdit({ op: 'saveReceivablePayment', receivableId: 'r1', payment: { id: 'p1', date: '2026-10-04', amount: 1, transactionId: null } })).toMatchObject({
      payment: { transactionId: null },
    })
  })

  it('refuses empty or long names, odd amounts and days', () => {
    const bad = [
      { op: 'saveReceivable', receivable: { id: 'r1', transactionId: 't1', person: '  ', amount: 10_00 } },
      { op: 'saveReceivable', receivable: { id: 'r1', transactionId: 't1', person: 'x'.repeat(41), amount: 10_00 } },
      { op: 'saveReceivable', receivable: { id: 'r1', transactionId: 't1', person: 'Ana', amount: 0 } },
      { op: 'saveReceivable', receivable: { id: 'r1', transactionId: 't1', person: 'Ana', amount: 10.5 } },
      { op: 'saveReceivable', receivable: { id: 'r1', transactionId: 't1', person: 'Ana', amount: -100 } },
      { op: 'saveReceivablePayment', receivableId: 'r1', payment: { id: 'p1', date: '2026-02-30', amount: 1, transactionId: null } },
      { op: 'saveReceivablePayment', receivableId: 'r1', payment: { id: 'p1', date: '2026-10-04', amount: 1, transactionId: "x'; DROP" } },
      { op: 'deleteReceivablePayment', receivableId: 'r1' },
    ]
    for (const e of bad) expect(() => validateEdit(e), JSON.stringify(e)).toThrow(EditError)
  })
})

describe('receivables: demo repository', () => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
  beforeEach(() => store.clear())
  const today = new Date(2026, 8, 27)

  it('keeps receivables and payments across loads', async () => {
    const repo = createMockRepository(today)
    const expense = (await repo.load()).transactions.find((t) => t.amount < 0 && !t.transfer)!
    await repo.edit({ op: 'saveReceivable', receivable: { id: 'r1', transactionId: expense.id, person: 'Ana', amount: 1 } })
    await repo.edit({ op: 'saveReceivablePayment', receivableId: 'r1', payment: { id: 'p1', date: expense.date, amount: 1, transactionId: null } })
    const s = await createMockRepository(today).load()
    expect(s.receivables).toEqual([{ id: 'r1', transactionId: expense.id, date: expense.date, person: 'Ana', amount: 1, payments: [{ id: 'p1', date: expense.date, amount: 1, transactionId: null }] }])
  })
})
