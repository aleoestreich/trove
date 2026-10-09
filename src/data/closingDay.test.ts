import { describe, expect, it } from 'vitest'
import { estimateCardDays, type BilledPurchase } from './closingDay'

// A made-up card: closes on the 3rd (purchases up to the 3rd are in the bill), due on the 10th.
const bills = [
  { id: 'b6', dueDate: '2026-06-10' },
  { id: 'b7', dueDate: '2026-07-10' },
  { id: 'b8', dueDate: '2026-08-10' },
  { id: 'b9', dueDate: '2026-09-10' },
]
/** Purchases every 2 days from May to September, each in the bill its date falls in. */
function purchases(): BilledPurchase[] {
  const list: BilledPurchase[] = []
  for (let d = new Date(Date.UTC(2026, 4, 1)); d < new Date(Date.UTC(2026, 8, 30)); d.setUTCDate(d.getUTCDate() + 2)) {
    const date = d.toISOString().slice(0, 10)
    const bill = bills.find((b) => date <= `${b.dueDate.slice(0, 8)}03`)
    list.push({ date, billId: bill?.id ?? null })
  }
  return list
}

describe('estimated closing day', () => {
  it('finds the closing and due days from the last 3 bills', () => {
    expect(estimateCardDays(bills, purchases())).toEqual({ close: 3, due: 10, bills: 3 })
  })

  it('isn’t moved by a late posting or an installment dated on the original purchase', () => {
    const odd = [...purchases(), { date: '2026-08-02', billId: 'b9' }, { date: '2026-03-15', billId: 'b8' }]
    expect(estimateCardDays(bills, odd)).toEqual({ close: 3, due: 10, bills: 3 })
  })

  it('uses the most common due day when one moved off a weekend', () => {
    const moved = bills.map((b) => (b.id === 'b8' ? { ...b, dueDate: '2026-08-12' } : b))
    expect(estimateCardDays(moved, purchases())?.due).toBe(10)
  })

  it('reads the open bill’s purchases (no bill yet) as after the last closing', () => {
    const open = purchases()
    expect(open.some((p) => p.billId === null)).toBe(true)
    expect(estimateCardDays(bills.slice(-1), open)).toEqual({ close: 3, due: 10, bills: 1 })
  })

  it('gives nothing without bills, or when the bank doesn’t say which bill a purchase is in', () => {
    expect(estimateCardDays([], purchases())).toBeNull()
    expect(estimateCardDays(bills, purchases().map((p) => ({ ...p, billId: null })))).toBeNull()
  })
})
