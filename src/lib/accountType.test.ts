import { describe, expect, it } from 'vitest'
import type { Account } from '../data/types'
import { messages } from '../i18n/messages'
import { accountType, accountTypeLabels } from './accountType'

const acc = (id: string, over: Partial<Account> = {}): Account => ({
  id,
  institutionId: 'bank',
  name: '',
  type: 'BANK',
  subtype: 'CHECKING_ACCOUNT',
  balance: 0,
  ...over,
})
const card = (id: string, name = '') => acc(id, { type: 'CREDIT', subtype: 'CREDIT_CARD', name })
const usd = acc('usd', { foreign: { currency: 'USD', balance: 0, rate: 5 } })
const eur = acc('eur', { foreign: { currency: 'EUR', balance: 0, rate: 6 } })

describe('account types', () => {
  it('maps checking, savings, USD balances and cards; anything else is checking', () => {
    expect(accountType(acc('c'))).toBe('checking')
    expect(accountType(acc('s', { subtype: 'SAVINGS_ACCOUNT' }))).toBe('savings')
    expect(accountType(usd)).toBe('usd')
    expect(accountType(card('k'))).toBe('card')
    expect(accountType(eur)).toBe('checking')
  })

  it('labels each by its kind', () => {
    const list = [acc('c', { name: 'Conta Pré-paga' }), acc('s', { subtype: 'SAVINGS_ACCOUNT' }), usd, card('k')]
    expect([...accountTypeLabels(list, messages).values()]).toEqual(['Conta corrente', 'Poupança', 'Saldo em dólar', 'Cartão de crédito'])
  })

  it('names other foreign balances by currency', () => {
    expect(accountTypeLabels([eur], messages).get('eur')).toBe('Saldo em EUR')
  })

  it('adds the account name when a bank has two of the same kind', () => {
    const labels = accountTypeLabels([card('a', 'Platinum'), card('b', 'Black'), acc('c')], messages)
    expect([...labels.values()]).toEqual(['Cartão de crédito · Platinum', 'Cartão de crédito · Black', 'Conta corrente'])
  })
})
