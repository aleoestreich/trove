import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useData } from '../state'
import { MONTHS_OF_HISTORY } from '../data/seed'
import type { Transaction } from '../data/types'
import { balances, expensesByCategory, inMonth, totals } from '../lib/summary'
import { balanceHistory, cashByCurrency, cashByInstitution } from '../lib/history'
import { installmentPlans, upcomingByMonth } from '../lib/installments'
import { dayOfMonth, formatMonth, formatMonthShort, formatShortDate, lastMonths, monthKey, toISO } from '../lib/dates'
import { formatMoney, formatRate } from '../lib/money'
import { Card, MonthSwitcher, SectionTitle } from '../components/ui'
import { CashFlowChart, NetWorthChart, SpendingTrendChart, seriesColor } from '../components/charts'
import { TransactionRow } from '../components/TransactionRow'
import { TransactionSheet } from '../components/TransactionSheet'

const TOP_CATEGORIES = 5

export function Dashboard() {
  const { accounts, transactions, categoriesById, institutionsById } = useData()
  const [params, setParams] = useSearchParams()
  const latest = monthKey(toISO(new Date()))
  const month = params.get('m') ?? latest
  const months = useMemo(() => lastMonths(latest, MONTHS_OF_HISTORY), [latest])
  const [selected, setSelected] = useState<Transaction | null>(null)

  const bal = balances(accounts)
  const foreignAccounts = accounts.filter((a) => a.foreign)

  // Net worth history (month ends; the last point is today).
  const history = useMemo(() => balanceHistory(accounts, transactions, months), [accounts, transactions, months])
  const netPoints = history.map((h, i) => ({
    label: i === history.length - 1 ? 'hoje' : formatMonthShort(h.month),
    net: h.net,
    cash: h.cash,
    cardDebt: h.cardDebt,
  }))
  const change = history[history.length - 1].net - history[0].net

  // Where the money is.
  const institutionNames = new Map([...institutionsById].map(([id, i]) => [id, i.name]))
  const byInstitution = cashByInstitution(accounts, institutionNames)
  const byCurrency = cashByCurrency(accounts)

  // Cash flow.
  const flow = useMemo(
    () => months.map((m) => ({ month: m, label: formatMonthShort(m), ...totals(inMonth(transactions, m), categoriesById) })),
    [transactions, categoriesById, months],
  )
  const flowTotals = flow.reduce((s, f) => ({ income: s.income + f.income, expenses: s.expenses + f.expenses }), { income: 0, expenses: 0 })
  const saved = flowTotals.income - flowTotals.expenses
  const savingsRate = flowTotals.income > 0 ? Math.round((saved / flowTotals.income) * 100) : 0

  // Spending trend: top categories over the period, the rest folded into "Other".
  const periodTxs = useMemo(() => transactions.filter((t) => monthKey(t.date) >= months[0]), [transactions, months])
  const periodByCategory = expensesByCategory(periodTxs, categoriesById)
  const top = periodByCategory.slice(0, TOP_CATEGORIES)
  const otherTotal = periodByCategory.slice(TOP_CATEGORIES).reduce((s, c) => s + c.amount, 0)
  const trendSeries = [
    ...top.map((c) => ({ key: c.category.id, name: c.category.name, total: c.amount })),
    ...(otherTotal > 0 ? [{ key: 'other', name: 'Other', total: otherTotal }] : []),
  ]
  const trendData = months.map((m) => {
    const row: Record<string, number | string> = { label: formatMonthShort(m) }
    for (const c of expensesByCategory(inMonth(transactions, m), categoriesById)) {
      const key = top.some((t) => t.category.id === c.category.id) ? c.category.id : 'other'
      row[key] = Number(row[key] ?? 0) + c.amount
    }
    return row
  })

  // Commitments: open card bills + installments already scheduled.
  const cards = accounts.filter((a) => a.type === 'CREDIT')
  const plans = useMemo(() => installmentPlans(transactions), [transactions])
  const nextMonthKey = monthKey(dayOfMonth(new Date(), 1, 1))
  const nextMonthInstallments = upcomingByMonth(plans).find((m) => m.month === nextMonthKey)?.amount ?? 0
  const installmentsLeft = plans.reduce((s, p) => s + p.remaining, 0)

  // Selected month.
  const monthTxs = useMemo(() => inMonth(transactions, month), [transactions, month])
  const monthTotals = totals(monthTxs, categoriesById)
  const byCategory = expensesByCategory(monthTxs, categoriesById)
  const maxCategory = byCategory[0]?.amount ?? 0

  return (
    <div className="space-y-4">
      {/* 1. Net worth now and over time */}
      <Card>
        <p className="text-sm text-ink-2">Net worth (accounts − card bills)</p>
        <p className="tabular mt-1 text-4xl font-semibold tracking-tight">{formatMoney(bal.net)}</p>
        <p className={`tabular mt-1 text-sm font-medium ${change >= 0 ? 'text-income' : 'text-critical'}`}>
          <span aria-hidden>{change >= 0 ? '▲' : '▼'}</span> {formatMoney(change, 'BRL', { signed: true })}{' '}
          <span className="font-normal text-muted">since end of {formatMonth(months[0]).toLowerCase()}</span>
        </p>
        <div className="mt-3">
          <NetWorthChart points={netPoints} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm">
          <div>
            <p className="text-muted">In accounts</p>
            <p className="tabular font-medium">{formatMoney(bal.cash)}</p>
          </div>
          <div>
            <p className="text-muted">Open card bills</p>
            <p className="tabular font-medium">−{formatMoney(bal.cardDebt)}</p>
          </div>
        </div>
      </Card>

      {/* 2. Where the money is */}
      <Card>
        <SectionTitle>Where your money is</SectionTitle>
        <ShareList rows={byInstitution.map((s) => ({ key: s.id, label: s.label, amount: s.amount }))} total={bal.cash} />
        <div className="my-3 border-t border-line" />
        <ShareList
          rows={byCurrency.map((s) => {
            const foreign = foreignAccounts.find((a) => a.foreign!.currency === s.id)?.foreign
            return {
              key: s.id,
              label: s.id === 'BRL' ? 'In reais (BRL)' : `In dollars (${s.id})`,
              amount: s.amount,
              note: foreign && `${formatMoney(foreign.balance, foreign.currency)} at R$ ${formatRate(foreign.rate)}`,
            }
          })}
          total={bal.cash}
        />
      </Card>

      {/* 3. Cash flow */}
      <Card>
        <SectionTitle>Income vs. expenses (R$)</SectionTitle>
        <CashFlowChart data={flow} />
        <p className="mt-2 text-sm text-ink-2">
          Last {MONTHS_OF_HISTORY} months: you kept{' '}
          <span className={`tabular font-semibold ${saved >= 0 ? 'text-income' : 'text-critical'}`}>{formatMoney(saved)}</span>
          {flowTotals.income > 0 && (
            <>
              , <span className="font-semibold text-ink">{savingsRate}%</span> of your income
            </>
          )}
          .
        </p>
      </Card>

      {/* 4. Commitments */}
      <Card>
        <SectionTitle
          action={
            <Link to="/installments" className="text-sm text-accent">
              Installments
            </Link>
          }
        >
          Coming up
        </SectionTitle>
        <ul className="divide-y divide-line text-sm">
          {cards.map((c) => (
            <li key={c.id} className="flex items-baseline justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate">{c.name}</span>
                <span className="text-xs text-muted">Bill due {formatShortDate(c.creditData!.balanceDueDate)}</span>
              </span>
              <span className="tabular shrink-0 font-medium">{formatMoney(c.balance)}</span>
            </li>
          ))}
          <li className="flex items-baseline justify-between gap-3 py-2">
            <span>
              <span className="block">Installments charged next month</span>
              <span className="text-xs text-muted">{formatMoney(installmentsLeft)} left in total</span>
            </span>
            <span className="tabular shrink-0 font-medium">{formatMoney(nextMonthInstallments)}</span>
          </li>
        </ul>
<p className="mt-1 flex items-baseline justify-between gap-3 border-t border-line pt-2 text-sm">
          <span className="font-medium">Total already committed</span>
          <span className="tabular font-semibold">{formatMoney(bal.cardDebt + nextMonthInstallments)}</span>
        </p>
      </Card>

      {/* 5. Spending trend */}
      <Card>
        <SectionTitle>Spending by category per month (R$)</SectionTitle>
        <SpendingTrendChart data={trendData} series={trendSeries} />
        <ul className="mt-3 grid grid-cols-1 gap-1.5 text-sm">
          {trendSeries.map((s, i) => (
            <li key={s.key} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: seriesColor(i) }} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <span className="tabular text-ink-2">{formatMoney(Math.round(s.total / MONTHS_OF_HISTORY))}/mo</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Average per month over the last {MONTHS_OF_HISTORY} months, current month included.</p>
      </Card>

      {/* 6. One month in detail */}
      <div className="pt-2">
        <MonthSwitcher month={month} latest={latest} count={MONTHS_OF_HISTORY} onChange={(m) => setParams({ m }, { replace: true })} />
      </div>

      <Card className="divide-y divide-line !py-1">
        <Stat label="Income" value={formatMoney(monthTotals.income)} tone="income" />
        <Stat label="Expenses" value={formatMoney(monthTotals.expenses)} />
        <Stat label="Net" value={formatMoney(monthTotals.net, 'BRL', { signed: true })} tone={monthTotals.net >= 0 ? 'income' : 'critical'} />
      </Card>

      <Card>
        <SectionTitle
          action={
            <Link to={`/transactions?m=${month}&type=expense`} className="text-sm text-accent">
              See all
            </Link>
          }
        >
          Spending by category
        </SectionTitle>
        {byCategory.length === 0 && <p className="text-sm text-muted">No expenses this month.</p>}
        <ul className="space-y-1">
          {byCategory.map(({ category, amount }) => (
            <li key={category.id}>
              <Link to={`/transactions?m=${month}&c=${category.id}`} className="block rounded-lg py-1.5 active:bg-track">
                <span className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{category.name}</span>
                  <span className="tabular shrink-0 font-medium">{formatMoney(amount)}</span>
                </span>
                <span className="mt-1 block h-2 overflow-hidden rounded-full bg-track">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${(amount / maxCategory) * 100}%` }} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <SectionTitle
          action={
            <Link to={`/transactions?m=${month}`} className="text-sm text-accent">
              See all
            </Link>
          }
        >
          Latest transactions
        </SectionTitle>
        <div className="divide-y divide-line">
          {monthTxs.slice(0, 5).map((t) => (
            <TransactionRow key={t.id} tx={t} onSelect={setSelected} />
          ))}
        </div>
      </Card>

      {selected && <TransactionSheet tx={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

/** Rows of label + amount + share of total, with a single-hue bar. */
function ShareList({ rows, total }: { rows: { key: string; label: string; amount: number; note?: string }[]; total: number }) {
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const share = total > 0 ? r.amount / total : 0
        return (
          <li key={r.key}>
            <span className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{r.label}</span>
              <span className="tabular shrink-0">
                <span className="font-medium">{formatMoney(r.amount)}</span>{' '}
                <span className="inline-block w-10 text-right text-muted">{Math.round(share * 100)}%</span>
              </span>
            </span>
            {r.note && <span className="tabular block text-xs text-muted">{r.note}</span>}
            <span className="mt-1 block h-2 overflow-hidden rounded-full bg-track">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${share * 100}%` }} />
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'income' | 'critical' }) {
  const color = tone === 'income' ? 'text-income' : tone === 'critical' ? 'text-critical' : 'text-ink'
  return (
    <p className="flex items-baseline justify-between gap-3 py-2.5">
      <span className="text-sm text-ink-2">{label}</span>
      <span className={`tabular text-lg font-semibold ${color}`}>{value}</span>
    </p>
  )
}
