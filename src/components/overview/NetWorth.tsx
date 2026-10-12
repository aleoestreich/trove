import { useData, useSync } from '../../state'
import { useI18n } from '../../i18n/I18nProvider'
import { balances } from '../../lib/summary'
import { cashByCurrency, cashByInstitution } from '../../lib/history'
import { formatDay, toISO } from '../../lib/dates'
import { formatMoney, formatPercent, signOf } from '../../lib/money'
import { Card, Progress, Swatch } from '../ui'
import { Icon, type IconName } from '../Icon'
import { InstitutionBadge } from '../BankBadge'
import { OutOfTotalGroup } from '../OutOfTotal'
import { BlockLabel, HeaderLink } from './parts'

const CURRENCY_COLORS: Record<string, string> = { BRL: 'var(--series-1)', USD: 'var(--series-3)', EUR: 'var(--series-4)' }
const currencyColor = (c: string) => CURRENCY_COLORS[c] ?? 'var(--series-6)'

/**
 * Patrimônio: net worth today (money in the accounts minus the open card
 * bills, as the banks report them), and where that money is: by bank, and
 * by currency when there's more than one. The FGTS and previdência sit
 * apart ("Fora do total"). A bank that failed the latest sync is named,
 * with "Tentar de novo"; a negative total gets a neutral note.
 */
export function NetWorthCard({ className = '' }: { className?: string }) {
  const { accounts, institutionsById } = useData()
  const { info, failed, sync } = useSync()
  const { t } = useI18n()
  const o = t.overview
  const bal = balances(accounts)
  const stale = failed[0]
  const staleAt = stale && info?.connections.find((c) => c.id === stale.id)?.lastSyncedAt
  const byInstitution = cashByInstitution(accounts, new Map([...institutionsById].map(([id, i]) => [id, i.name])))
  const byCurrency = cashByCurrency(accounts)
  const foreignBalance = (currency: string) => accounts.filter((a) => a.type === 'BANK' && a.foreign?.currency === currency).reduce((s, a) => s + a.foreign!.balance, 0)
  const share = (amount: number) => (bal.cash > 0 ? (amount / bal.cash) * 100 : 0)

  return (
    <Card className={`flex flex-col gap-4 ${className}`}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] leading-[18px] text-muted">{o.netWorth}</p>
          <HeaderLink to="/accounts">{o.accountsLink}</HeaderLink>
        </div>
        <p className="tabular text-[34px] leading-[42px] font-bold tracking-[-0.02em] text-ink lg:text-[36px] lg:leading-[44px]">
          {`${bal.net < 0 ? signOf(bal.net) : ''}${formatMoney(Math.abs(bal.net))}`}
        </p>
        <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 lg:gap-3">
          <Tile icon="checking" label={o.inAccounts} value={formatMoney(bal.cash)} />
          <Tile icon="card" label={o.cardBills} value={`${signOf(-bal.cardDebt)}${formatMoney(bal.cardDebt)}`} />
        </div>
        {/* The FGTS and the previdência, apart from what's added up. */}
        <OutOfTotalGroup />
        {stale ? (
          <>
            <p role="status" className="flex items-start gap-2.5 rounded-md border border-critical/30 bg-critical-soft px-3 py-2.5 text-[13px] leading-[18px] text-ink">
              <Icon name="alert" className="mt-px size-[18px] shrink-0 text-critical" />
              {o.bankStale(stale.name ?? '?', staleAt ? formatDay(toISO(new Date(staleAt))) : '—')}
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
      </div>

      {/* Where the money is: the accounts' balances, before the bills. */}
      {byInstitution.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <BlockLabel>{o.whereMoney}</BlockLabel>
          {byCurrency.length > 1 && (
            <div className="flex flex-col gap-1.5 pb-1">
              <div data-progress className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                {byCurrency.map((c) => (
                  <div key={c.id} style={{ flexGrow: c.amount, flexBasis: 0, background: currencyColor(c.id) }} />
                ))}
              </div>
              <div data-legend className="flex flex-wrap gap-x-4 gap-y-1">
                {byCurrency.map((c) => (
                  <span key={c.id} className="tabular inline-flex items-center gap-1.5 text-xs leading-4 text-ink-2">
                    <Swatch color={currencyColor(c.id)} />
                    {c.id} {formatPercent(share(c.amount))}
                    {c.id !== 'BRL' && <span className="text-muted">· {formatMoney(foreignBalance(c.id), c.id)}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
          <ul className="flex flex-col">
            {byInstitution.map((s) => (
              <li key={s.id} className="flex min-h-12 items-center gap-3">
                <InstitutionBadge institution={institutionsById.get(s.id)!} size={32} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm text-ink">
                      {s.label} <span className="tabular text-xs text-muted">{formatPercent(share(s.amount))}</span>
                    </span>
                    <span className="tabular text-sm font-medium whitespace-nowrap text-ink">{formatMoney(s.amount)}</span>
                  </span>
                  <Progress value={share(s.amount)} height={4} tone="bar" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function Tile({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    // Narrow phones: one row each (label, then the value at the end); from 400px, two tiles side by side.
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-page px-3 py-2.5 min-[400px]:flex-col min-[400px]:items-start min-[400px]:justify-start min-[400px]:gap-0.5">
      <span className="inline-flex min-w-0 items-center gap-1.5 text-xs leading-4 text-ink-2">
        <Icon name={icon} className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <span className="tabular shrink-0 text-[15px] leading-6 font-bold whitespace-nowrap text-ink min-[400px]:max-w-full min-[400px]:shrink min-[400px]:truncate min-[400px]:text-[17px]">{value}</span>
    </div>
  )
}
