import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useData } from '../state'
import { MONTHS_OF_HISTORY } from '../data/seed'
import type { Transaction } from '../data/types'
import { balances, expensesByCategory, inMonth, totals, visible } from '../lib/summary'
import { incomeAverage, NO_FILTER } from '../data/incomeAverage'
import { catVar } from '../components/CategoryBadge'
import { SyncBar } from '../components/SyncBar'
import { cashByCurrency, cashByInstitution } from '../lib/history'
import { installmentPlans, upcomingByMonth } from '../lib/installments'
import { currentBill, isIdleCard } from '../lib/bills'
import { dayOfMonth, formatFullDate, formatMonthName, formatMonthShort, formatShortDate, lastMonths, monthKey, toISO } from '../lib/dates'
import { formatMoney, formatPercent } from '../lib/money'
import { Card, CardTitle, IconDisc, MonthSwitcher, Overline, PageHeader, Progress, RangeSwitcher, SeeAll, Swatch, parseRange, type Range } from '../components/ui'
import { InstitutionBadge } from '../components/BankBadge'
import { CashFlowChart, StackedMonthChart, seriesColor } from '../components/charts'
import { TransactionRow } from '../components/TransactionRow'
import { AverageIncomeCard } from '../components/AverageIncome'
import { TransactionSheet } from '../components/TransactionSheet'
import { ProjectionCard, RecurringCard, UnusualCard } from '../components/insights/cards'
import { useI18n } from '../i18n/I18nProvider'
import { useIsDesktop } from '../lib/useIsDesktop'
import { shownName } from '../lib/accountLabel'

const TOP_CATEGORIES = 5
/** Complete months in the average income. */
const CURRENCY_COLORS: Record<string, string> = { BRL: 'var(--series-1)', USD: 'var(--series-3)', EUR: 'var(--series-4)' }

