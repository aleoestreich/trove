import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router-dom'
import { useData } from '../state'
import { MONTHS_OF_HISTORY } from '../data/seed'
import type { Category, CategoryKind, Transaction } from '../data/types'
import { formatDayHeading, formatMonth, formatShortDate, lastMonths, monthKey, toISO } from '../lib/dates'
import { currentBill, inBill } from '../lib/bills'
import { installmentPlans } from '../lib/installments'
import { formatMoney } from '../lib/money'
import { kindOf, totals } from '../lib/summary'
import { Icon } from '../components/Icon'
import { Amount, Button, EmptyState, PageHeader } from '../components/ui'
import { CategoryLine, TransactionRow, useAccountLabel } from '../components/TransactionRow'
import { TransactionBadge, catVar } from '../components/CategoryBadge'
import { TransactionPanel, TransactionSheet } from '../components/TransactionSheet'
import { BulkPanel, BulkSheet, UndoToast, type Applied } from '../components/BulkCategorize'
import { SelectBox } from '../components/SelectBox'
import { groupState, rangeIds, selectable, selectAllIds, summarize, toggleGroup, type CheckState } from '../lib/selection'
import { useI18n } from '../i18n/I18nProvider'
import { accountLabel } from '../lib/accountLabel'
import { useIsDesktop } from '../lib/useIsDesktop'

export interface TransactionFilters {
  month?: string
  accountId?: string
  /** A category ID, or "none" for uncategorized. */
  categoryId?: string
  kind?: CategoryKind
  query?: string
}

/**
 * Newest day first. Stable, so within a day the order from the data stays
 * (the server sorts same-day transactions by time, latest first).
 */
export const newestFirst = (txs: Transaction[]): Transaction[] => [...txs].sort((a, b) => b.date.localeCompare(a.date))

