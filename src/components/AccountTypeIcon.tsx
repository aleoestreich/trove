import type { AccountType } from '../lib/accountType'
import { Icon, type IconName } from './Icon'

/** Icons from the Trove icon set: ui/checking.svg, savings.svg, usd-balance.svg, card.svg. */
const ICONS: Record<AccountType, IconName> = { checking: 'checking', savings: 'savings', usd: 'usdBalance', card: 'card' }

/** The account kind's icon at 18×18, in the text colour. Decorative: the label is next to it. */
export function AccountTypeIcon({ type }: { type: AccountType }) {
  return <Icon name={ICONS[type]} className="size-[18px] shrink-0" />
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
