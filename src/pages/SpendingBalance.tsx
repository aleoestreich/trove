import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { GroupsSaved } from './BalanceOrganize'
import { useData } from '../state'
import { useI18n } from '../i18n/I18nProvider'
import { Card } from '../components/ui'
import { Icon } from '../components/Icon'
import { CategoryBadge, catVar } from '../components/CategoryBadge'
import { DetailHeader, capitalize } from '../components/insights/parts'
import { IncomeFilterSheet } from '../components/IncomeFilter'
import { BarLegend, GROUP_FILL, GroupSwatch, OVER_FILL, SplitBar, StatusPill, pct, useMonthBalance, useStatusText } from '../components/balance/parts'
import { InfoNote, TargetSheet } from '../components/balance/TargetSheet'
import { NO_FILTER, joinNames, summarizeIncomeFilter } from '../data/incomeAverage'
import { daysSoFar, monthBalances, roundedShares, type BalanceItem, type MonthBalance } from '../data/spendingBalance'
import type { BalanceTarget, SpendingGroup } from '../data/types'
import { formatMonthName, formatMonthShort, lastMonths, monthKey } from '../lib/dates'
import { formatMoney, isMoneyMasked } from '../lib/money'
import { monthTitle } from '../components/MonthPicker'

/** Category rows shown per group before "Mais N categorias". */
const TOP_ROWS = 5

/**
 * "Equilíbrio do mês": a month's split (?m=YYYY-MM; the card's month by
 * default), what forms each group, "Sem grupo", and the months before it.
 * Desktop: the summary and Essencial on the left, Estilo de vida and Sem
 * grupo on the right, the months below.
 */
export function SpendingBalance() {
  const { t } = useI18n()
  const b = t.spendingBalance
  const { today, loadedFrom, storedMonths } = useData()
  const [params, setParams] = useSearchParams()
  const asked = params.get('m')
  const current = monthKey(today)
  // The months the loaded data covers in full, up to the current one.
  const months = useMemo(() => {
    const first = loadedFrom ?? storedMonths[0] ?? current
    return storedMonths.filter((m) => m >= first && m <= current).concat(storedMonths.includes(current) ? [] : [current])
  }, [loadedFrom, storedMonths, current])
  const month = asked && months.includes(asked) ? asked : undefined
  const { balance, status, target } = useMonthBalance(month)
  const [targetOpen, setTargetOpen] = useState(false)
  const setMonth = (m: string) => setParams({ m }, { replace: true })

  return (
    <>
      <DetailHeader title={b.title} subtitle={b.detail.subtitle} />
      <div className="flex flex-col gap-3 lg:gap-5">
        <MonthStepper month={balance.month} months={months} today={today} onChange={setMonth} />
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
          <div className="flex flex-col gap-3 lg:gap-5">
            <SummaryCard balance={balance} status={status} target={target} onEditTarget={() => setTargetOpen(true)} />
            <GroupCard group="essential" balance={balance} target={target} />
          </div>
          <div className="flex flex-col gap-3 lg:gap-5">
            <GroupCard group="lifestyle" balance={balance} target={target} />
            {balance.ungrouped > 0 && <UngroupedCard balance={balance} />}
          </div>
        </div>
        <Trend target={target} />
        <Link to="/balance/organize" className="inline-flex h-12 items-center justify-center gap-1.5 self-center rounded-md px-4 text-[15px] font-medium text-accent hover:bg-track">
          <Icon name="tabCategories" className="size-[18px]" />
          {b.detail.organize}
        </Link>
      </div>
      {targetOpen && <TargetSheet onClose={() => setTargetOpen(false)} />}
      <SavedToast />
    </>
  )
}

