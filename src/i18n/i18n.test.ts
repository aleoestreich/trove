import { afterEach, describe, expect, it } from 'vitest'
import { messages } from './messages'
import { setActiveLocale } from './locale'
import { formatCompact, formatMoney, formatRate } from '../lib/money'
import { formatDay, formatMonth, formatMonthYear, formatShortDate } from '../lib/dates'

/** Every leaf path in a messages object ("overview.netWorth", ...). */
function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  )
}

describe('messages', () => {
  it('pt-BR has exactly the same keys as English', () => {
    expect(keys(messages['pt-BR']).sort()).toEqual(keys(messages.en).sort())
  })

  it('handles singular and plural', () => {
    expect(messages.en.transactions.count(1, null)).toBe('1 transaction')
    expect(messages.en.transactions.count(42, 'September 2026')).toBe('42 transactions in September')
    expect(messages['pt-BR'].transactions.count(1, null)).toBe('1 transação')
    expect(messages['pt-BR'].transactions.count(42, 'Setembro de 2026')).toBe('42 transações em setembro')
    expect(messages['pt-BR'].installments.toGo(1)).toBe('1 restante')
    expect(messages['pt-BR'].installments.toGo(7)).toBe('7 restantes')
  })
})

describe('formatting follows the language', () => {
  afterEach(() => setActiveLocale('pt-BR'))

  it('pt-BR', () => {
    setActiveLocale('pt-BR')
    expect(formatMoney(123456)).toBe('R$ 1.234,56')
    expect(formatMoney(341237, 'USD')).toBe('US$ 3.412,37')
    expect(formatRate(5.45)).toBe('5,45')
    expect(formatCompact(15000)).toBe('15 mil')
    expect(formatMonth('2026-09')).toBe('Setembro de 2026')
    expect(formatDay('2026-09-27')).toBe('27 de set.')
    expect(formatShortDate('2026-10-08')).toBe('08/10')
    expect(formatMonthYear('2027-03')).toBe('03/2027')
  })

  it('English', () => {
    setActiveLocale('en')
    expect(formatMoney(123456)).toBe('R$1,234.56')
    expect(formatMoney(341237, 'USD')).toBe('$3,412.37')
    expect(formatRate(5.45)).toBe('5.45')
    expect(formatCompact(15000)).toBe('15K')
    expect(formatMonth('2026-09')).toBe('September 2026')
    expect(formatDay('2026-09-27')).toBe('Sep 27')
    expect(formatShortDate('2026-10-08')).toBe('Oct 8')
    expect(formatMonthYear('2027-03')).toBe('Mar 2027')
  })
})
