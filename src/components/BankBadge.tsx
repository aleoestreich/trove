import type { CSSProperties } from 'react'
import { Icon, type IconName } from './Icon'
import type { Institution } from '../data/types'

export type Bank = 'nubank' | 'itau' | 'santander' | 'wise'
export type BankBadgeSize = 32 | 36 | 40

/** Each bank's colour token (src/index.css). */
const TOKEN: Record<Bank, string> = {
  nubank: '--series-4',
  itau: '--series-2',
  santander: '--series-5',
  wise: '--series-3',
}

/** The bank's outline glyph from the icon pack (ui/bank-*.svg). */
const GLYPH: Record<Bank, IconName> = { nubank: 'bankNubank', itau: 'bankItau', santander: 'bankSantander', wise: 'bankWise' }

/**
 * A chart colour per institution, matching its badge: known banks use their
 * token; the others take the remaining series slots in order (series-1, -6…).
 */
export function bankColors(institutions: Institution[]): Map<string, string> {
  const used = new Set(Object.values(TOKEN))
  const free = ['--series-1', '--series-6', '--series-4', '--series-2', '--series-5', '--series-3'].filter((t) => !used.has(t))
  let next = 0
  const out = new Map<string, string>()
  for (const inst of institutions) {
    const bank = bankFor(inst.name)
    // Unknown banks beyond the free slots reuse them in order.
    const token = bank ? TOKEN[bank] : free[next++ % free.length]
    out.set(inst.id, `var(${token})`)
  }
  return out
}

/** The bank for an institution name ("Itaú" → "itau"), or null when there's no logo for it. */
export function bankFor(name: string): Bank | null {
  const key = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
  return key in TOKEN ? (key as Bank) : null
}

function boxStyle(size: BankBadgeSize, token: string): CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: 12,
    boxSizing: 'border-box',
    border: `1.5px solid color-mix(in srgb, var(${token}) 45%, transparent)`,
    background: `color-mix(in srgb, var(${token}) 8%, transparent)`,
  }
}

const inkOf = (token: string) => `color-mix(in srgb, var(${token}) 72%, var(--ink))`

/**
 * A bank's outline glyph in a rounded square (radius 12): a 1.5px border in
 * the bank's colour at 45% and an 8% tint. Trove's own glyphs, not the
 * official logos; they follow light and dark mode. Decorative: the bank name
 * is always next to it.
 */
export function BankBadge({ bank, size = 40 }: { bank: Bank; size?: BankBadgeSize }) {
  const token = TOKEN[bank]
  const glyph = size === 32 ? 'size-[18px]' : 'size-5'
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center" style={{ ...boxStyle(size, token), color: inkOf(token) }}>
      <Icon name={GLYPH[bank]} className={glyph} strokeWidth={1.9} />
    </span>
  )
}

/**
 * Badge for any institution: the bank's logo when Trove has one, otherwise
 * its first two letters in the same rounded square, in a neutral tone.
 * Rounded squares are for banks only; category icons stay circles.
 */
export function InstitutionBadge({ institution, size = 40 }: { institution: Institution; size?: BankBadgeSize }) {
  const bank = bankFor(institution.name)
  if (bank) return <BankBadge bank={bank} size={size} />
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center font-bold"
      style={{ ...boxStyle(size, '--muted'), color: inkOf('--muted'), fontSize: size === 40 ? 14 : 13 }}
    >
      {institution.name.slice(0, 2)}
    </span>
  )
}