/** After "Salvar grupos": "Grupos salvos · N categorias organizadas" and Desfazer, for 6 s. */
function SavedToast() {
  const { t } = useI18n()
  const o = t.spendingBalance.org
  const location = useLocation()
  const navigate = useNavigate()
  const { saveCategoryGroups } = useData()
  const [saved] = useState(() => (location.state as { groupsSaved?: GroupsSaved } | null)?.groupsSaved ?? null)
  const [state, setState] = useState<'shown' | 'undoing' | 'undone' | 'failed' | 'gone'>(saved ? 'shown' : 'gone')
  useEffect(() => {
    // The state is read once: a reload or Back doesn't show it again.
    if (saved) navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (state === 'undoing' || state === 'gone') return
    const timer = setTimeout(() => setState('gone'), state === 'shown' ? 6000 : 3000)
    return () => clearTimeout(timer)
  }, [state])
  if (!saved || state === 'gone') return null
  const undo = async () => {
    setState('undoing')
    try {
      await saveCategoryGroups(saved.previous)
      setState('undone')
    } catch {
      setState('failed')
    }
  }
  const active = state === 'shown' || state === 'undoing'
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(86px+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-[480px] px-3 lg:bottom-6 lg:left-[248px] lg:mx-0 lg:max-w-[440px] lg:px-6">
      <div role="status" className="pointer-events-auto flex min-h-14 w-full items-center gap-2.5 rounded-md bg-ink py-1.5 pr-1 pl-4 text-page shadow-lg">
        <Icon name={state === 'failed' ? 'alert' : 'check'} className="size-[18px] shrink-0" strokeWidth={2} />
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="text-sm leading-[19px] font-medium">{state === 'undone' ? t.bulk.undone : state === 'failed' ? t.bulk.undoFailed : o.saved}</span>
          {active && <span className="truncate text-[13px] leading-[18px] opacity-80">{o.savedN(saved.count)}</span>}
        </span>
        {active && (
          <button type="button" onClick={undo} disabled={state === 'undoing'} className="h-11 shrink-0 rounded-sm px-3 text-sm font-bold disabled:opacity-60">
            {o.undo}
          </button>
        )}
      </div>
    </div>
  )
}

/** ‹ setembro de 2026 › and "Mês fechado" or "Até agora · 12 de 31 dias". */
function MonthStepper({ month, months, today, onChange }: { month: string; months: string[]; today: string; onChange(m: string): void }) {
  const { t } = useI18n()
  const d = t.spendingBalance.detail
  const i = months.indexOf(month)
  const btn = 'flex size-11 shrink-0 items-center justify-center rounded-[12px] text-ink-2 hover:bg-track disabled:text-line disabled:hover:bg-transparent'
  const soFar = month === monthKey(today)
  const days = daysSoFar(month, today)
  return (
    <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-3">
      <div className="flex min-w-0 items-center gap-1 rounded-[14px] bg-surface p-0.5 lg:w-[360px]">
        <button type="button" className={btn} disabled={i <= 0} onClick={() => onChange(months[i - 1])} aria-label={t.previousMonth}>
          <Icon name="chevronLeft" className="size-[22px]" strokeWidth={2} />
        </button>
        <span aria-live="polite" className="min-w-0 flex-1 truncate text-center text-[15px] font-medium text-ink">
          {monthTitle(month)}
        </span>
        <button type="button" className={btn} disabled={i < 0 || i >= months.length - 1} onClick={() => onChange(months[i + 1])} aria-label={t.nextMonth}>
          <Icon name="chevronRight" className="size-[22px]" strokeWidth={2} />
        </button>
      </div>
      <span className="tabular text-center text-xs leading-4 text-muted lg:text-left">{soFar ? d.soFar(days.day, days.of) : d.closedMonth}</span>
    </div>
  )
}

