import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../state'
import type { Account } from '../data/types'
import { balances } from '../lib/summary'
import { installmentPlans, remainingByAccount } from '../lib/installments'
import { formatShortDate } from '../lib/dates'
import { formatMoney, formatPercent, formatRate } from '../lib/money'
import { Badge, InstitutionBadge, Progress } from '../components/ui'
import { Icon } from '../components/Icon'
import { useI18n } from '../i18n/I18nProvider'

/** Share of the limit at which a card is flagged "Near limit". */
const NEAR_LIMIT = 0.8

export function Accounts() {
  const { institutions, accounts, transactions } = useData()
  const { t } = useI18n()
  const bal = balances(accounts)
  const futureInstallments = useMemo(() => remainingByAccount(installmentPlans(transactions)), [transactions])

  return (
    <div className="flex flex-col gap-3">
      <section className="flex flex-col gap-0.5 px-1 pt-2 pb-1">
        <span className="text-[13px] leading-[18px] font-medium text-muted">{t.accounts.total(institutions.length)}</span>
        <span className="tabular text-[32px] leading-10 font-bold tracking-[-0.02em] text-ink">{formatMoney(bal.net)}</span>
        <span className="text-[13px] leading-[18px] text-muted">{t.accounts.totalNote}</span>
      </section>

      {institutions.map((inst) => {
        const own = accounts.filter((a) => a.institutionId === inst.id)
        const total = balances(own)
        return (
          <section key={inst.id} className="overflow-hidden rounded-lg border border-line bg-surface">
            <div className="flex items-center gap-3 p-4">
              <InstitutionBadge institution={inst} />
              <h2 className="min-w-0 flex-1 truncate text-base leading-[22px] font-medium text-ink">{inst.name}</h2>
              <span className="tabular text-base font-medium whitespace-nowrap text-ink">{formatMoney(total.net)}</span>
            </div>
            {own.map((a) =>
              a.type === 'CREDIT' ? (
                <CreditCardBlock key={a.id} account={a} futureInstallments={futureInstallments.get(a.id) ?? 0} />
              ) : a.foreign ? (
                <ForeignBlock key={a.id} account={a} />
              ) : (
                <Link
                  key={a.id}
                  to={`/transactions?m=all&a=${a.id}`}
                  className="flex min-h-14 items-center justify-between gap-3 border-t border-line px-4 active:bg-track"
                >
                  <span className="text-sm text-ink-2">{a.name}</span>
                  <span className="tabular text-[15px] font-medium whitespace-nowrap text-ink">{formatMoney(a.balance)}</span>
                </Link>
              ),
            )}
          </section>
        )
      })}

      {isDeployed() && (
        <a
          href="/api/auth/logout"
          className="flex h-12 items-center justify-center gap-2 rounded-md border border-line bg-surface text-[15px] font-medium text-critical active:bg-track"
        >
          <Icon name="signOut" className="size-[18px]" strokeWidth={2} />
          {t.accounts.signOut}
        </a>
      )}

      <p className="px-2 text-center text-xs leading-4 text-muted">{t.accounts.footer}</p>
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

/** A balance held in another currency: the original amount large, BRL and the rate below. */
function ForeignBlock({ account }: { account: Account }) {
  const { t } = useI18n()
  const foreign = account.foreign!
  return (
    <Link to={`/transactions?m=all&a=${account.id}`} className="flex flex-col gap-1 border-t border-line p-4 active:bg-track">
      <span className="text-xs leading-4 text-muted">{account.name}</span>
      <span className="tabular text-2xl leading-[30px] font-bold tracking-[-0.01em] text-ink">{formatMoney(foreign.balance, foreign.currency)}</span>
      <span className="tabular text-sm leading-5 text-ink-2">≈ {formatMoney(account.balance)}</span>
      <span className="tabular mt-1 text-xs leading-4 text-muted">{t.accounts.rate(foreign.currency, formatRate(foreign.rate))}</span>
    </Link>
  )
}

function CreditCardBlock({ account, futureInstallments }: { account: Account; futureInstallments: number }) {
  const { t } = useI18n()
  const credit = account.creditData!
  // Used = open bill + installments still to be charged (both take limit).
  const used = credit.creditLimit - credit.availableCreditLimit
  const share = credit.creditLimit > 0 ? used / credit.creditLimit : 0
  const near = share >= NEAR_LIMIT
  return (
    <Link to={`/transactions?m=all&a=${account.id}`} className="flex flex-col gap-3 border-t border-line p-4 active:bg-track">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm text-ink-2">
          <Icon name="card" className="size-[18px]" strokeWidth={1.75} />
          {account.name}
        </span>
        {near && (
          <Badge tone="critical" icon="alert">
            {t.accounts.nearLimit}
          </Badge>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs leading-4 text-muted">{t.accounts.currentBill}</span>
        <span className="tabular text-2xl leading-[30px] font-bold tracking-[-0.01em] text-ink">{formatMoney(account.balance)}</span>
      </div>
      <Progress value={share * 100} tone={near ? 'critical' : 'accent'} label={t.accounts.limitUsed} role="meter" />
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs leading-4 text-muted">
            {t.accounts.used} · {formatPercent(share * 100)}
          </span>
          <span className="tabular text-sm font-medium text-ink">{formatMoney(used)}</span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-xs leading-4 text-muted">{t.accounts.available}</span>
          <span className="tabular text-sm font-medium text-ink">{formatMoney(credit.availableCreditLimit)}</span>
        </div>
      </div>
      <span className="tabular text-xs leading-4 text-muted">
        {t.accounts.limit} {formatMoney(credit.creditLimit)}
        {futureInstallments > 0 && ` · ${t.accounts.futureInstallments(formatMoney(futureInstallments))}`}
      </span>
      <div className="grid grid-cols-2 gap-2 rounded-sm bg-page px-3 py-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs leading-4 text-muted">{t.accounts.closes}</span>
          <span className="text-sm font-medium text-ink">{formatShortDate(credit.balanceCloseDate)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs leading-4 text-muted">{t.accounts.due}</span>
          <span className="text-sm font-medium text-ink">{formatShortDate(credit.balanceDueDate)}</span>
        </div>
      </div>
    </Link>
  )
}
