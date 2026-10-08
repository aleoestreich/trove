import { useRef, type MouseEvent, type PointerEvent } from 'react'
import type { Transaction } from '../data/types'
import { useData } from '../state'
import { Amount } from './ui'
import { CategoryLabel, TransactionBadge } from './CategoryBadge'
import { SelectBox } from './SelectBox'
import { formatShortDate } from '../lib/dates'
import { useI18n } from '../i18n/I18nProvider'
import { shownName } from '../lib/accountLabel'

/** Account label for a row: the name set in Trove, else "Cartão Nubank", "Itaú", "Wise USD". */
export function useAccountLabel() {
  const { accountsById, institutionsById } = useData()
  const { t } = useI18n()
  return (accountId: string) => {
    const account = accountsById.get(accountId)!
    const institution = institutionsById.get(account.institutionId)!
    if (account.type === 'CREDIT') return shownName(account, t.cardOf(institution.name))
    return shownName(account, `${institution.name}${account.foreign ? ` ${account.foreign.currency}` : ''}`)
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

/** How long a press must last to count as a long press. */
const LONG_PRESS_MS = 500

/**
 * Category badge; description, "Category › Subcategory", and "account · 3/10";
 * the amount. `showDate` adds the date to the last line (lists that aren't
 * grouped by day).
 *
 * Selection mode (`select`): the badge becomes a checkbox, the row a
 * checkbox (role, aria-checked), tinted when selected; rows that can't be
 * selected (transfers) are dimmed and aria-disabled. `onLongPress` enters
 * selection mode from a normal row.
 */
export function TransactionRow({
  tx,
  onSelect,
  onLongPress,
  select,
  showDate = false,
  className = '',
}: {
  tx: Transaction
  onSelect?(tx: Transaction): void
  onLongPress?(tx: Transaction): void
  select?: { checked: boolean; disabled: boolean }
  showDate?: boolean
  className?: string
}) {
  const { categoriesById } = useData()
  const { t } = useI18n()
  const accountLabel = useAccountLabel()
  const press = useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null)
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer)
  }
  const longPress = onLongPress && {
    onPointerDown: (e: PointerEvent) => {
      cancelPress()
      const state = { x: e.clientX, y: e.clientY, fired: false, timer: 0 }
      state.timer = window.setTimeout(() => {
        state.fired = true
        onLongPress(tx)
      }, LONG_PRESS_MS)
      press.current = state
    },
    onPointerMove: (e: PointerEvent) => {
      const p = press.current
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancelPress()
    },
    onPointerUp: cancelPress,
    onPointerCancel: cancelPress,
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
  }

  return (
    <button
      type="button"
      role={select ? 'checkbox' : undefined}
      aria-checked={select ? select.checked : undefined}
      aria-disabled={select?.disabled || undefined}
      onClick={() => {
        // The click that ends a long press doesn't also open the details.
        if (press.current?.fired) {
          press.current = null
          return
        }
        if (!select?.disabled) onSelect?.(tx)
      }}
      {...longPress}
      className={`flex min-h-[72px] w-full items-center gap-3 py-2.5 text-left select-none ${select?.checked ? 'bg-accent-faint' : select ? '' : 'active:bg-track'} ${className}`}
    >
      {select ? (
        <span className={`flex size-10 shrink-0 items-center justify-center ${select.disabled ? 'opacity-45' : ''}`}>
          <SelectBox state={select.disabled ? 'disabled' : select.checked ? 'on' : 'off'} />
        </span>
      ) : (
        <TransactionBadge tx={tx} categoriesById={categoriesById} />
      )}
      <span className={`flex min-w-0 flex-1 flex-col ${select?.disabled ? 'opacity-45' : ''}`}>
        <span title={tx.description} className="private truncate text-[15px] leading-5 font-medium text-ink">{tx.description}</span>
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
      <span className={select?.disabled ? 'opacity-45' : undefined}>
        <Amount cents={tx.amount} foreign={tx.foreign} transfer={!!tx.transfer} />
      </span>
    </button>
  )
}
