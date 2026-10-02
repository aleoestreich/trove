import type { AccountType } from '../lib/accountType'

/** 24×24 line icons from the Trove icon set (ui/checking.svg, savings.svg, usd-balance.svg, card.svg). */
const PATHS: Record<AccountType, string> = {
  checking: 'M3 9.5L12 4l9 5.5 M5 10v8 M9.7 10v8 M14.3 10v8 M19 10v8 M3 20.5h18',
  savings: 'M4 5h16v13H4Z M7 18v2 M17 18v2 M9 11.5a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M12 11.5h3',
  usd: 'M12 3v18 M16.5 7.6c-.7-1.3-2.3-2.1-4.5-2.1-2.6 0-4.3 1.2-4.3 3.1 0 4.1 8.8 2.3 8.8 6.5 0 1.9-1.8 3.2-4.6 3.2-2.3 0-4.1-.9-4.9-2.5',
  card: 'M3 6h18v12H3Z M3 10h18 M7 15h3',
}

/** The account kind's icon at 18×18, in the text colour. Decorative: the label is next to it. */
export function AccountTypeIcon({ type }: { type: AccountType }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d={PATHS[type]} />
    </svg>
  )
}

/** Icon then label: 14px, ink-2, 8px apart. Used for every account on Accounts. */
export function AccountTypeLabel({ type, label }: { type: AccountType; label: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-sm leading-5 text-ink-2">
      <AccountTypeIcon type={type} />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  )
}
