import { describe, expect, it } from 'vitest'
import { messages as t } from '../i18n/messages'
import type { Account, Institution } from '../data/types'
import { accountLabel, shownName } from './accountLabel'
import { accountTypeLabels } from './accountType'
import { accountName, describeEvent, paymentLabel } from './insightText'

const institutions: Institution[] = [{ id: 'bank', name: 'Banco Exemplo', color: '#000' }]
const checking: Account = { id: 'chk', institutionId: 'bank', name: 'Conta Corrente', type: 'BANK', subtype: 'CHECKING_ACCOUNT', balance: 0 }
const card: Account = { id: 'card', institutionId: 'bank', name: 'Cartão Platinum', type: 'CREDIT', subtype: 'CREDIT_CARD', balance: 0 }
const named = (a: Account, nickname: string): Account => ({ ...a, nickname })

describe('account names on screen: the name in Trove, else the original', () => {
  it('shownName', () => {
    expect(shownName(named(card, 'Cartão da casa'), 'Cartão Banco Exemplo')).toBe('Cartão da casa')
    expect(shownName(card, 'Cartão Banco Exemplo')).toBe('Cartão Banco Exemplo')
    expect(shownName(undefined, 'Banco Exemplo')).toBe('Banco Exemplo')
  })

  it('Contas and the account filter', () => {
    expect(accountTypeLabels([named(checking, 'Conta da casa'), card], t)).toEqual(new Map([['chk', 'Conta da casa'], ['card', 'Cartão de crédito']]))
    expect(accountLabel(named(card, 'Cartão da casa'), t)).toBe('Cartão da casa')
    expect(accountLabel(card, t)).toBe('Cartão Platinum')
  })

  it('the insights: bills, recurring charges and the projection’s accounts', () => {
    const accounts = [named(checking, 'Conta da casa'), named(card, 'Cartão da casa')]
    expect(accountName('card', accounts, institutions)).toBe('Cartão da casa')
    expect(accountName('card', [checking, card], institutions)).toBe('Banco Exemplo')
    expect(paymentLabel('card', 'card', accounts, institutions)).toBe('Cartão da casa')
    expect(paymentLabel('pix', 'chk', accounts, institutions)).toBe('Pix Conta da casa')
    expect(paymentLabel('card', 'card', [checking, card], institutions)).toBe('Cartão Banco Exemplo')
    expect(paymentLabel('debit', 'chk', [checking, card], institutions)).toBe('Débito Banco Exemplo')
    const bill = { date: '2026-10-10', kind: 'bill' as const, accountId: 'card', amount: -100_00, installments: 0 }
    expect(describeEvent(bill, accounts, institutions).name).toBe('Fatura Cartão da casa')
    expect(describeEvent(bill, [checking, card], institutions).name).toBe('Fatura Banco Exemplo')
  })
})
