import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Category, Transaction } from '../data/types'
import { useData } from '../state'
import { newId } from '../data/edits'
import { addMonths, formatFullDate, formatMonthYear } from '../lib/dates'
import { formatMoney, formatRate } from '../lib/money'
import { kindOf } from '../lib/summary'
import { Icon } from './Icon'
import { CategoryBadge, TransactionBadge, catInk, catTint, catVar } from './CategoryBadge'
import { useAccountLabel } from './TransactionRow'
import { useI18n } from '../i18n/I18nProvider'

/**
 * Transaction details: amount, facts, the category in two steps (category,
 * then subcategory) and the "Hide this transaction" switch. Changes save at
 * once. Phones show it in a bottom sheet (`sheet`); the desktop Transactions
 * page shows it in a side panel (`panel`).
 */
function TransactionDetails({ tx, onClose, variant }: { tx: Transaction; onClose(): void; variant: 'sheet' | 'panel' }) {
  const { categories, categoriesById, subcategories, edit, transactions } = useData()
  const { t, categoryName } = useI18n()
  const accountLabel = useAccountLabel()
  const closeRef = useRef<HTMLButtonElement>(null)
  const current = transactions.find((x) => x.id === tx.id) ?? tx
  const category = current.categoryId ? categoriesById.get(current.categoryId) : undefined
  const kind = kindOf(current, categoriesById)

  const panel = variant === 'panel'

  const kindLabel =
    current.transfer === 'card-payment'
      ? t.transactions.cardPaymentRow
      : kind === 'income'
        ? t.transactions.kindIncome
        : kind === 'transfer'
          ? t.transactions.kindTransfer
          : t.transactions.kindExpense
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

  // Categories of the transaction's type (money in: income; out: expense), plus its own if it's of the other type.
  const type = current.amount > 0 ? 'income' : 'expense'
  // The chosen one first, so it's in view; the order is kept while the sheet is open.
  const [first] = useState(category?.id)
  const matching = categories.filter((c) => c.type === type || c.id === category?.id)
  const options = [...matching.filter((c) => c.id === first), ...matching.filter((c) => c.id !== first)]

  const amount = current.foreign
    ? formatMoney(current.foreign.amount, current.foreign.currency, { signed: kind !== 'transfer' })
    : formatMoney(kind === 'transfer' ? Math.abs(current.amount) : current.amount, 'BRL', { signed: kind !== 'transfer' })

  const setCategory = (c: Category) =>
    edit({ op: 'categorize', transactionId: current.id, categoryId: c.id === category?.id ? null : c.id, subcategoryId: null })

  return (
    <>
      <div className="flex items-center gap-3 pt-1 pb-3 lg:pt-0">
        <TransactionBadge tx={current} categoriesById={categoriesById} size={44} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="truncate text-lg leading-6 font-medium text-ink">{current.description}</h2>
          <span className="text-[13px] leading-[18px] text-muted">{accountLabel(current.accountId)}</span>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="-mr-2 flex size-12 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-track active:bg-track"
          aria-label={t.close}
        >
          <Icon name="close" className="size-[22px]" strokeWidth={2} />
        </button>
      </div>

      <div className={`flex flex-col gap-0.5 ${panel ? 'pt-4 pb-3' : 'pt-1 pb-3'}`}>
        <span
          className={`tabular font-bold tracking-[-0.02em] ${panel ? 'text-[30px] leading-[38px]' : 'text-[32px] leading-10'} ${kind === 'income' ? 'text-income' : kind === 'transfer' ? 'text-muted' : 'text-ink'} ${current.hidden ? 'opacity-60' : ''}`}
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

      {current.transfer === 'card-payment' ? (
        <>
          <p className="mt-3 text-[13px] leading-[18px] text-muted">{t.transactions.cardPaymentNote}</p>
          <button
            type="button"
            onClick={() => edit({ op: 'setTransferOverride', transactionId: current.id, value: 'none' })}
            className="mt-2 inline-flex h-12 items-center gap-2 self-start rounded-md px-3 -ml-3 text-sm font-medium text-accent hover:bg-accent-faint active:bg-track"
          >
            <Icon name="close" className="size-[18px]" strokeWidth={2} />
            {t.transactions.notCardPayment}
          </button>
        </>
      ) : current.transfer ? (
        <>
          <p className="mt-3 text-[13px] leading-[18px] text-muted">{t.transactions.transferNote}</p>
          <button
            type="button"
            onClick={() => edit({ op: 'setTransferOverride', transactionId: current.id, value: 'none' })}
            className="mt-2 inline-flex h-12 items-center gap-2 self-start rounded-md px-3 -ml-3 text-sm font-medium text-accent hover:bg-accent-faint active:bg-track"
          >
            <Icon name="close" className="size-[18px]" strokeWidth={2} />
            {t.transactions.notOwnTransfer}
          </button>
        </>
      ) : (
        <>
          <h3 id={`${variant}-category`} className="label-caps pt-4 pb-2">
            {t.category}
          </h3>
          {options.length === 0 ? (
            <p className="text-[13px] text-muted">{t.transactions.noCategoriesOfType(type === 'income' ? t.income.toLowerCase() : t.expenses.toLowerCase())}</p>
          ) : (
            <div
              role="radiogroup"
              aria-labelledby={`${variant}-category`}
              className={`-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:-mx-5 lg:px-5 ${panel ? 'lg:flex-wrap lg:overflow-visible' : ''}`}
            >
              {options.map((c) => (
                <CategoryChip key={c.id} category={c} name={categoryName(c)} on={c.id === category?.id} onClick={() => setCategory(c)} />
              ))}
            </div>
          )}

          {category && (
            <SubcategoryPicker
              variant={variant}
              category={category}
              current={current.subcategoryId ?? null}
              options={subcategories.filter((x) => x.categoryId === category.id)}
              onPick={(id) => edit({ op: 'categorize', transactionId: current.id, categoryId: category.id, subcategoryId: id === current.subcategoryId ? null : id })}
              onAdd={(name) => {
                const id = newId()
                edit({ op: 'createSubcategory', subcategory: { id, categoryId: category.id, name } })
                edit({ op: 'categorize', transactionId: current.id, categoryId: category.id, subcategoryId: id })
              }}
            />
          )}
        </>
      )}

      {/* Neither income nor an expense: mark it as a transfer (own accounts, or a card bill payment). */}
      {!current.transfer && (
        <div className="mt-4 divide-y divide-line overflow-hidden rounded-md border border-line">
          {(
            [
              ['own', 'transfer', t.transactions.markOwnTransfer, t.transactions.markOwnTransferNote],
              ['card-payment', 'card', t.transactions.markCardPayment, t.transactions.markCardPaymentNote],
            ] as const
          ).map(([value, icon, label, note]) => (
            <button
              key={value}
              type="button"
              onClick={() => edit({ op: 'setTransferOverride', transactionId: current.id, value })}
              className="flex min-h-16 w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-track active:bg-track"
            >
              <Icon name={icon} className="size-[22px] shrink-0 text-ink-2" strokeWidth={1.8} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] leading-5 font-medium text-ink">{label}</span>
                <span className="text-xs leading-[17px] text-muted">{note}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <HideSwitch hidden={!!current.hidden} onChange={(hidden) => edit({ op: 'hide', transactionId: current.id, hidden })} />
    </>
  )
}

/**
 * A category chip with its badge (radio). Selected: a 1.5px border in the
 * category's colour over a 10% tint. Sizes: 48px (details sheet), 40px (bulk
 * sheet) and 36px (desktop bulk panel), each with at least a 44px touch area.
 */
export function CategoryChip({
  category,
  name,
  on,
  onClick,
  size = 48,
}: {
  category: Category
  name: string
  on: boolean
  onClick(): void
  size?: 48 | 40 | 36
}) {
  const style: CSSProperties = on ? { borderColor: catVar(category.color), background: `color-mix(in srgb, ${catVar(category.color)} 10%, var(--surface))` } : {}
  const height = size === 48 ? 'h-12 gap-2 pl-2' : size === 40 ? 'h-10 gap-[7px] pl-[7px] before:-inset-y-1' : 'h-9 gap-1.5 pl-1.5 before:-inset-y-1'
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      style={style}
      className={`relative inline-flex shrink-0 items-center rounded-full pr-3.5 text-sm font-medium whitespace-nowrap before:absolute before:inset-x-0 ${height} ${
        on ? 'border-[1.5px] text-ink' : 'border border-line bg-surface text-ink-2 hover:bg-track'
      }`}
    >
      <CategoryBadge category={category} size={size === 48 ? 28 : size === 40 ? 26 : 24} />
      {name}
    </button>
  )
}

/**
 * The chosen category's subcategories and "+ New" to add one inline. In the
 * details, tapping the selected one again clears it (the caller decides).
 * Chips are 40px (34px on the desktop bulk panel) with a 44px+ touch area.
 */
export function SubcategoryPicker({
  variant,
  category,
  current,
  options,
  onPick,
  onAdd,
  small = false,
}: {
  variant: string
  category: Category
  current: string | null
  options: { id: string; name: string }[]
  onPick(id: string): void
  onAdd(name: string): void
  small?: boolean
}) {
  const { t } = useI18n()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const chip = `relative inline-flex ${small ? 'h-[34px]' : 'h-10'} items-center gap-1.5 rounded-full px-3.5 text-sm font-medium before:absolute before:inset-x-0 before:-inset-y-1`

  const submit = () => {
    const n = name.trim().replace(/\s+/g, ' ')
    if (!n) return setError(t.categoriesPage.nameRequired)
    if (options.some((o) => o.name.localeCompare(n, undefined, { sensitivity: 'base' }) === 0)) return setError(t.categoriesPage.nameTaken)
    onAdd(n)
    setAdding(false)
    setName('')
    setError(null)
  }

  return (
    <>
      <h3 id={`${variant}-subcategory`} className="label-caps pt-4 pb-2">
        {t.transactions.subcategory}
      </h3>
      <div role="radiogroup" aria-labelledby={`${variant}-subcategory`} className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = o.id === current
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPick(o.id)}
              className={`${chip} ${on ? 'border-[1.5px]' : 'border border-line bg-surface text-ink-2 hover:bg-track'}`}
              style={on ? { borderColor: catVar(category.color), background: catTint(category.color, 14), color: catInk(category.color) } : undefined}
            >
              {on && <Icon name="check" className="size-4" strokeWidth={2.4} />}
              {o.name}
            </button>
          )
        })}
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={`${chip} border border-dashed border-line pr-3.5 pl-2.5 text-accent hover:bg-track`}>
            <Icon name="plus" className="size-4" strokeWidth={2.2} />
            {t.transactions.newSubcategory}
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
              setError(null)
            }}
            aria-label={t.transactions.subcategoryName}
            aria-invalid={!!error}
            placeholder={t.transactions.subcategoryName}
            maxLength={40}
            className={`h-12 min-w-0 flex-1 rounded-md border bg-surface px-3 text-[15px] text-ink placeholder:text-muted ${error ? 'border-critical' : 'border-line'}`}
          />
          <button type="submit" className="h-12 shrink-0 rounded-md bg-accent px-4 text-sm font-medium text-surface">
            {t.transactions.add}
          </button>
          <button
            type="button"
            aria-label={t.close}
            onClick={() => {
              setAdding(false)
              setName('')
              setError(null)
            }}
            className="flex size-12 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-track"
          >
            <Icon name="close" className="size-5" />
          </button>
        </form>
      )}
      {error && <p className="mt-1.5 text-xs text-critical">{error}</p>}
    </>
  )
}

/** "Hide this transaction": a switch row with its explanation. */
function HideSwitch({ hidden, onChange }: { hidden: boolean; onChange(hidden: boolean): void }) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={hidden}
      onClick={() => onChange(!hidden)}
      className="mt-4 flex min-h-16 w-full items-center gap-3 rounded-md bg-page px-3.5 py-2.5 text-left"
    >
      <Icon name="eyeOff" className="size-[22px] shrink-0 text-ink-2" strokeWidth={1.8} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] leading-5 font-medium text-ink">{t.transactions.hide}</span>
        <span className="text-xs leading-[17px] text-muted">{t.transactions.hideNote}</span>
      </span>
      <span
        aria-hidden
        className={`flex h-8 w-[52px] shrink-0 items-center rounded-full border-2 px-1 transition-colors ${hidden ? 'justify-end border-accent bg-accent' : 'border-muted bg-track'}`}
      >
        <span className={`rounded-full transition-all ${hidden ? 'size-6 bg-surface' : 'size-4 bg-muted'}`} />
      </span>
    </button>
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