function SummaryCard({
  balance,
  status,
  target,
  onEditTarget,
}: {
  balance: MonthBalance
  status: ReturnType<typeof useMonthBalance>['status']
  target: BalanceTarget
  onEditTarget(): void
}) {
  const { t } = useI18n()
  const b = t.spendingBalance
  const d = b.detail
  const text = useStatusText(status)
  const shares = roundedShares(balance)
  const soFar = status.kind === 'partial'
  const points = (n: number) => (isMoneyMasked() ? '' : d.points(n))
  // The month in progress: with what's still expected, the figures run to the end of the month.
  const soFarTag = balance.expectedSpending > 0 ? d.withExpectedTag : d.soFarTag

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={status} />
        <span className="text-[13px] leading-[18px] text-ink-2">{text}</span>
      </div>
      {shares ? (
        <>
          <SplitBar balance={balance} target={target} height={28} />
          <BarLegend target={target} over={balance.overIncome > 0} reserve={balance.reserved.essential + balance.reserved.lifestyle > 0} onEditTarget={onEditTarget} />
          <IncomeBase balance={balance} />
          <div className="flex flex-col">
            <ShareRow
              part="essential"
              name={b.groups.essential}
              note={d.rowShare(pct(shares.essential), target.essential)}
              amount={balance.essential}
              tag={balance.reserved.essential > 0 ? d.rowReserved(formatMoney(balance.reserved.essential)) : soFar ? soFarTag : points(shares.essential - target.essential)}
            />
            <ShareRow
              part="lifestyle"
              name={b.groups.lifestyle}
              note={d.rowShare(pct(shares.lifestyle), target.lifestyle)}
              amount={balance.lifestyle}
              tag={balance.reserved.lifestyle > 0 ? d.rowReserved(formatMoney(balance.reserved.lifestyle)) : soFar ? soFarTag : points(shares.lifestyle - target.lifestyle)}
            />
            <ShareRow
              part="future"
              name={b.groups.future}
              note={d.rowShare(pct(shares.future), target.future)}
              amount={balance.future}
              tag={soFar ? soFarTag : points(shares.future - target.future)}
              critical={balance.future < 0}
            />
            {balance.ungrouped > 0 && <UngroupedRow amount={balance.ungrouped} />}
          </div>
          {balance.reserved.essential + balance.reserved.lifestyle > 0 && (
            <p className="tabular text-xs leading-4 text-muted">
              {d.reserveNote(
                joinNames(
                  (['essential', 'lifestyle'] as const).filter((g) => balance.reserved[g] > 0).map((g) => d.reservePart(b.groups[g], formatMoney(balance.reserved[g]))),
                  t.overview.avgIncome.filter.and,
                ),
              )}
            </p>
          )}
          {balance.expectedSpending > 0 && <p className="tabular text-xs leading-4 text-muted">{d.expectedSpendNote(formatMoney(balance.expectedSpending))}</p>}
        </>
      ) : (
        <>
          <InfoNote>{d.noIncomeBanner}</InfoNote>
          <div className="flex flex-col">
            <ShareRow part="essential" name={b.groups.essential} amount={balance.essential} />
            <ShareRow part="lifestyle" name={b.groups.lifestyle} amount={balance.lifestyle} />
            <ShareRow part="ungrouped" name={b.groups.ungrouped} amount={balance.ungrouped} />
          </div>
        </>
      )}
    </Card>
  )
}

/**
 * "Sobre R$ 10.000,00 de renda": which income counts (the average income's
 * categories), with "Alterar". The month in progress: "de renda prevista",
 * the 3-month average, and what already came in.
 */
function IncomeBase({ balance }: { balance: MonthBalance }) {
  const { income, month } = balance
  const { t } = useI18n()
  const d = t.spendingBalance.detail
  const { categories, subcategories, incomeFilter } = useData()
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const f = t.overview.avgIncome.filter
  const filter = incomeFilter ?? NO_FILTER
  const summary = summarizeIncomeFilter(filter, categories, subcategories, t.transactions.uncategorized)
  const excluded = [
    ...categories.filter((c) => c.type === 'income' && filter.excludedCategoryIds.includes(c.id)).map((c) => c.name),
    ...(filter.excludeUncategorized ? [t.transactions.uncategorized] : []),
  ]
  const which = summary.all
    ? d.baseAll
    : d.baseNote(joinNames(summary.included.map((i) => (i.partial ? `${i.name} ${f.partial}` : i.name)), f.and), excluded.length ? joinNames(excluded, f.and) : null)
  const expected = balance.expected !== null
  const note = expected ? `${d.expectedNote(formatMoney(balance.received))} ${which}` : which
  return (
    <div className="flex items-center gap-2 rounded-md bg-page py-2 pr-2.5 pl-3">
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="tabular text-sm leading-5 font-medium text-ink">{(expected ? d.baseExpected : d.base)(formatMoney(income))}</span>
        <span className="text-xs leading-4 text-muted">{note}</span>
      </span>
      <button ref={button} type="button" onClick={() => setOpen(true)} className="h-10 shrink-0 rounded-sm px-2 text-sm font-medium text-accent hover:bg-track">
        {d.change}
      </button>
      {open && <IncomeFilterSheet currentMonth={month} onClose={() => setOpen(false)} returnTo={button} />}
    </div>
  )
}

