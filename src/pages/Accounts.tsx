import { Fragment, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useData, useSync } from '../state'
import type { Account } from '../data/types'
import { balances } from '../lib/summary'
import { installmentPlans, remainingByAccount } from '../lib/installments'
import { currentBill, isIdleCard, type CardBill } from '../lib/bills'
import { formatShortDate } from '../lib/dates'
import { formatMoney, formatPercent, formatRate } from '../lib/money'
import { Badge, PageHeader, Progress } from '../components/ui'
import { InstitutionBadge } from '../components/BankBadge'
import { Icon } from '../components/Icon'
import { useI18n } from '../i18n/I18nProvider'
import { accountType, accountTypeLabels } from '../lib/accountType'
import { AccountTypeLabel } from '../components/AccountTypeIcon'
import { sortForDisplay } from '../lib/accountOrder'
import { isDeployed } from '../lib/useIsDesktop'
import { ConnectMeuPluggy } from '../components/ConnectMeuPluggy'
import { CardDaysEditor } from '../components/CardDaysEditor'
import { FgtsSection } from '../components/Fgts'
import { RenameButton } from '../components/RenameAccount'
import { SyncBar } from '../components/SyncBar'
import { needsReconnect } from '../lib/syncProblems'

/** Share of the limit at which a card is flagged "Near limit". */
const NEAR_LIMIT = 0.8

