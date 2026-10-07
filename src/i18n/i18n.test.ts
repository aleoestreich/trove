import { describe, expect, it } from 'vitest'
import { errorMessage } from '../data/apiRepository'
import { messages } from './messages'
import { formatCompact, formatCompactMoney, formatMoney, formatRate } from '../lib/money'
import { formatDay, formatDayHeading, formatMonth, formatMonthYear, formatShortDate } from '../lib/dates'

describe('messages', () => {
  it('handles singular and plural', () => {
    expect(messages.transactions.count(1, null)).toBe('1 transação')
    expect(messages.transactions.count(42, 'Setembro de 2026')).toBe('42 transações em setembro')
    expect(messages.installments.toGo(1)).toBe('1 restante')
    expect(messages.installments.toGo(7)).toBe('7 restantes')
  })
})

/** Intl separates the symbol and "mil" with a no-break space. */
const nb = (s: string) => s.replace(/ /g, '\u00a0')

describe('formatting (pt-BR)', () => {
  it('money, rates and chart labels', () => {
    expect(formatMoney(123456)).toBe(nb('R$ 1.234,56'))
    expect(formatMoney(123456, 'USD')).toBe(nb('US$ 1.234,56'))
    expect(formatRate(5.45)).toBe('5,45')
    expect(formatCompact(13400)).toBe(nb('13,4 mil'))
    expect(formatCompactMoney(1990000)).toBe(nb('R$ 19,9 mil'))
  })

  it('dates', () => {
    expect(formatMonth('2026-09')).toBe('Setembro de 2026')
    expect(formatDay('2026-09-12')).toBe('12 set.')
    expect(formatDayHeading('2026-09-28')).toBe('segunda, 28 set. 2026')
    expect(formatDayHeading('2025-03-05')).toBe('quarta, 5 mar. 2025')
    expect(formatShortDate('2026-10-08')).toBe('08/10')
    expect(formatMonthYear('2027-03')).toBe('03/2027')
  })
})

describe('errors', () => {
  it('shows the API’s error codes in Portuguese, never the server’s text', () => {
    expect(errorMessage('schema_outdated')).toMatch(/^As tabelas do banco de dados estão desatualizadas/)
    expect(errorMessage('name_taken')).toBe('Já existe uma com esse nome.')
    expect(errorMessage('something_new', 502)).toBe('A requisição falhou (HTTP 502).')
  })
})
