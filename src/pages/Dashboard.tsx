import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useData } from '../state'
import { MONTHS_OF_HISTORY } from '../data/seed'
import type { Transaction } from '../data/types'
import { balances, expensesByCategory, inMonth, totals } from '../lib/summary'
import { formatMonthShort, lastMonths, monthKey, toISO } from '../lib/dates'
import { formatMoney, formatRate } from '../lib/money'
import { Card, MonthSwitcher, SectionTitle } from '../components/ui'
import { TransactionRow } from '../components/TransactionRow'
import { TransactionSheet } from '../components/TransactionSheet'

const compactBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })

export function Dashboard() {
  const { accounts, transactions, categoriesById } = useData()
  const [params, setParams] = useSearchParams()
  const latest = monthKey(toISO(new Date()))
  const month = params.get('m') ?? latest
  const [selected, setSelected] = useState<Transaction | null>(null)

  const bal = balances(accounts)
  const foreignAccounts = accounts.filter((a) => a.foreign)
  const monthTxs = useMemo(() => inMonth(transactions, month), [transactions, month])
  const monthTotals = totals(monthTxs, categoriesById)
  const byCategory = expensesByCategory(monthTxs, categoriesById)
  const maxCategory = byCategory[0]?.amount ?? 0

  const trend = useMemo(
    () =>
      lastMonths(latest, MONTHS_OF_HISTORY).map((m) => {
        const t = totals(inMonth(transactions, m), categoriesById)
        return { month: m, label: formatMonthShort(m), income: t.income / 100, expenses: t.expenses / 100 }
      }),
    [transactions, categoriesById, latest],
  )

  return (
    <div className="space-y-4">
      {/* Net worth across all accounts */}
      <Card>
        <p className="text-sm text-ink-2">Net balance, all accounts</p>
        <p className="tabular mt-1 text-4xl font-semibold tracking-tight">{formatMoney(bal.net)}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted">In accounts</p>
            <p className="tabular font-medium">{formatMoney(bal.cash)}</p>
          </div>
          <div>
            <p className="text-muted">Open card bills</p>
            <p className="tabular font-medium">−{formatMoney(bal.cardDebt)}</p>
          </div>
        </div>
        {foreignAccounts.map((a) => (
          <p key={a.id} className="mt-3 rounded-lg bg-track px-3 py-2 text-xs text-ink-2">
            Includes <span className="tabular font-medium text-ink">{formatMoney(a.foreign!.balance, a.foreign!.currency)}</span> ={' '}
            <span className="tabular font-medium text-ink">{formatMoney(a.balance)}</span> at R$ {formatRate(a.foreign!.rate)} per{' '}
            {a.foreign!.currency}
          </p>
        ))}
      </Card>

      <MonthSwitcher month={month} latest={latest} count={MONTHS_OF_HISTORY} onChange={(m) => setParams({ m }, { replace: true })} />

      {/* Month totals */}
      <Card className="divide-y divide-line !py-1">
        <Stat label="Income" value={formatMoney(monthTotals.income)} tone="income" />
        <Stat label="Expenses" value={formatMoney(monthTotals.expenses)} />
        <Stat label="Net" value={formatMoney(monthTotals.net, 'BRL', { signed: true })} tone={monthTotals.net >= 0 ? 'income' : 'critical'} />
      </Card>

      {/* Spending by category */}
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

      {/* 6-month trend */}
      <Card>
        <SectionTitle>Income vs. expenses, last {MONTHS_OF_HISTORY} months</SectionTitle>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trend} barGap={2} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--line)' }} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
              <YAxis
                width={64}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'var(--muted)', fontSize: 12 }}
                tickFormatter={(v: number) => compactBRL.format(v)}
              />
              <Tooltip
                cursor={{ fill: 'var(--track)' }}
                formatter={(v) => formatMoney(Math.round(Number(v) * 100))}
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--ink)' }}
                labelStyle={{ color: 'var(--ink-2)' }}
              />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 12 }}
                formatter={(value) => <span style={{ color: 'var(--ink-2)' }}>{value}</span>}
              />
              <Bar dataKey="income" name="Income" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={24} />
              <Bar dataKey="expenses" name="Expenses" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Latest transactions in the selected month */}
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
          {monthTxs.slice(0, 6).map((t) => (
            <TransactionRow key={t.id} tx={t} onSelect={setSelected} />
          ))}
        </div>
      </Card>

      {selected && <TransactionSheet tx={selected} onClose={() => setSelected(null)} />}
    </div>
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
