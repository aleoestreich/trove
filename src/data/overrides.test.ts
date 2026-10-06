import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyOverrides, clearOverrides, saveIgnored, saveOverride } from './overrides'
import type { Snapshot, Transaction } from './types'

const tx = (id: string): Transaction => ({ id, accountId: 'a', date: '2026-10-01', description: 'LOJA EXEMPLO', amount: -150_00, categoryId: 'shopping', status: 'POSTED' })
const snapshot = (): Snapshot => ({ institutions: [], accounts: [], categories: [], transactions: [tx('t1'), tx('t2')], source: 'demo' })

/** In-memory localStorage (tests run in Node). */
const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
})

describe('owner edits saved on this device', () => {
  beforeEach(() => clearOverrides())

  it('marks ignored transactions and can count them again', () => {
    saveIgnored('t1', true)
    expect(applyOverrides(snapshot()).transactions.map((t) => !!t.ignored)).toEqual([true, false])
    saveIgnored('t1', false)
    expect(applyOverrides(snapshot()).transactions.map((t) => !!t.ignored)).toEqual([false, false])
  })

  it('keeps a category change and the ignored flag together', () => {
    saveOverride('t2', 'groceries')
    saveIgnored('t2', true)
    expect(applyOverrides(snapshot()).transactions[1]).toMatchObject({ categoryId: 'groceries', ignored: true })
  })
})
