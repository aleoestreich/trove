import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useData } from '../state'
import { useI18n } from '../i18n/I18nProvider'
import { Icon } from '../components/Icon'
import { Card } from '../components/ui'
import { CategoryBadge } from '../components/CategoryBadge'
import { GroupSwatch } from '../components/balance/parts'
import { hasGroups, suggestGroup } from '../data/spendingBalance'
import { countedAmount, kindOf } from '../data/categories'
import type { Category, SpendingGroup } from '../data/types'
import { lastMonths, monthKey } from '../lib/dates'
import { formatWholeMoney } from '../lib/money'

/** Months in each category's "R$ 180/mês". */
const AVERAGE_MONTHS = 3

/** What the page hands to the Equilíbrio page after saving, for "Grupos salvos" and Desfazer. */
export interface GroupsSaved {
  count: number
  previous: { categoryId: string; group: SpendingGroup | null }[]
}

interface Section {
  key: string
  title: string
  ids: string[]
  /** The categories nobody chose for yet: highlighted, and "Escolhidas por você" once all are chosen. */
  pick?: boolean
}

/**
 * "Organizar categorias": the first time, the three groups explained and
 * "Ver sugestões"; then every expense category in one list, each with
 * Essencial | Estilo. Those without a suggestion (or a group) come first;
 * the rest are grouped as suggested (or as they are). The sections stay put
 * while choosing. Saved all at once; the Equilíbrio page offers Desfazer.
 */
export function BalanceOrganize() {
  const { t } = useI18n()
  const o = t.spendingBalance.org
  const { categories, subcategories } = useData()
  const expense = useMemo(() => categories.filter((c) => c.type === 'expense'), [categories])
  const [step, setStep] = useState<'intro' | 'review'>(() => (hasGroups(categories, subcategories) ? 'review' : 'intro'))
  const [suggest, setSuggest] = useState(true)

  return (
    <>
      <Link to="/balance" className="-ml-1 mb-1 inline-flex h-11 items-center gap-1 self-start rounded-sm pr-3 pl-1 text-sm font-medium text-accent hover:bg-track lg:h-9">
        <Icon name="chevronLeft" className="size-5" strokeWidth={2} />
        {o.back}
      </Link>
      {expense.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-2">{o.empty}</p>
        </Card>
      ) : step === 'intro' ? (
        <Intro
          categories={expense}
          onNext={(withSuggestions) => {
            setSuggest(withSuggestions)
            setStep('review')
          }}
        />
      ) : (
        <Review categories={expense} suggest={suggest} />
      )}
    </>
  )
}

function Intro({ categories, onNext }: { categories: Category[]; onNext(withSuggestions: boolean): void }) {
  const { t } = useI18n()
  const b = t.spendingBalance
  const o = b.org
  const suggested = categories.filter((c) => suggestGroup(c)).length
  const [before, bold, after] = o.suggested(suggested, categories.length)
  return (
    <div className="flex flex-col gap-4 pb-28 lg:max-w-[560px] lg:pb-0">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl leading-[30px] font-medium text-ink">{o.introTitle}</h1>
        <p className="text-[15px] leading-[22px] text-ink-2">{o.introText}</p>
      </div>
      <section className="flex flex-col rounded-lg border border-line bg-surface px-4 py-1">
        {(['essential', 'lifestyle', 'future'] as const).map((g, i) => (
          <div key={g} className={`flex items-start gap-3 py-3 ${i > 0 ? 'border-t border-line' : ''}`}>
            <GroupSwatch part={g} size={16} className="mt-0.5 rounded-[4px]" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <b className="text-[15px] leading-5 font-medium text-ink">{b.groups[g]}</b>
              <span className="text-[13px] leading-[18px] text-ink-2">{o.help[g]}</span>
            </span>
          </div>
        ))}
      </section>
      {suggested > 0 && (
        <div className="flex items-start gap-2.5 rounded-md bg-accent-faint px-3 py-2.5 text-[13px] leading-[18px] text-ink-2">
          <Icon name="check" className="mt-px size-[18px] shrink-0 text-accent" strokeWidth={2} />
          <span>
            {before}
            <b className="font-medium text-ink">{bold}</b>
            {after}
          </span>
        </div>
      )}
      <Footer>
        <button type="button" onClick={() => onNext(true)} className="h-12 w-full rounded-md bg-accent text-[15px] font-medium text-surface active:opacity-80 lg:w-auto lg:px-6">
          {o.seeSuggestions}
        </button>
        <button type="button" onClick={() => onNext(false)} className="h-11 w-full rounded-md text-sm font-medium text-accent hover:bg-track lg:w-auto lg:px-4">
          {o.oneByOne}
        </button>
      </Footer>
    </div>
  )
}

