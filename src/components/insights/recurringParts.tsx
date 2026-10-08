import { useState } from 'react'
import type { RecurringAction, RecurringAlert, RecurringItem } from '../../data/recurring'
import { formatDay, formatMonthName, formatMonthShort } from '../../lib/dates'
import { formatMoney, formatPercent } from '../../lib/money'
import { paymentLabel } from '../../lib/insightText'
import { useData } from '../../state'
import { useI18n } from '../../i18n/I18nProvider'
import { CategoryBadge } from '../CategoryBadge'
import { Sheet } from './parts'

/** How a recurring charge is paid, with its bank: "Cartão Nubank". */
export function usePaymentLabel() {
  const { accounts, institutions } = useData()
  return (item: RecurringItem) => paymentLabel(item.paymentMethod, item.accountId, accounts, institutions)
}

const money = (cents: number, currency = 'BRL') => formatMoney(cents, currency)

/** The alert's one-line summary ("R$ 39,90 → R$ 44,90 por mês"). */
export function useAlertText() {
  const { t } = useI18n()
  const r = t.insights.recurring
  return (alert: RecurringAlert, item: RecurringItem): string => {
    const yearly = item.cadence === 'yearly'
    if (alert.type === 'price_up' && item.priceChange)
      return r.short.up(money(item.priceChange.from, item.priceChange.currency), money(item.priceChange.to, item.priceChange.currency), yearly)
    if (alert.type === 'new') return r.short.new(money(item.amount), yearly, formatMonthShort(item.firstDate))
    return r.short.stopped(money(item.amount), formatMonthShort(item.lastDate))
  }
}

/** The alert card's main line and explanation. */
export function useAlertDetail() {
  const { t } = useI18n()
  const r = t.insights.recurring
  const label = usePaymentLabel()
  return (alert: RecurringAlert, item: RecurringItem): { head: string; body: string } => {
    const yearly = item.cadence === 'yearly'
    const perYear = (cents: number) => money(yearly ? cents : cents * 12)
    if (alert.type === 'price_up' && item.priceChange) {
      const c = item.priceChange
      const pct = formatPercent(((c.to - c.from) / c.from) * 100, 1)
      // The extra per year, in BRL at the latest charge's rate.
      const extra = Math.round(((c.to - c.from) / c.to) * item.amount)
      return { head: r.head.up(money(c.from, c.currency), money(c.to, c.currency)), body: r.body.up(pct, formatDay(c.date), perYear(extra)) }
    }
    if (alert.type === 'new') {
      const foreign = item.foreign ? money(item.foreign.amount, item.foreign.currency) : null
      const dates = item.charges.map((c) => formatDay(c.date)).reverse()
      return { head: r.head.new(money(item.amount), foreign, yearly), body: r.body.new(r.dates(dates.slice(-3)), label(item), perYear(item.amount)) }
    }
    return { head: r.head.stopped(formatDay(item.lastDate)), body: r.body.stopped(money(item.amount), formatMonthName(item.lastDate.slice(0, 7))) }
  }
}

/** The two answers an alert offers, in the order shown: the quieter one first. */
export function useAlertActions(onCharges: (item: RecurringItem) => void) {
  const { t } = useI18n()
  const { answerRecurring } = useData()
  const a = t.insights.recurring.actions
  return (alert: RecurringAlert, item: RecurringItem): { label: string; tone: 'ink' | 'accent'; run(): void }[] => {
    const answer = (action: RecurringAction) => () => answerRecurring(item.id, action)
    if (alert.type === 'price_up')
      return [
        { label: a.understood, tone: 'ink', run: answer('dismiss_increase') },
        { label: a.seeCharges, tone: 'accent', run: () => onCharges(item) },
      ]
    if (alert.type === 'new')
      return [
        { label: a.notRecurring, tone: 'ink', run: answer('not_recurring') },
        { label: a.confirm, tone: 'accent', run: answer('confirm') },
      ]
    return [
      { label: a.stillPaying, tone: 'ink', run: answer('still_active') },
      { label: a.markCancelled, tone: 'accent', run: answer('cancelled') },
    ]
  }
}

/**
 * The last 6 prices as bars: earlier months muted at 35%, the latest in
 * critical after an increase (accent otherwise), each with its value.
 */
