import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useData, useSync } from '../state'
import type { Transaction } from '../data/types'
import { balances, expensesByCategory, inMonth, totals, visible } from '../lib/summary'
import { incomeAverage, NO_FILTER } from '../data/incomeAverage'
import { CategoryBadge, catVar } from '../components/CategoryBadge'
import { SyncBar } from '../components/SyncBar'
import { FgtsNetWorthLine, showsFgtsLine } from '../components/Fgts'
import { PensionNetWorthLine, showsPensionLine } from '../components/Pension'
import { BalancesReminder } from '../components/BalancesReminder'
import { cashByCurrency, cashByInstitution } from '../lib/history'
import { installmentPlans, upcomingByMonth } from '../lib/installments'
import { currentBill, isIdleCard } from '../lib/bills'
import { dayOfMonth, daysBetween, formatDay, formatFullDate, formatMonthName, formatMonthShort, formatShortDate, formatTime, lastMonths, monthKey, toISO } from '../lib/dates'
import { useMonthCounts, useStoredTransactions } from '../lib/storedMonths'
import { MonthPicker, monthTitle } from '../components/MonthPicker'
import { formatCompactMoney, formatMoney, formatPercent, formatWholeMoney, signOf } from '../lib/money'
import { Card, CardTitle, IconDisc, Overline, PageHeader, Progress, RangeSwitcher, SeeAll, Swatch, parseRange, type Range } from '../components/ui'
import { InstitutionBadge } from '../components/BankBadge'
import { CashFlowChart, StackedMonthChart, seriesColor } from '../components/charts'
import { TransactionRow } from '../components/TransactionRow'
import { AverageIncomeCard } from '../components/AverageIncome'
import { TransactionSheet } from '../components/TransactionSheet'
import { ProjectionCard, RecurringCard, UnusualCard } from '../components/insights/cards'
import { useI18n } from '../i18n/I18nProvider'
import { useIsDesktop } from '../lib/useIsDesktop'
import { Icon, type IconName } from '../components/Icon'
import { messages } from '../i18n/messages'
import { shownName } from '../lib/accountLabel'

const TOP_CATEGORIES = 5
/** Complete months in the average income. */
const CURRENCY_COLORS: Record<string, string> = { BRL: 'var(--series-1)', USD: 'var(--series-3)', EUR: 'var(--series-4)' }

