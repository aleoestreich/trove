import type { Transaction } from '../data/types'
import { useData } from '../state'
import { Amount, InstitutionBadge } from './ui'

export function TransactionRow({ tx, onSelect }: { tx: Transaction; onSelect?(tx: Transaction): void }) {
  const { accountsById, institutionsById, categoriesById } = useData()
  const account = accountsById.get(tx.accountId)!
  const institution = institutionsById.get(account.institutionId)!
  const category = categoriesById.get(tx.categoryId)
  const isCard = account.type === 'CREDIT'

  return (
    <button
      type="button"
      onClick={() => onSelect?.(tx)}
      className="flex w-full items-center gap-3 px-1 py-3 text-left active:bg-track"
    >
      <InstitutionBadge institution={institution} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium">{tx.description}</span>
          {tx.installment && (
            <span className="shrink-0 rounded bg-track px-1.5 text-xs text-ink-2 tabular">
              {tx.installment.number}/{tx.installment.total}
            </span>
          )}
          {tx.status === 'PENDING' && <span className="shrink-0 rounded bg-track px-1.5 text-xs text-ink-2">Pending</span>}
        </span>
        <span className="block truncate text-xs text-muted">
          {category?.name} · {institution.name} {isCard ? 'card' : account.foreign ? account.foreign.currency : ''}
        </span>
      </span>
      <Amount cents={tx.amount} foreign={tx.foreign} muted={category?.kind === 'transfer'} />
    </button>
  )
}
