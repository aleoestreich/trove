import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useData } from '../state'
import { MONTHS_OF_HISTORY } from '../data/seed'
import type { CategoryKind, Transaction } from '../data/types'
import { formatDayHeading, formatMonth, lastMonths, monthKey, toISO } from '../lib/dates'
import { formatMoney } from '../lib/money'
import { totals } from '../lib/summary'
import { Icon, categoryIcon } from '../components/Icon'
import { Amount, Button, EmptyState, IconDisc, PageHeader } from '../components/ui'
import { TransactionRow, useAccountLabel } from '../components/TransactionRow'
import { TransactionPanel, TransactionSheet } from '../components/TransactionSheet'
import { useI18n } from '../i18n/I18nProvider'
import { useIsDesktop } from '../lib/useIsDesktop'

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

/**
 * A filter chip: looks like a 36px pill, but a transparent native <select>
 * covers the whole 48px-tall target, so the phone's own picker opens.
 */
function FilterChip({
  label,
  applied,
  value,
  onChange,
  children,
}: {
  label: string
  applied: boolean
  value: string
  onChange(value: string): void
  children: ReactNode
}) {
  return (
    <label className="relative flex h-12 shrink-0 items-center lg:h-11">
      <span
        className={`inline-flex h-9 items-center gap-1 rounded-full border pr-2.5 pl-3.5 text-sm font-medium whitespace-nowrap lg:h-11 lg:pr-3 lg:pl-4 ${
          applied ? 'border-transparent bg-accent-soft text-accent' : 'border-line bg-surface text-ink-2'
        }`}
      >
        {label}
        <Icon name="chevronDown" className="size-4" strokeWidth={2} />
      </span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
        {children}
      </select>
    </label>
  )
}