export function Accounts() {
  const { institutions: allInstitutions, accounts: allAccounts, transactions, source } = useData()
  const { t } = useI18n()
  const plans = useMemo(() => installmentPlans(transactions), [transactions])
  const futureInstallments = useMemo(() => remainingByAccount(plans), [plans])
  // Cards with nothing in the current or future cycles are hidden, and banks left with nothing to show.
  const accounts = allAccounts.filter((a) => !isIdleCard(a, transactions, plans))
  const institutions = allInstitutions.filter((i) => accounts.some((a) => a.institutionId === i.id))
  const bal = balances(accounts)
  // Connections Pluggy marks as needing attention (the institution ID is the connection ID).
  const reconnect = new Set((useSync().info?.connections ?? []).filter((c) => needsReconnect(c.status)).map((c) => c.id))

  const bankCard = (inst: (typeof institutions)[number]) => {
    // Checking first, then savings, then cards.
    const own = sortForDisplay(accounts.filter((a) => a.institutionId === inst.id))
    const labels = accountTypeLabels(own, t)
    // What the bank calls each one, without the names set in Trove.
    const bankLabels = accountTypeLabels(
      own.map(({ nickname: _n, ...a }) => a),
      t,
    )
    const total = balances(own)
    return (
      <section key={inst.id} className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="flex items-center gap-3 p-4 lg:px-5">
          <InstitutionBadge institution={inst} size={40} />
          <h2 className="min-w-0 flex-1 truncate text-base leading-[22px] font-medium text-ink">{inst.name}</h2>
          <span className="tabular text-base font-medium whitespace-nowrap text-ink lg:text-lg lg:font-bold">{formatMoney(total.net)}</span>
        </div>
        {reconnect.has(inst.id) && (
          <p role="status" className="flex items-start gap-2 border-t border-line bg-critical-soft px-4 py-2.5 text-[13px] leading-[18px] text-ink lg:px-5">
            <Icon name="alert" className="mt-px size-4 shrink-0 text-critical" />
            <span>
              {t.sync.reconnect(inst.name)} {t.sync.reconnectNote}
            </span>
          </p>
        )}
        {own.map((a) =>
          a.type === 'CREDIT' ? (
            <Fragment key={a.id}>
              <div className="relative">
                <CreditCardBlock account={a} label={labels.get(a.id)!} sub={a.nickname ? bankLabels.get(a.id) : undefined} bill={currentBill(a, transactions, plans)} futureInstallments={futureInstallments.get(a.id) ?? 0} />
                <RenameButton account={a} label={labels.get(a.id)!} bankLabel={bankLabels.get(a.id)!} className="absolute top-2 right-2 lg:right-3" />
              </div>
              <CardDaysEditor account={a} />
            </Fragment>
          ) : a.foreign ? (
            <div key={a.id} className="relative">
              <ForeignBlock account={a} label={labels.get(a.id)!} sub={a.nickname ? bankLabels.get(a.id) : undefined} />
              <RenameButton account={a} label={labels.get(a.id)!} bankLabel={bankLabels.get(a.id)!} className="absolute top-2 right-2 lg:top-1/2 lg:right-3 lg:-translate-y-1/2" />
            </div>
          ) : (
            <div key={a.id} className="flex items-center border-t border-line pr-2 lg:pr-3">
              <Link
                to={`/transactions?m=all&a=${a.id}`}
                className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 pl-4 active:bg-track lg:min-h-[52px] lg:pl-5 lg:hover:bg-page"
              >
                <AccountTypeLabel type={accountType(a)} label={labels.get(a.id)!} sub={a.nickname ? bankLabels.get(a.id) : undefined} />
                <span className="tabular text-[15px] font-medium whitespace-nowrap text-ink">{formatMoney(a.balance)}</span>
              </Link>
              <RenameButton account={a} label={labels.get(a.id)!} bankLabel={bankLabels.get(a.id)!} />
            </div>
          ),
        )}
      </section>
    )
  }

  return (
    <>
      <PageHeader title={t.nav.accounts} subtitle={`${t.accounts.total(institutions.length)}: ${formatMoney(bal.net)}`} />
      <div className="flex flex-col gap-3 lg:gap-5">
        <SyncBar />
        <section className="flex flex-col gap-0.5 px-1 pt-2 pb-1 lg:hidden">
          <span className="text-[13px] leading-[18px] font-medium text-muted">{t.accounts.total(institutions.length)}</span>
          <span className="tabular text-[32px] leading-10 font-bold tracking-[-0.02em] text-ink">{formatMoney(bal.net)}</span>
          <span className="text-[13px] leading-[18px] text-muted">{t.accounts.totalNote}</span>
        </section>

        {/* Phones: one list, then the FGTS. Desktop: two columns, filled alternately; the FGTS at the end of the right one. */}
        <div className="flex flex-col gap-3 lg:hidden">
          {institutions.map(bankCard)}
          <FgtsSection />
        </div>
        <div className="hidden grid-cols-2 items-start gap-5 lg:grid">
          {[0, 1].map((col) => (
            <div key={col} className="flex flex-col gap-5">
              {institutions.filter((_, i) => i % 2 === col).map(bankCard)}
              {col === 1 && <FgtsSection />}
            </div>
          ))}
        </div>

        {/* Until Pluggy is connected (demo data on the deployed site): connect Meu Pluggy. */}
        {isDeployed() && source === 'demo' && <ConnectMeuPluggy />}

        {isDeployed() && (
          <a
            href="/api/auth/logout"
            className="flex h-12 items-center justify-center gap-2 rounded-md border border-line bg-surface text-[15px] font-medium text-critical active:bg-track lg:hidden"
          >
            <Icon name="signOut" className="size-[18px]" strokeWidth={2} />
            {t.accounts.signOut}
          </a>
        )}

        {source === 'demo' && <p className="px-2 text-center text-xs leading-4 text-muted">{t.accounts.footer}</p>}

        {/* TEMPORARY: the debug screen. */}
        {isDeployed() && (
          <Link to="/debug" className="flex h-11 items-center self-center px-3 text-xs leading-4 text-muted underline">
            {t.debug.link}
          </Link>
        )}

      </div>
    </>
  )
}

/** A balance held in another currency: the original amount large, BRL and the rate below. */
function ForeignBlock({ account, label, sub }: { account: Account; label: string; sub?: string }) {
  const { t } = useI18n()
  const foreign = account.foreign!
  return (
    <Link
      to={`/transactions?m=all&a=${account.id}`}
      className="flex flex-col gap-1 border-t border-line p-4 pr-14 active:bg-track lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:px-5 lg:pr-16 lg:hover:bg-page"
    >
      <span className="flex flex-col gap-1 lg:gap-0.5">
        <span className="mb-0.5">
          <AccountTypeLabel type={accountType(account)} label={label} sub={sub} />
        </span>
        <span className="tabular text-2xl leading-[30px] font-bold tracking-[-0.01em] text-ink lg:text-[26px] lg:leading-8">
          {formatMoney(foreign.balance, foreign.currency)}
        </span>
        <span className="tabular text-sm leading-5 text-ink-2">≈ {formatMoney(account.balance)}</span>
      </span>
      <span className="tabular mt-1 text-xs leading-4 text-muted lg:mt-0 lg:max-w-[170px] lg:text-right">
        {t.accounts.rate(foreign.currency, formatRate(foreign.rate))}
      </span>
    </Link>
  )
}

