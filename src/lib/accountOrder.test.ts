import { describe, expect, it } from 'vitest'
import type { Account } from '../data/types'
import { sortForDisplay } from './accountOrder'

const acc = (id: string, subtype: Account['subtype']): Account => ({
  id,
  institutionId: 'bank',
  name: id,
  type: subtype === 'CREDIT_CARD' ? 'CREDIT' : 'BANK',
  subtype,
  balance: 0,
})

describe('account order within a bank', () => {
  it('puts checking first, then savings, then cards, keeping the order within each kind', () => {
    const order = sortForDisplay([acc('card', 'CREDIT_CARD'), acc('savings', 'SAVINGS_ACCOUNT'), acc('brl', 'CHECKING_ACCOUNT'), acc('usd', 'CHECKING_ACCOUNT')])
    expect(order.map((a) => a.id)).toEqual(['brl', 'usd', 'savings', 'card'])
  })
})