export function Dashboard() {
  const { accounts, transactions, allTransactions, categories, subcategories, incomeFilter, categoriesById, institutionsById, insights, storedMonths, loadedFrom } = useData()
  const isDesktop = useIsDesktop()
  const [params, setParams] = useSearchParams()
  const { t, categoryName } = useI18n()
  const latest = monthKey(toISO(new Date()))
  const month = params.get('m') ?? latest
  // The period of the multi-month charts (net worth, income vs expenses, spending by category).
  const range = parseRange(params.get('r'))
  const months = useMemo(() => lastMonths(latest, range), [latest, range])
  const [selected, setSelected] = useState<Transaction | null>(null)

  const bal = balances(accounts)

  // Where the money is.
  const institutionNames = new Map([...institutionsById].map(([id, i]) => [id, i.name]))
  const byInstitution = cashByInstitution(accounts, institutionNames)
  const byCurrency = cashByCurrency(accounts)
  const foreignBalance = (currency: string) =>
    accounts.filter((a) => a.type === 'BANK' && a.foreign?.currency === currency).reduce((s, a) => s + a.foreign!.balance, 0)

  // Hidden transactions count nowhere here (balances aside: those are the bank's).
  // Everything loaded (up to a year for the charts); the month in detail is always within it.
  const counted = useMemo(() => visible(allTransactions), [allTransactions])

  // The first month with data: earlier months in the period are drawn dashed, with a note.
  const firstMonth = storedMonths[0] ?? latest
  const shortHistory = months[0] < firstMonth
  const empty = months.map((m) => m < firstMonth)

  // Cash flow.
  const flow = useMemo(
    () => months.map((m) => ({ month: m, label: formatMonthShort(m), empty: m < firstMonth, ...totals(inMonth(counted, m), categoriesById) })),
    [counted, categoriesById, months, firstMonth],
  )
  // The cash flow card's figures: the current month (the month picker belongs to "Mês em detalhe").
  const thisMonth = flow[flow.length - 1]
  // Average income: the last 6 complete months, the current one compared with it,
  // counting the income categories chosen on the card (src/data/incomeAverage.ts, shared with the server).
  const avgIncome = useMemo(
    () => incomeAverage(transactions, categories, subcategories, incomeFilter ?? NO_FILTER, latest),
    [transactions, categories, subcategories, incomeFilter, latest],
  )
  const keptPct = thisMonth.income > 0 ? (thisMonth.net / thisMonth.income) * 100 : null

  // Spending trend: top categories over the period, the rest folded into "Other".
  const periodTxs = useMemo(() => counted.filter((tx) => monthKey(tx.date) >= months[0]), [counted, months])
  const periodByCategory = expensesByCategory(periodTxs, categoriesById)
  const top = periodByCategory.slice(0, TOP_CATEGORIES)
  const hasOther = periodByCategory.length > TOP_CATEGORIES
  const trendSeries = [
    ...top.map((c) => ({ key: c.category?.id ?? 'none', name: categoryName(c.category) })),
    ...(hasOther ? [{ key: 'other', name: t.other }] : []),
  ]
  const trendData = months.map((m) => {
    const row: Record<string, number | string> = { label: formatMonthShort(m) }
    for (const c of expensesByCategory(inMonth(counted, m), categoriesById)) {
      const id = c.category?.id ?? 'none'
      const key = top.some((x) => (x.category?.id ?? 'none') === id) ? id : 'other'
      row[key] = Number(row[key] ?? 0) + c.amount
    }
    return row
  })
  // Each category in its own colour; uncategorized in muted; categories outside the top 5 share "Other".
  const keyColor = (key: string) => (key === 'other' ? seriesColor(5) : key === 'none' ? 'var(--muted)' : catVar(categoriesById.get(key)?.color ?? 'slate'))
  const trendColors = trendSeries.map((s) => keyColor(s.key))

  // Coming up: open card bills + installments charged next month.
  const plans = useMemo(() => installmentPlans(transactions), [transactions])
  // Coming up: cards with something to pay now or later.
  const cards = accounts.filter((a) => a.type === 'CREDIT' && !isIdleCard(a, transactions, plans))
  const nextMonthKey = monthKey(dayOfMonth(new Date(), 1, 1))
  const nextMonthInstallments = upcomingByMonth(plans).find((m) => m.month === nextMonthKey)?.amount ?? 0
  const nextMonthPurchases = plans.filter((p) => p.upcoming.some((u) => u.month === nextMonthKey)).length

  // Selected month: any stored one; one older than what's loaded is fetched first.
  const { months: pickable, counts } = useMonthCounts(latest)
  const older = !!loadedFrom && month < loadedFrom
  const stored = useStoredTransactions(older ? { month } : null)
  const monthTxs = useMemo(() => inMonth(counted, month), [counted, month])
  const monthTotals = totals(monthTxs, categoriesById)
  const byCategory = expensesByCategory(monthTxs, categoriesById).slice(0, TOP_CATEGORIES)


  // Each control keeps the other's choice in the address.
  const setParam = (key: 'm' | 'r', value: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        next.set(key, value)
        return next
      },
      { replace: true },
    )
  const setMonth = (m: string) => setParam('m', m)
  const setRange = (r: Range) => setParam('r', String(r))

  return (
    <>
      <PageHeader title={t.nav.overview} subtitle={t.overview.subtitle(formatFullDate(toISO(new Date())))} />
      <SyncBar className="mb-3" />
      <BalancesReminder className="mb-3 lg:mb-5" />

      {/* Phones: one column in reading order. Desktop: a 12-column grid, reordered. */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-12 lg:gap-5">
        {/* 1. Net worth today: the accounts' balances minus the open card bills, as the banks report them */}
        <NetWorthCard className="lg:order-1 lg:col-span-8 lg:self-start" />

        {/* Insights: month-end projection, unusual categories, recurring charges (desktop: right below net worth) */}
        <ProjectionCard projection={insights.projection} />
        <UnusualCard unusual={insights.unusual} />
        <RecurringCard summary={insights.recurring} />

        {/* 2. Where the money is */}
        <Card className="flex flex-col gap-4 lg:order-9 lg:col-span-4">
          <CardTitle subtitle={t.overview.balancesNote}>{t.overview.whereMoney}</CardTitle>
          <div className="flex flex-col gap-2">
            <Overline className="lg:hidden">{t.overview.byCurrency}</Overline>
            <div data-progress className="flex h-3 gap-0.5 overflow-hidden rounded-xs" aria-hidden>
              {byCurrency.map((c) => (
                <div key={c.id} style={{ flexGrow: c.amount, flexBasis: 0, background: CURRENCY_COLORS[c.id] ?? 'var(--series-6)' }} />
              ))}
            </div>
            <div className="flex justify-between gap-3">
              {byCurrency.map((c, i) => (
                <div key={c.id} className={`flex min-w-0 flex-col gap-0.5 ${i > 0 ? 'items-end text-right' : ''}`}>
                  <span className="flex items-center gap-1.5 text-[13px] text-ink-2">
                    <Swatch color={CURRENCY_COLORS[c.id] ?? 'var(--series-6)'} />
                    {c.id} · <span className="tabular">{formatPercent(bal.cash > 0 ? (c.amount / bal.cash) * 100 : 0)}</span>
                  </span>
                  <span className="tabular text-[15px] font-medium text-ink lg:text-sm">
                    {c.id === 'BRL' ? formatMoney(c.amount) : formatMoney(foreignBalance(c.id), c.id as 'USD')}
                  </span>
                  {c.id !== 'BRL' && <span className="tabular text-xs text-muted">≈ {formatMoney(c.amount)}</span>}
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col lg:border-t lg:border-line lg:pt-3">
            <Overline className="mb-1 lg:hidden">{t.overview.byBank}</Overline>
            {byInstitution.map((s) => {
              const share = bal.cash > 0 ? (s.amount / bal.cash) * 100 : 0
              return (
                <div key={s.id} className="flex min-h-[60px] items-center gap-3 lg:min-h-[52px]">
                  <InstitutionBadge institution={institutionsById.get(s.id)!} size={isDesktop ? 32 : 36} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[15px] font-medium text-ink lg:text-sm">
                        {s.label} <span className="tabular text-[13px] font-normal text-muted lg:text-xs">{formatPercent(share)}</span>
                      </span>
                      <span className="tabular text-[15px] font-medium whitespace-nowrap text-ink lg:text-sm">{formatMoney(s.amount)}</span>
                    </div>
                    <Progress value={share} height={4} tone="bar" />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* 4. Coming up */}
        <Card className="flex flex-col gap-2 lg:order-2 lg:col-span-4">
          <CardTitle subtitle={t.overview.openCardBills}>{t.overview.comingUp}</CardTitle>
          {cards.map((c) => {
            // The bill from the billing cycle; the balance only when the bank gives no closing date.
            const bill = currentBill(c, transactions, plans)
            const dueDate = bill ? bill.dueDate : c.creditData?.balanceDueDate
            return (
              <Link key={c.id} to={bill ? `/transactions?bill=${c.id}` : `/transactions?m=all&a=${c.id}`} className="flex min-h-[60px] items-center gap-3 border-b border-line active:bg-track">
                <InstitutionBadge institution={institutionsById.get(c.institutionId)!} size={36} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-medium text-ink lg:text-sm">{shownName(c, t.cardOf(institutionsById.get(c.institutionId)!.name))}</span>
                  {dueDate && <span className="text-[13px] text-muted">{t.overview.due(formatShortDate(dueDate))}</span>}
                </span>
                <span className="tabular text-[15px] font-medium whitespace-nowrap text-ink">{formatMoney(bill ? bill.amount : c.balance)}</span>
              </Link>
            )
          })}
          <Link to="/installments" className="flex min-h-16 items-center gap-3 active:bg-track lg:mt-auto lg:rounded-md lg:bg-page lg:p-3.5">
            <IconDisc icon="installments" size="sm" tone="accent" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-medium text-ink lg:text-sm">{t.overview.installmentsNextMonth}</span>
              <span className="text-[13px] text-muted">{t.overview.nextMonthPurchases(formatMonthName(nextMonthKey), nextMonthPurchases)}</span>
            </span>
            <span className="tabular text-[15px] font-medium whitespace-nowrap text-ink">{formatMoney(nextMonthInstallments)}</span>
          </Link>
        </Card>

        {/* Trend: the period of the multi-month charts, right above them */}
        <section aria-labelledby="trend-title" className="mt-3 flex flex-col gap-3 lg:order-6 lg:col-span-12 lg:mt-0 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-baseline justify-between gap-3 px-1 lg:flex-col lg:items-start lg:gap-0.5 lg:px-0">
            <h2 id="trend-title" className="text-lg leading-6 font-medium text-ink">
              {t.overview.trend}
            </h2>
            <span className="text-[13px] leading-[18px] text-ink-2">{spanLabel(months)}</span>
          </div>
          <div className="lg:w-[330px]">
            <RangeSwitcher value={range} onChange={setRange} />
          </div>
          {shortHistory && (
            <p className="flex items-start gap-2.5 px-1 text-[13px] leading-[18px] text-ink-2 lg:hidden">
              <Icon name="info" className="mt-px size-[18px] shrink-0 text-ink-2" />
              {t.overview.shortHistory(`${formatMonthShort(firstMonth)} ${firstMonth.slice(0, 4)}`)}
            </p>
          )}
        </section>
        {shortHistory && (
          <p className="hidden items-center gap-2.5 text-[13px] leading-[18px] text-ink-2 lg:order-6 lg:col-span-12 lg:-mt-2 lg:flex">
            <Icon name="info" className="size-[18px] shrink-0" />
            {t.overview.shortHistory(`${formatMonthShort(firstMonth)} ${firstMonth.slice(0, 4)}`)}
          </p>
        )}

        {/* 3. Income vs expenses */}
        <Card className="flex flex-col gap-3.5 lg:order-6 lg:col-span-6 lg:gap-4">
          <div className="flex flex-col gap-3.5 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
            <CardTitle subtitle={t.overview.lastMonths(range)}>{t.overview.incomeVsExpenses}</CardTitle>
            <div data-legend className="flex flex-wrap gap-x-4 gap-y-1.5 lg:pt-0.5">
              <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
                <Swatch color="var(--income)" />
                {t.income}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
                <Swatch color="var(--ink-2)" />
                {t.expenses}
              </span>
            </div>
          </div>
          <CashFlowChart data={flow} label={t.overview.incomeVsExpenses} />
          <div className="grid grid-cols-2 gap-3 border-t border-line pt-3 lg:grid-cols-3 lg:pt-3.5">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs leading-4 text-muted">
                {t.income} · {thisMonth.label}
              </span>
              <span className="tabular text-base font-medium text-income lg:text-[17px]">{formatMoney(thisMonth.income, 'BRL', { signed: true })}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs leading-4 text-muted">
                {t.expenses} · {thisMonth.label}
              </span>
              <span className="tabular text-base font-medium text-ink lg:text-[17px]">{formatMoney(-thisMonth.expenses, 'BRL', { signed: true })}</span>
            </div>
            {keptPct !== null && (
              <div className="hidden flex-col gap-0.5 lg:flex">
                <span className="text-xs leading-4 text-muted">{t.overview.keptShort}</span>
                <span className={`tabular text-[17px] font-bold ${keptPct >= 0 ? 'text-ink' : 'text-critical'}`}>{formatPercent(keptPct)}</span>
              </div>
            )}
          </div>
          {keptPct !== null && (
            <div className="flex items-center gap-3.5 rounded-md bg-page p-3 lg:hidden">
              <span className={`tabular text-[28px] leading-8 font-bold tracking-[-0.02em] ${keptPct >= 0 ? 'text-ink' : 'text-critical'}`}>
                {formatPercent(keptPct)}
              </span>
              <div className="flex flex-1 flex-col gap-1.5">
                <span className="text-[13px] leading-[18px] text-ink-2">{t.overview.kept}</span>
                <Progress value={keptPct} height={6} tone="income" />
              </div>
            </div>
          )}
        </Card>

        {/* 5. Spending trend */}
        <Card className="flex flex-col gap-3.5 lg:order-7 lg:col-span-6 lg:gap-4">
          <CardTitle subtitle={t.overview.lastMonths(range)}>{t.overview.spendingByCategory}</CardTitle>
          <StackedMonthChart data={trendData} series={trendSeries} colors={trendColors} label={t.overview.spendingByCategory} months={months} empty={empty} />
          <ul data-legend className="flex flex-wrap gap-x-3.5 gap-y-2 lg:gap-x-4 lg:border-t lg:border-line lg:pt-3.5">
            {trendSeries.map((s, i) => (
              <li key={s.key} className="inline-flex items-center gap-1.5 text-[13px] leading-[18px] text-ink-2">
                <Swatch color={trendColors[i]} />
                {s.name}
              </li>
            ))}
          </ul>
        </Card>

        {/* 3b. Average income (desktop: full width after the two monthly charts) */}
        {avgIncome && (
          <Card className="lg:order-8 lg:col-span-12">
            <AverageIncomeCard average={avgIncome} />
          </Card>
        )}

        {/* 6. One month in detail: any stored month (older ones fetched), its totals, top categories and latest transactions */}
        <Card className="flex flex-col gap-3 !pb-2 lg:order-10 lg:col-span-8 lg:!pb-5">
          <CardTitle>{t.overview.monthInDetail}</CardTitle>
          <MonthPicker month={month} months={pickable} latest={latest} today={toISO(new Date())} counts={counts} onChange={setMonth} />
          {stored.status === 'loading' ? (
            <div className="flex flex-col gap-3" aria-busy>
              <p role="status" className="flex items-center gap-2.5 py-1 text-[13px] leading-[18px] text-ink-2">
                <Icon name="refresh" className="size-[18px] text-accent motion-safe:animate-spin" strokeWidth={2} />
                {t.overview.fetchingMonth(monthTitle(month))}
              </p>
              <div className="grid grid-cols-3 gap-2" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 rounded-md bg-track" />
                ))}
              </div>
              <div className="flex flex-col gap-3 pb-3" aria-hidden>
                <div className="h-3 w-4/5 rounded-full bg-track" />
                <div className="h-3 w-3/5 rounded-full bg-track" />
                <div className="h-3 w-1/2 rounded-full bg-track" />
              </div>
            </div>
          ) : stored.status === 'error' ? (
            <div role="alert" className="mb-2 flex items-center gap-3 rounded-md border border-critical/30 bg-critical-soft py-1.5 pr-1.5 pl-3 text-[13px] leading-[18px] text-ink">
              <Icon name="alert" className="size-[18px] shrink-0 text-critical" />
              <span className="min-w-0 flex-1">{t.overview.fetchMonthFailed(monthTitle(month))}</span>
              <button type="button" onClick={stored.retry} className="h-11 shrink-0 rounded-sm px-2 text-sm font-medium text-accent hover:bg-accent-faint">
                {t.tryAgain}
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 lg:gap-3">
                <Tile label={t.income} value={formatWhole(monthTotals.income)} tone="text-income" />
                <Tile label={t.expenses} value={formatWhole(-monthTotals.expenses)} tone="text-ink" />
                <Tile label={t.net} value={formatWhole(monthTotals.net)} tone={monthTotals.net >= 0 ? 'text-ink' : 'text-critical'} />
              </div>

              <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-7">
                <div className="flex flex-col">
                  <Overline className="mt-1 mb-1">{t.overview.topCategories}</Overline>
                  {byCategory.length === 0 && <p className="text-sm text-muted">{t.overview.noExpenses}</p>}
                  {byCategory.map(({ category, amount }) => {
                    const share = monthTotals.expenses > 0 ? (amount / monthTotals.expenses) * 100 : 0
                    const key = category?.id ?? 'none'
                    return (
                      <Link
                        key={key}
                        to={`/transactions?m=${month}&c=${key}`}
                        className="-mx-1 flex min-h-14 items-center gap-3 rounded-sm px-1 active:bg-track lg:hover:bg-track"
                      >
                        <CategoryBadge category={category ?? null} size={32} />
                        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[15px] text-ink lg:text-sm">{categoryName(category)}</span>
                            <span className="tabular text-[15px] font-medium whitespace-nowrap text-ink lg:text-sm">{formatMoney(amount)}</span>
                          </span>
                          <Progress value={share} height={6} tone={keyColor(key)} />
                        </span>
                      </Link>
                    )
                  })}
                </div>

                <div className="flex flex-col">
                  <div className="mt-1 mb-1 flex items-baseline justify-between">
                    <Overline>{t.overview.latestTransactions}</Overline>
                    <Link to={`/transactions?m=${month}`} className="hidden text-[13px] font-medium text-accent hover:underline lg:inline">
                      {t.seeAll}
                    </Link>
                  </div>
                  <div className="lg:divide-y lg:divide-line">
                    {monthTxs.slice(0, 5).map((tx) => (
                      <TransactionRow key={tx.id} tx={tx} onSelect={setSelected} showDate className="lg:min-h-[52px]" />
                    ))}
                  </div>
                  <div className="lg:hidden">
                    <SeeAll to={`/transactions?m=${month}`}>{t.seeAll}</SeeAll>
                  </div>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      {selected && <TransactionSheet key={selected.id} tx={selected} onClose={() => setSelected(null)} />}
    </>
  )
}

/** A month's figure in whole reais, signed: "+R$ 6.800", "−R$ 3.215"; from R$ 10 mil, compact ("+R$ 12,5 mil") to fit three across. */
const formatWhole = (cents: number) =>
  `${signOf(cents)}${Math.abs(cents) >= 10_000_00 ? formatCompactMoney(Math.abs(cents)) : formatWholeMoney(Math.abs(cents))}`

/** "abr. a set. 2026" within a year; "out. 2025 a set. 2026" across two. */
function spanLabel(months: string[]): string {
  const first = months[0]
  const last = months[months.length - 1]
  const sameYear = first.slice(0, 4) === last.slice(0, 4)
  return messages.overview.span(sameYear ? formatMonthShort(first) : `${formatMonthShort(first)} ${first.slice(0, 4)}`, `${formatMonthShort(last)} ${last.slice(0, 4)}`)
}

function Tile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-md bg-page px-2.5 py-2 lg:px-3">
      <span className="truncate text-xs leading-4 text-muted">{label}</span>
      <span className={`tabular truncate text-[15px] leading-5 font-bold ${tone}`}>{value}</span>
    </div>
  )
}

/**
 * Net worth today: money in the accounts minus the open card bills, as the
 * banks report them (no history, no chart). A bank that failed the latest
 * sync is named, with the day of the balance used and "Tentar de novo";
 * a negative total gets a neutral note. The FGTS and previdência balances
 * tracked by hand are lines of their own below the tiles, not in the total.
 */
function NetWorthCard({ className }: { className: string }) {
  const { accounts, fgts, pension } = useData()
  const { info, failed, sync } = useSync()
  const { t } = useI18n()
  const o = t.overview
  const bal = balances(accounts)
  const cashAccounts = accounts.filter((a) => a.type === 'BANK').length
  const cards = accounts.filter((a) => a.type === 'CREDIT').length
  const stale = failed[0]
  const staleAt = stale && info?.connections.find((c) => c.id === stale.id)?.lastSyncedAt
  const updated = info?.lastSyncedAt ? when(new Date(info.lastSyncedAt), o) : null
  return (
    <Card className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] leading-[18px] text-muted">{o.netWorth}</p>
        <Link to="/accounts" className="-my-3 -mr-2 inline-flex h-11 items-center gap-0.5 rounded-sm px-2 text-[13px] font-medium text-accent hover:bg-accent-faint">
          {o.accountsLink}
          <Icon name="chevronRight" className="size-4" strokeWidth={2} />
        </Link>
      </div>
      <p className="tabular text-[34px] leading-[42px] font-bold tracking-[-0.02em] text-ink lg:text-[36px] lg:leading-[44px]">
        {`${bal.net < 0 ? signOf(bal.net) : ''}${formatMoney(Math.abs(bal.net))}`}
      </p>
      <div className="grid grid-cols-2 gap-2 lg:gap-3">
        <NetWorthTile icon="checking" label={o.inAccounts} value={formatMoney(bal.cash)} sub={o.accountsCount(cashAccounts)} />
        <NetWorthTile icon="card" label={o.cardBills} value={`${signOf(-bal.cardDebt)}${formatMoney(bal.cardDebt)}`} sub={o.cardsCount(cards)} />
      </div>
      {/* The FGTS and the previdência, apart from what's added up. */}
      <FgtsNetWorthLine />
      <PensionNetWorthLine />
      {stale ? (
        <>
          <p role="status" className="flex items-start gap-2.5 rounded-md border border-critical/30 bg-critical-soft px-3 py-2.5 text-[13px] leading-[18px] text-ink">
            <Icon name="alert" className="mt-px size-[18px] shrink-0 text-critical" />
            {o.bankStale(stale.name ?? '?', staleAt ? formatDay(brazilDay(staleAt)) : '—')}
          </p>
          <button
            type="button"
            onClick={() => sync(failed.map((f) => f.id))}
            className="-my-1 -ml-2 inline-flex h-11 items-center gap-1.5 self-start rounded-sm px-2 text-sm font-medium text-accent hover:bg-accent-faint"
          >
            <Icon name="sync" className="size-[18px]" />
            {t.tryAgain}
          </button>
        </>
      ) : (
        bal.net < 0 && (
          <p className="flex items-start gap-2.5 rounded-md bg-page px-3 py-2.5 text-[13px] leading-[18px] text-ink">
            <Icon name="info" className="mt-px size-[18px] shrink-0 text-ink-2" />
            {o.negativeNote}
          </p>
        )
      )}
      {!stale && (
        <p className="flex items-start gap-2 text-xs leading-4 text-ink-2">
          <Icon name="info" className="size-3.5 shrink-0 text-muted" />
          <span>
            {showsFgtsLine(fgts) || showsPensionLine(pension) ? (
              showsFgtsLine(fgts) && showsPensionLine(pension) ? (
                t.netWorthNotes.both
              ) : showsFgtsLine(fgts) ? (
                t.netWorthNotes.fgts
              ) : (
                t.netWorthNotes.pension
              )
            ) : (
              <>
                {o.netWorthNote}
                {updated && ` · ${o.updated(updated)}`}
              </>
            )}
          </span>
        </p>
      )}
    </Card>
  )
}

function NetWorthTile({ icon, label, value, sub }: { icon: IconName; label: string; value: string; sub: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-md bg-page px-3 py-2.5">
      <span className="inline-flex min-w-0 items-center gap-1.5 text-xs leading-4 text-ink-2">
        <Icon name={icon} className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <span className="tabular truncate text-[17px] leading-6 font-bold text-ink">{value}</span>
      <span className="text-xs leading-4 text-muted">{sub}</span>
    </div>
  )
}

/** "hoje às 10:00", "ontem às 10:00", "em 06/10 às 10:00". */
function when(at: Date, o: typeof messages.overview): string {
  const days = daysBetween(at, new Date())
  const time = formatTime(at)
  return days === 0 ? o.today(time) : days === 1 ? o.yesterday(time) : o.onDate(formatShortDate(toISO(at)), time)
}

/** The day of a moment, in this device's time zone (YYYY-MM-DD). */
const brazilDay = (iso: string) => toISO(new Date(iso))
