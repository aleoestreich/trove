// Exchange rates to BRL for foreign-currency accounts (e.g. Wise USD), from
// AwesomeAPI (economia.awesomeapi.com.br), a free Brazilian quotes API.
// Cached for an hour per server instance.

type Rates = Record<string, number>

let cache: { at: number; rates: Rates } | null = null
const TTL = 60 * 60 * 1000

/** BRL per 1 unit of each currency. Throws if a rate can't be fetched. */
export async function ratesToBRL(currencies: string[], fetchFn: typeof fetch = fetch): Promise<Rates> {
  const wanted = [...new Set(currencies.map((c) => c.toUpperCase()).filter((c) => c !== 'BRL'))]
  if (wanted.length === 0) return {}
  if (cache && Date.now() - cache.at < TTL && wanted.every((c) => cache!.rates[c])) return cache.rates

  const res = await fetchFn(`https://economia.awesomeapi.com.br/json/last/${wanted.map((c) => `${c}-BRL`).join(',')}`)
  if (!res.ok) throw new Error(`Exchange rate service failed (HTTP ${res.status}).`)
  const body = (await res.json()) as Record<string, { bid?: string }>
  const rates: Rates = {}
  for (const c of wanted) {
    const rate = Number(body[`${c}BRL`]?.bid)
    if (!Number.isFinite(rate) || rate <= 0) throw new Error(`No exchange rate for ${c}.`)
    rates[c] = rate
  }
  cache = { at: Date.now(), rates }
  return rates
}

/** Test helper. */
export function clearRateCache() {
  cache = null
}
