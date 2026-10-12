import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useData } from '../state'
import { useI18n } from '../i18n/I18nProvider'
import { closedMonth, type Figures } from '../data/monthClose'
import type { Transaction } from '../data/types'
import { addMonths, formatMonth, formatMonthName, formatMonthShort } from '../lib/dates'
import { formatMoney, formatPercent, signOf } from '../lib/money'
import { Card, CardTitle, Overline, Progress } from '../components/ui'
import { DetailHeader } from '../components/insights/parts'
import { CategoryBadge, catVar } from '../components/CategoryBadge'
import { TransactionRow } from '../components/TransactionRow'
import { TransactionSheet } from '../components/TransactionSheet'
import { Icon } from '../components/Icon'
import { keptLine, useBalanceVerdict, useMonthClose } from '../components/MonthClose'

const shift = (month: string, by: number) => addMonths(`${month}-01`, by).slice(0, 7)
/** "+R$ 120,00" / "−R$ 80,00" (no sign while values are hidden). */
const signed = (cents: number) => `${signOf(cents)}${formatMoney(Math.abs(cents))}`

/**
 * "Fechamento do mês" (?m=YYYY-MM, the month just closed by default): what
 * was kept, what changed from the month before and the average, the biggest
 * spending, the unusual categories and the Equilíbrio do mês against its
 * target. Any closed month that's loaded can be picked.
 */
