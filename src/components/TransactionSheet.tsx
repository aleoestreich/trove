import { useEffect } from 'react'
import type { Transaction } from '../data/types'
import { useData } from '../state'
import { formatDay } from '../lib/dates'
import { formatMoney, formatRate } from '../lib/money'
import { Icon } from './Icon'

/** Bottom sheet with transaction details; lets you change the category. */
export function TransactionSheet({ tx, onClose }: { tx: Transaction; onClose(): void }) {
  const { accountsById, institutionsById, categories, categoriesById, setCategory, transactions } = useData()
  const current = transactions.find((t) => t.id === tx.id) ?? tx
  const account = accountsById.get(current.accountId)!
  const institution = institutionsById.get(account.institutionId)!

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const groups = (['expense', 'income', 'transfer'] as const).map((kind) => ({
    kind,
    label: kind === 'expense' ? 'Expenses' : kind === 'income' ? 'Income' : 'Transfers',
    items: categories.filter((c) => c.kind === kind),
  }))

  const rate = current.foreign ? Math.abs(current.amount / current.foreign.amount) : null

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label="Transaction details"
        className="w-full max-w-md rounded-t-3xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted">{formatDay(current.date)} · {institution.name} · {account.name}</p>
            <h3 className="text-lg font-semibold">{current.description}</h3>
          </div>
          <button onClick={onClose} className="-m-2 p-2 text-muted" aria-label="Close">
            <Icon name="close" />
          </button>
        </div>

        <p className={`tabular text-3xl font-semibold ${current.amount > 0 ? 'text-income' : ''}`}>
          {formatMoney(current.amount, 'BRL', { signed: true })}
        </p>
        {current.foreign && rate && (
          <p className="tabular mt-1 text-sm text-ink-2">
            {formatMoney(current.foreign.amount, current.foreign.currency, { signed: true })} at R$ {formatRate(rate)} per{' '}
            {current.foreign.currency}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-ink-2">
          {current.installment && (
            <span className="rounded bg-track px-2 py-0.5">
              Installment {current.installment.number} of {current.installment.total}
            </span>
          )}
          {current.status === 'PENDING' && <span className="rounded bg-track px-2 py-0.5">Pending</span>}
        </div>

        <label className="mt-5 block text-sm font-medium text-ink-2" htmlFor="category">
          Category
        </label>
        <select
          id="category"
          value={current.categoryId}
          onChange={(e) => setCategory(current.id, e.target.value)}
          className="mt-1 h-12 w-full rounded-xl bg-page px-3 ring-1 ring-line"
        >
          {groups.map((g) => (
            <optgroup key={g.kind} label={g.label}>
              {g.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {categoriesById.get(current.categoryId)?.kind === 'transfer' && (
          <p className="mt-2 text-xs text-muted">Transfers aren't counted as income or expenses.</p>
        )}
      </div>
    </div>
  )
}
