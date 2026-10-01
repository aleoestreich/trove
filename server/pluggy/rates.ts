// Exchange rates to BRL for foreign-currency accounts (e.g. Wise USD). Free,
// keyless sources, tried in order until every currency has a rate:
//   1. AwesomeAPI (economia.awesomeapi.com.br), a Brazilian quotes API;
//   2. Banco Central do Brasil, PTAX (olinda.bcb.gov.br), the official rate;
//   3. ExchangeRate-API's open endpoint (open.er-api.com).
// AwesomeAPI limits requests per IP, and Vercel's IPs are shared, so it can
// answer 429 even when Trove made few calls. Rates are cached for an hour per
// server instance; if every source fails, the last good rate is reused.

type Rates = Record<string, number>
type Fetch = typeof fetch

interface Source {
  name: string
  /** Rates (BRL per unit) for as many of `wanted` as it can; throws on a failed request. */
  get(wanted: string[], fetchFn: Fetch, now: Date): Promise<Rates>
}

const TTL = 60 * 60 * 1000
/** Per request, so a slow source doesn't hold up the page. */
const TIMEOUT = 4000

let fresh: { at: number; rates: Rates } | null = null
/** Last good rate per currency, kept beyond the TTL as a fallback. */
let lastGood: Rates = {}

async function getJson(url: string, fetchFn: Fetch, name: string): Promise<unknown> {
  const res = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT) })
  if (!res.ok) throw new Error(`${name} HTTP ${res.status}`)
  return res.json()
}

const valid = (n: number) => Number.isFinite(n) && n > 0

const awesomeApi: Source = {
  name: 'AwesomeAPI',
  async get(wanted, fetchFn) {
    const url = `https://economia.awesomeapi.com.br/json/last/${wanted.map((c) => `${c}-BRL`).join(',')}`
    const body = (await getJson(url, fetchFn, this.name)) as Record<string, { bid?: string } | undefined>
    const rates: Rates = {}
    for (const c of wanted) {
      const rate = Number(body[`${c}BRL`]?.bid)
      if (valid(rate)) rates[c] = rate
    }
    return rates
  },
}

/** MM-DD-YYYY in Brazil's time zone, as PTAX expects. */
function ptaxDate(d: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  )
  return `${p.month}-${p.day}-${p.year}`
}

const bancoCentral: Source = {
  name: 'Banco Central',
  async get(wanted, fetchFn, now) {
    // The last 10 days covers weekends and holidays, when there is no quote.
    const from = ptaxDate(new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000))
    const to = ptaxDate(now)
    const rates: Rates = {}
    for (const c of wanted) {
      const url =
        'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/' +
        'CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)' +
        `?@moeda='${c}'&@dataInicial='${from}'&@dataFinalCotacao='${to}'&$format=json`
      const body = (await getJson(url, fetchFn, this.name)) as { value?: { cotacaoCompra?: number; dataHoraCotacao?: string }[] }
      const latest = [...(body.value ?? [])].sort((a, b) => String(a.dataHoraCotacao).localeCompare(String(b.dataHoraCotacao))).pop()
      const rate = Number(latest?.cotacaoCompra)
      if (valid(rate)) rates[c] = rate
    }
    return rates
  },
}

const openErApi: Source = {
  name: 'ExchangeRate-API',
  async get(wanted, fetchFn) {
    // Units of each currency per 1 BRL; invert for BRL per unit.
    const body = (await getJson('https://open.er-api.com/v6/latest/BRL', fetchFn, this.name)) as {
      result?: string
      rates?: Record<string, number>
    }
    if (body.result !== 'success') throw new Error(`${this.name} returned no rates`)
    const rates: Rates = {}
    for (const c of wanted) {
      const perBrl = Number(body.rates?.[c])
      if (valid(perBrl)) rates[c] = 1 / perBrl
    }
    return rates
  },
}

const SOURCES = [awesomeApi, bancoCentral, openErApi]

/** BRL per 1 unit of each currency. Throws only if no source (nor the last good rate) has one. */
export async function ratesToBRL(currencies: string[], fetchFn: Fetch = fetch, now: Date = new Date()): Promise<Rates> {
  const wanted = [...new Set(currencies.map((c) => c.toUpperCase()).filter((c) => c !== 'BRL'))]
  if (wanted.length === 0) return {}
  if (fresh && now.getTime() - fresh.at < TTL && wanted.every((c) => fresh!.rates[c])) return fresh.rates

  const rates: Rates = {}
  const failures: string[] = []
  for (const source of SOURCES) {
    const missing = wanted.filter((c) => !rates[c])
    if (missing.length === 0) break
    try {
      Object.assign(rates, await source.get(missing, fetchFn, now))
    } catch (e) {
      // Status codes and source names only, never response bodies.
      failures.push(e instanceof Error && e.name !== 'TimeoutError' ? e.message : `${source.name} timed out`)
    }
  }

  const missing = wanted.filter((c) => !rates[c])
  if (missing.length === 0) {
    lastGood = { ...lastGood, ...rates }
    fresh = { at: now.getTime(), rates: { ...(fresh?.rates ?? {}), ...rates } }
    return rates
  }
  if (missing.every((c) => lastGood[c])) {
    console.warn(`Exchange rates: using the last good rate for ${missing.join(', ')} (${failures.join('; ') || 'no rate returned'}).`)
    return { ...rates, ...Object.fromEntries(missing.map((c) => [c, lastGood[c]])) }
  }
  const why = failures.length ? ` (${failures.join('; ')})` : ''
  throw new Error(`No exchange rate for ${missing.join(', ')}${why}.`)
}

/** Test helper. */
export function clearRateCache() {
  fresh = null
  lastGood = {}
}
