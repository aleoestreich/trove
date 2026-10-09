import type { Cents, CurrencyCode } from '../data/types.js'
import { LOCALE } from '../i18n/locale.js'

const formatters = new Map<string, Intl.NumberFormat>()

/**
 * Privacy mode ("Ocultar valores", src/lib/privacy.ts): every amount and
 * percentage is shown as "R$ •••••" / "•• %", without sign. Set only in the
 * app; the server never masks.
 */
let masked = false
const DOTS = '•••••'
export function setMoneyMasked(value: boolean) {
  masked = value
}
export const isMoneyMasked = () => masked
/** "+", "−" or nothing, for a figure written by hand; nothing while values are hidden. */
export const signOf = (n: number) => (masked || n === 0 ? '' : n > 0 ? '+' : '−')
const maskOf = (currency: CurrencyCode) => `${currency === 'BRL' ? 'R$' : currency === 'USD' ? 'US$' : currency} ${DOTS}`

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
  if (masked) return maskOf(currency)
  return formatter(currency, !!opts.signed).format(cents / 100)
}

/** Convert a float amount (as APIs return it) to integer cents. */
export function toCents(amount: number): Cents {
  return Math.round(amount * 100)
}

/**
 * An amount typed in reais, as cents: "10.850,32", "R$ 10850,3", "10850" or
 * "10850.32". A comma is the decimal separator and dots group thousands;
 * without a comma, a single dot followed by 1–2 digits is the decimal point.
 * Null when it isn't an amount (or is negative).
 */
export function parseMoney(text: string): Cents | null {
  const t = text.replace(/R\$|\s/g, '')
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null
  let whole: string
  let frac = ''
  if (t.includes(',')) {
    const parts = t.split(',')
    if (parts.length !== 2 || /\./.test(parts[1])) return null
    ;[whole, frac] = parts
    whole = whole.replace(/\./g, '')
  } else if (/^\d+\.\d{1,2}$/.test(t)) {
    ;[whole, frac] = t.split('.')
  } else {
    // Dots only group thousands: groups of 3 digits.
    if (t.includes('.') && !/^\d{1,3}(\.\d{3})+$/.test(t)) return null
    whole = t.replace(/\./g, '')
  }
  if (frac.length > 2 || (!whole && !frac)) return null
  return Number(whole || '0') * 100 + Number(frac.padEnd(2, '0') || '0')
}

/** Cents as typed in a field: "10850,32" (no grouping, no symbol). */
export function moneyInput(cents: Cents): string {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`
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
  if (masked) return DOTS
  return new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

/** Percentage: "6,0%". */
export function formatPercent(value: number, decimals = 0): string {
  if (masked) return '•• %'
  return new Intl.NumberFormat(LOCALE, { style: 'percent', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value / 100)
}

/** Short money for chart labels: "R$ 14,5 mil". */
export function formatCompactMoney(cents: Cents): string {
  if (masked) return maskOf('BRL')
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(cents / 100)
}

/** Money rounded to whole reais, for averages in lists: "R$ 13.783". */
export function formatWholeMoney(cents: Cents): string {
  if (masked) return maskOf('BRL')
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(cents / 100))
}
