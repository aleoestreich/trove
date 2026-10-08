import type { AccountType } from '../lib/accountType'
import { Icon, type IconName } from './Icon'

/** Icons from the Trove icon set: ui/checking.svg, savings.svg, usd-balance.svg, card.svg. */
const ICONS: Record<AccountType, IconName> = { checking: 'checking', savings: 'savings', usd: 'usdBalance', card: 'card' }

/** The account kind's icon at 18×18, in the text colour. Decorative: the label is next to it. */
export function AccountTypeIcon({ type }: { type: AccountType }) {
  return <Icon name={ICONS[type]} className="size-[18px] shrink-0" />
}

/**
 * Icon then label: 14px, ink-2, 8px apart. Used for every account on
 * Accounts. With a name set in Trove, the label is that name (in ink) and
 * `sub`, what the bank calls the account, goes on the line below.
 */
export function AccountTypeLabel({ type, label, sub }: { type: AccountType; label: string; sub?: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-sm leading-5 text-ink-2">
      <AccountTypeIcon type={type} />
      {sub ? (
        <span className="flex min-w-0 flex-col">
          <span className="min-w-0 truncate text-[15px] text-ink">{label}</span>
          <span className="min-w-0 truncate text-xs leading-4 text-muted">{sub}</span>
        </span>
      ) : (
        <span className="min-w-0 truncate">{label}</span>
      )}
    </span>
  )
}
