import type { Cents, CurrencyCode } from '../data/types'
import { LOCALE } from '../i18n/locale'

const formatters = new Map<string, Intl.NumberFormat>()

function formatter(currency: CurrencyCode, signed: boolean): Intl.NumberFormat {
  const key = `${currency}:${signed}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency,
      signDisplay: signed ? 'exceptZero' : 'auto',
    })
    formatters.set(key, f)
  }
  return f
}

/**
 * Format cents as currency (pt-BR):
 * "R$ 1.234,56" / "US$ 12,00".
 */
export function formatMoney(cents: Cents, currency: CurrencyCode = 'BRL', opts: { signed?: boolean } = {}): string {
  return formatter(currency, !!opts.signed).format(cents / 100)
}

/** Convert a float amount (as APIs return it) to integer cents. */
export function toCents(amount: number): Cents {
  return Math.round(amount * 100)
}

/** Convert a foreign amount to BRL cents at `rate` BRL per unit. */
export function convertToBRL(cents: Cents, rate: number): Cents {
  return Math.round(cents * rate)
}

/** "5,45" */
export function formatRate(rate: number): string {
  return rate.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

/** Axis ticks: "15 mil". */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

/** Percentage: "6,0%". */
export function formatPercent(value: number, decimals = 0): string {
  return new Intl.NumberFormat(LOCALE, { style: 'percent', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value / 100)
}

/** Short money for chart labels: "R$ 14,5 mil". */
export function formatCompactMoney(cents: Cents): string {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(cents / 100)
}

/** Money rounded to whole reais, for averages in lists: "R$ 13.783". */
export function formatWholeMoney(cents: Cents): string {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(cents / 100))
}
