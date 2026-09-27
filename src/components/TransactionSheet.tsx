import { useEffect } from 'react'
import type { Transaction } from '../data/types'
import { useData } from '../state'
import { formatDay, formatShortDate } from '../lib/dates'
import { formatMoney, formatRate } from '../lib/money'
import { Icon } from './Icon'
import { useI18n } from '../i18n/I18nProvider'

/** Bottom sheet with transaction details; lets you change the category. */
export function TransactionSheet({ tx, onClose }: { tx: Transaction; onClose(): void }) {
  const { accountsById, institutionsById, categories, categoriesById, setCategory, transactions } = useData()
  const { t, categoryName } = useI18n()
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
    label: kind === 'expense' ? t.expenses : kind === 'income' ? t.income : t.transfers,
    items: categories.filter((c) => c.kind === kind),
  }))

  const rate = current.foreign ? Math.abs(current.amount / current.foreign.amount) : null

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={t.transactions.details}
        className="w-full max-w-md rounded-t-3xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted">{formatDay(current.date)} · {institution.name} · {account.name}</p>
            <h3 className="text-lg font-semibold">{current.description}</h3>
          </div>
          <button onClick={onClose} className="-m-2 p-2 text-muted" aria-label={t.close}>
            <Icon name="close" />
          </button>
        </div>

        <p className={`tabular text-3xl font-semibold ${current.amount > 0 ? 'text-income' : ''}`}>
          {formatMoney(current.amount, 'BRL', { signed: true })}
        </p>
        {current.foreign && rate && (
          <p className="tabular mt-1 text-sm text-ink-2">
            {t.transactions.foreignAt(
              formatMoney(current.foreign.amount, current.foreign.currency, { signed: true }),
              formatRate(rate),
              current.foreign.currency,
            )}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-ink-2">
          {current.installment && (
            <span className="rounded bg-track px-2 py-0.5">
              {t.transactions.installmentOf(
                current.installment.number,
                current.installment.total,
                formatMoney(current.installment.totalAmount),
                formatShortDate(current.installment.purchaseDate),
              )}
            </span>
          )}
          {current.status === 'PENDING' && <span className="rounded bg-track px-2 py-0.5">{t.pending}</span>}
        </div>

        <label className="mt-5 block text-sm font-medium text-ink-2" htmlFor="category">
          {t.category}
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
                  {categoryName(c)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {categoriesById.get(current.categoryId)?.kind === 'transfer' && (
          <p className="mt-2 text-xs text-muted">{t.transactions.transferNote}</p>
        )}
      </div>
    </div>
  )
}