export function Transactions() {
  const { transactions, accounts, institutionsById, categories, categoriesById } = useData()
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState<Transaction | null>(null)
  const { t, categoryName, locale } = useI18n()
  const desktop = useIsDesktop()

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

  // Grouped by day, each with its net (transfers excluded). `locale`: headings are formatted text.
  const byDate = useMemo(() => {
    const groups = new Map<string, Transaction[]>()
    for (const tx of filtered) groups.set(tx.date, [...(groups.get(tx.date) ?? []), tx])
    return [...groups].map(([date, txs]) => ({ date, label: formatDayHeading(date), txs, net: totals(txs, categoriesById).net }))
  }, [filtered, categoriesById, locale])

  const hasFilters = params.has('a') || params.has('c') || params.has('type') || params.has('q')
  const clear = () => setParams(params.has('m') ? { m: params.get('m')! } : {}, { replace: true })

  const monthValue = params.get('m') ?? latest
  const monthLabel = filters.month ? formatMonth(filters.month) : t.transactions.allMonths
  const kindLabel = { expense: t.expenses, income: t.income, transfer: t.transfers }
  const account = filters.accountId ? accounts.find((a) => a.id === filters.accountId) : undefined
  const category = filters.categoryId ? categoriesById.get(filters.categoryId) : undefined

  const countText = t.transactions.count(filtered.length, filters.month ? formatMonth(filters.month) : null)
  const empty = (
    <EmptyState
      icon="search"
      title={t.transactions.emptyTitle}
      action={
        hasFilters && (
          <Button variant="secondary" onClick={clear}>
            {t.transactions.clearFilters}
          </Button>
        )
      }
    >
      {t.transactions.emptyBody(filters.month ? formatMonth(filters.month) : null)}
    </EmptyState>
  )

  return (
    <>
      <PageHeader title={t.nav.transactions} subtitle={countText} />
      <div className="-mx-4 flex flex-col gap-1 lg:mx-0 lg:gap-4">
        <div className="flex flex-col gap-1 lg:flex-row lg:flex-wrap lg:items-center lg:gap-3">
          <div className="px-4 lg:w-[340px] lg:px-0">
            <label className="flex h-12 items-center gap-2.5 rounded-md border border-line bg-surface px-3.5 text-muted focus-within:border-accent lg:h-11 lg:rounded-sm">
              <Icon name="search" className="size-5 shrink-0 lg:size-[18px]" />
              <input
                type="search"
                placeholder={t.transactions.search}
                aria-label={t.transactions.search}
                value={filters.query ?? ''}
                onChange={(e) => set('q', e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted lg:text-sm"
              />
            </label>
          </div>

          {/* Filters: one horizontally scrollable row on phones */}
          <div className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:flex-wrap lg:gap-3 lg:overflow-visible lg:px-0">
            <FilterChip label={monthLabel} applied value={monthValue} onChange={(v) => set('m', v)}>
              {lastMonths(latest, MONTHS_OF_HISTORY)
                .reverse()
                .map((m) => (
                  <option key={m} value={m}>
                    {formatMonth(m)}
                  </option>
                ))}
              <option value="all">{t.transactions.allMonths}</option>
            </FilterChip>
            <FilterChip label={filters.kind ? kindLabel[filters.kind] : t.transactions.type} applied={!!filters.kind} value={filters.kind ?? ''} onChange={(v) => set('type', v)}>
              <option value="">{t.transactions.allTypes}</option>
              <option value="expense">{t.expenses}</option>
              <option value="income">{t.income}</option>
              <option value="transfer">{t.transfers}</option>
            </FilterChip>
            <FilterChip
              label={account ? `${institutionsById.get(account.institutionId)!.name} · ${account.name}` : t.transactions.account}
              applied={!!account}
              value={filters.accountId ?? ''}
              onChange={(v) => set('a', v)}
            >
              <option value="">{t.transactions.allAccounts}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {institutionsById.get(a.institutionId)!.name} · {a.name}
                </option>
              ))}
            </FilterChip>
            <FilterChip label={category ? categoryName(category) : t.category} applied={!!category} value={filters.categoryId ?? ''} onChange={(v) => set('c', v)}>
              <option value="">{t.transactions.allCategories}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryName(c)}
                </option>
              ))}
            </FilterChip>
            {hasFilters && (
              <button type="button" className="h-12 shrink-0 px-2 text-sm font-medium text-accent lg:h-11" onClick={clear}>
                {t.transactions.clear}
              </button>
            )}
          </div>
        </div>

        {desktop ? (
          <div className="flex items-start gap-5">
            <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-line bg-surface">
              {byDate.length === 0 ? empty : <TransactionTable days={byDate} selectedId={selected?.id} onSelect={setSelected} narrow={!!selected} />}
            </div>
            {selected && <TransactionPanel tx={selected} onClose={() => setSelected(null)} />}
          </div>
        ) : byDate.length === 0 ? (
          empty
        ) : (
          <>
            <p className="px-4 pb-2 text-[13px] leading-[18px] text-muted">{countText}</p>
            <div className="flex flex-col gap-4 px-4">
              {byDate.map((day) => (
                <section key={day.date} className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between px-1">
                    <h2 className="text-[13px] leading-[18px] font-medium text-ink-2">{day.label}</h2>
                    <DayTotal net={day.net} />
                  </div>
                  <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                    {day.txs.map((tx) => (
                      <TransactionRow key={tx.id} tx={tx} onSelect={setSelected} className="px-4" />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}

        {!desktop && selected && <TransactionSheet tx={selected} onClose={() => setSelected(null)} />}
      </div>
    </>
  )
}

function DayTotal({ net }: { net: number }) {
  if (net === 0) return null
  return (
    <span className={`tabular text-[13px] leading-[18px] font-medium ${net > 0 ? 'text-income' : 'text-ink-2'}`}>
      {formatMoney(net, 'BRL', { signed: true })}
    </span>
  )
}

/**
 * With the details panel open, screens under 1280px drop the Account and
 * Category columns (the panel shows both) so descriptions keep their room.
 */
const columnsFor = (narrow: boolean) =>
  `grid gap-4 px-5 ${narrow ? 'grid-cols-[minmax(0,1fr)_130px] xl:grid-cols-[minmax(0,1fr)_150px_150px_130px]' : 'grid-cols-[minmax(0,1fr)_150px_150px_130px]'}`

/** Desktop: one table, day bands between the rows. The selected row is highlighted. */
function TransactionTable({
  days,
  selectedId,
  onSelect,
  narrow,
}: {
  days: { date: string; label: string; txs: Transaction[]; net: number }[]
  selectedId?: string
  onSelect(tx: Transaction): void
  narrow: boolean
}) {
  const columns = columnsFor(narrow)
  const optional = narrow ? 'hidden xl:block' : ''
  const { categoriesById } = useData()
  const { t, categoryName } = useI18n()
  const accountLabel = useAccountLabel()
  return (
    <div role="table" aria-label={t.nav.transactions}>
      <div role="row" className={`${columns} label-caps border-b border-line py-3`}>
        <span role="columnheader">{t.transactions.colDescription}</span>
        <span role="columnheader" className={optional}>
          {t.transactions.account}
        </span>
        <span role="columnheader" className={optional}>
          {t.category}
        </span>
        <span role="columnheader" className="text-right">
          {t.transactions.colAmount}
        </span>
      </div>
      {days.map((day) => (
        <div key={day.date} role="rowgroup">
          <div role="row" className="flex justify-between border-b border-line bg-page px-5 py-2.5">
            <span role="rowheader" className="text-[13px] font-medium text-ink-2">
              {day.label}
            </span>
            <DayTotal net={day.net} />
          </div>
          {day.txs.map((tx) => {
            const category = categoriesById.get(tx.categoryId)
            const on = tx.id === selectedId
            return (
              <button
                key={tx.id}
                type="button"
                role="row"
                aria-selected={on}
                onClick={() => onSelect(tx)}
                className={`${columns} min-h-14 w-full items-center border-b border-line py-2 text-left ${on ? 'bg-accent-faint' : 'hover:bg-page'}`}
              >
                <span role="cell" className="flex min-w-0 items-center gap-3">
                  <IconDisc icon={categoryIcon(tx.categoryId)} size="sm" />
                  <span className="min-w-0 truncate text-sm font-medium text-ink">{tx.description}</span>
                  {tx.installment && (
                    <span className="tabular inline-flex h-[22px] shrink-0 items-center rounded-full bg-track px-[7px] text-xs font-medium text-ink-2">
                      {tx.installment.number}/{tx.installment.total}
                    </span>
                  )}
                  {tx.status === 'PENDING' && <span className="min-w-0 shrink-[2] truncate text-xs text-muted">{t.pending}</span>}
                </span>
                <span role="cell" className={`truncate text-[13px] text-ink-2 ${optional}`}>
                  {accountLabel(tx.accountId)}
                </span>
                <span role="cell" className={`truncate text-[13px] text-ink-2 ${optional}`}>
                  {categoryName(category)}
                </span>
                <span role="cell">
                  <Amount cents={tx.amount} foreign={tx.foreign} transfer={category?.kind === 'transfer'} className="[&>span:first-child]:text-sm" />
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
