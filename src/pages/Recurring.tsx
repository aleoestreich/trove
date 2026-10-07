import { useData } from '../state'
import { useI18n } from '../i18n/I18nProvider'
import { Card } from '../components/ui'
import { CategoryBadge } from '../components/CategoryBadge'
import { formatDay } from '../lib/dates'
import { formatMoney } from '../lib/money'
import type { RecurringItem } from '../data/recurring'
import { RecurringFlag, RecurringTotals } from '../components/insights/cards'
import { AlertBadge, DetailHeader, TextAction } from '../components/insights/parts'
import { PriceBars, useAlertActions, useAlertDetail, useHistorySheet, useRecurringMeta } from '../components/insights/recurringParts'

/**
 * "Recorrentes": totals, alerts with their answers, the active charges
 * (largest first; tap for the history), the stopped ones (out of the
 * totals) and how detection works. Desktop: alerts beside the list.
 */
export function Recurring() {
  const { insights, categoriesById } = useData()
  const { t } = useI18n()
  const r = t.insights.recurring
  const summary = insights.recurring
  const items = new Map([...summary.active, ...summary.stopped].map((i) => [i.id, i]))
  const history = useHistorySheet()
  const actions = useAlertActions(history.open)
  const detail = useAlertDetail()
  const meta = useRecurringMeta()
  const empty = summary.active.length === 0 && summary.stopped.length === 0
  const hasYearly = summary.active.some((i) => i.cadence === 'yearly')

  if (empty)
    return (
      <>
        <DetailHeader title={r.title} subtitle={r.subtitle} />
        <Card>
          <p className="text-sm leading-5 text-ink-2">{r.empty}</p>
        </Card>
        <p className="mx-1 mt-3 text-xs leading-[17px] text-muted">{r.footer}</p>
      </>
    )

  return (
    <>
      <DetailHeader title={r.title} subtitle={r.subtitle} />
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-5">
        <div className="flex flex-col gap-3">
          <RecurringTotals summary={summary} size="page" />
          <p className="mx-1 -mt-1 text-xs leading-[17px] text-muted">{r.totalsNote(summary.active.length, hasYearly)}</p>

          {summary.alerts.length > 0 && (
            <>
              <h2 className="mx-1 mt-2 text-[13px] leading-[18px] font-medium text-ink-2">{r.alertsTitle(summary.alerts.length)}</h2>
              {summary.alerts.map((a) => {
                const item = items.get(a.recurringId)!
                const { head, body } = detail(a, item)
                return (
                  <article key={`${a.type}-${a.recurringId}`} className="flex flex-col gap-2.5 rounded-lg border border-line bg-surface px-4 pt-3.5 pb-2">
                    <div className="flex items-center gap-2.5">
                      <CategoryBadge category={item.categoryId ? categoriesById.get(item.categoryId) : null} size={36} />
                      <span className="min-w-0 flex-1 truncate text-[15px] leading-5 font-medium text-ink">{item.merchant}</span>
                      <AlertBadge kind={a.type} long />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="tabular text-lg leading-6 font-bold text-ink">{head}</span>
                      <span className="text-[13px] leading-[18px] text-ink-2">{body}</span>
                    </div>
                    {a.type === 'price_up' && item.priceHistory.length > 1 && <PriceBars item={item} />}
                    <div className="-mr-2 flex flex-wrap justify-end gap-1">
                      {actions(a, item).map((ac) => (
                        <TextAction key={ac.label} tone={ac.tone} onClick={ac.run}>
                          {ac.label}
                        </TextAction>
                      ))}
                    </div>
                  </article>
                )
              })}
            </>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="mx-1 mt-2 flex items-baseline justify-between lg:mt-0">
            <h2 className="text-[13px] leading-[18px] font-medium text-ink-2">{r.activeCount(summary.active.length)}</h2>
            <span className="text-xs text-muted">{r.largestFirst}</span>
          </div>
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            {summary.active.map((i, k) => (
              <ActiveRow key={i.id} item={i} divider={k > 0} meta={meta(i)} onOpen={() => history.open(i)} />
            ))}
          </div>

          {summary.stopped.length > 0 && (
            <>
              <h2 className="mx-1 mt-2 text-[13px] leading-[18px] font-medium text-ink-2">{r.stoppedTitle(summary.stopped.length)}</h2>
              <div className="overflow-hidden rounded-lg border border-line bg-surface">
                {summary.stopped.map((i, k) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => history.open(i)}
                    className={`flex min-h-[68px] w-full items-center gap-3 px-4 py-2.5 text-left opacity-60 hover:bg-track/40 ${k ? 'border-t border-line' : ''}`}
                  >
                    <CategoryBadge category={i.categoryId ? categoriesById.get(i.categoryId) : null} size={40} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[15px] leading-5 font-medium text-ink">{i.merchant}</span>
                      <span className="truncate text-xs leading-4 text-muted">{r.stoppedMeta(formatDay(i.lastDate))}</span>
                    </span>
                    <span className="tabular text-[15px] font-medium whitespace-nowrap text-muted line-through">{formatMoney(i.amount)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="mx-1 mt-1 text-xs leading-[17px] text-muted">{r.footer}</p>
        </div>
      </div>
      {history.sheet}
    </>
  )
}

function ActiveRow({ item, divider, meta, onOpen }: { item: RecurringItem; divider: boolean; meta: string; onOpen(): void }) {
  const { t } = useI18n()
  const { categoriesById } = useData()
  const r = t.insights.recurring
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex min-h-[68px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-track lg:hover:bg-track/40 ${divider ? 'border-t border-line' : ''}`}
    >
      <CategoryBadge category={item.categoryId ? categoriesById.get(item.categoryId) : null} size={40} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[15px] leading-5 font-medium text-ink">{item.merchant}</span>
          <RecurringFlag item={item} />
        </span>
        <span className="truncate text-xs leading-4 text-muted">{meta}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-px">
        <span className="tabular text-[15px] leading-5 font-medium whitespace-nowrap text-ink">{formatMoney(item.amount)}</span>
        <span className="tabular text-xs leading-4 whitespace-nowrap text-muted">{item.cadence === 'yearly' ? r.per.year : r.per.month}</span>
      </span>
    </button>
  )
}
