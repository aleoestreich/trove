import { useEffect, useState, type CSSProperties } from 'react'
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

/** Line icons used when the logo file can't be loaded (24×24, stroked). */
const FALLBACK: Record<Bank, string> = {
  nubank: 'M7.5 18V6l9 12V6',
  itau: 'M9 6h6 M12 6v12 M9 18h6',
  santander: 'M16.4 8.2c-.7-1.4-2.3-2.4-4.4-2.4-2.5 0-4.2 1.3-4.2 3.1 0 4.1 8.6 2.3 8.6 6.4 0 1.9-1.8 3.1-4.4 3.1-2.2 0-3.9-1-4.6-2.5',
  wise: 'M4.5 6.5l3.2 11 4.3-8.5 4.3 8.5 3.2-11',
}

/**
 * Logo size as a share of the badge. Itaú's logo is a filled square with the
 * lettering cut out, which gets hard to read at 32px, so it's drawn larger.
 * Nubank's "nu" is wide and short (about 24×13 in a 24×24 file), so at the
 * same size it looked smaller than the squarer logos; 68% evens them out.
 */
const LOGO_SCALE: Record<Bank, number> = { nubank: 0.68, itau: 0.64, santander: 0.58, wise: 0.58 }

const logoUrl = (bank: Bank) => `/banks/${bank}.svg`

/** Whether each logo file loads, checked once per page load. */
const logoStatus = new Map<Bank, 'ok' | 'missing'>()
const logoChecks = new Map<Bank, Promise<'ok' | 'missing'>>()

function checkLogo(bank: Bank): Promise<'ok' | 'missing'> {
  let check = logoChecks.get(bank)
  if (!check) {
    check = new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve('ok')
      img.onerror = () => resolve('missing')
      img.src = logoUrl(bank)
    }).then((status) => {
      logoStatus.set(bank, status as 'ok' | 'missing')
      return status as 'ok' | 'missing'
    })
    logoChecks.set(bank, check)
  }
  return check
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
    borderRadius: size === 32 ? 10 : 12,
    boxSizing: 'border-box',
    border: `1.5px solid color-mix(in srgb, var(${token}) 45%, transparent)`,
    background: `color-mix(in srgb, var(${token}) 8%, transparent)`,
  }
}

const inkOf = (token: string) => `color-mix(in srgb, var(${token}) 72%, var(--ink))`

/**
 * A bank's logo in a rounded square tinted with its colour token. The logo
 * file (public/banks/<bank>.svg) is used as a mask, so it shows as one flat
 * colour that follows light and dark mode. If the file can't be loaded, a
 * line icon is shown instead. Decorative: the bank name is always next to it.
 */
export function BankBadge({ bank, size = 40 }: { bank: Bank; size?: BankBadgeSize }) {
  const token = TOKEN[bank]
  const [status, setStatus] = useState(() => logoStatus.get(bank) ?? null)

  useEffect(() => {
    let live = true
    void checkLogo(bank).then((s) => live && setStatus(s))
    return () => {
      live = false
    }
  }, [bank])

  const inner = Math.round(size * LOGO_SCALE[bank])
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center" style={boxStyle(size, token)}>
      {status === 'ok' && (
        <span
          style={{
            width: inner,
            height: inner,
            background: inkOf(token),
            WebkitMask: `url(${logoUrl(bank)}) center / contain no-repeat`,
            mask: `url(${logoUrl(bank)}) center / contain no-repeat`,
          }}
        />
      )}
      {status === 'missing' && (
        <svg
          viewBox="0 0 24 24"
          width={inner}
          height={inner}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: inkOf(token) }}
        >
          <path d={FALLBACK[bank]} />
        </svg>
      )}
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
