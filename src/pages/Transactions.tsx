import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useData } from '../state'
import { MONTHS_OF_HISTORY } from '../data/seed'
import type { CategoryKind, Transaction } from '../data/types'
import { formatDay, formatMonth, lastMonths, monthKey, toISO } from '../lib/dates'
import { formatMoney } from '../lib/money'
import { totals } from '../lib/summary'
import { Icon } from '../components/Icon'
import { TransactionRow } from '../components/TransactionRow'
import { TransactionSheet } from '../components/TransactionSheet'
import { useI18n } from '../i18n/I18nProvider'

export interface TransactionFilters {
  month?: string
  accountId?: string
  categoryId?: string
  kind?: CategoryKind
  query?: string
}

export function filterTransactions(
  transactions: Transaction[],
  kindOf: (categoryId: string) => CategoryKind | undefined,
  f: TransactionFilters,
): Transaction[] {
  const q = f.query?.trim().toLowerCase()
  return transactions.filter(
    (t) =>
      (!f.month || monthKey(t.date) === f.month) &&
      (!f.accountId || t.accountId === f.accountId) &&
      (!f.categoryId || t.categoryId === f.categoryId) &&
      (!f.kind || kindOf(t.categoryId) === f.kind) &&
      (!q || t.description.toLowerCase().includes(q)),
  )
}

const selectCls = 'h-10 shrink-0 rounded-full bg-surface px-3 text-sm ring-1 ring-line'

export function Transactions() {
  const { transactions, accounts, institutionsById, categories, categoriesById } = useData()
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState<Transaction | null>(null)
  const { t, categoryName } = useI18n()

  const latest = monthKey(toISO(new Date()))
  const filters: TransactionFilters = {
    month: params.get('m') === 'all' ? undefined : (params.get('m') ?? latest),
    accountId: params.get('a') ?? undefined,
    categoryId: params.get('c') ?? undefined,
    kind: (params.get('type') as CategoryKind | null) ?? undefined,
    query: params.get('q') ?? undefined,
  }

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const filtered = useMemo(
    () => filterTransactions(transactions, (id) => categoriesById.get(id)?.kind, filters),
    [transactions, categoriesById, params],
  )
  const sums = totals(filtered, categoriesById)

  const byDate = useMemo(() => {
    const groups = new Map<string, Transaction[]>()
    for (const tx of filtered) groups.set(tx.date, [...(groups.get(tx.date) ?? []), tx])
    return [...groups]
  }, [filtered])

  const hasFilters = params.has('a') || params.has('c') || params.has('type') || params.has('q')

  return (
    <div className="space-y-3">
      <label className="flex h-11 items-center gap-2 rounded-full bg-surface px-4 ring-1 ring-line">
        <Icon name="search" className="size-5 text-muted" />
        <input
          type="search"
          placeholder={t.transactions.search}
          value={filters.query ?? ''}
          onChange={(e) => set('q', e.target.value)}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
        />
      </label>

      {/* Filters: one horizontally scrollable row on phones */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <select aria-label={t.transactions.month} className={selectCls} value={params.get('m') ?? latest} onChange={(e) => set('m', e.target.value)}>
          {lastMonths(latest, MONTHS_OF_HISTORY)
            .reverse()
            .map((m) => (
              <option key={m} value={m}>
                {formatMonth(m)}
              </option>
            ))}
          <option value="all">{t.transactions.allMonths}</option>
        </select>
        <select aria-label={t.transactions.type} className={selectCls} value={filters.kind ?? ''} onChange={(e) => set('type', e.target.value)}>
          <option value="">{t.transactions.allTypes}</option>
          <option value="expense">{t.expenses}</option>
          <option value="income">{t.income}</option>
          <option value="transfer">{t.transfers}</option>
        </select>
        <select aria-label={t.transactions.account} className={selectCls} value={filters.accountId ?? ''} onChange={(e) => set('a', e.target.value)}>
          <option value="">{t.transactions.allAccounts}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {institutionsById.get(a.institutionId)!.name} · {a.name}
            </option>
          ))}
        </select>
        <select aria-label={t.category} className={selectCls} value={filters.categoryId ?? ''} onChange={(e) => set('c', e.target.value)}>
          <option value="">{t.transactions.allCategories}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {categoryName(c)}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            className="h-10 shrink-0 rounded-full px-3 text-sm text-accent"
            onClick={() => setParams(params.has('m') ? { m: params.get('m')! } : {}, { replace: true })}
          >
            {t.transactions.clear}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-2xl bg-surface p-3 ring-1 ring-line">
          <p className="text-xs text-muted">{t.income}</p>
          <p className="tabular font-semibold text-income">{formatMoney(sums.income)}</p>
        </div>
        <div className="rounded-2xl bg-surface p-3 ring-1 ring-line">
          <p className="text-xs text-muted">{t.expenses}</p>
          <p className="tabular font-semibold">{formatMoney(sums.expenses)}</p>
        </div>
      </div>

      {byDate.length === 0 && <p className="py-8 text-center text-sm text-muted">{t.transactions.noMatch}</p>}

      {byDate.map(([date, txs]) => (
        <section key={date}>
          <h3 className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 bg-page py-1.5 text-xs font-semibold text-muted uppercase">
            {formatDay(date)}
          </h3>
          <div className="divide-y divide-line rounded-2xl bg-surface px-3 ring-1 ring-line">
            {txs.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} onSelect={setSelected} />
            ))}
          </div>
        </section>
      ))}

      {selected && <TransactionSheet tx={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