function ShareRow({ part, name, note, amount, tag, critical = false }: { part: 'essential' | 'lifestyle' | 'future' | 'ungrouped'; name: string; note?: string; amount: number; tag?: string; critical?: boolean }) {
  return (
    <div className="flex min-h-[60px] items-center gap-3 border-t border-line py-2 first:border-t-0">
      <GroupSwatch part={part} />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-[15px] leading-5 font-medium text-ink">{name}</span>
        {note && <span className="tabular text-xs leading-4 text-muted">{note}</span>}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-px">
        <span className={`tabular text-[15px] leading-5 font-medium ${critical ? 'text-critical' : 'text-ink'}`}>{signedMoney(amount)}</span>
        {tag && <small className="tabular text-xs leading-4 text-muted">{tag}</small>}
      </span>
    </div>
  )
}

const signedMoney = (cents: number) => (cents < 0 && !isMoneyMasked() ? `−${formatMoney(-cents)}` : formatMoney(cents))

function UngroupedRow({ amount }: { amount: number }) {
  const { t } = useI18n()
  const b = t.spendingBalance
  return (
    <div className="flex min-h-[60px] items-center gap-3 border-t border-line py-2">
      <GroupSwatch part="ungrouped" />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-[15px] leading-5 font-medium text-ink">{b.groups.ungrouped}</span>
        <span className="tabular text-xs leading-4 text-muted">{b.detail.insideFuture(formatMoney(amount))}</span>
      </span>
      <Link to="/balance/organize" className="flex h-11 shrink-0 items-center rounded-sm px-2 text-sm font-medium text-accent hover:bg-track">
        {b.detail.classify}
      </Link>
    </div>
  )
}

/** A group: its total, a bar against its share of the target, a sentence, and its categories. */
function GroupCard({ group, balance, target }: { group: SpendingGroup; balance: MonthBalance; target: BalanceTarget }) {
  const { t } = useI18n()
  const b = t.spendingBalance
  const d = b.detail
  const { categoriesById, subcategoriesById } = useData()
  const [all, setAll] = useState(false)
  const amount = balance[group]
  const items = balance.items[group]
  const goal = balance.income > 0 ? Math.round((balance.income * target[group]) / 100) : null
  const name = (i: BalanceItem) => (i.subcategoryId ? (subcategoriesById.get(i.subcategoryId)?.name ?? '') : (categoriesById.get(i.categoryId ?? '')?.name ?? d.uncategorized))
  const top = items.slice(0, 2)
  const topShare = amount > 0 ? Math.round((top.reduce((s, i) => s + i.amount, 0) / amount) * 100) : 0
  const shown = all ? items : items.slice(0, TOP_ROWS)
  const rest = items.slice(TOP_ROWS)

  let sentence = null
  if (goal !== null && amount > goal) {
    sentence = (
      <>
        <b className="font-medium text-ink">{d.overTarget(formatMoney(amount - goal))}</b>
        {d.overTargetOf(formatMoney(goal))}
        {top.length === 2 && !isMoneyMasked() && d.topShare(joinNames(top.map(name), t.overview.avgIncome.filter.and), topShare)}
      </>
    )
  } else if (goal !== null) sentence = amount === goal ? d.atTarget(formatMoney(goal)) : d.underTarget(formatMoney(goal - amount), formatMoney(goal))

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <GroupSwatch part={group} size={14} />
        <h2 className="min-w-0 flex-1 text-base leading-[22px] font-medium text-ink">{b.groups[group]}</h2>
        <span className="tabular text-base font-medium text-ink">{formatMoney(amount)}</span>
      </div>
      {goal !== null && goal > 0 && <GoalBar amount={amount} goal={goal} />}
      {sentence && <p className="tabular text-[13px] leading-[18px] text-ink-2">{sentence}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-muted">{d.emptyGroup}</p>
      ) : (
        <div className="flex flex-col">
          {shown.map((i) => (
            <ItemRow key={`${i.categoryId}/${i.subcategoryId}`} item={i} total={amount} month={balance.month} />
          ))}
          {rest.length > 0 && (
            <button type="button" onClick={() => setAll(!all)} aria-expanded={all} className="flex min-h-14 items-center gap-3 border-t border-line text-left hover:bg-track">
              <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-track text-ink-2">
                <Icon name={all ? 'chevronUp' : 'chevronDown'} className="size-4" />
              </span>
              <span className="min-w-0 flex-1 text-sm text-ink">{all ? d.less : d.more(rest.length)}</span>
              {!all && <span className="tabular text-sm font-medium text-ink">{formatMoney(rest.reduce((s, i) => s + i.amount, 0))}</span>}
            </button>
          )}
        </div>
      )}
    </Card>
  )
}

