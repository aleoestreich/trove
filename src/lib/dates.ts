/** Dates are handled as ISO strings (yyyy-mm-dd) in local time; no time zones. */
import { LOCALE } from '../i18n/locale'

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

/** The same day `months` months later (overflowing days clamp). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return dayOfMonth(new Date(y, m - 1, 1), months, d)
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

// Display formats are pt-BR (see i18n/locale).
const formatters = new Map<string, Intl.DateTimeFormat>()

function fmt(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options)
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE, options)
    formatters.set(key, f)
  }
  return f
}

function parse(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d ?? 1)
}

/** Compact date: "01/10". "—" when the date is unknown (null). */
export function formatShortDate(iso: string | null): string {
  if (!iso) return '—'
  return fmt({ day: '2-digit', month: '2-digit' }).format(parse(iso))
}

/** "Setembro de 2026" */
export function formatMonth(key: string): string {
  const s = fmt({ month: 'long', year: 'numeric' }).format(parse(key))
  return s[0].toUpperCase() + s.slice(1)
}

/** "set." */
export function formatMonthShort(key: string): string {
  return fmt({ month: 'short' }).format(parse(key))
}

/** "12 set." */
export function formatDay(iso: string): string {
  const d = parse(iso)
  return `${d.getDate()} ${fmt({ month: 'short' }).format(d)}`
}

/** "03/2027" */
export function formatMonthYear(key: string): string {
  return `${key.slice(5)}/${key.slice(0, 4)}`
}

/** "qui., 25 de set. de 2026" */
export function formatFullDate(iso: string): string {
  return fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(parse(iso))
}

/** Day heading: "segunda, 28 set." */
export function formatDayHeading(iso: string): string {
  const weekday = fmt({ weekday: 'long' }).format(parse(iso)).replace('-feira', '')
  return `${weekday}, ${formatDay(iso)}`
}

/** "outubro" */
export function formatMonthName(key: string): string {
  return fmt({ month: 'long' }).format(parse(key))
}

/** A moment's time of day, "08:12", in the device's time zone. */
export function formatTime(at: Date): string {
  return new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false }).format(at)
}

/** Whole calendar days between two moments, in the device's time zone (0 = same day). */
export function daysBetween(earlier: Date, later: Date): number {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((day(later) - day(earlier)) / 86_400_000)
}
