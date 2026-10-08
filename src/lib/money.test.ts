import { afterEach, describe, expect, it } from 'vitest'
import { formatCompact, formatCompactMoney, formatMoney, formatPercent, formatWholeMoney, setMoneyMasked, signOf } from './money'

describe('privacy mode masking', () => {
  afterEach(() => setMoneyMasked(false))

  it('shows every amount and percentage as dots, without sign', () => {
    setMoneyMasked(true)
    expect(formatMoney(-15000, 'BRL', { signed: true })).toBe('R$ •••••')
    expect(formatMoney(1200, 'USD')).toBe('US$ •••••')
    expect(formatCompactMoney(8_410_000)).toBe('R$ •••••')
    expect(formatWholeMoney(95_600)).toBe('R$ •••••')
    expect(formatCompact(15000)).toBe('•••••')
    expect(formatPercent(35)).toBe('•• %')
    expect(signOf(-1)).toBe('')
  })

  it('formats normally otherwise', () => {
    expect(formatMoney(-15000, 'BRL', { signed: true })).toMatch(/150,00/)
    expect(signOf(-1)).toBe('−')
    expect(signOf(0)).toBe('')
  })
})
