import { afterEach, describe, expect, it } from 'vitest'
import { formatCompact, formatCompactMoney, formatMoney, formatPercent, formatWholeMoney, moneyInput, parseMoney, setMoneyMasked, signOf } from './money'

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

describe('amounts typed in reais', () => {
  it('reads the usual ways of writing them', () => {
    expect(parseMoney('10.850,32')).toBe(10_850_32)
    expect(parseMoney('R$ 10850,3')).toBe(10_850_30)
    expect(parseMoney('10850')).toBe(10_850_00)
    expect(parseMoney('10850.32')).toBe(10_850_32)
    expect(parseMoney('10.850')).toBe(10_850_00)
    expect(parseMoney('1.234.567,8')).toBe(1_234_567_80)
    expect(parseMoney(',5')).toBe(50)
    expect(moneyInput(10_850_05)).toBe('10.850,05')
    expect(parseMoney(moneyInput(1_234_567_89))).toBe(1_234_567_89)
  })

  it('refuses what isn’t an amount', () => {
    for (const bad of ['', 'abc', '-10', '10,5,3', '1,234.56', '10.85.3', '10,123', '1.23.456']) expect(parseMoney(bad)).toBeNull()
  })
})

