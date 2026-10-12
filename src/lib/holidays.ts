// Brazil's national days without banking: the national holidays (Lei
// 662/1949 and later laws) plus Carnival Monday and Tuesday and Corpus
// Christi, when banks close too. State and city holidays aren't included.
// Shared by the app and the server, so it imports nothing.

/** Fixed national holidays, MM-DD. Black Consciousness Day (20 Nov) is national since 2024 (Lei 14.759/2023). */
const FIXED = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25']
const BLACK_CONSCIOUSNESS = '11-20'

/** Easter Sunday (Gregorian calendar, the anonymous algorithm), as YYYY-MM-DD. */
export function easter(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const cache = new Map<number, Set<string>>()

/** A year's days without banking (YYYY-MM-DD). */
export function bankHolidays(year: number): Set<string> {
  let days = cache.get(year)
  if (!days) {
    const e = easter(year)
    days = new Set([
      ...FIXED.map((md) => `${year}-${md}`),
      ...(year >= 2024 ? [`${year}-${BLACK_CONSCIOUSNESS}`] : []),
      shift(e, -48), // Carnival Monday
      shift(e, -47), // Carnival Tuesday
      shift(e, -2), // Good Friday
      shift(e, 60), // Corpus Christi
    ])
    cache.set(year, days)
  }
  return days
}

/** A weekday that isn't a national bank holiday. */
export function isBusinessDay(iso: string): boolean {
  const weekday = new Date(`${iso}T12:00:00Z`).getUTCDay()
  return weekday !== 0 && weekday !== 6 && !bankHolidays(Number(iso.slice(0, 4))).has(iso)
}

/** The day itself when it's a business day, else the business day before it. */
export function businessDayOnOrBefore(iso: string): string {
  let d = iso
  while (!isBusinessDay(d)) d = shift(d, -1)
  return d
}
