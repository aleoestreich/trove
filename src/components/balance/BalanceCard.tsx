import { Link } from 'react-router-dom'
import { useData } from '../../state'
import { useI18n } from '../../i18n/I18nProvider'
import { Icon } from '../Icon'
import { Card } from '../ui'
import { formatMoney } from '../../lib/money'
import { monthKey } from '../../lib/dates'
import { hasGroups, roundedShares } from '../../data/spendingBalance'
import { GROUP_FILL, GroupSwatch, SplitBar, pct, StatusPill, monthLabel, useMonthBalance, useStatusText, type Part } from './parts'

/**
 * "Equilíbrio do mês" on the Visão geral: the verdict, the month as one bar
 * against the target, the three shares and a sentence. Opens the page.
 * Before any category is in a group: what it is, and "Organizar categorias".
 */
export function BalanceCard() {
  const { categories, subcategories } = useData()
  if (!hasGroups(categories, subcategories)) return <EmptyBalanceCard />
  return <FilledBalanceCard />
}

const cardClass = 'flex flex-col gap-3 lg:order-5 lg:col-span-12'

function EmptyBalanceCard() {
  const { t } = useI18n()
  const b = t.spendingBalance
  const { balanceTarget: target } = useData()
  return (
    <Card className={cardClass}>
      <h2 className="text-base leading-[22px] font-medium text-ink">{b.title}</h2>
      <div className="flex flex-col gap-1.5 lg:max-w-[560px]">
        <div aria-hidden className="flex h-3.5 gap-0.5">
          {(['essential', 'lifestyle', 'future'] as const).map((g, i) => (
            <span
              key={g}
              className={`border-[1.5px] border-dashed border-muted ${i === 0 ? 'rounded-l-[5px]' : ''} ${i === 2 ? 'rounded-r-[5px]' : ''}`}
              style={{ flex: `${target[g]} 1 0` }}
            />
          ))}
        </div>
        <div className="grid gap-0.5 text-xs leading-4 text-muted" style={{ gridTemplateColumns: `${target.essential}fr ${target.lifestyle}fr ${target.future}fr` }}>
          <span className="truncate">{b.groups.essential}</span>
          <span className="truncate">{b.groups.lifestyle}</span>
          <span className="truncate">{b.groups.future}</span>
        </div>
      </div>
      <p className="text-sm leading-5 text-ink-2">{b.emptyText}</p>
      <Link
        to="/balance/organize"
        className="inline-flex h-12 items-center justify-center rounded-md bg-accent px-5 text-[15px] font-medium text-surface active:opacity-80 lg:self-start"
      >
        {b.organize}
      </Link>
      <p className="text-xs leading-4 text-muted">{b.emptyNote}</p>
    </Card>
  )
}

function FilledBalanceCard() {
  const { t } = useI18n()
  const b = t.spendingBalance
  const { today } = useData()
  const { balance, status, target } = useMonthBalance()
  const text = useStatusText(status)
  const soFar = balance.month === monthKey(today)
  const shares = roundedShares(balance)
  const sub =
    status.kind === 'noIncome'
      ? b.subNoIncome(monthLabel(balance.month), soFar)
      : (balance.expected !== null ? b.subSoFar : b.sub)(monthLabel(balance.month), formatMoney(balance.income))

  const tiles: { part: Part; label: string; value: string; note?: string; critical?: boolean }[] = shares
    ? [
        { part: 'essential', label: b.groups.essential, value: pct(shares.essential), note: b.target(target.essential) },
        { part: 'lifestyle', label: b.groups.lifestyle, value: pct(shares.lifestyle), note: b.target(target.lifestyle) },
        { part: 'future', label: b.groups.future, value: pct(shares.future), note: b.target(target.future), critical: shares.future < 0 },
      ]
    : [
        { part: 'essential', label: b.groups.essential, value: formatMoney(balance.essential) },
        { part: 'lifestyle', label: b.groups.lifestyle, value: formatMoney(balance.lifestyle) },
        { part: 'ungrouped', label: b.groups.ungrouped, value: formatMoney(balance.ungrouped) },
      ]

  return (
    <Card className={`relative ${cardClass}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base leading-[22px] font-medium text-ink">
          {/* The whole card opens the page; the "Classificar" button sits above this link. */}
          <Link to={`/balance?m=${balance.month}`} aria-label={b.open(b.status[status.kind])} className="after:absolute after:inset-0 after:rounded-lg after:content-['']">
            {b.title}
          </Link>
        </h2>
        <StatusPill status={status} />
      </div>
      <p className="-mt-2 tabular text-[13px] leading-[18px] text-muted">{sub}</p>
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-center lg:gap-8">
        <div className="flex flex-col gap-3">
          {shares && <SplitBar balance={balance} target={target} />}
          <div className="grid grid-cols-3 gap-2">
            {tiles.map((x) => (
              <div key={x.part} className="flex min-w-0 flex-col gap-0.5">
                <span aria-hidden className="h-1 w-5 shrink-0 rounded-[2px]" style={{ background: GROUP_FILL[x.part] }} />
                <span className="truncate text-xs leading-4 text-ink-2">{x.label}</span>
                <span className={`tabular font-medium ${shares ? 'text-lg leading-[22px]' : 'text-sm leading-5'} ${x.critical ? 'text-critical' : 'text-ink'}`}>{x.value}</span>
                {x.note && <span className="tabular text-xs leading-4 text-muted">{x.note}</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 border-t border-line pt-2.5 lg:border-t-0 lg:pt-0">
            <span className="min-w-0 flex-1 text-[13px] leading-[18px] text-ink-2">{text}</span>
            <Icon name="chevronRight" className="size-[18px] shrink-0 text-muted" />
          </div>
          {status.kind === 'incomplete' ? (
            <Link
              to="/balance/organize"
              className="relative z-10 inline-flex h-11 items-center justify-center self-start rounded-md border border-line bg-surface px-4 text-sm font-medium text-accent hover:bg-track"
            >
              {b.classifyAmount(formatMoney(balance.ungrouped))}
            </Link>
          ) : (
            balance.ungrouped > 0 &&
            shares && (
              <span className="flex items-center gap-1.5 text-xs leading-4 text-muted">
                <GroupSwatch part="ungrouped" size={10} />
                <span className="tabular">{b.includesUngrouped(formatMoney(balance.ungrouped))}</span>
              </span>
            )
          )}
        </div>
      </div>
    </Card>
  )
}
