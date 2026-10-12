import { useNavigate } from 'react-router-dom'
import type { Projection } from '../../data/projection'
import type { CategoryComparison, UnusualResult } from '../../data/unusual'
import type { RecurringSummary } from '../../data/recurring'
import { formatDay, formatMonthName, formatMonthShort } from '../../lib/dates'
import { formatCompactMoney, formatMoney, formatPercent, formatWholeMoney } from '../../lib/money'
import { useData } from '../../state'
import { useI18n } from '../../i18n/I18nProvider'
import { CategoryBadge } from '../CategoryBadge'
import { Icon } from '../Icon'
import { DivergingBar, PctPill, capitalize, signedPct } from './parts'

// Pieces of the insights shared by the Visão geral's cards and the insight
// pages: the projection's lines, title and low point; the unusual
// categories' rows and texts; the recurring charges' totals and flags.

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

/** "Previsão do fim do mês", or "Previsão até o fim de novembro" over two months. */
export function useProjectionTitle(p: Projection | null): string {
  const { t } = useI18n()
  const x = t.insights.projection
  return p?.settings.horizon === 'nextMonth' ? x.titleUntil(formatMonthName(p.endDate.slice(0, 7))) : x.title
}

/** "Ponto mais baixo: R$ 17,6 mil em 19 out., antes do salário". */
export function useLowNote(p: Projection) {
  const { t } = useI18n()
  const beforeSalary = p.events.some((e) => e.kind === 'salary' && e.date > p.low.date)
  return t.insights.projection.lowNote(formatCompactMoney(p.low.value), formatDay(p.low.date), beforeSalary)
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

/** While values are hidden: comparisons (percentages, arrows, "acima/abaixo") are hidden too, and this says why. */
export function ComparisonsHidden() {
  const { t } = useI18n()
  return (
    <p className="flex items-start gap-2.5 rounded-md bg-page px-3 py-2.5 text-[13px] leading-[18px] text-ink">
      <Icon name="eyeOff" className="mt-px size-[18px] shrink-0 text-ink-2" />
      {t.privacy.comparisonsHidden}
    </p>
  )
}
