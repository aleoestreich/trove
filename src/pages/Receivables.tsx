import { useState } from 'react'
import { useData } from '../state'
import { useI18n } from '../i18n/I18nProvider'
import { Card, EmptyState, Progress } from '../components/ui'
import { DetailHeader } from '../components/insights/parts'
import { ReceivableSheet } from '../components/Receivables'
import { Icon } from '../components/Icon'
import { isSettled, owedByPerson, owedTotal, received, remaining, type Receivable } from '../data/receivables'
import { formatDay } from '../lib/dates'
import { formatMoney } from '../lib/money'

/**
 * "A receber": what's still owed in all, then each person (most owed first)
 * with their open receivables, then the ones paid back. Tap one for its
 * payments and actions. Desktop: the people beside the total.
 */
export function Receivables() {
  const { receivables, allTransactions } = useData()
  const { t } = useI18n()
  const r = t.receivables
  const [open, setOpen] = useState<string | null>(null)
  const [showSettled, setShowSettled] = useState(false)
  const people = owedByPerson(receivables)
  const settled = receivables.filter(isSettled)
  const description = (x: Receivable) => allTransactions.find((tx) => tx.id === x.transactionId)?.description ?? r.unknownTransaction

  const row = (x: Receivable, who?: string) => {
    const left = remaining(x)
    return (
      <li key={x.id}>
        <button type="button" onClick={() => setOpen(x.id)} className="flex min-h-16 w-full items-center gap-3 py-2 text-left hover:bg-track active:bg-track lg:-mx-2 lg:w-[calc(100%+16px)] lg:rounded-sm lg:px-2">
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-[15px] leading-5 text-ink">{who ? `${who} · ${description(x)}` : description(x)}</span>
            {left > 0 && x.payments.length > 0 && <Progress value={(received(x) / x.amount) * 100} height={4} tone="income" />}
            <span className="tabular text-xs leading-4 text-muted">
              {formatDay(x.date)} · {left > 0 ? r.leftOf(formatMoney(left), formatMoney(x.amount)) : r.received(formatMoney(x.amount))}
            </span>
          </span>
          <Icon name="chevronRight" className="size-[18px] shrink-0 text-muted" />
        </button>
      </li>
    )
  }

  return (
    <>
      <DetailHeader title={r.title} subtitle={r.sub} />
      {receivables.length === 0 ? (
        <Card>
          <EmptyState icon="piggy" title={r.emptyTitle}>
            {r.emptyText}
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-5">
          <Card className="flex flex-col gap-0.5">
            <span className="text-[13px] leading-[18px] text-muted">
              {r.total}
              {people.length > 0 && ` · ${r.people(people.length)}`}
            </span>
            <span className="tabular text-[32px] leading-10 font-bold tracking-[-0.02em] text-ink">{formatMoney(owedTotal(receivables))}</span>
          </Card>

          <div className="flex flex-col gap-3">
            {people.map((p) => (
              <Card key={p.person} className="flex flex-col">
                <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
                  <h2 className="min-w-0 truncate text-base leading-[22px] font-medium text-ink">{p.person}</h2>
                  <span className="tabular shrink-0 text-base font-bold text-ink">{formatMoney(p.remaining)}</span>
                </div>
                <ul className="flex flex-col divide-y divide-line">{p.open.map((x) => row(x))}</ul>
              </Card>
            ))}

            {settled.length > 0 && (
              <Card className="flex flex-col">
                <button
                  type="button"
                  aria-expanded={showSettled}
                  onClick={() => setShowSettled(!showSettled)}
                  className="-my-2 flex min-h-12 w-full items-center justify-between gap-3 text-left"
                >
                  <span className="flex flex-col">
                    <span className="text-base leading-[22px] font-medium text-ink">{r.settled}</span>
                    <span className="text-[13px] leading-[18px] text-muted">{r.settledCount(settled.length)}</span>
                  </span>
                  <Icon name={showSettled ? 'chevronUp' : 'chevronDown'} className="size-5 shrink-0 text-ink-2" />
                </button>
                {showSettled && <ul className="mt-3 flex flex-col divide-y divide-line border-t border-line">{settled.map((x) => row(x, x.person))}</ul>}
              </Card>
            )}
          </div>
        </div>
      )}
      {open && <ReceivableSheet id={open} onClose={() => setOpen(null)} />}
    </>
  )
}