export function PriceBars({ item }: { item: RecurringItem }) {
  const { t } = useI18n()
  const currency = item.foreign?.currency ?? 'BRL'
  const history = item.priceHistory
  const max = Math.max(1, ...history.map((h) => h.amount))
  const label = t.insights.recurring.priceChart(
    item.merchant,
    history.map((h) => `${formatMonthShort(h.month)} ${money(h.amount, currency)}`).join(', '),
  )
  return (
    <div role="img" data-chart aria-label={label} className="flex flex-col gap-1">
      <div aria-hidden className="flex h-[58px] items-end gap-1.5">
        {history.map((h, i) => {
          const last = i === history.length - 1
          return (
            <div key={h.month} className="flex h-full flex-1 flex-col items-center justify-end gap-0.5">
              <span className={`tabular text-[10px] leading-3 whitespace-nowrap ${last ? 'font-bold text-ink' : 'text-muted'}`}>
                {(h.amount / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span
                className="w-full max-w-8 rounded-t-[4px]"
                style={{
                  height: Math.max(2, (h.amount / max) * 34),
                  background: last ? (item.increaseAlert ? 'var(--critical)' : 'var(--accent)') : 'var(--muted)',
                  opacity: last ? 1 : 0.35,
                }}
              />
            </div>
          )
        })}
      </div>
      <div aria-hidden className="h-px bg-line" />
      <div aria-hidden className="flex gap-1.5">
        {history.map((h, i) => (
          <span key={h.month} className={`flex-1 text-center text-[11px] leading-[14px] ${i === history.length - 1 ? 'font-medium text-ink' : 'text-muted'}`}>
            {formatMonthShort(h.month)}
          </span>
        ))}
      </div>
    </div>
  )
}

/** A recurring charge's history: its price per month, every charge, and "Não é recorrente". */
export function RecurringHistorySheet({ item, onClose }: { item: RecurringItem; onClose(): void }) {
  const { t } = useI18n()
  const { categoriesById, answerRecurring } = useData()
  const r = t.insights.recurring
  const label = usePaymentLabel()
  const meta = useRecurringMeta()
  const currency = item.foreign?.currency
  return (
    <Sheet
      title={item.merchant}
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={() => {
            answerRecurring(item.id, 'not_recurring')
            onClose()
          }}
          className="mt-4 h-12 shrink-0 rounded-md border border-line text-[15px] font-medium text-accent active:bg-track"
        >
          {r.actions.notRecurring}
        </button>
      }
    >
      <div className="mt-1 flex items-center gap-3">
        <CategoryBadge category={item.categoryId ? categoriesById.get(item.categoryId) : null} size={40} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[13px] leading-[18px] text-muted">{meta(item)}</span>
          <span className="tabular text-lg leading-6 font-bold text-ink">
            {money(item.amount)} <span className="text-[13px] font-normal text-muted">{item.cadence === 'yearly' ? r.per.year : r.per.month}</span>
          </span>
        </span>
      </div>
      {item.priceHistory.length > 1 && (
        <div className="mt-4">
          <PriceBars item={item} />
        </div>
      )}
      <h3 className="mt-5 text-[13px] leading-[18px] font-medium text-ink-2">
        {r.historyTitle} · {r.historyCount(item.charges.length)}
      </h3>
      <ul className="mt-1 flex flex-col">
        {item.charges.map((c, i) => (
          <li key={c.transactionId} className={`flex min-h-12 items-center gap-3 ${i ? 'border-t border-line' : ''}`}>
            <span className="tabular w-16 text-[13px] text-muted">{formatDay(c.date)}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{label(item)}</span>
            <span className="flex flex-col items-end">
              <span className="tabular text-sm font-medium text-ink">{money(c.amount)}</span>
              {currency && c.foreign && <span className="tabular text-xs text-muted">{money(c.foreign.amount, c.foreign.currency)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

/** "Todo dia 24 · Cartão Nubank" / "Anual · mar. · ≈ R$ 13,90/mês". */
export function useRecurringMeta() {
  const { t } = useI18n()
  const r = t.insights.recurring
  const label = usePaymentLabel()
  return (item: RecurringItem) =>
    item.cadence === 'monthly' ? r.meta.monthly(item.day, label(item)) : r.meta.yearly(formatMonthShort(item.lastDate), money(item.monthly))
}

/** Which recurring charge's history is open, and the sheet for it. */
export function useHistorySheet() {
  const [open, setOpen] = useState<RecurringItem | null>(null)
  return {
    open: setOpen,
    sheet: open ? <RecurringHistorySheet item={open} onClose={() => setOpen(null)} /> : null,
  }
}

