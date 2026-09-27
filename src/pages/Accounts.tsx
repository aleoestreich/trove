import { Link } from 'react-router-dom'
import { useData } from '../state'
import type { Account } from '../data/types'
import { balances } from '../lib/summary'
import { formatShortDate } from '../lib/dates'
import { formatMoney, formatRate } from '../lib/money'
import { Card, InstitutionBadge } from '../components/ui'

export function Accounts() {
  const { institutions, accounts } = useData()
  const bal = balances(accounts)

  return (
    <div className="space-y-4">
      <Card className="divide-y divide-line !py-1">
        <SummaryRow label="In accounts" value={formatMoney(bal.cash)} />
        <SummaryRow label="Open card bills" value={`−${formatMoney(bal.cardDebt)}`} />
        <SummaryRow label="Net" value={formatMoney(bal.net)} strong />
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
                <p className="text-xs text-muted">
                  {own.length} {own.length === 1 ? 'account' : 'accounts'}
                </p>
              </div>
              <p className="tabular font-semibold">{formatMoney(total.net)}</p>
            </div>
            <div className="divide-y divide-line">
              {own.map((a) => (a.type === 'CREDIT' ? <CreditCardRow key={a.id} account={a} /> : <BankRow key={a.id} account={a} />))}
            </div>
          </Card>
        )
      })}

      <p className="px-2 text-center text-xs text-muted">
        Demo data. Real accounts will be connected through Meu Pluggy once the backend is added.
      </p>
    </div>
  )
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
  return (
    <Link to={`/transactions?m=all&a=${account.id}`} className="flex items-center justify-between gap-3 p-4 active:bg-track">
      <div className="min-w-0">
        <p className="font-medium">{account.name}</p>
        {account.foreign && (
          <p className="text-xs text-muted">
            1 {account.foreign.currency} = R$ {formatRate(account.foreign.rate)}
          </p>
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

function CreditCardRow({ account }: { account: Account }) {
  const credit = account.creditData!
  const used = Math.min(1, account.balance / credit.creditLimit)
  return (
    <Link to={`/transactions?m=all&a=${account.id}`} className="block p-4 active:bg-track">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{account.name}</p>
          <p className="text-xs text-muted">
            Closes {formatShortDate(credit.balanceCloseDate)} · Due {formatShortDate(credit.balanceDueDate)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">Open bill</p>
          <p className="tabular font-semibold">{formatMoney(account.balance)}</p>
        </div>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-track"
        role="meter"
        aria-label="Credit limit used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(used * 100)}
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${used * 100}%` }} />
      </div>
      <p className="tabular mt-1.5 flex justify-between text-xs text-muted">
        <span>Available {formatMoney(credit.availableCreditLimit)}</span>
        <span>Limit {formatMoney(credit.creditLimit)}</span>
      </p>
    </Link>
  )
}