export function MonthClose() {
  const { today, loadedFrom, storedMonths, categoriesById } = useData()
  const { t, categoryName } = useI18n()
  const m = t.monthClose
  const verdict = useBalanceVerdict()
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState<Transaction | null>(null)
  const last = closedMonth(today)
  const first = [loadedFrom, storedMonths[0]].filter((x): x is string => !!x).sort().at(-1) ?? last
  const asked = params.get('m')
  const month = asked && /^\d{4}-\d{2}$/.test(asked) && asked >= first && asked <= last ? asked : last
  const close = useMonthClose(month)
  const go = (by: number) => setParams({ m: shift(month, by) }, { replace: true })
  const name = (id: string | null) => categoryName(id ? categoriesById.get(id) : null)
  const category = (id: string | null) => (id ? categoriesById.get(id) : null)

  const nav = (
    <div className="flex items-center gap-1 self-start lg:self-auto">
      <button
        type="button"
        onClick={() => go(-1)}
        disabled={month <= first}
        aria-label={t.previousMonth}
        className="flex size-11 items-center justify-center rounded-md border border-line bg-surface text-ink-2 hover:bg-track disabled:opacity-40"
      >
        <Icon name="chevronLeft" className="size-5" />
      </button>
      <span className="min-w-[150px] text-center text-sm font-medium text-ink">{formatMonth(month)}</span>
      <button
        type="button"
        onClick={() => go(1)}
        disabled={month >= last}
        aria-label={t.nextMonth}
        className="flex size-11 items-center justify-center rounded-md border border-line bg-surface text-ink-2 hover:bg-track disabled:opacity-40"
      >
        <Icon name="chevronRight" className="size-5" />
      </button>
    </div>
  )

  if (!close)
    return (
      <>
        <DetailHeader title={m.title(formatMonthName(month))} subtitle={m.sub}>
          {nav}
        </DetailHeader>
        <Card>
          <p className="text-sm leading-5 text-ink-2">{m.empty(formatMonth(month))}</p>
        </Card>
      </>
    )

  const f = close.figures
  // A row of "O que mudou": the figure, then its change from the month before and from the average.
  const change = (label: string, key: keyof Figures, goodWhenUp: boolean) => {
    const tone = (d: number) => (d === 0 ? 'text-ink-2' : d > 0 === goodWhenUp ? 'text-income' : 'text-critical')
    const delta = (base: Figures | null, against: string) => {
      if (!base) return null
      const d = f[key] - base[key]
      return (
        <span className="text-[13px] leading-[18px] whitespace-nowrap">
          <span className={`tabular font-medium ${tone(d)}`}>{signed(d)}</span> <span className="text-muted">{against}</span>
        </span>
      )
    }
    return (
      <li className="flex min-h-14 items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
        <span className="flex min-w-0 flex-col">
          <span className="text-[13px] leading-[18px] text-ink-2">{label}</span>
          <span className="tabular text-[15px] font-medium text-ink">{formatMoney(f[key])}</span>
        </span>
        <span className="flex flex-col items-end">
          {delta(close.previous, m.vsPrevious(formatMonthShort(close.previous?.month ?? month)))}
          {delta(close.average, m.vsAverageShort)}
        </span>
      </li>
    )
  }

  return (
    <>
      <DetailHeader title={m.title(formatMonthName(month))} subtitle={m.sub}>
        {nav}
      </DetailHeader>
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
        <div className="flex flex-col gap-3 lg:gap-5">
          {/* What was kept. */}
          <Card className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <span className={`tabular text-[24px] leading-8 font-bold tracking-[-0.01em] ${f.net >= 0 ? 'text-ink' : 'text-critical'}`}>{keptLine(t, close)}</span>
              <span className="tabular text-[13px] leading-[18px] text-muted">
                {close.keptPct !== null ? m.keptPct(formatPercent(close.keptPct)) : m.noIncome} · {m.count(close.count)}
              </span>
            </div>
            <dl className="flex flex-col border-t border-line pt-1 sm:grid sm:grid-cols-3 sm:gap-2 sm:pt-3">
              {(
                [
                  [m.income, f.income],
                  [m.expenses, f.expenses],
                  [m.net, f.net],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex min-h-10 items-center justify-between gap-3 sm:min-h-0 sm:flex-col sm:items-start sm:gap-0">
                  <dt className="text-[13px] leading-[18px] text-muted sm:text-xs sm:leading-4">{label}</dt>
                  <dd className="tabular text-[15px] font-medium text-ink">{formatMoney(value)}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {/* What changed. */}
          <Card className="flex flex-col gap-2">
            <CardTitle subtitle={close.previous || close.average ? m.changedSub(close.previous ? formatMonthName(close.previous.month) : null, close.average?.months ?? null) : undefined}>
              {m.changedTitle}
            </CardTitle>
            {!close.previous && !close.average ? (
              <p className="text-sm leading-5 text-ink-2">{m.noPrevious}</p>
            ) : (
              <>
                <ul className="flex flex-col">
                  {change(m.income, 'income', true)}
                  {change(m.expenses, 'expenses', false)}
                  {change(m.net, 'net', true)}
                </ul>
                {close.changes.length > 0 && (
                  <>
                    <Overline className="mt-2">{m.movers}</Overline>
                    <ul className="flex flex-col">
                      {close.changes.map((c) => (
                        <Row key={c.categoryId ?? 'none'} badge={<CategoryBadge category={category(c.categoryId)} size={32} />} title={name(c.categoryId)} sub={`${formatMoney(c.now)} · ${m.moverWas(formatMoney(c.before))}`}>
                          <span className={`tabular text-sm font-medium whitespace-nowrap ${c.delta > 0 ? 'text-critical' : 'text-income'}`}>{signed(c.delta)}</span>
                        </Row>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-3 lg:gap-5">
          {/* The biggest spending. */}
          <Card className="flex flex-col gap-2">
            <CardTitle>{m.biggestTitle}</CardTitle>
            {close.topCategories.length > 0 && (
              <>
                <Overline>{m.byCategory}</Overline>
                <ul className="flex flex-col">
                  {close.topCategories.map((c) => (
                    <li key={c.categoryId ?? 'none'} className="flex flex-col gap-1.5 border-b border-line py-2.5 last:border-b-0">
                      <span className="flex items-center gap-3">
                        <CategoryBadge category={category(c.categoryId)} size={32} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm leading-[19px] text-ink">{name(c.categoryId)}</span>
                          <span className="tabular text-xs leading-4 text-muted">{m.share(formatPercent(c.share))}</span>
                        </span>
                        <span className="tabular text-sm font-medium whitespace-nowrap text-ink">{formatMoney(c.amount)}</span>
                      </span>
                      <Progress value={c.share} height={4} tone={c.categoryId ? catVar(category(c.categoryId)?.color ?? 'slate') : 'var(--muted)'} />
                    </li>
                  ))}
                </ul>
              </>
            )}
            {close.biggest.length > 0 && (
              <>
                <Overline className="mt-2">{m.largest}</Overline>
                <div className="flex flex-col divide-y divide-line">
                  {close.biggest.map((tx) => (
                    <TransactionRow key={tx.id} tx={tx} onSelect={setSelected} showDate />
                  ))}
                </div>
              </>
            )}
          </Card>

          {/* Unusual categories. */}
          <Card className="flex flex-col gap-2">
            <CardTitle>{m.unusualTitle}</CardTitle>
            {close.unusual === null ? (
              <p className="text-sm leading-5 text-ink-2">{m.unusualNoHistory}</p>
            ) : close.unusual.length === 0 ? (
              <p className="text-sm leading-5 text-ink-2">{m.unusualNone}</p>
            ) : (
              <ul className="flex flex-col">
                {close.unusual.map((c) => (
                  <Row
                    key={c.categoryId}
                    badge={<CategoryBadge category={category(c.categoryId)} size={32} />}
                    title={name(c.categoryId)}
                    sub={m.unusualRow(formatPercent(Math.abs(c.pct) * 100), c.pct > 0, formatMoney(c.avg))}
                  >
                    <span className={`tabular text-sm font-medium whitespace-nowrap ${c.delta > 0 ? 'text-critical' : 'text-income'}`}>{signed(c.delta)}</span>
                  </Row>
                ))}
              </ul>
            )}
          </Card>

          {/* The goal: Equilíbrio do mês. */}
          <Card className="flex flex-col gap-2">
            <CardTitle>{m.goalsTitle}</CardTitle>
            {close.balance ? (
              <>
                <p className="tabular text-sm leading-5 text-ink-2">{verdict(close.balance.status)}</p>
                {close.balance.shares && (
                  <ul className="flex flex-col">
                    {(['essential', 'lifestyle', 'future'] as const).map((g) => (
                      <li key={g} className="flex min-h-11 items-center justify-between gap-3 border-b border-line text-sm last:border-b-0">
                        <span className="text-ink">{t.spendingBalance.groups[g]}</span>
                        <span className="tabular flex items-baseline gap-2">
                          <span className="font-medium text-ink">{formatPercent(close.balance!.shares![g])}</span>
                          <span className="text-xs text-muted">{m.goalsTarget(formatPercent(close.balance!.target[g]))}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <TextLink to={`/balance?m=${month}`}>{m.goalsOpen}</TextLink>
              </>
            ) : (
              <>
                <p className="text-sm leading-5 text-ink-2">{m.goalsNone}</p>
                <TextLink to="/balance/organize">{m.goalsOrganize}</TextLink>
              </>
            )}
          </Card>
        </div>
      </div>
      {selected && <TransactionSheet key={selected.id} tx={selected} onClose={() => setSelected(null)} />}
    </>
  )
}

function Row({ badge, title, sub, children }: { badge: ReactNode; title: string; sub: string; children: ReactNode }) {
  return (
    <li className="flex min-h-14 items-center gap-3 border-b border-line py-2 last:border-b-0">
      {badge}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm leading-[19px] text-ink">{title}</span>
        <span className="tabular text-xs leading-4 text-muted">{sub}</span>
      </span>
      {children}
    </li>
  )
}

function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="-ml-3 inline-flex h-11 items-center gap-1 self-start rounded-md px-3 text-sm font-medium text-accent hover:bg-accent-faint">
      {children}
      <Icon name="chevronRight" className="size-4" strokeWidth={2} />
    </Link>
  )
}