function CreditCardBlock({ account, label, sub, bill, futureInstallments }: { account: Account; label: string; sub?: string; bill: CardBill | null; futureInstallments: number }) {
  const { t } = useI18n()
  const credit = account.creditData!
  // The bill from the billing cycle; the balance only when the bank gives no closing date.
  const billAmount = bill ? bill.amount : account.balance
  const closeDate = bill ? bill.closeDate : credit.balanceCloseDate
  const dueDate = bill ? bill.dueDate : credit.balanceDueDate
  const closesLabel = bill?.closed ? t.accounts.closed : t.accounts.closes
  // Used = open bill + installments still to be charged (both take limit).
  const used = credit.creditLimit - credit.availableCreditLimit
  const share = credit.creditLimit > 0 ? used / credit.creditLimit : 0
  const near = share >= NEAR_LIMIT
  return (
    <Link
      to={bill ? `/transactions?bill=${account.id}` : `/transactions?m=all&a=${account.id}`}
      className="flex flex-col gap-3 border-t border-line p-4 active:bg-track lg:px-5 lg:hover:bg-page"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pr-10">
        <AccountTypeLabel type="card" label={label} sub={sub} />
        {near && (
          <Badge tone="critical" icon="alert">
            {t.accounts.nearLimit}
          </Badge>
        )}
      </div>
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs leading-4 text-muted">{bill?.closed ? t.accounts.closedBill : t.accounts.currentBill}</span>
          <span className="tabular text-2xl leading-[30px] font-bold tracking-[-0.01em] text-ink lg:text-[26px] lg:leading-8">
            {formatMoney(billAmount)}
          </span>
          {bill && bill.paid > 0 && <span className="tabular text-xs leading-4 text-muted">{t.accounts.alreadyPaid(formatMoney(bill.paid))}</span>}
        </div>
        {/* Desktop: close and due dates beside the bill */}
        <div className="hidden gap-5 text-right lg:flex">
          <DateFigure label={closesLabel} value={formatShortDate(closeDate)} />
          <DateFigure label={t.accounts.due} value={formatShortDate(dueDate)} />
        </div>
      </div>
      <Progress value={share * 100} tone={near ? 'critical' : 'accent'} label={t.accounts.limitUsed} role="meter" />
      <div className="grid grid-cols-2 gap-2 lg:hidden">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs leading-4 text-muted">
            {t.accounts.used} · <span className="tabular">{formatPercent(share * 100)}</span>
          </span>
          <span className="tabular text-sm font-medium text-ink">{formatMoney(used)}</span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-xs leading-4 text-muted">{t.accounts.available}</span>
          <span className="tabular text-sm font-medium text-ink">{formatMoney(credit.availableCreditLimit)}</span>
        </div>
      </div>
      <div className="tabular hidden justify-between gap-3 text-[13px] text-ink-2 lg:flex">
        <span>
          {t.accounts.used} <span className="font-medium text-ink">{formatMoney(used)}</span> · {formatPercent(share * 100)}
        </span>
        <span>
          {t.accounts.available} <span className="font-medium text-ink">{formatMoney(credit.availableCreditLimit)}</span>
        </span>
      </div>
      <span className="tabular text-xs leading-4 text-muted">
        {t.accounts.limit} {formatMoney(credit.creditLimit)}
        {futureInstallments > 0 && ` · ${t.accounts.futureInstallments(formatMoney(futureInstallments))}`}
      </span>
      <div className="grid grid-cols-2 gap-2 rounded-sm bg-page px-3 py-2.5 lg:hidden">
        <DateFigure label={closesLabel} value={formatShortDate(closeDate)} />
        <DateFigure label={t.accounts.due} value={formatShortDate(dueDate)} />
      </div>
    </Link>
  )
}

function DateFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs leading-4 text-muted">{label}</span>
      <span className="text-sm font-medium text-ink">{value}</span>
    </div>
  )
}