/** Sticky at the bottom on phones (above the tab bar), inline on desktop. */
function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(78px+env(safe-area-inset-bottom))] z-20 mx-auto flex max-w-[480px] flex-col items-stretch gap-1 border-t border-line bg-surface px-4 pt-3 pb-3 lg:static lg:mx-0 lg:max-w-none lg:flex-row lg:items-center lg:gap-3 lg:border-0 lg:bg-transparent lg:p-0">
      {children}
    </div>
  )
}

function Review({ categories, suggest }: { categories: Category[]; suggest: boolean }) {
  const { t } = useI18n()
  const b = t.spendingBalance
  const o = b.org
  const { allTransactions, categoriesById, today, saveCategoryGroups } = useData()
  const navigate = useNavigate()
  const [choice, setChoice] = useState<Record<string, SpendingGroup | null>>(() =>
    Object.fromEntries(categories.map((c) => [c.id, c.group ?? (suggest ? suggestGroup(c) : null)])),
  )
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  // Sections as the page opened, so rows don't jump while choosing.
  const [sections] = useState<Section[]>(() => {
    const pick = categories.filter((c) => !c.group && !(suggest && suggestGroup(c)))
    const suggested = (g: SpendingGroup) => categories.filter((c) => !c.group && suggest && suggestGroup(c) === g)
    const set = (g: SpendingGroup) => categories.filter((c) => c.group === g)
    const list: Section[] = [
      { key: 'pick', title: o.choose, ids: pick.map((c) => c.id), pick: true },
      { key: 's-essential', title: o.suggestedAs(b.groups.essential), ids: suggested('essential').map((c) => c.id) },
      { key: 's-lifestyle', title: o.suggestedAs(b.groups.lifestyle), ids: suggested('lifestyle').map((c) => c.id) },
      { key: 'essential', title: b.groups.essential, ids: set('essential').map((c) => c.id) },
      { key: 'lifestyle', title: b.groups.lifestyle, ids: set('lifestyle').map((c) => c.id) },
    ]
    return list.filter((s) => s.ids.length > 0)
  })

  // Each category's monthly average over the last complete months.
  const perMonth = useMemo(() => {
    const months = new Set(lastMonths(monthKey(today), AVERAGE_MONTHS + 1).slice(0, -1))
    const sums = new Map<string, number>()
    for (const tx of allTransactions) {
      if (tx.hidden || !tx.categoryId || !months.has(monthKey(tx.date)) || kindOf(tx, categoriesById) !== 'expense') continue
      sums.set(tx.categoryId, (sums.get(tx.categoryId) ?? 0) - countedAmount(tx))
    }
    return new Map([...sums].map(([id, v]) => [id, Math.max(0, Math.round(v / AVERAGE_MONTHS))]))
  }, [allTransactions, categoriesById, today])

  const left = categories.filter((c) => !choice[c.id]).length
  useEffect(() => setFailed(false), [choice])

  const save = async () => {
    const changes = categories.filter((c) => (c.group ?? null) !== choice[c.id]).map((c) => ({ categoryId: c.id, group: choice[c.id] }))
    if (changes.length === 0) return navigate('/balance')
    setSaving(true)
    try {
      await saveCategoryGroups(changes)
      const saved: GroupsSaved = { count: categories.length - left, previous: changes.map((x) => ({ categoryId: x.categoryId, group: categoriesById.get(x.categoryId)?.group ?? null })) }
      navigate('/balance', { state: { groupsSaved: saved } })
    } catch {
      setFailed(true)
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 pb-36 lg:pb-0">
      <div className="flex flex-col gap-0.5 py-1">
        <h1 className="text-xl leading-[26px] font-medium text-ink lg:text-[28px] lg:leading-[34px]">{o.reviewTitle}</h1>
        <p className="text-[13px] leading-[18px] text-ink-2">{o.reviewSub(categories.length)}</p>
      </div>
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:items-start lg:gap-5">
        {sections.map((s) => {
          const allChosen = s.pick && s.ids.every((id) => choice[id])
          return (
            <section key={s.key} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2 px-1 pt-2">
                <h2 className="text-[15px] leading-5 font-medium text-ink">{allChosen ? o.chosen : s.title}</h2>
                <span className="tabular text-xs text-muted">{s.pick && !allChosen ? o.noSuggestion(s.ids.filter((id) => !choice[id]).length) : s.ids.length}</span>
              </div>
              <div
                className={`flex flex-col overflow-hidden rounded-lg border bg-surface ${s.pick && !allChosen ? 'border-[color-mix(in_srgb,var(--accent)_40%,var(--line))]' : 'border-line'}`}
              >
                {s.ids.map((id, i) => {
                  const c = categoriesById.get(id)!
                  return (
                    <GroupRow
                      key={id}
                      category={c}
                      perMonth={perMonth.get(id) ?? 0}
                      value={choice[id]}
                      first={i === 0}
                      onChange={(g) => setChoice({ ...choice, [id]: g })}
                    />
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
      <Footer>
        <span className="text-xs leading-4 text-muted lg:flex-1">{failed ? <span className="text-critical">{o.failed}</span> : left > 0 ? o.left(left) : o.allSet(categories.length)}</span>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-accent text-[15px] font-medium text-surface active:opacity-80 disabled:opacity-60 lg:w-auto lg:px-6"
        >
          {saving && <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-surface border-t-transparent" />}
          {saving ? o.saving : o.save}
        </button>
      </Footer>
    </div>
  )
}

/** A category with "Essencial | Estilo": the chosen one on a surface, with its colour. */
export function GroupRow({
  category,
  perMonth,
  value,
  first,
  onChange,
}: {
  category: Category
  perMonth?: number
  value: SpendingGroup | null
  first: boolean
  onChange(g: SpendingGroup): void
}) {
  const { t } = useI18n()
  const b = t.spendingBalance
  return (
    <div className={`flex min-h-14 items-center gap-2.5 py-2 pr-2.5 pl-3 ${first ? '' : 'border-t border-line'}`}>
      <CategoryBadge category={category} size={32} />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-sm text-ink">{category.name}</span>
        {perMonth !== undefined && <span className="tabular text-xs leading-4 text-muted">{b.org.perMonth(formatWholeMoney(perMonth))}</span>}
      </span>
      <div role="radiogroup" aria-label={category.name} className="grid shrink-0 grid-cols-[76px_66px] gap-0.5 rounded-[12px] bg-track p-0.5">
        {(['essential', 'lifestyle'] as const).map((g) => {
          const on = value === g
          return (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={b.groups[g]}
              onClick={() => onChange(g)}
              className={`flex h-10 items-center justify-center gap-[5px] rounded-[10px] px-2 text-[13px] font-medium ${on ? 'bg-surface text-ink shadow-sm' : 'text-ink-2'}`}
            >
              {on && <GroupSwatch part={g} size={8} className="rounded-[2px]" />}
              {b.short[g]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
