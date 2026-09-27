/** Dates are handled as ISO strings (yyyy-mm-dd) in local time; no time zones. */

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Date for `day` of the month `offset` months from `ref` (overflowing days clamp). */
export function dayOfMonth(ref: Date, offset: number, day: number): string {
  const first = new Date(ref.getFullYear(), ref.getMonth() + offset, 1)
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  return toISO(new Date(first.getFullYear(), first.getMonth(), Math.min(day, last)))
}

/** "2026-09" for a given ISO date. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

/** Month keys ending at `endMonth`, oldest first. */
export function lastMonths(endMonth: string, count: number): string[] {
  const [y, m] = endMonth.split('-').map(Number)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(y, m - 1 - (count - 1 - i), 1)
    return toISO(d).slice(0, 7)
  })
}

const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
const monthShortFmt = new Intl.DateTimeFormat('pt-BR', { month: 'short' })
const dayFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })

function parse(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d ?? 1)
}

const shortDateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })

/** "01/10" */
export function formatShortDate(iso: string): string {
  return shortDateFmt.format(parse(iso))
}

/** "Setembro de 2026" */
export function formatMonth(key: string): string {
  const s = monthFmt.format(parse(key))
  return s[0].toUpperCase() + s.slice(1)
}

/** "set." */
export function formatMonthShort(key: string): string {
  return monthShortFmt.format(parse(key))
}

/** "27 de set." */
export function formatDay(iso: string): string {
  return dayFmt.format(parse(iso))
}
