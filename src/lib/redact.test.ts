import { describe, expect, it } from 'vitest'
import { HIDDEN, redact } from './redact'

describe('redact', () => {
  it('keeps IDs, types and dates and hides amounts, descriptions and names', () => {
    const page = {
      total: 1,
      results: [
        {
          id: 'tx-1',
          accountId: 'acc-1',
          providerId: 'p-1',
          date: '2026-10-01T00:00:00.000Z',
          description: 'LOJA EXEMPLO 04/10',
          amount: 150,
          type: 'DEBIT',
          creditCardMetadata: { installmentNumber: 4, totalInstallments: 10, billId: 'bill-1', purchaseDate: '2026-07-01' },
          merchant: { name: 'Loja Exemplo', cnpj: '00.000.000/0001-00' },
          tags: ['x'],
          pending: false,
          balance: null,
        },
      ],
    }
    expect(redact(page)).toEqual({
      total: 1,
      results: [
        {
          id: 'tx-1',
          accountId: 'acc-1',
          providerId: 'p-1',
          date: '2026-10-01T00:00:00.000Z',
          description: HIDDEN,
          amount: HIDDEN,
          type: 'DEBIT',
          creditCardMetadata: { installmentNumber: 4, totalInstallments: 10, billId: 'bill-1', purchaseDate: '2026-07-01' },
          merchant: { name: HIDDEN, cnpj: HIDDEN },
          tags: [HIDDEN],
          pending: false,
          balance: null,
        },
      ],
    })
  })

  it('hides a body that is plain text', () => {
    expect(redact('Internal error for ACME')).toBe(HIDDEN)
  })
})
