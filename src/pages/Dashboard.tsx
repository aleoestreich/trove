import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useData } from '../state'
import { MONTHS_OF_HISTORY } from '../data/seed'
import type { Transaction } from '../data/types'
import { balances, expensesByCategory, inMonth, totals } from '../lib/summary'
import { balanceHistory, cashByCurrency, cashByInstitution } from '../lib/history'
import { installmentPlans, upcomingByMonth } from '../lib/installments'
import { dayOfMonth, formatFullDate, formatMonth, formatMonthName, formatMonthShort, formatShortDate, lastMonths, monthKey, toISO } from '../lib/dates'
import { formatMoney, formatPercent } from '../lib/money'
import { Badge, Card, CardTitle, IconDisc, MonthSwitcher, Overline, PageHeader, Progress, SeeAll, Swatch } from '../components/ui'
import { InstitutionBadge } from '../components/BankBadge'
import { CashFlowChart, NetWorthChart, SpendingTrendChart, seriesColor } from '../components/charts'
import { TransactionRow } from '../components/TransactionRow'
import { TransactionSheet } from '../components/TransactionSheet'
import { useI18n } from '../i18n/I18nProvider'
import { useIsDesktop } from '../lib/useIsDesktop'

const TOP_CATEGORIES = 5
const CURRENCY_COLORS: Record<string, string> = { BRL: 'var(--series-1)', USD: 'var(--series-3)', EUR: 'var(--series-4)' }

