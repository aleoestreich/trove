import { useEffect, useRef } from 'react'
import type { CategoryKind, Transaction } from '../data/types'
import { useData } from '../state'
import { addMonths, formatFullDate, formatMonthYear } from '../lib/dates'
import { formatMoney, formatRate } from '../lib/money'
import { Icon, categoryIcon } from './Icon'
import { IconDisc } from './ui'
import { useAccountLabel } from './TransactionRow'
import { useI18n } from '../i18n/I18nProvider'


/**
 * Transaction details: amount, facts and category chips (tap one to
 * recategorise). Phones show it in a bottom sheet (`sheet`); the desktop
 * Transactions page shows it in a side panel (`panel`).
 */
function TransactionDetails({ tx, onClose, variant }: { tx: Transaction; onClose(): void; variant: 'sheet' | 'panel' }) {
  const { categories, categoriesById, setCategory, setIgnored, transactions } = useData()
  const { t, categoryName } = useI18n()
  const accountLabel = useAccountLabel()
  const closeRef = useRef<HTMLButtonElement>(null)
  const current = transactions.find((t) => t.id === tx.id) ?? tx
  const category = categoriesById.get(current.categoryId)
  const kind: CategoryKind = category?.kind ?? (current.amount > 0 ? 'income' : 'expense')

  const panel = variant === 'panel'

  const kindLabel = kind === 'income' ? t.transactions.kindIncome : kind === 'transfer' ? t.transactions.kindTransfer : t.transactions.kindExpense
  const inst = current.installment
  const subtitle = inst ? `${kindLabel} · ${t.transactions.installmentN(inst.number, inst.total)}` : kindLabel
  const rate = current.foreign ? Math.abs(current.amount / current.foreign.amount) : null
  const lastMonth = inst && addMonths(current.date, inst.total - inst.number).slice(0, 7)

  const details: { label: string; value: string }[] = [
    { label: t.transactions.date, value: formatFullDate(current.date) },
    { label: t.transactions.account, value: accountLabel(current.accountId) },
  ]
  if (current.foreign && rate)
    details.push({
      label: t.transactions.inBRL,
      value: `≈ ${formatMoney(Math.abs(current.amount))} · ${t.oneUnitIs(current.foreign.currency, formatRate(rate))}`,
    })
  if (inst && lastMonth) {
    details.push({ label: t.transactions.installment, value: t.transactions.installmentEnds(inst.number, inst.total, formatMonthYear(lastMonth)) })
    details.push({ label: t.transactions.purchaseTotal, value: formatMoney(inst.totalAmount) })
  }
  if (current.status === 'PENDING') details.push({ label: t.transactions.status, value: t.pending })

  // Same kind first (an expense is recategorised as another expense), then the rest.
  const options = [...categories.filter((c) => c.kind === kind), ...categories.filter((c) => c.kind !== kind)]

  const amount = current.foreign
    ? formatMoney(current.foreign.amount, current.foreign.currency, { signed: kind !== 'transfer' })
    : formatMoney(kind === 'transfer' ? Math.abs(current.amount) : current.amount, 'BRL', { signed: kind !== 'transfer' })

  return (
    <>
      <div className="flex items-center gap-3 pt-1 pb-3 lg:pt-0">
        <IconDisc icon={categoryIcon(current.categoryId)} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="truncate text-lg leading-6 font-medium text-ink">{current.description}</h2>
          <span className="text-[13px] leading-[18px] text-muted">{accountLabel(current.accountId)}</span>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className={`flex shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-track active:bg-track ${panel ? 'size-10' : '-mr-2 size-12'}`}
          aria-label={t.close}
        >
          <Icon name="close" className={panel ? 'size-5' : 'size-[22px]'} strokeWidth={2} />
        </button>
      </div>

      <div className={`flex flex-col gap-0.5 ${panel ? 'pt-4 pb-3' : 'pt-1 pb-3'}`}>
        <span
          className={`tabular font-bold tracking-[-0.02em] ${panel ? 'text-[30px] leading-[38px]' : 'text-[32px] leading-10'} ${kind === 'income' ? 'text-income' : kind === 'transfer' ? 'text-muted' : 'text-ink'}`}
        >
          {amount}
        </span>
        <span className="text-[13px] leading-[18px] text-ink-2">{subtitle}</span>
      </div>

      <dl className="border-t border-line">
        {details.map((d) => (
          <div key={d.label} className={`flex items-center justify-between gap-4 border-b border-line py-2 ${panel ? 'min-h-11' : 'min-h-12'}`}>
            <dt className={`text-muted ${panel ? 'text-[13px]' : 'text-sm'}`}>{d.label}</dt>
            <dd className={`tabular text-right font-medium text-ink ${panel ? 'text-[13px]' : 'text-sm'}`}>{d.value}</dd>
          </div>
        ))}
      </dl>

      <button
        type="button"
        role="switch"
        aria-checked={!!current.ignored}
        onClick={() => setIgnored(current.id, !current.ignored)}
        className={`flex w-full items-center gap-3 border-b border-line py-2.5 text-left ${panel ? 'min-h-11' : 'min-h-14'}`}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={`font-medium text-ink ${panel ? 'text-[13px] leading-[18px]' : 'text-[15px] leading-5'}`}>{t.transactions.ignore}</span>
          <span className="text-xs leading-4 text-muted">{t.transactions.ignoreNote}</span>
        </span>
        <span
          aria-hidden
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${current.ignored ? 'bg-accent' : 'bg-track'}`}
        >
          <span
            className={`absolute top-0.5 size-6 rounded-full bg-surface shadow-sm transition-[left] ${current.ignored ? 'left-[22px]' : 'left-0.5'}`}
          />
        </span>
      </button>

      <h3 id={`${variant}-category`} className="label-caps pt-4 pb-2">
        {t.category}
      </h3>
      <div role="radiogroup" aria-labelledby={`${variant}-category`} className={`flex flex-wrap ${panel ? 'gap-1.5' : 'gap-2'}`}>
        {options.map((c) => {
          const on = c.id === current.categoryId
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setCategory(current.id, c.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${
                panel ? 'h-9 px-3 text-[13px]' : 'h-12 pr-3.5 pl-3 text-sm'
              } ${on ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-ink-2 hover:bg-track'}`}
            >
              {!panel && <Icon name={on ? 'check' : categoryIcon(c.id)} className="size-[18px]" />}
              {categoryName(c)}
            </button>
          )
        })}
      </div>
      {kind === 'transfer' && <p className="mt-3 text-[13px] leading-[18px] text-muted">{t.transactions.transferNote}</p>}
    </>
  )
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
}

