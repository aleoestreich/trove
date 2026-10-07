import { Link, useParams } from 'react-router-dom'
import { useData } from '../state'
import { useI18n } from '../i18n/I18nProvider'
import { Card } from '../components/ui'
import { Icon } from '../components/Icon'
import { CategoryBadge, catVar } from '../components/CategoryBadge'
import { addMonths, formatMonthName, formatMonthShort, lastMonths } from '../lib/dates'
import { formatPercent, formatWholeMoney } from '../lib/money'
import type { CategoryComparison, UnusualResult } from '../data/unusual'
import { UnusualRow, useNormalList, useUnusualSubtitle } from '../components/insights/cards'
import { DetailHeader, DivergingLegend, Legend, LegendItem, capitalize, swatch } from '../components/insights/parts'

const BAND = 0.15

/** "Restaurantes": this month vs its average, by month and by subcategory, and what it means. */
export function UnusualCategory() {
  const { categoryId } = useParams()
  const { insights, categoriesById } = useData()
  const { t, categoryName } = useI18n()
  const d = t.insights.unusual.detail
  const u = insights.unusual
  const c = u && [...u.unusual, ...u.normal].find((x) => x.categoryId === categoryId)
  const category = categoryId ? categoriesById.get(categoryId) : undefined
  if (!u || !c || !category)
    return (
      <>
        <DetailHeader title={category ? categoryName(category) : t.insights.unusual.title} />
        <Card>
          <p className="text-sm leading-5 text-ink-2">{d.notFound}</p>
        </Card>
      </>
    )
  const unusual = Math.abs(c.pct) > BAND
  const month = formatMonthName(u.month)
  return (
    <>
      <DetailHeader title={categoryName(category)} subtitle={unusual ? d.subUnusual(month) : d.subNormal(month)} />
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
        <SummaryCard c={c} u={u} />
        <div className="flex flex-col gap-3 lg:gap-5">
          <DriversCard c={c} u={u} />
          <FactsCard c={c} u={u} />
          <Link
            to={`/transactions?m=${u.month}&c=${c.categoryId}`}
            className="flex h-12 items-center justify-center rounded-md border border-line bg-surface text-[15px] font-medium text-accent active:bg-track lg:hover:bg-track"
          >
            {d.seeTransactions(categoryName(category))}
          </Link>
        </div>
      </div>
    </>
  )
}

