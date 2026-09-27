import type { Cents, CurrencyCode } from '../data/types'

const formatters = new Map<string, Intl.NumberFormat>()

function formatter(currency: CurrencyCode, signed: boolean): Intl.NumberFormat {
  const key = `${currency}:${signed}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
      signDisplay: signed ? 'exceptZero' : 'auto',
    })
    formatters.set(key, f)
  }
  return f
}

/** Format cents as currency, Brazilian style: "R$ 1.234,56", "US$ 12,00". */
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
  return rate.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}
