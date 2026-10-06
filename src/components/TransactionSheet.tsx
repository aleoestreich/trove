import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
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
  const { categories, categoriesById, subcategories, setCategory, setSubcategory, categoryEditor, transactions } = useData()
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
        <IconDisc icon={categoryIcon(current.categoryId, categoriesById)} size="lg" />
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

      <div className="flex items-baseline justify-between gap-3 pt-4 pb-2">
        <h3 id={`${variant}-category`} className="label-caps">
          {t.category}
        </h3>
        <Link to="/categories" onClick={onClose} className="text-[13px] font-medium text-accent hover:underline">
          {t.transactions.manageCategories}
        </Link>
      </div>
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
              {!panel && <Icon name={on ? 'check' : categoryIcon(c.id, categoriesById)} className="size-[18px]" />}
              {categoryName(c)}
            </button>
          )
        })}
      </div>
      {kind === 'transfer' && <p className="mt-3 text-[13px] leading-[18px] text-muted">{t.transactions.transferNote}</p>}

      {kind !== 'transfer' && category && (
        <SubcategoryPicker
          variant={variant}
          current={current.subcategoryId ?? null}
          options={subcategories.filter((s) => s.categoryId === category.id)}
          onPick={(id) => setSubcategory(current.id, id)}
          onAdd={(name) => {
            const sub = categoryEditor.addSubcategory(category.id, name)
            if (sub) setSubcategory(current.id, sub.id)
            return !!sub
          }}
        />
      )}
    </>
  )
}

/** "None", the category's subcategories, and a chip to add one on the spot. */
function SubcategoryPicker({
  variant,
  current,
  options,
  onPick,
  onAdd,
}: {
  variant: 'sheet' | 'panel'
  current: string | null
  options: { id: string; name: string }[]
  onPick(id: string | null): void
  /** False when the name is empty or already used. */
  onAdd(name: string): boolean
}) {
  const { t } = useI18n()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState(false)
  const panel = variant === 'panel'
  const chip = `inline-flex items-center gap-1.5 rounded-full border font-medium ${panel ? 'h-9 px-3 text-[13px]' : 'h-12 px-3.5 text-sm'}`
  const off = 'border-line bg-surface text-ink-2 hover:bg-track'
  const on = 'border-accent bg-accent-soft text-accent'

  const submit = () => {
    if (onAdd(name)) {
      setAdding(false)
      setName('')
      setError(false)
    } else setError(true)
  }

  return (
    <>
      <h3 id={`${variant}-subcategory`} className="label-caps pt-4 pb-2">
        {t.transactions.subcategory}
      </h3>
      <div role="radiogroup" aria-labelledby={`${variant}-subcategory`} className={`flex flex-wrap ${panel ? 'gap-1.5' : 'gap-2'}`}>
        {[{ id: null as string | null, name: t.transactions.noSubcategory }, ...options].map((o) => (
          <button
            key={o.id ?? 'none'}
            type="button"
            role="radio"
            aria-checked={current === o.id}
            onClick={() => onPick(o.id)}
            className={`${chip} ${current === o.id ? on : off}`}
          >
            {!panel && current === o.id && <Icon name="check" className="size-[18px]" />}
            {o.name}
          </button>
        ))}
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={`${chip} border-dashed ${off}`}>
            <Icon name="plus" className="size-[18px]" />
            {t.transactions.addSubcategory}
          </button>
        )}
      </div>
      {adding && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(false)
            }}
            aria-label={t.categoryEditor.subcategoryName}
            aria-invalid={error}
            placeholder={t.categoryEditor.subcategoryName}
            maxLength={40}
            className={`min-w-0 flex-1 rounded-md border bg-surface px-3 text-[15px] text-ink placeholder:text-muted ${panel ? 'h-10' : 'h-12'} ${error ? 'border-critical' : 'border-line'}`}
          />
          <button type="submit" className={`shrink-0 rounded-md bg-accent px-4 text-sm font-medium text-surface ${panel ? 'h-10' : 'h-12'}`}>
            {t.categoryEditor.add}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false)
              setName('')
              setError(false)
            }}
            className={`shrink-0 px-2 text-sm font-medium text-ink-2 ${panel ? 'h-10' : 'h-12'}`}
          >
            {t.categoryEditor.cancel}
          </button>
        </form>
      )}
      {error && <p className="mt-1.5 text-xs text-critical">{t.categoryEditor.nameTaken}</p>}
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