function SummaryCard({ c, u }: { c: CategoryComparison; u: UnusualResult }) {
  const { t, categoryName } = useI18n()
  const { categoriesById } = useData()
  const d = t.insights.unusual.detail
  const category = categoriesById.get(c.categoryId)!
  const color = catVar(category.color)
  const up = c.delta > 0
  const normal = Math.abs(c.pct) <= BAND
  const tone = normal ? 'text-ink' : up ? 'text-critical' : 'text-income'
  const month = formatMonthName(u.month)
  const vs = u.mode === 'mtd' ? d.vsMtd(capitalize(month), u.days!) : d.vs(capitalize(month), formatMonthShort(u.compareFrom), formatMonthShort(u.compareTo))
  // Bars: the comparison months faded, the compared one in full, with the ±15% band and the average.
  const max = Math.max(1, ...c.series.map((s) => s.amount), c.avg * (1 + BAND))
  const H = 140
  const k = H / (max * 1.1)
  const months = lastMonths(u.month, c.series.length)
  const aria = d.chart(
    categoryName(category),
    c.series.map((s, i) => `${formatMonthShort(months[i])} ${formatWholeMoney(s.amount)}`).join(', '),
    formatWholeMoney(c.avg),
  )
  return (
    <Card className="flex flex-col gap-1">
      <div className="flex items-center gap-2.5">
        <CategoryBadge category={category} size={40} />
        <span className="flex-1 text-[13px] leading-[18px] text-muted">{vs}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <span className={`tabular inline-flex items-center gap-1 text-[32px] leading-10 font-bold tracking-[-0.02em] ${tone}`}>
          <Icon name={up ? 'arrowUp' : 'arrowDown'} className="size-6 self-center" strokeWidth={2.4} />
          {formatPercent(Math.abs(Math.round(c.pct * 100)))}
        </span>
        <span className="text-[15px] leading-5 text-ink">{up ? d.above : d.below}</span>
      </div>
      <span className="tabular text-sm leading-5 text-ink-2">
        {d.compare(formatWholeMoney(c.now), month, formatWholeMoney(c.avg), `${up ? '+' : '−'}${formatWholeMoney(Math.abs(c.delta))}`)}
      </span>

      <div role="img" aria-label={aria} className="mt-4">
        <div className="relative" style={{ height: H + 24 }}>
          <div aria-hidden className="absolute inset-x-0 rounded-[4px] bg-track" style={{ bottom: c.avg * (1 - BAND) * k, height: c.avg * 2 * BAND * k }} />
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-line" />
          <div aria-hidden className="absolute inset-0 flex items-end gap-2.5 px-1.5">
            {c.series.map((s, i) => {
              const last = i === c.series.length - 1
              return (
                <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-[3px]">
                  <span className={`tabular text-[10px] leading-3 whitespace-nowrap ${last ? 'font-bold text-ink' : 'text-transparent'}`}>
                    {formatWholeMoney(s.amount).replace(/^R\$\s?/, '')}
                  </span>
                  <span className="w-full rounded-t-[4px]" style={{ height: Math.max(2, s.amount * k), background: color, opacity: last ? 1 : 0.4 }} />
                </div>
              )
            })}
          </div>
          <div aria-hidden className="absolute inset-x-0 border-t-[1.5px] border-dashed border-ink-2" style={{ bottom: c.avg * k }} />
          <span
            aria-hidden
            className="tabular absolute left-0 rounded-[6px] bg-surface px-1.5 py-px text-[11px] leading-[14px] font-medium text-ink"
            style={{ bottom: c.avg * k + 4 }}
          >
            {d.avgLabel(formatWholeMoney(c.avg))}
          </span>
        </div>
        <div aria-hidden className="mt-1 flex gap-2.5 px-1.5">
          {months.map((m, i) => (
            <span key={m} className={`flex-1 text-center text-[11px] leading-5 ${i === months.length - 1 ? 'font-medium text-ink' : 'text-muted'}`}>
              {formatMonthShort(m)}
            </span>
          ))}
        </div>
      </div>
      <Legend className="mt-1">
        <LegendItem swatch={<span aria-hidden className="w-3.5 border-t-[1.5px] border-dashed border-ink-2" />}>{d.legendAvg}</LegendItem>
        <LegendItem swatch={swatch('var(--track)', 'shadow-[inset_0_0_0_1px_var(--line)]')}>{t.insights.unusual.legend.band}</LegendItem>
      </Legend>
    </Card>
  )
}

function DriversCard({ c, u }: { c: CategoryComparison; u: UnusualResult }) {
  const { t } = useI18n()
  const { categoriesById, subcategoriesById } = useData()
  const d = t.insights.unusual.detail
  const category = categoriesById.get(c.categoryId)!
  const color = catVar(category.color)
  const up = c.delta > 0
  // Largest change in the card's direction first.
  const subs = [...c.subs].sort((a, b) => (up ? b.delta - a.delta : a.delta - b.delta))
  const max = Math.max(1, ...subs.flatMap((s) => [s.now, s.avg]))
  const monthShort = formatMonthShort(u.month)
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base leading-[22px] font-medium text-ink">{up ? d.driversUp : d.driversDown}</h2>
        <p className="text-[13px] leading-[18px] text-muted">{d.driversSub(formatMonthName(u.month))}</p>
      </div>
      {subs.map((s) => {
        const name = s.subcategoryId ? (subcategoriesById.get(s.subcategoryId)?.name ?? d.noSubcategory) : d.noSubcategory
        const big = s.pct !== null && Math.abs(s.pct) > BAND
        const pct = s.pct === null ? '' : ` (${s.pct >= 0 ? '+' : '−'}${formatPercent(Math.abs(Math.round(s.pct * 100)))})`
        const count =
          s.counts.now > 0 || s.counts.avg > 0
            ? d.countNote(s.counts.now, monthShort, s.counts.avg.toLocaleString('pt-BR', { maximumFractionDigits: 1 }))
            : ''
        return (
          <div key={s.subcategoryId ?? 'none'} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm leading-5 font-medium text-ink">{name}</span>
              <span className={`tabular text-sm leading-5 font-bold whitespace-nowrap ${big && s.delta > 0 ? 'text-critical' : big && s.delta < 0 ? 'text-income' : 'text-ink-2'}`}>
                {s.delta >= 0 ? '+' : '−'}
                {formatWholeMoney(Math.abs(s.delta))}
                {pct}
              </span>
            </div>
            <div aria-hidden className="relative h-[18px]">
              <span className="absolute top-0 left-0 h-2 rounded-r-[4px]" style={{ width: `${(s.now / max) * 100}%`, background: color }} />
              <span className="absolute top-[11px] left-0 h-1 rounded-r-[2px] bg-muted opacity-55" style={{ width: `${(s.avg / max) * 100}%` }} />
            </div>
            <span className="tabular text-xs leading-4 text-muted">
              {d.subNote(formatWholeMoney(s.now), formatWholeMoney(s.avg))}
              {big ? (count ? ` · ${count}` : '') : ` · ${d.insideBand}`}
            </span>
          </div>
        )
      })}
      <Legend>
        <LegendItem swatch={swatch(color)}>{capitalize(formatMonthName(u.month))}</LegendItem>
        <LegendItem swatch={<span aria-hidden className="h-1 w-3 rounded-[2px] bg-muted opacity-55" />}>{d.legendAvgShort}</LegendItem>
      </Legend>
    </Card>
  )
}