export function Dashboard() {
  const { accounts, transactions, allTransactions, categories, subcategories, incomeFilter, categoriesById, institutionsById, insights } = useData()
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

  // Net worth now, as the banks report it: no month-by-month reconstruction.
  const debtShare = bal.cash > 0 ? (bal.cardDebt / bal.cash) * 100 : null
  // Desktop: each bank's share of it (its accounts minus its cards).
  const netByBank = [...institutionsById.values()]
    .map((inst) => ({ inst, ...balances(accounts.filter((a) => a.institutionId === inst.id)) }))
    .filter((b) => b.cash !== 0 || b.cardDebt !== 0)
    .sort((a, b) => b.net - a.net)

  // Where the money is.
  const institutionNames = new Map([...institutionsById].map(([id, i]) => [id, i.name]))
  const byInstitution = cashByInstitution(accounts, institutionNames)
  const byCurrency = cashByCurrency(accounts)
  const foreignBalance = (currency: string) =>
    accounts.filter((a) => a.type === 'BANK' && a.foreign?.currency === currency).reduce((s, a) => s + a.foreign!.balance, 0)

  // Hidden transactions count nowhere here (balances aside: those are the bank's).
  // Everything loaded (up to a year for the charts); the month in detail is always within it.
  const counted = useMemo(() => visible(allTransactions), [allTransactions])

  // Cash flow.
  const flow = useMemo(
    () => months.map((m) => ({ month: m, label: formatMonthShort(m), ...totals(inMonth(counted, m), categoriesById) })),
    [counted, categoriesById, months],
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

  // Selected month.
  const monthTxs = useMemo(() => inMonth(counted, month), [counted, month])
  const monthTotals = totals(monthTxs, categoriesById)
  const byCategory = expensesByCategory(monthTxs, categoriesById)

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
      <PageHeader title={t.nav.overview} subtitle={t.overview.subtitle(formatFullDate(toISO(new Date())))}>
        <RangeSwitcher value={range} onChange={setRange} />
      </PageHeader>
      <SyncBar className="mb-3" />
      <div className="mb-3 lg:hidden">
        <RangeSwitcher value={range} onChange={setRange} />
      </div>

      {/* Phones: one column in reading order. Desktop: a 12-column grid, reordered. */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-12 lg:gap-5">
        {/* 1. Net worth now: the accounts' balances minus the cards' bills, as the banks report them */}
        <Card className="flex flex-col gap-4 lg:order-1 lg:col-span-8">
          <div className="flex flex-col">
            <p className="text-[13px] leading-[18px] font-medium text-muted">{t.overview.netWorth}</p>
            <p className="tabular mt-0.5 text-4xl leading-[44px] font-bold tracking-[-0.02em] text-ink lg:text-[40px] lg:leading-[48px]">
              {formatMoney(bal.net)}
            </p>
            <p className="mt-0.5 text-[13px] leading-[18px] text-muted">{t.overview.netWorthNote}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:gap-3">
            <div className="flex min-w-0 flex-col gap-0.5 rounded-md bg-page p-3 lg:px-4">
              <span className="text-xs leading-4 text-muted">{t.overview.inAccounts}</span>
              <span className="tabular truncate text-base font-medium text-ink lg:text-lg">{formatMoney(bal.cash)}</span>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5 rounded-md bg-page p-3 lg:px-4">
              <span className="text-xs leading-4 text-muted">{t.overview.cardBills}</span>
              <span className="tabular truncate text-base font-medium text-ink lg:text-lg">{formatMoney(-bal.cardDebt)}</span>
            </div>
          </div>
          <div className="hidden flex-col gap-1 border-t border-line pt-3 lg:flex">
            <Overline>{t.overview.byBankNet}</Overline>
            <div className="grid grid-cols-2 gap-x-6">
              {netByBank.map((b) => (
                <div key={b.inst.id} className="flex min-h-12 items-center gap-3 border-b border-line">
                  <InstitutionBadge institution={b.inst} size={32} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{b.inst.name}</span>
                  <span className={`tabular text-sm font-medium whitespace-nowrap ${b.net < 0 ? 'text-critical' : 'text-ink'}`}>{formatMoney(b.net)}</span>
                </div>
              ))}
            </div>
          </div>
          {debtShare !== null && (
            <div className="flex flex-col gap-1.5 lg:mt-auto">
              <Progress value={debtShare} height={6} tone={debtShare >= 50 ? 'critical' : 'bar'} label={t.overview.debtShare(formatPercent(debtShare))} role="meter" />
              <span className="tabular text-xs leading-4 text-ink-2">{t.overview.debtShare(formatPercent(debtShare))}</span>
            </div>
          )}
        </Card>

        {/* Insights: month-end projection, unusual categories, recurring charges (desktop: right below net worth) */}
        <ProjectionCard projection={insights.projection} />
        <UnusualCard unusual={insights.unusual} />
        <RecurringCard summary={insights.recurring} />

        {/* 2. Where the money is */}
        <Card className="flex flex-col gap-4 lg:order-9 lg:col-span-4">
          <CardTitle subtitle={t.overview.balancesNote}>{t.overview.whereMoney}</CardTitle>
          <div className="flex flex-col gap-2">
            <Overline className="lg:hidden">{t.overview.byCurrency}</Overline>
            <div className="flex h-3 gap-0.5 overflow-hidden rounded-xs" aria-hidden>
              {byCurrency.map((c) => (
                <div key={c.id} style={{ flexGrow: c.amount, flexBasis: 0, background: CURRENCY_COLORS[c.id] ?? 'var(--series-6)' }} />
              ))}
            </div>
            <div className="flex justify-between gap-3">
              {byCurrency.map((c, i) => (
                <div key={c.id} className={`flex min-w-0 flex-col gap-0.5 ${i > 0 ? 'items-end text-right' : ''}`}>
                  <span className="flex items-center gap-1.5 text-[13px] text-ink-2">
                    <Swatch color={CURRENCY_COLORS[c.id] ?? 'var(--series-6)'} />
                    {c.id} · {formatPercent(bal.cash > 0 ? (c.amount / bal.cash) * 100 : 0)}
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
                        {s.label} <span className="text-[13px] font-normal text-muted lg:text-xs">{formatPercent(share)}</span>
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

        {/* 3. Income vs expenses */}
        <Card className="flex flex-col gap-3.5 lg:order-6 lg:col-span-6 lg:gap-4">
          <div className="flex flex-col gap-3.5 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
            <CardTitle subtitle={t.overview.lastMonths(range)}>{t.overview.incomeVsExpenses}</CardTitle>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 lg:pt-0.5">
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

        {/* 3b. Average income (desktop: full width after the two monthly charts) */}
        {avgIncome && (
          <Card className="lg:order-8 lg:col-span-12">
            <AverageIncomeCard average={avgIncome} />
          </Card>
        )}

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

        {/* 5. Spending trend */}
        <Card className="flex flex-col gap-3.5 lg:order-7 lg:col-span-6 lg:gap-4">
          <CardTitle subtitle={t.overview.lastMonths(range)}>{t.overview.spendingByCategory}</CardTitle>
          <StackedMonthChart data={trendData} series={trendSeries} colors={trendColors} label={t.overview.spendingByCategory} />
          <ul className="flex flex-wrap gap-x-3.5 gap-y-2 lg:gap-x-4 lg:border-t lg:border-line lg:pt-3.5">
            {trendSeries.map((s, i) => (
              <li key={s.key} className="inline-flex items-center gap-1.5 text-[13px] leading-[18px] text-ink-2">
                <Swatch color={trendColors[i]} />
                {s.name}
              </li>
            ))}
          </ul>
        </Card>

        {/* 6. One month in detail */}
        <Card className="flex flex-col gap-4 !pb-2 lg:order-10 lg:col-span-8 lg:!pb-5">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{t.overview.monthInDetail}</CardTitle>
            <div className="hidden lg:block">
              <MonthSwitcher variant="compact" month={month} latest={latest} count={MONTHS_OF_HISTORY} onChange={setMonth} />
            </div>
          </div>
          <div className="-my-1 lg:hidden">
            <MonthSwitcher month={month} latest={latest} count={MONTHS_OF_HISTORY} onChange={setMonth} />
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 lg:gap-3">
            <Tile label={t.income} value={formatMoney(monthTotals.income, 'BRL', { signed: true })} tone="text-income" />
            <Tile label={t.expenses} value={formatMoney(-monthTotals.expenses, 'BRL', { signed: true })} tone="text-ink" />
            <div className="col-span-2 flex items-center justify-between rounded-md border border-line p-3 lg:col-span-1 lg:flex-col lg:items-start lg:justify-start lg:gap-0.5 lg:px-3.5">
              <span className="text-[13px] text-ink-2 lg:text-xs lg:text-muted">{t.net}</span>
              <span className={`tabular text-xl font-bold lg:text-lg ${monthTotals.net >= 0 ? 'text-ink' : 'text-critical'}`}>
                {formatMoney(monthTotals.net, 'BRL', { signed: true })}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-7">
            <div className="flex flex-col gap-1">
              <Overline className="mb-1">{t.overview.categories}</Overline>
              {byCategory.length === 0 && <p className="text-sm text-muted">{t.overview.noExpenses}</p>}
              {byCategory.map(({ category, amount }) => {
                const share = monthTotals.expenses > 0 ? (amount / monthTotals.expenses) * 100 : 0
                const key = category?.id ?? 'none'
                return (
                  <Link
                    key={key}
                    to={`/transactions?m=${month}&c=${key}`}
                    className="-mx-1 flex min-h-12 flex-col justify-center gap-1.5 rounded-sm px-1 active:bg-track lg:min-h-10 lg:hover:bg-track"
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="inline-flex min-w-0 flex-1 items-center gap-2 text-sm text-ink">
                        <Swatch color={keyColor(key)} />
                        <span className="truncate">{categoryName(category)}</span>
                      </span>
                      <span className="tabular text-[13px] text-muted lg:text-xs">{formatPercent(share)}</span>
                      <span className="tabular w-[92px] text-right text-sm font-medium text-ink">{formatMoney(amount)}</span>
                    </span>
                    <Progress value={share} height={4} tone={keyColor(key)} />
                  </Link>
                )
              })}
            </div>

            <div className="flex flex-col">
              <div className="mb-1 flex items-baseline justify-between">
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
        </Card>
      </div>

      {selected && <TransactionSheet key={selected.id} tx={selected} onClose={() => setSelected(null)} />}
    </>
  )
}

function Tile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-line p-3 lg:px-3.5">
      <span className="text-xs leading-4 text-muted">{label}</span>
      <span className={`tabular text-base font-medium lg:text-lg ${tone}`}>{value}</span>
    </div>
  )
}
