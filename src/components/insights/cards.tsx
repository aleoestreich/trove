import { Link, useNavigate } from 'react-router-dom'
import type { Projection } from '../../data/projection'
import type { CategoryComparison, UnusualResult } from '../../data/unusual'
import type { RecurringSummary } from '../../data/recurring'
import { formatDay, formatMonthName, formatMonthShort } from '../../lib/dates'
import { formatCompactMoney, formatMoney, formatPercent, formatWholeMoney } from '../../lib/money'
import { describeEvent } from '../../lib/insightText'
import { useData } from '../../state'
import { useI18n } from '../../i18n/I18nProvider'
import { CategoryBadge } from '../CategoryBadge'
import { Icon } from '../Icon'
import { Card } from '../ui'
import { ProjectionChart } from './ProjectionChart'
import { AlertBadge, DivergingBar, DivergingLegend, PctPill, TextAction, capitalize, signedPct } from './parts'
import { useAlertActions, useAlertText, useHistorySheet, usePaymentLabel } from './recurringParts'

// The three insight cards on the Overview. Phones: one column, in the
// design's order. Desktop (lg): projection (7 columns) and unusual
// categories (5) side by side, recurring charges across (12).

/** The breakdown's lines with signed values and colours, shared with the detail page. */
export function useProjectionLines(p: Projection) {
  const { t } = useI18n()
  const l = t.insights.projection.lines
  const b = p.breakdown
  return [
    { key: 'saldo', label: l.saldoHoje, value: formatMoney(b.saldoHoje), income: false },
    { key: 'receitas', label: l.receitas, value: formatMoney(b.receitasPrevistas, 'BRL', { signed: true }), income: b.receitasPrevistas > 0 },
    { key: 'faturas', label: l.faturas, value: formatMoney(-b.faturas), income: false },
    { key: 'recorrentes', label: l.recorrentes, value: formatMoney(-b.recorrentes), income: false },
    { key: 'diaADia', label: l.diaADia, value: formatMoney(-b.diaADia), income: false },
  ]
}

/** "Ponto mais baixo: R$ 17,6 mil em 19 out., antes do salário". */
export function useLowNote(p: Projection) {
  const { t } = useI18n()
  const beforeSalary = p.events.some((e) => e.kind === 'salary' && e.date > p.low.date)
  return t.insights.projection.lowNote(formatCompactMoney(p.low.value), formatDay(p.low.date), beforeSalary)
}

function LowRing() {
  return <span aria-hidden className="size-2 shrink-0 rounded-full border-2 border-critical" />
}

export function ProjectionCard({ projection }: { projection: Projection | null }) {
  const { t } = useI18n()
  const p = t.insights.projection
  if (!projection)
    return (
      <Card className="flex flex-col gap-2 lg:order-3 lg:col-span-7">
        <h2 className="text-base leading-[22px] font-medium text-ink">{p.title}</h2>
        <p className="text-sm leading-5 text-ink-2">{p.empty}</p>
      </Card>
    )
  return <ProjectionCardBody projection={projection} />
}

