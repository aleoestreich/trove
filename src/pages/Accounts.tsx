import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../state'
import type { Account } from '../data/types'
import { balances } from '../lib/summary'
import { installmentPlans, remainingByAccount } from '../lib/installments'
import { formatShortDate } from '../lib/dates'
import { formatMoney, formatRate } from '../lib/money'
import { Card, InstitutionBadge } from '../components/ui'
import { useI18n } from '../i18n/I18nProvider'

export function Accounts() {
  const { institutions, accounts, transactions } = useData()
  const { t } = useI18n()
  const bal = balances(accounts)
  const futureInstallments = useMemo(() => remainingByAccount(installmentPlans(transactions)), [transactions])

  return (
    <div className="space-y-4">
      <Card className="divide-y divide-line !py-1">
        <SummaryRow label={t.overview.inAccounts} value={formatMoney(bal.cash)} />
        <SummaryRow label={t.overview.openCardBills} value={`−${formatMoney(bal.cardDebt)}`} />
        <SummaryRow label={t.net} value={formatMoney(bal.net)} strong />
      </Card>

      {institutions.map((inst) => {
        const own = accounts.filter((a) => a.institutionId === inst.id)
        const total = balances(own)
        return (
          <Card key={inst.id} className="!p-0">
            <div className="flex items-center gap-3 border-b border-line p-4">
              <InstitutionBadge institution={inst} />
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{inst.name}</h2>
                <p className="text-xs text-muted">{t.accounts.count(own.length)}</p>
              </div>
              <p className="tabular font-semibold">{formatMoney(total.net)}</p>
            </div>
            <div className="divide-y divide-line">
              {own.map((a) => (a.type === 'CREDIT' ? <CreditCardRow key={a.id} account={a} futureInstallments={futureInstallments.get(a.id) ?? 0} /> : <BankRow key={a.id} account={a} />))}
            </div>
          </Card>
        )
      })}

      {isDeployed() && (
        <a
          href="/api/auth/logout"
          className="flex h-12 items-center justify-center rounded-2xl bg-surface font-medium text-critical ring-1 ring-line active:bg-track"
        >
          {t.accounts.signOut}
        </a>
      )}

      <p className="px-2 text-center text-xs text-muted">{t.accounts.footer}</p>
    </div>
  )
}

/**
 * Login only exists on the deployed site (Vercel), not in local development
 * (localhost or a LAN address), so Sign out is shown only there.
 */
function isDeployed(): boolean {
  const host = window.location.hostname
  return !/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/.test(host)
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <p className="flex items-baseline justify-between gap-3 py-2.5">
      <span className="text-sm text-ink-2">{label}</span>
      <span className={`tabular ${strong ? 'text-lg font-semibold' : 'font-medium'}`}>{value}</span>
    </p>
  )
}

function BankRow({ account }: { account: Account }) {
  const { t } = useI18n()
  return (
    <Link to={`/transactions?m=all&a=${account.id}`} className="flex items-center justify-between gap-3 p-4 active:bg-track">
      <div className="min-w-0">
        <p className="font-medium">{account.name}</p>
        {account.foreign && (
          <p className="text-xs text-muted">{t.oneUnitIs(account.foreign.currency, formatRate(account.foreign.rate))}</p>
        )}
      </div>
      <div className="text-right">
        {account.foreign ? (
          <>
            <p className="tabular font-semibold">{formatMoney(account.foreign.balance, account.foreign.currency)}</p>
            <p className="tabular text-sm text-ink-2">= {formatMoney(account.balance)}</p>
          </>
        ) : (
          <p className="tabular font-semibold">{formatMoney(account.balance)}</p>
        )}
      </div>
    </Link>
  )
}

function CreditCardRow({ account, futureInstallments }: { account: Account; futureInstallments: number }) {
  const { t } = useI18n()
  const credit = account.creditData!
  const pct = (cents: number) => `${Math.min(100, (cents / credit.creditLimit) * 100)}%`
  const used = credit.creditLimit - credit.availableCreditLimit
  return (
    <Link to={`/transactions?m=all&a=${account.id}`} className="block p-4 active:bg-track">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{account.name}</p>
          <p className="text-xs text-muted">
            {t.accounts.cardDates(formatShortDate(credit.balanceCloseDate), formatShortDate(credit.balanceDueDate))}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">{t.accounts.openBill}</p>
          <p className="tabular font-semibold">{formatMoney(account.balance)}</p>
        </div>
      </div>
      {/* Limit usage: open bill + future installments (both reduce the available limit) */}
      <div
        className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded-full bg-track"
        role="meter"
        aria-label={t.accounts.limitUsed}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((used / credit.creditLimit) * 100)}
      >
        <span className="h-full rounded-l-full bg-accent" style={{ width: pct(account.balance) }} />
        {futureInstallments > 0 && <span className="h-full bg-accent/40" style={{ width: pct(futureInstallments) }} />}
      </div>
      <div className="tabular mt-2 space-y-0.5 text-xs text-ink-2">
        {futureInstallments > 0 && (
          <p className="flex justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-accent/40" aria-hidden />
              {t.accounts.futureInstallments}
            </span>
            <span>{formatMoney(futureInstallments)}</span>
          </p>
        )}
        <p className="flex justify-between gap-2">
          <span>{t.accounts.available}</span>
          <span className="font-medium text-ink">{formatMoney(credit.availableCreditLimit)}</span>
        </p>
        <p className="flex justify-between gap-2 text-muted">
          <span>{t.accounts.limit}</span>
          <span>{formatMoney(credit.creditLimit)}</span>
        </p>
      </div>
    </Link>
  )
}