export function Dashboard() {
  const { accounts, transactions, categoriesById, institutionsById } = useData()
  const isDesktop = useIsDesktop()
  const [params, setParams] = useSearchParams()
  const { t, categoryName, locale } = useI18n()
  const latest = monthKey(toISO(new Date()))
  const month = params.get('m') ?? latest
  const months = useMemo(() => lastMonths(latest, MONTHS_OF_HISTORY), [latest])
  const [selected, setSelected] = useState<Transaction | null>(null)

  const bal = balances(accounts)

  // Net worth history (month ends; the last point is today) and the change since last month.
  const history = useMemo(() => balanceHistory(accounts, transactions, months), [accounts, transactions, months])
  const netPoints = history.map((h) => ({ label: formatMonthShort(h.month), net: h.net, cash: h.cash, cardDebt: h.cardDebt }))
  const previous = history.length > 1 ? history[history.length - 2].net : history[0].net
  const change = bal.net - previous
  const changePct = previous !== 0 ? (change / Math.abs(previous)) * 100 : 0

  // Where the money is.
  const institutionNames = new Map([...institutionsById].map(([id, i]) => [id, i.name]))
  const byInstitution = cashByInstitution(accounts, institutionNames)
  const byCurrency = cashByCurrency(accounts)
  const foreignBalance = (currency: string) =>
    accounts.filter((a) => a.type === 'BANK' && a.foreign?.currency === currency).reduce((s, a) => s + a.foreign!.balance, 0)

  // Cash flow. `locale` is a dependency because the labels are formatted text.
  const flow = useMemo(
    () => months.map((m) => ({ month: m, label: formatMonthShort(m), ...totals(inMonth(transactions, m), categoriesById) })),
    [transactions, categoriesById, months, locale],
  )
  // Figures for the selected month (the current one by default).
  const thisMonth = flow.find((f) => f.month === month) ?? flow[flow.length - 1]
  const keptPct = thisMonth.income > 0 ? (thisMonth.net / thisMonth.income) * 100 : null

  // Spending trend: top categories over the period, the rest folded into "Other".
  const periodTxs = useMemo(() => transactions.filter((tx) => monthKey(tx.date) >= months[0]), [transactions, months])
  const periodByCategory = expensesByCategory(periodTxs, categoriesById)
  const top = periodByCategory.slice(0, TOP_CATEGORIES)
  const hasOther = periodByCategory.length > TOP_CATEGORIES
  const trendSeries = [
    ...top.map((c) => ({ key: c.category.id, name: categoryName(c.category) })),
    ...(hasOther ? [{ key: 'other', name: t.other }] : []),
  ]
  const trendData = months.map((m) => {
    const row: Record<string, number | string> = { label: formatMonthShort(m) }
    for (const c of expensesByCategory(inMonth(transactions, m), categoriesById)) {
      const key = top.some((x) => x.category.id === c.category.id) ? c.category.id : 'other'
      row[key] = Number(row[key] ?? 0) + c.amount
    }
    return row
  })
  // A category keeps its chart colour everywhere; categories outside the top 5 share "Other".
  const categoryColor = (id: string) => {
    const i = top.findIndex((c) => c.category.id === id)
    return i >= 0 ? seriesColor(i) : seriesColor(5)
  }

  // Coming up: open card bills + installments charged next month.
  const cards = accounts.filter((a) => a.type === 'CREDIT')
  const plans = useMemo(() => installmentPlans(transactions), [transactions])
  const nextMonthKey = monthKey(dayOfMonth(new Date(), 1, 1))
  const nextMonthInstallments = upcomingByMonth(plans).find((m) => m.month === nextMonthKey)?.amount ?? 0
  const nextMonthPurchases = plans.filter((p) => p.upcoming.some((u) => u.month === nextMonthKey)).length

  // Selected month.
  const monthTxs = useMemo(() => inMonth(transactions, month), [transactions, month])
  const monthTotals = totals(monthTxs, categoriesById)
  const byCategory = expensesByCategory(monthTxs, categoriesById)

  const nwLabel = t.overview.netWorthChart(
    MONTHS_OF_HISTORY,
    formatMoney(history[0].net),
    formatMoney(history[history.length - 1].net),
  )

  const setMonth = (m: string) => setParams({ m }, { replace: true })

  return (
    <>
      <PageHeader title={t.nav.overview} subtitle={t.overview.subtitle(formatFullDate(toISO(new Date())))}>
        <MonthSwitcher variant="compact" month={month} latest={latest} count={MONTHS_OF_HISTORY} onChange={setMonth} />
      </PageHeader>

      {/* Phones: one column in reading order. Desktop: a 12-column grid, reordered. */}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-12 lg:gap-5">
        {/* 1. Net worth now and over time */}
        <Card className="flex flex-col lg:order-1 lg:col-span-8">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between lg:gap-4">
            <div className="flex flex-col">
              <p className="text-[13px] leading-[18px] font-medium text-muted">{t.overview.netWorth}</p>
              <p className="tabular mt-0.5 text-4xl leading-[44px] font-bold tracking-[-0.02em] text-ink lg:text-[40px] lg:leading-[48px]">
                {formatMoney(bal.net)}
              </p>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 lg:mt-0 lg:pt-[22px]">
              <Badge tone={change >= 0 ? 'income' : 'critical'} icon={change >= 0 ? 'trendUp' : 'trendDown'}>
                {formatMoney(change, 'BRL', { signed: true })} · {formatPercent(changePct, 1)}
              </Badge>
              <span className="text-[13px] text-muted">{t.overview.vsLastMonth}</span>
            </div>
          </div>
          <div className="mt-4 lg:mt-5 lg:flex lg:min-h-[206px] lg:flex-1 lg:flex-col">
            <NetWorthChart points={netPoints} label={nwLabel} />
          </div>
        </Card>

        {/* 2. Where the money is */}
        <Card className="flex flex-col gap-4 lg:order-5 lg:col-span-4">
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
        <Card className="flex flex-col gap-3.5 lg:order-3 lg:col-span-6 lg:gap-4">
          <div className="flex flex-col gap-3.5 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
            <CardTitle subtitle={t.overview.lastMonths(MONTHS_OF_HISTORY)}>{t.overview.incomeVsExpenses}</CardTitle>
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

        {/* 4. Coming up */}
        <Card className="flex flex-col gap-2 lg:order-2 lg:col-span-4">
          <CardTitle subtitle={t.overview.openCardBills}>{t.overview.comingUp}</CardTitle>
          {cards.map((c) => (
            <Link key={c.id} to={`/transactions?m=all&a=${c.id}`} className="flex min-h-[60px] items-center gap-3 border-b border-line active:bg-track">
              <InstitutionBadge institution={institutionsById.get(c.institutionId)!} size={36} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-medium text-ink lg:text-sm">{t.cardOf(institutionsById.get(c.institutionId)!.name)}</span>
                {c.creditData?.balanceDueDate && (
                  <span className="text-[13px] text-muted">{t.overview.due(formatShortDate(c.creditData.balanceDueDate))}</span>
                )}
              </span>
              <span className="tabular text-[15px] font-medium whitespace-nowrap text-ink">{formatMoney(c.balance)}</span>
            </Link>
          ))}
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
        <Card className="flex flex-col gap-3.5 lg:order-4 lg:col-span-6 lg:gap-4">
          <CardTitle subtitle={t.overview.lastMonths(MONTHS_OF_HISTORY)}>{t.overview.spendingByCategory}</CardTitle>
          <SpendingTrendChart data={trendData} series={trendSeries} label={t.overview.spendingByCategory} />
          <ul className="flex flex-wrap gap-x-3.5 gap-y-2 lg:gap-x-4 lg:border-t lg:border-line lg:pt-3.5">
            {trendSeries.map((s, i) => (
              <li key={s.key} className="inline-flex items-center gap-1.5 text-[13px] leading-[18px] text-ink-2">
                <Swatch color={seriesColor(i)} />
                {s.name}
              </li>
            ))}
          </ul>
        </Card>

        {/* 6. One month in detail */}
        <Card className="flex flex-col gap-4 !pb-2 lg:order-6 lg:col-span-8 lg:!pb-5">
          <div className="flex items-baseline justify-between gap-3">
            <CardTitle>{t.overview.monthInDetail}</CardTitle>
            <span className="hidden text-[13px] text-muted lg:inline">{formatMonth(month)}</span>
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
                return (
                  <Link
                    key={category.id}
                    to={`/transactions?m=${month}&c=${category.id}`}
                    className="-mx-1 flex min-h-11 flex-col justify-center gap-1.5 rounded-sm px-1 active:bg-track lg:min-h-10 lg:hover:bg-track"
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="inline-flex min-w-0 flex-1 items-center gap-2 text-sm text-ink">
                        <Swatch color={categoryColor(category.id)} />
                        <span className="truncate">{categoryName(category)}</span>
                      </span>
                      <span className="tabular text-[13px] text-muted lg:text-xs">{formatPercent(share)}</span>
                      <span className="tabular w-[92px] text-right text-sm font-medium text-ink">{formatMoney(amount)}</span>
                    </span>
                    <Progress value={share} height={4} tone={categoryColor(category.id)} />
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

      {selected && <TransactionSheet tx={selected} onClose={() => setSelected(null)} />}
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
