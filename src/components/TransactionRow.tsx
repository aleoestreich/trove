import type { Transaction } from '../data/types'
import { useData } from '../state'
import { Amount } from './ui'
import { CategoryLabel, TransactionBadge } from './CategoryBadge'
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
 * What a transaction is filed under, as one line: "Category › Subcategory" in
 * the category's colour, "Uncategorized · tap to choose" in the accent colour,
 * or the kind of transfer in muted text. `compact`: just "Uncategorized".
 */
export function CategoryLine({ tx, compact = false }: { tx: Transaction; compact?: boolean }) {
  const { categoriesById, subcategoriesById } = useData()
  const { t, categoryName } = useI18n()
  if (tx.transfer)
    return (
      <span className="truncate text-[13px] leading-[18px] text-muted">
        {tx.transfer === 'card-payment' ? t.transactions.cardPaymentRow : t.transactions.transferRow}
      </span>
    )
  const category = tx.categoryId ? categoriesById.get(tx.categoryId) : undefined
  if (!category)
    return (
      <span className="truncate text-[13px] leading-[18px] font-medium text-accent">
        {compact ? t.transactions.uncategorized : t.transactions.uncategorizedTap}
      </span>
    )
  const sub = tx.subcategoryId ? subcategoriesById.get(tx.subcategoryId) : undefined
  return <CategoryLabel category={category} subcategory={sub} name={categoryName(category)} />
}

/**
 * Category badge; description, "Category › Subcategory", and "account · 3/10";
 * the amount. `showDate` adds the date to the last line (lists that aren't
 * grouped by day).
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

  return (
    <button
      type="button"
      onClick={() => onSelect?.(tx)}
      className={`flex min-h-[72px] w-full items-center gap-3 py-2.5 text-left active:bg-track ${className}`}
    >
      <TransactionBadge tx={tx} categoriesById={categoriesById} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] leading-5 font-medium text-ink">{tx.description}</span>
        <CategoryLine tx={tx} />
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
        </span>
      </span>
      <Amount cents={tx.amount} foreign={tx.foreign} transfer={!!tx.transfer} />
    </button>
  )
}