function ProjectionCardBody({ projection }: { projection: Projection }) {
  const { t } = useI18n()
  const { accounts, institutions, today } = useData()
  const p = t.insights.projection
  const lines = useProjectionLines(projection)
  const lowNote = useLowNote(projection)
  const tiles = [
    { label: p.tiles.saldoHoje, value: lines[0].value, income: false },
    { label: p.tiles.receitas, value: lines[1].value, income: lines[1].income },
    { label: p.tiles.faturas, value: lines[2].value, income: false },
    { label: p.tiles.recorrentes, value: lines[3].value, income: false },
    { label: p.tiles.diaADia, value: lines[4].value, income: false },
  ]
  const range = p.range(formatCompactMoney(projection.range.min), formatCompactMoney(projection.range.max))
  return (
    <Card className="flex flex-col lg:order-3 lg:col-span-7 lg:gap-3.5">
      {/* Phones */}
      <div className="flex flex-col lg:hidden">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base leading-[22px] font-medium text-ink">{p.title}</h2>
          <span className="text-xs whitespace-nowrap text-muted">{p.today(formatDay(today))}</span>
        </div>
        <p className="mt-2 text-[13px] leading-[18px] text-muted">{p.shouldRemain(formatDay(projection.endDate))}</p>
        <p className="tabular text-[32px] leading-10 font-bold tracking-[-0.02em] text-ink">{formatMoney(projection.end)}</p>
        <p className="tabular text-[13px] leading-[18px] text-ink-2">{range}</p>
        <div className="mt-3.5">
          <ProjectionChart projection={projection} variant="spark" />
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-xs leading-4 text-ink-2">
          <LowRing />
          {lowNote}
        </p>
        <dl className="mt-3.5 border-t border-line">
          {lines.map((l) => (
            <div key={l.key} className="flex min-h-10 items-center justify-between gap-3 border-b border-line">
              <dt className="text-sm leading-[18px] text-ink-2">{l.label}</dt>
              <dd className={`tabular text-sm font-medium whitespace-nowrap ${l.income ? 'text-income' : 'text-ink'}`}>{l.value}</dd>
            </div>
          ))}
          <div className="flex min-h-11 items-center justify-between gap-3">
            <dt className="text-sm font-medium text-ink">{p.lines.total}</dt>
            <dd className="tabular text-[15px] font-bold text-ink">{formatMoney(projection.end)}</dd>
          </div>
        </dl>
        <Link to="/insights/projection" className="-ml-3 mt-1 inline-flex h-11 items-center self-start rounded-sm px-3 text-sm font-medium text-accent active:bg-track">
          {p.seeDetails}
        </Link>
      </div>

      {/* Desktop */}
      <div className="hidden items-start justify-between gap-4 lg:flex">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-base leading-[22px] font-medium text-ink">{p.title}</h2>
          <span className="text-[13px] text-muted">
            {p.shouldRemain(formatDay(projection.endDate))} · {p.today(formatDay(today))}
          </span>
          <span className="tabular mt-1.5 text-[34px] leading-10 font-bold tracking-[-0.02em] text-ink">{formatMoney(projection.end)}</span>
          <span className="tabular text-[13px] text-ink-2">{range}</span>
        </div>
        <Link
          to="/insights/projection"
          className="inline-flex h-10 shrink-0 items-center rounded-[10px] border border-line bg-surface px-3.5 text-sm font-medium whitespace-nowrap text-accent hover:bg-track"
        >
          {p.seeDetailsShort}
        </Link>
      </div>
      <div className="hidden lg:block">
        <ProjectionChart projection={projection} variant="full" height={176} />
        <p className="mt-1 flex items-center gap-1.5 text-xs leading-4 text-ink-2">
          <LowRing />
          {lowNote}
        </p>
      </div>
      <div className="hidden grid-cols-5 gap-2 lg:grid">
        {tiles.map((tile) => (
          <div key={tile.label} className="flex min-w-0 flex-col gap-0.5 rounded-sm bg-page p-2.5">
            <span className="truncate text-xs leading-4 text-muted">{tile.label}</span>
            <span className={`tabular truncate text-[13px] leading-[18px] font-medium ${tile.income ? 'text-income' : 'text-ink'}`}>{tile.value}</span>
          </div>
        ))}
      </div>
      <div className="hidden flex-col border-t border-line lg:flex">
        <span className="label-caps pt-3 pb-1">{p.nextTitle}</span>
        {projection.events.length === 0 && <p className="py-2 text-[13px] text-muted">{p.nextNone}</p>}
        {projection.events.slice(0, 4).map((e, i) => (
          <div key={i} className="grid min-h-9 grid-cols-[64px_minmax(0,1fr)_120px] items-center gap-3 text-[13px]">
            <span className="tabular text-muted">{formatDay(e.date)}</span>
            <span className="truncate text-ink">{describeEvent(e, accounts, institutions).name}</span>
            <span className={`tabular text-right font-medium ${e.amount > 0 ? 'text-income' : 'text-ink'}`}>
              {formatMoney(e.amount, 'BRL', { signed: e.amount > 0 })}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}

/** "Restaurantes está 45% acima da sua média de 6 meses (+R$ 509)." in a tinted box. */
export function UnusualHeadline({ c }: { c: CategoryComparison }) {
  const { t, categoryName } = useI18n()
  const { categoriesById } = useData()
  const up = c.delta > 0
  const text = t.insights.unusual.headline(
    categoryName(categoriesById.get(c.categoryId)),
    formatPercent(Math.abs(Math.round(c.pct * 100))),
    formatWholeMoney(Math.abs(c.delta)),
    up,
  )
  const tone = up ? 'var(--critical)' : 'var(--income)'
  return (
    <p
      className="flex gap-2 rounded-sm border px-3 py-2.5 text-sm leading-5 text-ink"
      style={{ background: `color-mix(in srgb, ${tone} 8%, var(--surface))`, borderColor: `color-mix(in srgb, ${tone} 25%, transparent)` }}
    >
      <span className="mt-px shrink-0" style={{ color: tone }}>
        <Icon name={up ? 'arrowUp' : 'arrowDown'} className="size-[18px]" strokeWidth={2.2} />
      </span>
      <span>{text}</span>
    </p>
  )
}

/** "Moradia, Mercado (+4%), Assinaturas (+3%) e Saúde (−6%)". */
export function useNormalList(u: UnusualResult) {
  const { t, categoryName } = useI18n()
  const { categoriesById } = useData()
  const names = u.normal.map((c) => t.insights.unusual.normalItem(categoryName(categoriesById.get(c.categoryId)), Math.round(c.pct * 100) ? signedPct(c.pct) : ''))
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} ${t.insights.projection.and} ${names[names.length - 1]}`
}

/** The card's subtitle, for a complete month or the month so far. */
export function useUnusualSubtitle(u: UnusualResult, desktop = false) {
  const { t } = useI18n()
  const s = t.insights.unusual
  const month = capitalize(formatMonthName(u.month))
  if (u.mode === 'mtd') return desktop ? s.subDesktopMtd(month, u.days!) : s.subMtd(month, u.days!)
  return desktop ? s.subDesktop(month, formatMonthShort(u.compareFrom), formatMonthShort(u.compareTo)) : s.subMonth(month)
}

/** One category's row: badge, name, now vs average, the change, and its diverging bar. */
export function UnusualRow({ c, u, layout }: { c: CategoryComparison; u: UnusualResult; layout: 'stacked' | 'grid' }) {
  const { t, categoryName } = useI18n()
  const { categoriesById } = useData()
  const navigate = useNavigate()
  const category = categoriesById.get(c.categoryId)
  const name = categoryName(category)
  const normal = Math.abs(c.pct) <= 0.15
  const up = c.pct > 0
  const label = t.insights.unusual.rowLabel(name, formatPercent(Math.abs(Math.round(c.pct * 100))), up, normal)
  const open = () => navigate(`/insights/unusual/${c.categoryId}`)
  if (layout === 'grid')
    return (
      <button
        type="button"
        onClick={open}
        aria-label={label}
        className="grid min-h-16 grid-cols-[30px_120px_minmax(0,1fr)_64px] items-center gap-3 border-t border-line py-2 text-left first:border-t-0 hover:bg-track/40"
      >
        <CategoryBadge category={category} size={28} />
        <span className="flex min-w-0 flex-col gap-px">
          <span className="truncate text-sm font-medium text-ink">{name}</span>
          <span className="tabular text-xs whitespace-nowrap text-muted">
            {t.insights.unusual.compareShort(formatWholeMoney(c.now).replace(/^R\$\s?/, ''), formatWholeMoney(c.avg).replace(/^R\$\s?/, ''))}
          </span>
        </span>
        <DivergingBar pct={c.pct} normal={normal} height={12} />
        <span className={`tabular inline-flex items-center justify-self-end gap-0.5 text-sm font-bold ${normal ? 'text-ink-2' : up ? 'text-critical' : 'text-income'}`}>
          <Icon name={up ? 'arrowUp' : 'arrowDown'} className="size-3.5" strokeWidth={2.4} />
          {signedPct(c.pct)}
        </span>
      </button>
    )
  return (
    <button type="button" onClick={open} aria-label={label} className="flex flex-col gap-2 rounded-sm text-left active:bg-track">
      <span className="flex w-full items-center gap-2.5">
        <CategoryBadge category={category} size={32} />
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="truncate text-[15px] leading-5 font-medium text-ink">{name}</span>
          <span className="tabular text-xs leading-4 text-muted">
            {t.insights.unusual.compare(formatWholeMoney(c.now), formatMonthShort(u.month), formatWholeMoney(c.avg))}
          </span>
        </span>
        <PctPill pct={c.pct} normal={normal} />
      </span>
      <DivergingBar pct={c.pct} normal={normal} />
    </button>
  )
}

export function UnusualCard({ unusual }: { unusual: UnusualResult | null }) {
  return unusual ? <UnusualCardBody unusual={unusual} /> : null
}

function UnusualCardBody({ unusual }: { unusual: UnusualResult }) {
  const { t } = useI18n()
  const s = t.insights.unusual
  const subtitle = useUnusualSubtitle(unusual)
  const subtitleDesktop = useUnusualSubtitle(unusual, true)
  const normalList = useNormalList(unusual)
  const top = unusual.unusual[0]
  const desktopRows = [...unusual.unusual, ...unusual.normal].slice(0, 5)
  return (
    <Card className="flex flex-col gap-3.5 lg:order-4 lg:col-span-5">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base leading-[22px] font-medium text-ink">{s.title}</h2>
        <p className="text-[13px] leading-[18px] text-muted lg:hidden">{subtitle}</p>
        <p className="hidden text-[13px] leading-[18px] text-muted lg:block">{subtitleDesktop}</p>
      </div>
      {top ? (
        <UnusualHeadline c={top} />
      ) : (
        <p className="flex gap-2 rounded-sm bg-page px-3 py-2.5 text-sm leading-5 font-medium text-ink">
          <Icon name="check" className="mt-px size-[18px] shrink-0 text-income" strokeWidth={2.2} />
          {s.allNormal}
        </p>
      )}
      <div className="flex flex-col gap-4 lg:hidden">
        {unusual.unusual.slice(0, 3).map((c) => (
          <UnusualRow key={c.categoryId} c={c} u={unusual} layout="stacked" />
        ))}
      </div>
      <div className="hidden flex-col lg:flex">
        {desktopRows.map((c) => (
          <UnusualRow key={c.categoryId} c={c} u={unusual} layout="grid" />
        ))}
      </div>
      {(unusual.unusual.length > 0 || desktopRows.length > 0) && <DivergingLegend />}
      {unusual.normal.length > 0 && (
        <p className="rounded-sm bg-page px-3 py-2.5 text-[13px] leading-[18px] text-ink-2 lg:hidden">
          <span className="font-medium text-ink">{s.normalLabel}</span> {normalList}
        </p>
      )}
      <Link to="/insights/unusual" className="-my-1.5 -ml-3 inline-flex h-11 items-center self-start rounded-sm px-3 text-sm font-medium text-accent active:bg-track lg:hover:bg-track">
        {s.seeAll}
      </Link>
    </Card>
  )
}

/** "Por mês" / "Por ano" tiles. */
export function RecurringTotals({ summary, size }: { summary: RecurringSummary; size: 'card' | 'desktop' | 'page' }) {
  const { t } = useI18n()
  const r = t.insights.recurring
  const box = size === 'page' ? 'rounded-md border border-line bg-surface p-3.5' : 'rounded-sm bg-page px-3 py-2.5'
  const text = size === 'page' ? 'text-[19px] leading-[26px]' : size === 'desktop' ? 'text-xl leading-[26px]' : 'text-[17px] leading-6'
  return (
    <div className="grid grid-cols-2 gap-2">
      {[
        [r.perMonth, summary.monthTotal],
        [r.perYear, summary.yearTotal],
      ].map(([label, value]) => (
        <div key={label} className={`flex min-w-0 flex-col gap-0.5 ${box}`}>
          <span className="text-xs text-muted">{label}</span>
          <span className={`tabular font-bold whitespace-nowrap text-ink ${text}`}>{formatMoney(value as number)}</span>
        </div>
      ))}
    </div>
  )
}

export function RecurringCard({ summary }: { summary: RecurringSummary }) {
  const { t, categoryName } = useI18n()
  const { categoriesById } = useData()
  const r = t.insights.recurring
  const items = new Map([...summary.active, ...summary.stopped].map((i) => [i.id, i]))
  const alertText = useAlertText()
  const history = useHistorySheet()
  const actions = useAlertActions(history.open)
  const label = usePaymentLabel()
  const empty = summary.active.length === 0 && summary.stopped.length === 0
  return (
    <Card className="flex flex-col gap-3.5 lg:order-5 lg:col-span-12 lg:flex-row lg:gap-8">
      <div className="flex flex-col gap-3.5 lg:w-[360px] lg:shrink-0">
        <div className="flex items-baseline justify-between gap-2 lg:flex-col lg:items-start lg:gap-0.5">
          <h2 className="text-base leading-[22px] font-medium text-ink">{r.cardTitle}</h2>
          <span className="text-xs whitespace-nowrap text-muted lg:hidden">{r.activeCount(summary.active.length)}</span>
          <span className="hidden text-[13px] text-muted lg:inline">{r.desktopSub(summary.active.length)}</span>
        </div>
        {empty ? (
          <p className="text-sm leading-5 text-ink-2">{r.empty}</p>
        ) : (
          <>
            <div className="lg:hidden">
              <RecurringTotals summary={summary} size="card" />
            </div>
            <div className="hidden lg:block">
              <RecurringTotals summary={summary} size="desktop" />
            </div>
            {/* Phones: one row per alert */}
            {summary.alerts.length > 0 && (
              <div className="flex flex-col border-t border-line lg:hidden">
                {summary.alerts.slice(0, 3).map((a) => {
                  const item = items.get(a.recurringId)!
                  return (
                    <div key={`${a.type}-${a.recurringId}`} className="flex min-h-14 items-center gap-2.5 border-b border-line">
                      <AlertBadge kind={a.type} fixed />
                      <span className="flex min-w-0 flex-1 flex-col gap-px">
                        <span className="truncate text-sm leading-[19px] font-medium text-ink">{item.merchant}</span>
                        <span className="tabular truncate text-xs leading-4 text-ink-2">{alertText(a, item)}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
            {/* Desktop: compact alert cards with their answers */}
            <div className="hidden flex-col gap-2 lg:flex">
              {summary.alerts.slice(0, 3).map((a) => {
                const item = items.get(a.recurringId)!
                return (
                  <div key={`${a.type}-${a.recurringId}`} className="flex flex-col gap-1.5 rounded-sm border border-line px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <AlertBadge kind={a.type} small />
                      <span className="truncate text-sm font-medium text-ink">{item.merchant}</span>
                    </div>
                    <span className="tabular text-[13px] leading-[18px] text-ink-2">{alertText(a, item)}</span>
                    <div className="-ml-2.5 flex gap-1">
                      {actions(a, item).map((ac) => (
                        <TextAction key={ac.label} tone={ac.tone} compact onClick={ac.run}>
                          {ac.label}
                        </TextAction>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
        <Link
          to="/recurring"
          className="flex h-11 items-center justify-center rounded-sm border border-line bg-surface text-sm font-medium text-accent active:bg-track lg:hidden"
        >
          {r.seeAll}
        </Link>
      </div>

      {/* Desktop: the table */}
      {!empty && (
        <div className="hidden min-w-0 flex-1 flex-col lg:flex">
          <div className="label-caps grid grid-cols-[minmax(0,1fr)_150px_170px_130px] gap-4 border-b border-line pb-2.5">
            <span>{r.table.name}</span>
            <span>{r.table.frequency}</span>
            <span>{r.table.account}</span>
            <span className="text-right">{r.table.amount}</span>
          </div>
          {summary.active.slice(0, 8).map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => history.open(i)}
              className="grid min-h-14 grid-cols-[minmax(0,1fr)_150px_170px_130px] items-center gap-4 border-b border-line py-1.5 text-left hover:bg-track/40"
            >
              <span className="flex min-w-0 items-center gap-3">
                <CategoryBadge category={i.categoryId ? categoriesById.get(i.categoryId) : null} size={32} />
                <span className="truncate text-sm font-medium text-ink" title={categoryName(i.categoryId ? categoriesById.get(i.categoryId) : null)}>
                  {i.merchant}
                </span>
                <RecurringFlag item={i} />
              </span>
              <span className="text-[13px] text-ink-2">{i.cadence === 'monthly' ? r.freq.monthly(i.day) : r.freq.yearly(formatMonthName(i.lastDate.slice(0, 7)))}</span>
              <span className="truncate text-[13px] text-ink-2">{label(i)}</span>
              <span className="flex flex-col items-end gap-px">
                <span className="tabular text-sm font-medium text-ink">{formatMoney(i.amount)}</span>
                <span className="tabular text-xs whitespace-nowrap text-muted">
                  {i.cadence === 'yearly' ? r.per.yearDesktop(formatMoney(i.monthly).replace(/^R\$\s?/, '')) : r.per.month}
                </span>
              </span>
            </button>
          ))}
          <Link to="/recurring" className="mt-2 inline-flex h-10 items-center self-start rounded-sm px-2 text-sm font-medium text-accent hover:bg-track">
            {r.seeAll}
          </Link>
        </div>
      )}
      {history.sheet}
    </Card>
  )
}

/** "Nova" or "+R$ 5,00" next to a recurring charge's name. */
export function RecurringFlag({ item }: { item: RecurringSummary['active'][number] }) {
  const { t } = useI18n()
  const r = t.insights.recurring
  if (item.increaseAlert && item.priceChange)
    return (
      <span className="tabular inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full bg-critical-soft px-1.5 text-[11px] font-medium text-critical">
        <Icon name="arrowUp" className="size-3" strokeWidth={2.4} />
        {r.flagUp(formatMoney(item.priceChange.to - item.priceChange.from, item.priceChange.currency))}
      </span>
    )
  if (item.status === 'new')
    return (
      <span className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-1.5 text-[11px] font-medium text-accent">
        <Icon name="plus" className="size-3" strokeWidth={2.4} />
        {r.badge.new}
      </span>
    )
  return null
}
