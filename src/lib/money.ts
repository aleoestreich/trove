import type { Cents, CurrencyCode } from '../data/types'
import { intlLocale } from '../i18n/locale'

const formatters = new Map<string, Intl.NumberFormat>()

function formatter(currency: CurrencyCode, signed: boolean): Intl.NumberFormat {
  const locale = intlLocale()
  const key = `${locale}:${currency}:${signed}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      signDisplay: signed ? 'exceptZero' : 'auto',
    })
    formatters.set(key, f)
  }
  return f
}

/**
 * Format cents as currency in the active language:
 * pt-BR "R$ 1.234,56" / "US$ 12,00", en "R$1,234.56" / "$12.00".
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

/** pt-BR "5,45", en "5.45" */
export function formatRate(rate: number): string {
  return rate.toLocaleString(intlLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

/** Axis ticks: pt-BR "15 mil", en "15K". */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat(intlLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}
