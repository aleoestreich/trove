import { afterEach, describe, expect, it } from 'vitest'
import { messages } from './messages'
import { setActiveLocale } from './locale'
import { categories } from '../data/seed'
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

  it('translates every category in both languages', () => {
    for (const c of categories) {
      expect(messages.en.categories[c.id], c.id).toBeTruthy()
      expect(messages['pt-BR'].categories[c.id], c.id).toBeTruthy()
    }
  })

  it('handles singular and plural', () => {
    expect(messages.en.accounts.count(1)).toBe('1 account')
    expect(messages.en.accounts.count(2)).toBe('2 accounts')
    expect(messages['pt-BR'].accounts.count(1)).toBe('1 conta')
    expect(messages['pt-BR'].accounts.count(2)).toBe('2 contas')
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
