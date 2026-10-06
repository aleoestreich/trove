import type { Transaction } from '../data/types'
import { useData } from '../state'
import { Amount, IconDisc } from './ui'
import { categoryIcon } from './Icon'
import { formatShortDate } from '../lib/dates'
import { useI18n } from '../i18n/I18nProvider'

/** Account label for a row: "Nubank card", "Itaú", "Wise USD". */
export function useAccountLabel() {
  const { accountsById, institutionsById } = useData()
  const { t } = useI18n()
  return (accountId: string) => {
    const account = accountsById.get(accountId)!
    const institution = institutionsById.get(account.institutionId)!
    if (account.type === 'CREDIT') return t.cardOf(institution.name)
    return `${institution.name}${account.foreign ? ` ${account.foreign.currency}` : ''}`
  }
}

/**
 * Category icon, description, "account · 3/10" and the amount. `showDate`
 * adds the date to the second line (lists that aren't grouped by day).
 */
export function TransactionRow({
  tx,
  onSelect,
  showDate = false,
  className = '',
}: {
  tx: Transaction
  onSelect?(tx: Transaction): void
  showDate?: boolean
  className?: string
}) {
  const { categoriesById } = useData()
  const { t } = useI18n()
  const accountLabel = useAccountLabel()
  const category = categoriesById.get(tx.categoryId)

  return (
    <button
      type="button"
      onClick={() => onSelect?.(tx)}
      className={`flex min-h-16 w-full items-center gap-3 py-2.5 text-left active:bg-track ${className}`}
    >
      <IconDisc icon={categoryIcon(tx.categoryId)} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] leading-5 font-medium text-ink">{tx.description}</span>
        <span className="truncate text-[13px] leading-[18px] text-muted">
          {accountLabel(tx.accountId)}
          {showDate && ` · ${formatShortDate(tx.date)}`}
          {tx.installment && (
            <>
              {' · '}
              <span className="tabular font-medium text-ink-2">
                {tx.installment.number}/{tx.installment.total}
              </span>
            </>
          )}
          {tx.status === 'PENDING' && ` · ${t.pending}`}
          {tx.ignored && ` · ${t.transactions.ignored}`}
        </span>
      </span>
      <Amount cents={tx.amount} foreign={tx.foreign} transfer={category?.kind === 'transfer'} ignored={tx.ignored} />
    </button>
  )
}