/** Bottom sheet on phones (a centred dialog on wider screens). */
export function TransactionSheet({ tx, onClose }: { tx: Transaction; onClose(): void }) {
  const { t } = useI18n()
  const ref = useRef<HTMLElement>(null)
  useEscape(onClose)
  useEffect(() => ref.current?.querySelector('button')?.focus(), [])
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-scrim md:items-center" onClick={onClose}>
      <section
        ref={ref}
        role="dialog"
        aria-modal
        aria-label={t.transactions.details}
        className="flex max-h-[92dvh] w-full max-w-[480px] flex-col overflow-y-auto rounded-t-xl bg-surface px-4 pb-[calc(16px+env(safe-area-inset-bottom))] md:rounded-xl md:pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-[22px] shrink-0 items-center justify-center md:hidden" aria-hidden>
          <span className="h-1 w-8 rounded-full bg-line" />
        </div>
        <TransactionDetails tx={tx} onClose={onClose} variant="sheet" />
        <button type="button" onClick={onClose} className="mt-4 h-12 shrink-0 rounded-md bg-accent text-[15px] font-medium text-surface active:opacity-80">
          {t.done}
        </button>
      </section>
    </div>
  )
}

/** Side panel next to the desktop transactions table. */
export function TransactionPanel({ tx, onClose }: { tx: Transaction; onClose(): void }) {
  const { t } = useI18n()
  useEscape(onClose)
  return (
    <aside
      aria-label={t.transactions.details}
      className="sticky top-8 flex max-h-[calc(100dvh-64px)] w-[300px] shrink-0 xl:w-[360px] flex-col self-start overflow-y-auto rounded-lg border border-line bg-surface p-5"
    >
      <TransactionDetails tx={tx} onClose={onClose} variant="panel" />
    </aside>
  )
}