/** The group against its goal: filled to the goal (marked), the part above it hatched in critical. */
function GoalBar({ amount, goal }: { amount: number; goal: number }) {
  const scale = Math.max(amount, goal)
  const w = (v: number) => `${(v / scale) * 100}%`
  return (
    <div aria-hidden className="relative py-1">
      <div data-progress className="flex h-2 overflow-hidden rounded-full bg-track">
        <span style={{ width: w(Math.min(amount, goal)), background: 'var(--accent)' }} />
        {amount > goal && <span style={{ width: w(amount - goal), background: OVER_FILL }} />}
      </div>
      <span data-legend className="absolute -top-0.5 -bottom-0.5 w-0.5 rounded-[2px] bg-ink" style={{ left: `calc(${w(goal)} - 1px)`, boxShadow: '0 0 0 1.5px var(--surface)' }} />
    </div>
  )
}

/** A category of the group (or a subcategory in it from another category): amount, share of the group, and its transactions. */
function ItemRow({ item, total, month }: { item: BalanceItem; total: number; month: string }) {
  const { t } = useI18n()
  const d = t.spendingBalance.detail
  const { categoriesById, subcategoriesById } = useData()
  const category = item.categoryId ? categoriesById.get(item.categoryId) : undefined
  const sub = item.subcategoryId ? subcategoriesById.get(item.subcategoryId) : undefined
  const share = total > 0 ? Math.round((item.amount / total) * 100) : 0
  const color = category ? catVar(category.color) : 'var(--series-6)'
  return (
    <Link
      to={`/transactions?m=${month}&c=${category?.id ?? 'none'}`}
      className="flex min-h-14 items-center gap-3 border-t border-line py-2 first:border-t-0 hover:bg-track"
    >
      <CategoryBadge category={category} size={32} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-sm text-ink">{sub?.name ?? category?.name ?? d.uncategorized}</span>
          <span className="tabular text-sm font-medium text-ink">{formatMoney(item.amount)}</span>
        </span>
        <span className="flex items-center gap-2">
          <span data-progress className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-track">
            <span className="block h-full rounded-full" style={{ width: `${share}%`, background: color }} />
          </span>
          <span className="tabular w-24 shrink-0 text-right text-xs leading-4 text-muted">{sub && category ? d.fromCategory(category.name) : isMoneyMasked() ? '' : d.shareOfGroup(share)}</span>
        </span>
        {item.expected > 0 && <span className="tabular text-xs leading-4 text-muted">{d.itemExpected(formatMoney(item.expected))}</span>}
      </span>
    </Link>
  )
}

/** "Sem grupo": what's in it (uncategorized, categories without a group), and "Classificar". */
function UngroupedCard({ balance }: { balance: MonthBalance }) {
  const { t } = useI18n()
  const b = t.spendingBalance
  const d = b.detail
  const { categoriesById } = useData()
  return (
    <section className="flex flex-col gap-3 rounded-lg border-[1.5px] border-dashed border-line bg-surface p-4 lg:p-5" aria-label={b.groups.ungrouped}>
      <div className="flex items-center gap-2.5">
        <GroupSwatch part="ungrouped" size={14} />
        <h2 className="min-w-0 flex-1 text-base leading-[22px] font-medium text-ink">{b.groups.ungrouped}</h2>
        <span className="tabular text-base font-medium text-ink">{formatMoney(balance.ungrouped)}</span>
      </div>
      <p className="text-[13px] leading-[18px] text-ink-2">{d.ungroupedNote}</p>
      <div className="flex flex-col">
        {balance.items.ungrouped.map((i) => {
          const category = i.categoryId ? categoriesById.get(i.categoryId) : undefined
          return (
            <Link
              key={i.categoryId ?? 'none'}
              to={`/transactions?m=${balance.month}&c=${category?.id ?? 'none'}`}
              className="flex min-h-14 items-center gap-3 border-t border-line py-2 first:border-t-0 hover:bg-track"
            >
              <CategoryBadge category={category} size={32} />
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="truncate text-sm text-ink">{category?.name ?? d.uncategorized}</span>
                <span className="text-xs leading-4 text-muted">{category ? d.noGroupYet : d.txCount(i.count)}</span>
              </span>
              <span className="tabular text-sm font-medium text-ink">{formatMoney(i.amount)}</span>
            </Link>
          )
        })}
      </div>
      <Link
        to="/balance/organize"
        className="inline-flex h-12 items-center justify-center rounded-md border border-line bg-surface px-4 text-[15px] font-medium text-accent hover:bg-track"
      >
        {b.classifyAmount(formatMoney(balance.ungrouped))}
      </Link>
    </section>
  )
}