/** The transactions matching the filters. Hidden ones are left out (they have their own view). */
export function filterTransactions(transactions: Transaction[], categoriesById: Map<string, Category>, f: TransactionFilters): Transaction[] {
  const q = f.query?.trim().toLowerCase()
  return transactions.filter(
    (t) =>
      !t.hidden &&
      (!f.month || monthKey(t.date) === f.month) &&
      (!f.accountId || t.accountId === f.accountId) &&
      (!f.categoryId || (f.categoryId === 'none' ? !t.transfer && !(t.categoryId && categoriesById.has(t.categoryId)) : t.categoryId === f.categoryId)) &&
      (!f.kind || kindOf(t, categoriesById) === f.kind) &&
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

/** The day after an ISO date. */
function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return toISO(new Date(y, m - 1, d + 1))
}

export function Transactions() {
  const { transactions, accounts, institutionsById, categories, categoriesById } = useData()
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState<Transaction | null>(null)
  const { t, categoryName } = useI18n()
  const desktop = useIsDesktop()

  // Bulk selection. Phones enter a selection mode ("Selecionar" or a long
  // press); desktop has a checkbox column and is selecting whenever a row is checked.
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [applied, setApplied] = useState<Applied | null>(null)
  const [flash, setFlash] = useState<Set<string>>(() => new Set())
  const categorizeButton = useRef<HTMLButtonElement>(null)
  const exitSelection = useCallback(() => {
    setSelecting(false)
    setSelectedIds(new Set())
    setBulkOpen(false)
  }, [])
  useBackToExit(selecting && !desktop, exitSelection)
  const toggle = (id: string) =>
    setSelectedIds((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const startSelecting = (tx?: Transaction) => {
    setSelecting(true)
    setSelectedIds(new Set(tx && selectable(tx) ? [tx.id] : []))
  }
  const onApplied = (a: Applied) => {
    exitSelection()
    setApplied(a)
    setFlash(new Set(a.ids))
  }
  const dismissApplied = useCallback(() => setApplied(null), [])
  // The updated rows' tint fades out (flash-accent, 1.5 s).
  useEffect(() => {
    if (flash.size === 0) return
    const timer = setTimeout(() => setFlash(new Set()), 1600)
    return () => clearTimeout(timer)
  }, [flash])
  // Desktop: Esc clears the selection.
  useEffect(() => {
    if (!desktop || selectedIds.size === 0) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelectedIds(new Set())
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [desktop, selectedIds.size])
  // "Selecionar" goes in the app's mobile header.
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null)
  useEffect(() => setHeaderSlot(document.getElementById('header-actions')), [])

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

  // Opened from a card's bill (?bill=<card>): that bill's transactions; type, category and search still apply.
  const plans = useMemo(() => installmentPlans(transactions), [transactions])
  const billCard = params.get('bill') ? accounts.find((a) => a.id === params.get('bill')) : undefined
  const bill = billCard ? currentBill(billCard, transactions, plans) : null
  const filtered = useMemo(() => {
    const shown = !bill || !billCard
      ? filterTransactions(transactions, categoriesById, filters)
      : filterTransactions(transactions.filter((tx) => inBill(tx, billCard.id, bill)), categoriesById, { ...filters, month: undefined, accountId: undefined })
    return newestFirst(shown)
  }, [transactions, categoriesById, params, bill?.closeDate])

  // Grouped by day, each with its net (transfers excluded).
  const byDate = useMemo(() => {
    const groups = new Map<string, Transaction[]>()
    for (const tx of filtered) groups.set(tx.date, [...(groups.get(tx.date) ?? []), tx])
    return [...groups].map(([date, txs]) => ({ date, label: formatDayHeading(date), txs, net: totals(txs, categoriesById).net }))
  }, [filtered, categoriesById])

  // The selection, among the rows shown (the search and filters apply).
  const chosen = useMemo(() => filtered.filter((tx) => selectedIds.has(tx.id)), [filtered, selectedIds])
  const summary = useMemo(() => summarize(chosen, categoriesById), [chosen, categoriesById])
  const mixed = summary.count > 0 && !summary.kind
  // The bulk panel takes the details panel's place.
  useEffect(() => {
    if (chosen.length >= 2) setSelected(null)
  }, [chosen.length])
  const closeSheet = useCallback(() => {
    setBulkOpen(false)
    requestAnimationFrame(() => categorizeButton.current?.focus())
  }, [])

  const hasFilters = params.has('a') || params.has('c') || params.has('type') || params.has('q')
  // Clearing keeps the month, and the bill when one is open.
  const clear = () =>
    setParams(Object.fromEntries(['m', 'bill'].filter((k) => params.has(k)).map((k) => [k, params.get(k)!])), { replace: true })

  const monthValue = params.get('m') ?? latest
  const monthLabel = filters.month ? formatMonth(filters.month) : t.transactions.allMonths
  const kindLabel = { expense: t.expenses, income: t.income, transfer: t.transfers }
  const account = filters.accountId ? accounts.find((a) => a.id === filters.accountId) : undefined
  const category = filters.categoryId && filters.categoryId !== 'none' ? categoriesById.get(filters.categoryId) : undefined
  const hiddenCount = transactions.filter((tx) => tx.hidden).length

  // A bill spans two months: no month in the count or the empty message.
  const shownMonth = bill ? undefined : filters.month
  const countText = t.transactions.count(filtered.length, shownMonth ? formatMonth(shownMonth) : null)
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
      {t.transactions.emptyBody(shownMonth ? formatMonth(shownMonth) : null)}
    </EmptyState>
  )

  return (
    <>
      <PageHeader title={t.nav.transactions} subtitle={countText}>
        {hiddenCount > 0 && <HiddenLink count={hiddenCount} />}
      </PageHeader>
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
            {bill && billCard ? (
              <span className="flex h-12 shrink-0 items-center lg:h-11">
                <span className="inline-flex h-9 items-center gap-1 rounded-full bg-accent-soft pl-3.5 text-sm font-medium whitespace-nowrap text-accent lg:h-11 lg:pl-4">
                  {t.transactions.billChip(bill.closed, formatShortDate(nextDay(bill.fromDate)), formatShortDate(bill.closeDate))}
                  <button
                    type="button"
                    aria-label={t.transactions.billShowAll}
                    title={t.transactions.billShowAll}
                    onClick={() => setParams({ m: 'all', a: billCard.id }, { replace: true })}
                    className="-my-1.5 flex size-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <Icon name="close" className="size-4" strokeWidth={2} />
                  </button>
                </span>
              </span>
            ) : (
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
            )}
            <FilterChip label={filters.kind ? kindLabel[filters.kind] : t.transactions.type} applied={!!filters.kind} value={filters.kind ?? ''} onChange={(v) => set('type', v)}>
              <option value="">{t.transactions.allTypes}</option>
              <option value="expense">{t.expenses}</option>
              <option value="income">{t.income}</option>
              <option value="transfer">{t.transfers}</option>
            </FilterChip>
            {!bill && (
            <FilterChip
              label={account ? (account.nickname ?? `${institutionsById.get(account.institutionId)!.name} · ${accountLabel(account, t)}`) : t.transactions.account}
              applied={!!account}
              value={filters.accountId ?? ''}
              onChange={(v) => set('a', v)}
            >
              <option value="">{t.transactions.allAccounts}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nickname ?? `${institutionsById.get(a.institutionId)!.name} · ${accountLabel(a, t)}`}
                </option>
              ))}
            </FilterChip>
            )}
            <FilterChip
              label={filters.categoryId === 'none' ? t.transactions.uncategorized : category ? categoryName(category) : t.category}
              applied={!!filters.categoryId}
              value={filters.categoryId ?? ''}
              onChange={(v) => set('c', v)}
            >
              <option value="">{t.transactions.allCategories}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryName(c)}
                </option>
              ))}
              <option value="none">{t.transactions.uncategorized}</option>
            </FilterChip>
            {hasFilters && (
              <button type="button" className="h-12 shrink-0 px-2 text-sm font-medium text-accent lg:h-11" onClick={clear}>
                {t.transactions.clear}
              </button>
            )}
          </div>
        </div>

        {bill && billCard && (
          <div className="flex flex-col gap-0.5 px-4 pt-1 pb-2 lg:px-0 lg:pt-0 lg:pb-0">
            <p className="tabular text-sm font-medium text-ink">{t.transactions.billTotal(formatMoney(bill.amount + bill.paid))}</p>
            {bill.paid > 0 && <p className="tabular text-[13px] text-muted">{t.accounts.alreadyPaid(formatMoney(bill.paid))}</p>}
            {bill.expected > 0 && <p className="tabular text-[13px] text-muted">{t.transactions.billExpected(formatMoney(bill.expected))}</p>}
          </div>
        )}

        {desktop ? (
          <div className="flex items-start gap-5">
            <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-line bg-surface">
              {byDate.length === 0 ? (
                empty
              ) : (
                <TransactionTable
                  days={byDate}
                  shown={filtered}
                  selectedId={selected?.id}
                  onSelect={setSelected}
                  narrow={chosen.length >= 2 ? 'bulk' : selected ? 'details' : 'none'}
                  selectedIds={selectedIds}
                  setSelectedIds={setSelectedIds}
                  chosenCount={chosen.length}
                  total={summary.total}
                  flash={flash}
                />
              )}
            </div>
            {chosen.length >= 2 ? (
              <BulkPanel txs={chosen} onClear={() => setSelectedIds(new Set())} onApplied={onApplied} />
            ) : (
              selected && <TransactionPanel tx={selected} onClose={() => setSelected(null)} />
            )}
          </div>
        ) : byDate.length === 0 ? (
          empty
        ) : (
          <>
            {selecting ? (
              <div className="flex min-h-11 items-center justify-between gap-2 px-5 pb-1">
                <span className="text-[13px] leading-[18px] text-muted">{t.bulk.totalSelected}</span>
                <span className="tabular text-sm leading-5 font-medium text-ink">{formatMoney(summary.total, 'BRL', { signed: true })}</span>
              </div>
            ) : (
              <div className="flex min-h-12 items-center justify-between gap-3 pr-1 pl-4">
                <p className="text-[13px] leading-[18px] text-muted">{countText}</p>
                {hiddenCount > 0 && <HiddenLink count={hiddenCount} />}
              </div>
            )}
            <div className="flex flex-col gap-4 px-4">
              {byDate.map((day) => (
                <section key={day.date} className="flex flex-col gap-2">
                  <div className="flex min-h-[18px] items-center justify-between px-1">
                    <span className="flex min-w-0 items-center gap-0.5">
                      {selecting && (
                        <GroupCheckbox
                          state={groupState(day.txs, selectedIds)}
                          label={t.bulk.selectDay(day.label)}
                          onToggle={() => setSelectedIds((s) => toggleGroup(day.txs, s))}
                          className="-my-[13px] -ml-[11px] size-11"
                        />
                      )}
                      <h2 className="text-[13px] leading-[18px] font-medium text-ink-2">{day.label}</h2>
                    </span>
                    <DayTotal net={day.net} />
                  </div>
                  <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
                    {day.txs.map((tx) => (
                      <TransactionRow
                        key={tx.id}
                        tx={tx}
                        onSelect={selecting ? () => toggle(tx.id) : setSelected}
                        onLongPress={selecting ? undefined : startSelecting}
                        select={selecting ? { checked: selectedIds.has(tx.id), disabled: !selectable(tx) } : undefined}
                        className={`px-4 ${flash.has(tx.id) ? 'flash-accent' : ''}`}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
            {/* Room for the action bar, which is taller than the tab bar. */}
            {selecting && <div aria-hidden className="h-10" />}
          </>
        )}

        {!desktop && selected && <TransactionSheet tx={selected} onClose={() => setSelected(null)} />}
      </div>

      {!desktop && !selecting && headerSlot && filtered.some(selectable) &&
        createPortal(
          <button
            type="button"
            onClick={() => startSelecting()}
            className="inline-flex h-11 items-center gap-1.5 rounded-sm px-3 text-sm font-medium whitespace-nowrap text-accent hover:bg-accent-faint active:bg-track"
          >
            <Icon name="listCheck" className="size-[18px]" />
            {t.bulk.select}
          </button>,
          headerSlot,
        )}

      {!desktop && selecting && (
        <>
          {/* Selection header, over the app's header. */}
          <div
            className="fixed inset-x-0 top-0 z-30 mx-auto max-w-[480px] pt-[env(safe-area-inset-top)]"
            style={{ background: 'color-mix(in srgb, var(--accent) 10%, var(--page))' }}
          >
            <div className="flex h-14 items-center gap-1 px-1">
              <button
                type="button"
                onClick={exitSelection}
                aria-label={t.bulk.exitSelect}
                className="flex size-12 shrink-0 items-center justify-center rounded-full text-ink active:bg-track"
              >
                <Icon name="close" className="size-[22px]" strokeWidth={2} />
              </button>
              <h1 aria-live="polite" className="min-w-0 flex-1 truncate text-xl leading-[26px] font-medium text-ink">
                {t.bulk.selected(summary.count)}
              </h1>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set(selectAllIds(filtered)))}
                className="h-11 shrink-0 rounded-sm px-3 text-sm font-medium whitespace-nowrap text-accent active:bg-track"
              >
                {t.bulk.selectAll}
              </button>
            </div>
          </div>
          {/* Action bar, over the tab bar. */}
          <div className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-[480px] flex-col gap-2 border-t border-line bg-surface px-4 pt-3 pb-[calc(20px+env(safe-area-inset-bottom))]">
            <p className="text-center text-xs leading-4 text-muted">{mixed ? t.bulk.mixedNote : t.bulk.transfersNote}</p>
            <button
              ref={categorizeButton}
              type="button"
              disabled={summary.count === 0 || mixed}
              onClick={() => setBulkOpen(true)}
              className="flex h-12 items-center justify-center gap-2 rounded-md bg-accent text-[15px] font-medium text-surface disabled:opacity-40"
            >
              <Icon name="tag" className="size-5" />
              {t.bulk.categorizeN(summary.count)}
            </button>
          </div>
          {bulkOpen && <BulkSheet txs={chosen} onClose={closeSheet} onApplied={onApplied} />}
        </>
      )}

      {applied && <UndoToast key={applied.ids.join()} applied={applied} onDone={dismissApplied} />}
    </>
  )
}

/**
 * While selecting on a phone, the Android back button leaves selection mode:
 * an extra history entry is pushed on entry and taken back on exit.
 */
function useBackToExit(active: boolean, exit: () => void) {
  useEffect(() => {
    if (!active) return
    window.history.pushState({ troveSelecting: true }, '')
    let popped = false
    const onPop = () => {
      popped = true
      exit()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      // Our entry is still current (a filter change replaces it): take it back.
      if (!popped && (window.history.state as { troveSelecting?: boolean } | null)?.troveSelecting) window.history.back()
    }
  }, [active, exit])
}

/** A day's (or the table's) three-state checkbox; a dashed, disabled box when nothing in it can be selected. */
function GroupCheckbox({ state, label, onToggle, className, small = false }: { state: CheckState; label: string; onToggle(): void; className: string; small?: boolean }) {
  if (state === 'disabled')
    return (
      <span aria-hidden className={`flex shrink-0 items-center justify-center opacity-45 ${className}`}>
        <SelectBox state="disabled" small={small} />
      </span>
    )
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === 'on' ? true : state === 'mixed' ? 'mixed' : false}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className={`flex shrink-0 items-center justify-center ${className}`}
    >
      <SelectBox state={state} small={small} />
    </button>
  )
}