function FactsCard({ c, u }: { c: CategoryComparison; u: UnusualResult }) {
  const { t, categoryName } = useI18n()
  const { categoriesById, subcategoriesById } = useData()
  const d = t.insights.unusual.detail
  const name = categoryName(categoriesById.get(c.categoryId))
  const up = c.delta > 0
  const facts: { icon: 'receipt' | 'calendar'; text: string }[] = []
  const lead = [...c.subs].sort((a, b) => (up ? b.delta - a.delta : a.delta - b.delta))[0]
  if (lead && Math.abs(c.delta) > 0 && Math.sign(lead.delta) === Math.sign(c.delta) && lead.subcategoryId) {
    const share = Math.min(100, Math.round((lead.delta / c.delta) * 100))
    const sign = (v: number) => `${v >= 0 ? '+' : '−'}${formatWholeMoney(Math.abs(v))}`
    facts.push({ icon: 'receipt', text: d.factShare(subcategoriesById.get(lead.subcategoryId)?.name ?? d.noSubcategory, formatPercent(share), sign(lead.delta), sign(c.delta), up) })
  }
  if (u.mode === 'mtd') {
    // The rest of the month at its usual pace.
    const rest = Math.max(0, c.avgFull - c.avg)
    facts.push({ icon: 'calendar', text: d.factNextMtd(formatMonthName(u.month), name, formatWholeMoney(c.now + rest)) })
  } else {
    const key = addMonths(`${u.month}-01`, 1).slice(0, 7)
    facts.push({ icon: 'calendar', text: d.factNext(formatMonthName(key), name, formatWholeMoney(Math.round(c.avgFull / 10_00) * 10_00)) })
  }
  return (
    <Card className="flex flex-col !py-1">
      {facts.map((f, i) => (
        <div key={i} className={`flex min-h-14 items-center gap-3 py-2 ${i ? 'border-t border-line' : ''}`}>
          <Icon name={f.icon} className="size-5 shrink-0 text-ink-2" strokeWidth={1.8} />
          <span className="text-sm leading-5 text-ink-2">{f.text}</span>
        </div>
      ))}
    </Card>
  )
}

/** "Ver todas as categorias": every compared category, unusual ones first. */
export function UnusualAll() {
  const { insights } = useData()
  const { t } = useI18n()
  const s = t.insights.unusual
  const u = insights.unusual
  return (
    <>
      <DetailHeader title={s.allTitle} subtitle={u ? <AllSubtitle u={u} /> : undefined} />
      <Card className="flex flex-col gap-4 lg:max-w-[720px]">
        {!u && <p className="text-sm leading-5 text-ink-2">{s.detail.notFound}</p>}
        {u && u.unusual.length === 0 && <p className="text-sm leading-5 font-medium text-ink">{s.allNormal}</p>}
        {u && (
          <>
            <div className="flex flex-col gap-4 lg:hidden">
              {[...u.unusual, ...u.normal].map((c) => (
                <UnusualRow key={c.categoryId} c={c} u={u} layout="stacked" />
              ))}
            </div>
            <div className="hidden flex-col lg:flex">
              {[...u.unusual, ...u.normal].map((c) => (
                <UnusualRow key={c.categoryId} c={c} u={u} layout="grid" />
              ))}
            </div>
            <DivergingLegend />
            <NormalNote u={u} />
          </>
        )}
      </Card>
    </>
  )
}

function AllSubtitle({ u }: { u: UnusualResult }) {
  return <>{useUnusualSubtitle(u)}</>
}

function NormalNote({ u }: { u: UnusualResult }) {
  const { t } = useI18n()
  const list = useNormalList(u)
  if (!u.normal.length) return null
  return (
    <p className="rounded-sm bg-page px-3 py-2.5 text-[13px] leading-[18px] text-ink-2">
      <span className="font-medium text-ink">{t.insights.unusual.normalLabel}</span> {list}
    </p>
  )
}