/** The closed months as stacked bars across the income (the target's two marks dashed), a sentence, and a table. */
function Trend({ target }: { target: BalanceTarget }) {
  const { t } = useI18n()
  const d = t.spendingBalance.detail
  const g = t.spendingBalance.groups
  const { allTransactions, categories, subcategories, incomeFilter, today } = useData()
  const [count, setCount] = useState<6 | 12>(6)
  const [table, setTable] = useState(false)
  const months = lastMonths(monthKey(today), count + 1).slice(0, -1)
  const balances = useMemo(
    () => monthBalances(allTransactions, categories, subcategories, incomeFilter ?? NO_FILTER, months).filter((x) => x.income > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allTransactions, categories, subcategories, incomeFilter, months.join()],
  )
  const span = d.span(formatMonthShort(months[0]), `${formatMonthShort(months.at(-1)!)} ${months.at(-1)!.slice(0, 4)}`)
  const essentials = balances.map((x) => roundedShares(x)!.essential)
  const worst = balances.filter((x) => x.overIncome > 0).sort((a, b) => b.overIncome - a.overIncome)[0]
  const summary = balances.length
    ? `${d.trendSummary(Math.min(...essentials), Math.max(...essentials))}${worst ? d.trendOver(formatMonthName(worst.month), formatMoney(worst.overIncome)) : ''}`
    : d.trendEmpty

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 pt-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-baseline justify-between gap-3 px-1 lg:flex-col lg:gap-0.5 lg:px-0">
          <h2 className="text-lg leading-6 font-medium text-ink">{d.trendTitle}</h2>
          <span className="text-[13px] leading-[18px] text-ink-2">{span}</span>
        </div>
        <div role="group" aria-label={d.rangeLabel} className="flex rounded-md bg-track p-1 lg:w-[240px]">
          {([6, 12] as const).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={count === n}
              onClick={() => setCount(n)}
              className={`h-10 flex-1 rounded-[10px] px-3 text-sm ${count === n ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
            >
              {n === 6 ? d.months6 : d.year}
            </button>
          ))}
        </div>
      </div>
      <Card className="flex flex-col gap-3">
        <div data-legend className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs leading-4 text-muted">
          {(['essential', 'lifestyle', 'future'] as const).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <GroupSwatch part={k} size={10} />
              {g[k]}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <GroupSwatch part="over" size={10} />
            {d.legendOver}
          </span>
        </div>
        {balances.length > 0 && <TrendChart months={months} balances={balances} target={target} summary={summary} />}
        <p className="tabular text-[13px] leading-[18px] text-ink-2">{summary}</p>
        {balances.length > 0 && (
          <button type="button" onClick={() => setTable(!table)} aria-expanded={table} className="-ml-2 h-11 self-start rounded-sm px-2 text-sm font-medium text-accent hover:bg-track">
            {table ? d.hideTable : d.showTable}
          </button>
        )}
        {table && (
          <div className="overflow-x-auto">
            <table className="tabular w-full text-left text-[13px] leading-[18px]">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1.5 pr-2 font-medium">{d.table.month}</th>
                  <th className="py-1.5 pr-2 text-right font-medium">{d.table.income}</th>
                  <th className="py-1.5 pr-2 text-right font-medium">{g.essential}</th>
                  <th className="py-1.5 pr-2 text-right font-medium">{g.lifestyle}</th>
                  <th className="py-1.5 text-right font-medium">{g.future}</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((x) => {
                  const s = roundedShares(x)!
                  return (
                    <tr key={x.month} className="border-t border-line text-ink">
                      <td className="py-2 pr-2">{capitalize(formatMonthShort(x.month))}</td>
                      <td className="py-2 pr-2 text-right">{formatMoney(x.income)}</td>
                      <td className="py-2 pr-2 text-right">{pct(s.essential)}</td>
                      <td className="py-2 pr-2 text-right">{pct(s.lifestyle)}</td>
                      <td className={`py-2 text-right ${s.future < 0 ? 'text-critical' : ''}`}>{pct(s.future)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  )
}

const CHART_HEIGHT = 150

/** Stacked bars, each month on its own income (100%): Essencial, Estilo de vida, then Futuro, or the part above the income hatched. */
function TrendChart({ months, balances, target, summary }: { months: string[]; balances: MonthBalance[]; target: BalanceTarget; summary: string }) {
  const { t } = useI18n()
  const d = t.spendingBalance.detail
  const byMonth = new Map(balances.map((x) => [x.month, x]))
  // 100% of the income sits below the top, with room for a month above it.
  const top = Math.max(112, ...balances.map((x) => ((x.essential + x.lifestyle + x.ungrouped) / x.income) * 100 + 4))
  const y = (pctOfIncome: number) => (pctOfIncome / top) * CHART_HEIGHT
  const line = (pctOfIncome: number, label: string, dashed: boolean) => (
    <div className="pointer-events-none absolute inset-x-0 flex items-center" style={{ bottom: y(pctOfIncome) }} aria-hidden>
      <span className={`flex-1 border-t-[1.5px] border-ink-2 ${dashed ? 'border-dashed' : ''}`} />
      <span className="tabular w-8 pl-1 text-[11px] leading-3 text-muted">{label}</span>
    </div>
  )
  const narrow = months.length > 6
  return (
    <div data-chart role="img" aria-label={`${d.trendAria(formatMonthShort(months[0]), formatMonthShort(months.at(-1)!))} ${summary}`} className="flex flex-col gap-1.5">
      <div className="relative pr-8" style={{ height: CHART_HEIGHT }}>
        <div className="absolute inset-y-0 right-8 left-0 flex items-end justify-around">
          {months.map((m) => {
            const x = byMonth.get(m)
            if (!x) return <span key={m} className={narrow ? 'w-3' : 'w-[22px]'} />
            const pctOf = (v: number) => (v / x.income) * 100
            const futureShown = Math.max(0, pctOf(x.future))
            const over = pctOf(Math.max(0, x.essential + x.lifestyle - x.income))
            return (
              <span key={m} className={`flex flex-col-reverse ${narrow ? 'w-3' : 'w-[22px]'}`} style={{ height: '100%' }}>
                <span className="rounded-b-[3px]" style={{ height: y(pctOf(x.essential)), background: GROUP_FILL.essential }} />
                <span style={{ height: y(pctOf(x.lifestyle)), background: GROUP_FILL.lifestyle, borderBottom: '2px solid var(--surface)' }} />
                {futureShown > 0 && <span className="rounded-t-[3px]" style={{ height: y(futureShown), background: GROUP_FILL.future, borderBottom: '2px solid var(--surface)' }} />}
                {over > 0 && <span className="rounded-t-[3px]" style={{ height: y(over), background: OVER_FILL }} />}
              </span>
            )
          })}
        </div>
        {line(100, d.incomeLine, false)}
        {line(target.essential + target.lifestyle, String(target.essential + target.lifestyle), true)}
        {line(target.essential, String(target.essential), true)}
      </div>
      <div className="flex justify-around pr-8 text-[11px] leading-3 text-muted">
        {months.map((m, i) => (
          <span key={m} className={`text-center ${narrow ? 'w-3' : 'w-[22px]'} ${i === months.length - 1 ? 'font-medium text-ink' : ''}`}>
            {!narrow || (months.length - 1 - i) % 3 === 0 ? formatMonthShort(m) : ''}
          </span>
        ))}
      </div>
    </div>
  )
}