/** "Hidden (n)": opens the hidden transactions. */
function HiddenLink({ count }: { count: number }) {
  const { t } = useI18n()
  return (
    <Link
      to="/transactions/hidden"
      className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-accent hover:bg-accent-faint active:bg-track lg:h-11"
    >
      <Icon name="eyeOff" className="size-[18px]" />
      {t.transactions.hiddenLink(count)}
    </Link>
  )
}

/** Hidden transactions: grouped by day, no day totals, dimmed, each with Unhide. */
export function HiddenTransactions() {
  const { transactions, edit, categoriesById } = useData()
  const { t } = useI18n()
  const accountLabel = useAccountLabel()
  const days = useMemo(() => {
    const groups = new Map<string, Transaction[]>()
    for (const tx of newestFirst(transactions)) if (tx.hidden) groups.set(tx.date, [...(groups.get(tx.date) ?? []), tx])
    return [...groups].map(([date, txs]) => ({ date, label: formatDayHeading(date), txs }))
  }, [transactions])

  return (
    <div className="flex flex-col gap-4 lg:max-w-[880px]">
      <div className="flex items-center gap-1">
        <Link
          to="/transactions"
          aria-label={t.nav.transactions}
          className="-ml-3 flex size-12 items-center justify-center rounded-full text-ink-2 hover:bg-track active:bg-track"
        >
          <Icon name="chevronLeft" className="size-[22px]" />
        </Link>
        <h1 className="text-[22px] leading-7 font-medium text-ink lg:text-[28px] lg:leading-[34px]">{t.transactions.hiddenTitle}</h1>
      </div>
      <p className="text-sm leading-5 text-ink-2">{t.transactions.hiddenNote}</p>
      {days.length === 0 && <p className="py-6 text-center text-sm text-muted">{t.transactions.hiddenEmpty}</p>}
      {days.map((day) => (
        <section key={day.date} className="flex flex-col gap-2">
          <h2 className="px-1 text-[13px] leading-[18px] font-medium text-ink-2">{day.label}</h2>
          <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {day.txs.map((tx) => (
              <div key={tx.id} className="flex min-h-[72px] items-center gap-3 py-2 pr-2 pl-4">
                <div className="flex min-w-0 flex-1 items-center gap-3 opacity-60">
                  <TransactionBadge tx={tx} categoriesById={categoriesById} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span title={tx.description} className="truncate text-[15px] leading-5 font-medium text-ink">{tx.description}</span>
                    <CategoryLine tx={tx} compact />
                    <span className="truncate text-[13px] leading-[18px] text-muted">{accountLabel(tx.accountId)}</span>
                  </span>
                  <Amount cents={tx.amount} foreign={tx.foreign} transfer={!!tx.transfer} />
                </div>
                <button
                  type="button"
                  onClick={() => edit({ op: 'hide', transactionId: tx.id, hidden: false })}
                  aria-label={t.transactions.unhideAria(tx.description)}
                  className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-accent hover:bg-accent-faint active:bg-track"
                >
                  <Icon name="eye" className="size-[18px]" />
                  {t.transactions.unhide}
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
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
 * Columns: checkbox (20px), description, account (130px), category (184px),
 * amount (120px). Next to the details panel, screens under 1536px drop the
 * Account and Category columns (the panel shows both) so descriptions keep
 * their room; next to the bulk panel, screens under 1280px.
 */
type Narrow = 'none' | 'details' | 'bulk'
// Written out in full so Tailwind finds every class.
const COLUMNS: Record<Narrow, string> = {
  none: 'grid-cols-[20px_minmax(0,1fr)_130px_184px_120px]',
  details: 'grid-cols-[20px_minmax(0,1fr)_120px] 2xl:grid-cols-[20px_minmax(0,1fr)_130px_184px_120px]',
  bulk: 'grid-cols-[20px_minmax(0,1fr)_120px] xl:grid-cols-[20px_minmax(0,1fr)_130px_184px_120px]',
}
const columnsFor = (narrow: Narrow) => `grid gap-4 px-5 ${COLUMNS[narrow]}`
const optionalFor = (narrow: Narrow) => (narrow === 'details' ? 'hidden 2xl:flex' : narrow === 'bulk' ? 'hidden xl:flex' : 'flex')

/**
 * Desktop: one table, day bands between the rows, a checkbox column. While
 * rows are checked, a selection bar replaces the column header; clicking a
 * row then toggles it (shift + click: a range), otherwise it opens the details.
 */
function TransactionTable({
  days,
  shown,
  selectedId,
  onSelect,
  narrow,
  selectedIds,
  setSelectedIds,
  chosenCount,
  total,
  flash,
}: {
  days: { date: string; label: string; txs: Transaction[]; net: number }[]
  shown: Transaction[]
  selectedId?: string
  onSelect(tx: Transaction): void
  narrow: Narrow
  selectedIds: Set<string>
  setSelectedIds(update: (s: Set<string>) => Set<string>): void
  chosenCount: number
  total: number
  flash: Set<string>
}) {
  const columns = columnsFor(narrow)
  const optional = optionalFor(narrow)
  const { categoriesById } = useData()
  const { t } = useI18n()
  const accountLabel = useAccountLabel()
  const anchor = useRef<string | null>(null)
  const selecting = chosenCount > 0
  const allState = groupState(shown, selectedIds)
  const all = selectAllIds(shown)

  const pick = (tx: Transaction, shift: boolean) => {
    // Read the anchor now: the updater runs later, after it moves to this row.
    const from = anchor.current
    setSelectedIds((s) => {
      const next = new Set(s)
      if (shift && from) for (const id of rangeIds(shown, from, tx.id)) next.add(id)
      else if (next.has(tx.id)) next.delete(tx.id)
      else next.add(tx.id)
      return next
    })
    anchor.current = tx.id
  }
  const selectAllBox = (
    <GroupCheckbox
      state={allState}
      small
      label={t.bulk.selectAllAria}
      onToggle={() => setSelectedIds((s) => toggleGroup(shown, s))}
      className="relative h-6 w-5 before:absolute before:-inset-2.5"
    />
  )

  return (
    <div role="table" aria-label={t.nav.transactions}>
      {selecting ? (
        <div
          role="row"
          className="flex min-h-[52px] items-center gap-4 border-b border-line py-1 pr-3 pl-5"
          style={{ background: 'color-mix(in srgb, var(--accent) 10%, var(--surface))' }}
        >
          {selectAllBox}
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span aria-live="polite" className="text-sm font-medium whitespace-nowrap text-ink">
              {t.bulk.selected(chosenCount)}
            </span>
            <span className="tabular text-sm whitespace-nowrap text-muted">· {formatMoney(total, 'BRL', { signed: true })}</span>
          </span>
          <span className="ml-auto flex items-center">
            {allState !== 'on' && (
              <button type="button" onClick={() => setSelectedIds(() => new Set(all))} className="h-10 rounded-sm px-3 text-sm font-medium whitespace-nowrap text-accent hover:bg-accent-faint">
                {t.bulk.selectAllN(all.length)}
              </button>
            )}
            <button type="button" onClick={() => setSelectedIds(() => new Set())} className="h-10 rounded-sm px-3 text-sm font-medium whitespace-nowrap text-ink-2 hover:bg-track">
              {t.bulk.clearSelection}
            </button>
          </span>
        </div>
      ) : (
        <div role="row" className={`${columns} label-caps items-center border-b border-line py-3`}>
          <span role="columnheader" className="flex items-center justify-center">
            {selectAllBox}
          </span>
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
      )}
      {days.map((day) => (
        <div key={day.date} role="rowgroup">
          <div role="row" className="flex items-center justify-between border-b border-line bg-page px-5 py-2.5">
            <span className="flex items-center gap-4">
              <GroupCheckbox
                state={groupState(day.txs, selectedIds)}
                small
                label={t.bulk.selectDay(day.label)}
                onToggle={() => setSelectedIds((s) => toggleGroup(day.txs, s))}
                className="relative h-6 w-5 before:absolute before:-inset-2.5"
              />
              <span role="rowheader" className="text-[13px] font-medium text-ink-2">
                {day.label}
              </span>
            </span>
            <DayTotal net={day.net} />
          </div>
          {day.txs.map((tx) => {
            const category = tx.categoryId ? categoriesById.get(tx.categoryId) : undefined
            const can = selectable(tx)
            const checked = selectedIds.has(tx.id)
            const on = checked || tx.id === selectedId
            return (
              <div
                key={tx.id}
                role="row"
                aria-selected={on}
                onClick={(e) => {
                  if (!selecting) onSelect(tx)
                  else if (can) pick(tx, e.shiftKey)
                }}
                className={`${columns} min-h-14 cursor-pointer items-center border-b border-line py-2 ${on ? 'bg-accent-faint' : 'hover:bg-page'} ${flash.has(tx.id) ? 'flash-accent' : ''}`}
              >
                <span role="cell" className="flex items-center justify-center">
                  {can ? (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      aria-label={tx.description}
                      onClick={(e) => {
                        e.stopPropagation()
                        pick(tx, e.shiftKey)
                      }}
                      className="relative flex h-6 w-5 items-center justify-center before:absolute before:-inset-2.5"
                    >
                      <SelectBox state={checked ? 'on' : 'off'} small />
                    </button>
                  ) : (
                    <span aria-hidden className="opacity-45">
                      <SelectBox state="disabled" small />
                    </span>
                  )}
                </span>
                <span role="cell" className="flex min-w-0 items-center gap-3">
                  <TransactionBadge tx={tx} categoriesById={categoriesById} size={34} />
                  {/* The focusable part of the row: Enter opens the details (or toggles it while selecting). */}
                  <button type="button" title={tx.description} className="min-w-0 truncate text-left text-sm font-medium text-ink">
                    {tx.description}
                  </button>
                  {tx.installment && (
                    <span className="tabular inline-flex h-[22px] shrink-0 items-center rounded-full bg-track px-[7px] text-xs font-medium text-ink-2">
                      {tx.installment.number}/{tx.installment.total}
                    </span>
                  )}
                  {tx.status === 'PENDING' && <span className="min-w-0 shrink-[2] truncate text-xs text-muted">{t.pending}</span>}
                </span>
                <span role="cell" className={`min-w-0 items-center truncate text-[13px] text-ink-2 ${optional}`}>
                  <span className="truncate">{accountLabel(tx.accountId)}</span>
                </span>
                <span role="cell" className={`min-w-0 items-center gap-2 ${optional}`}>
                  {!tx.transfer && (
                    <span
                      aria-hidden
                      className={`size-2 shrink-0 rounded-full ${category ? '' : 'border-[1.5px] border-dashed border-muted'}`}
                      style={category ? { background: catVar(category.color) } : undefined}
                    />
                  )}
                  <CategoryLine tx={tx} compact />
                </span>
                <span role="cell">
                  <Amount cents={tx.amount} foreign={tx.foreign} transfer={!!tx.transfer} className="[&>span:first-child]:text-sm" />
                </span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
