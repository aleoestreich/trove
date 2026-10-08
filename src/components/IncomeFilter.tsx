import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { Category, IncomeFilter } from '../data/types'
import {
  NO_FILTER,
  categoryState,
  filterLabel,
  hasSelection,
  incomeOptions,
  joinNames,
  normalizeIncomeFilter,
  previewAverage,
  summarizeIncomeFilter,
} from '../data/incomeAverage'
import { useData } from '../state'
import { formatMoney, formatWholeMoney } from '../lib/money'
import { Icon } from './Icon'
import { CategoryBadge } from './CategoryBadge'
import { SelectBox } from './SelectBox'
import { useI18n } from '../i18n/I18nProvider'

/**
 * The average income card's pill: which income categories count
 * ("Salário, Freelance · 2 de 5", or "Todas as receitas"). Opens the picker.
 */
export function IncomeFilterPill({ onOpen, pillRef, expanded }: { onOpen(): void; pillRef: RefObject<HTMLButtonElement | null>; expanded: boolean }) {
  const { categories, subcategories, incomeFilter } = useData()
  const { t } = useI18n()
  const f = t.overview.avgIncome.filter
  const summary = summarizeIncomeFilter(incomeFilter ?? NO_FILTER, categories, subcategories, t.transactions.uncategorized)
  const label = filterLabel(summary, f)
  const names = summary.all ? f.all : joinNames(summary.included.map((i) => (i.partial ? `${i.name} ${f.partial}` : i.name)), f.and)
  return (
    <button
      ref={pillRef}
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-label={f.aria(names, summary.included.length, summary.total)}
      // 40px tall; the ::before pads the touch area to 44px.
      className="relative inline-flex h-10 max-w-full items-center gap-1.5 self-start rounded-full border border-line bg-surface pr-2.5 pl-3 text-[13px] font-medium whitespace-nowrap text-ink-2 before:absolute before:inset-x-0 before:-inset-y-0.5 hover:bg-track"
    >
      <Icon name="filterLines" className="size-4 shrink-0 text-income" strokeWidth={2} />
      <span className="min-w-0 truncate text-ink">{label}</span>
      <span className="shrink-0 font-normal text-muted">· {f.count(summary.included.length, summary.total)}</span>
      <Icon name="chevronDown" className="size-4 shrink-0" strokeWidth={2} />
    </button>
  )
}

/**
 * "Categorias da renda média": a checkbox per income category (mixed when
 * only some of its subcategories count), its subcategories when expanded,
 * and "Sem categoria", each with its monthly average; the average with this
 * selection, recalculated as boxes change; Marcar todas / Aplicar. Nothing is
 * saved until Aplicar.
 */
function IncomeFilterContent({ currentMonth, onClose, variant }: { currentMonth: string; onClose(): void; variant: 'sheet' | 'popover' }) {
  const { categories, subcategories, transactions, incomeFilter, saveIncomeFilter } = useData()
  const { t, categoryName } = useI18n()
  const f = t.overview.avgIncome.filter
  const [draft, setDraft] = useState<IncomeFilter>(() => normalizeIncomeFilter(incomeFilter ?? NO_FILTER, categories, subcategories))
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const options = useMemo(() => incomeOptions(transactions, categories, subcategories, currentMonth), [transactions, categories, subcategories, currentMonth])
  const amounts = new Map(options.categories.map((c) => [c.id, c]))
  const income = categories.filter((c) => c.type === 'income')
  const subsOf = (c: Category) => subcategories.filter((s) => s.categoryId === c.id)
  const any = hasSelection(draft, categories, subcategories)
  const update = (next: IncomeFilter) => {
    setDraft(normalizeIncomeFilter(next, categories, subcategories))
    setError(null)
  }
  const without = (list: string[], ids: string[]) => list.filter((id) => !ids.includes(id))

  // The whole category: on → off; off or partial → on.
  const toggleCategory = (c: Category) => {
    const subIds = subsOf(c).map((s) => s.id)
    const off = categoryState(c, subcategories, draft) === 'on'
    update({
      ...draft,
      excludedCategoryIds: off ? [...draft.excludedCategoryIds, c.id] : without(draft.excludedCategoryIds, [c.id]),
      excludedSubcategoryIds: without(draft.excludedSubcategoryIds, subIds),
    })
  }
  // One subcategory; ticking one of an excluded category counts that one only.
  const toggleSub = (c: Category, subId: string) => {
    if (draft.excludedCategoryIds.includes(c.id)) {
      const others = subsOf(c)
        .map((s) => s.id)
        .filter((id) => id !== subId)
      update({ ...draft, excludedCategoryIds: without(draft.excludedCategoryIds, [c.id]), excludedSubcategoryIds: [...draft.excludedSubcategoryIds, ...others] })
      return
    }
    const out = draft.excludedSubcategoryIds.includes(subId)
    update({ ...draft, excludedSubcategoryIds: out ? without(draft.excludedSubcategoryIds, [subId]) : [...draft.excludedSubcategoryIds, subId] })
  }

  const apply = async () => {
    if (!any || saving) return
    setSaving(true)
    try {
      await saveIncomeFilter(draft)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  const preview = previewAverage(options, draft)
  const all = previewAverage(options, NO_FILTER)
  const popover = variant === 'popover'

  return (
    <>
      <div className="flex items-start gap-3 pt-1">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id={`income-filter-${variant}`} className={`font-medium text-ink ${popover ? 'text-lg leading-6' : 'text-xl leading-[26px]'}`}>
            {f.title}
          </h2>
          <p className="text-[13px] leading-[18px] text-ink-2">{f.desc}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.close}
          className="-mt-2 -mr-2 flex size-12 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-track active:bg-track"
        >
          <Icon name="close" className="size-[22px]" strokeWidth={2} />
        </button>
      </div>

      <div className="flex items-baseline justify-between px-1 pt-4 pb-1.5">
        <span className="label-caps">{f.listLabel}</span>
        <span className="text-xs leading-4 text-muted">{f.avgCol}</span>
      </div>

      <div role="group" aria-labelledby={`income-filter-${variant}`} className="divide-y divide-line overflow-hidden rounded-[16px] border border-line">
        {income.map((c) => {
          const state = categoryState(c, subcategories, draft)
          const subs = subsOf(c)
          const expandable = subs.length >= 2
          const expanded = expandable && open.has(c.id)
          const amount = amounts.get(c.id)
          return (
            <div key={c.id}>
              <div className="flex items-center">
                <OptionRow
                  state={state}
                  onToggle={() => toggleCategory(c)}
                  name={categoryName(c)}
                  badge={<CategoryBadge category={c} size={32} />}
                  amount={amount?.average ?? 0}
                />
                {expandable ? (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-label={expanded ? f.collapse(categoryName(c)) : f.expand(categoryName(c))}
                    onClick={() =>
                      setOpen((s) => {
                        const next = new Set(s)
                        if (next.has(c.id)) next.delete(c.id)
                        else next.add(c.id)
                        return next
                      })
                    }
                    className="flex h-14 w-11 shrink-0 items-center justify-center text-ink-2"
                  >
                    <Icon name={expanded ? 'chevronUp' : 'chevronDown'} className="size-[18px]" strokeWidth={2} />
                  </button>
                ) : (
                  <span className="w-11 shrink-0" />
                )}
              </div>
              {expanded &&
                subs.map((s) => {
                  const on = state !== 'off' && !draft.excludedSubcategoryIds.includes(s.id)
                  return (
                    <div key={s.id} className="flex items-center border-t border-line bg-page">
                      <OptionRow
                        sub
                        state={on ? 'on' : 'off'}
                        onToggle={() => toggleSub(c, s.id)}
                        name={s.name}
                        amount={amount?.subcategories.find((x) => x.id === s.id)?.average ?? 0}
                      />
                      <span className="w-11 shrink-0" />
                    </div>
                  )
                })}
            </div>
          )
        })}
        <div className="flex items-center">
          <OptionRow
            state={draft.excludeUncategorized ? 'off' : 'on'}
            onToggle={() => update({ ...draft, excludeUncategorized: !draft.excludeUncategorized })}
            name={t.transactions.uncategorized}
            note={f.uncategorizedNote}
            badge={<CategoryBadge category={null} size={32} />}
            amount={options.uncategorized.average}
          />
          <span className="w-11 shrink-0" />
        </div>
      </div>

      <div
        aria-live="polite"
        className="mt-3.5 flex items-end justify-between gap-3 rounded-[14px] px-3.5 py-3"
        style={{ background: 'color-mix(in srgb, var(--income) 10%, var(--page))' }}
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs leading-4 text-ink-2">{f.resultLabel}</span>
          <span className="tabular text-xl leading-[26px] font-bold whitespace-nowrap text-ink">
            {formatMoney(preview)}
            <span className="text-[13px] font-normal text-muted">{t.overview.avgIncome.perMonth}</span>
          </span>
        </span>
        <span className="tabular shrink-0 text-right text-xs leading-4 text-muted">
          {f.allLabel}
          <br />
          {formatWholeMoney(all)}
        </span>
      </div>

      {!any && <p className="mt-3 text-center text-[13px] leading-[18px] text-critical">{f.noneHint}</p>}
      <div className="mt-3.5 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2">
        <button
          type="button"
          onClick={() => update(NO_FILTER)}
          className={`border border-line bg-surface font-medium text-ink hover:bg-track ${popover ? 'h-11 rounded-sm text-sm' : 'h-12 rounded-md text-[15px]'}`}
        >
          {f.markAll}
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={!any || saving}
          aria-busy={saving}
          className={`inline-flex items-center justify-center gap-2 bg-accent font-medium text-surface disabled:opacity-40 ${popover ? 'h-11 rounded-sm text-sm' : 'h-12 rounded-md text-[15px]'}`}
        >
          {saving && <Icon name="sync" className="size-[18px] animate-spin" strokeWidth={2} />}
          {saving ? f.saving : f.apply}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[13px] leading-[18px] text-critical">
          {error}
        </p>
      )}
    </>
  )
}

/**
 * One option: a <label> over the whole row, so a tap anywhere toggles it.
 * The native checkbox (visually hidden) gives the role and aria-checked,
 * "mixed" included; the box is drawn like bulk selection's.
 */
function OptionRow({
  state,
  onToggle,
  name,
  note,
  badge,
  amount,
  sub = false,
}: {
  state: 'on' | 'off' | 'mixed'
  onToggle(): void
  name: string
  note?: string
  badge?: ReactNode
  amount: number
  sub?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'mixed'
  }, [state])
  const off = state === 'off'
  return (
    <label className={`flex min-w-0 flex-1 cursor-pointer items-center gap-3 ${sub ? 'min-h-12 pl-14' : 'min-h-[60px] pl-3'}`}>
      <input ref={ref} type="checkbox" checked={state === 'on'} onChange={onToggle} className="peer sr-only" />
      <span className="rounded-[7px] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
        <SelectBox state={state} />
      </span>
      {badge}
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className={`truncate leading-5 ${sub ? 'text-sm' : 'text-[15px] font-medium'} ${off || sub ? 'text-ink-2' : 'text-ink'}`}>{name}</span>
        {note && <span className="text-xs leading-4 text-muted">{note}</span>}
      </span>
      <span
        className={`tabular shrink-0 text-[13px] leading-[18px] ${off ? 'text-muted line-through' : sub ? 'text-ink-2' : 'font-medium text-ink'}`}
      >
        {formatWholeMoney(amount)}
      </span>
    </label>
  )
}

/** Esc closes; focus goes to the first button inside on open, and back to the pill on close. */
function useDialogFocus(ref: RefObject<HTMLElement | null>, onClose: () => void, returnTo: RefObject<HTMLElement | null>) {
  // The latest onClose, so the effect runs once (on open and close) however the caller passes it.
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  }, [onClose])
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    window.addEventListener('keydown', onKey)
    const target = returnTo.current
    return () => {
      window.removeEventListener('keydown', onKey)
      target?.focus()
    }
  }, [ref, returnTo])
}

/** Phones: the picker in a bottom sheet over a scrim. */
export function IncomeFilterSheet({ currentMonth, onClose, returnTo }: { currentMonth: string; onClose(): void; returnTo: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLElement>(null)
  useDialogFocus(ref, onClose, returnTo)
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-scrim md:items-center" onClick={onClose}>
      <section
        ref={ref}
        role="dialog"
        aria-modal
        aria-labelledby="income-filter-sheet"
        className="flex max-h-[92dvh] w-full max-w-[480px] flex-col overflow-y-auto [&>*]:shrink-0 rounded-t-[28px] bg-surface px-4 pb-[calc(16px+env(safe-area-inset-bottom))] md:rounded-[28px] md:pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-[22px] shrink-0 items-center justify-center md:hidden" aria-hidden>
          <span className="h-1 w-8 rounded-full bg-line" />
        </div>
        <IncomeFilterContent currentMonth={currentMonth} onClose={onClose} variant="sheet" />
      </section>
    </div>
  )
}

/** Desktop: the picker in a 360px popover under the pill; Esc or a click outside closes it. */
export function IncomeFilterPopover({ currentMonth, onClose, returnTo }: { currentMonth: string; onClose(): void; returnTo: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLElement>(null)
  useDialogFocus(ref, onClose, returnTo)
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!ref.current?.contains(target) && !returnTo.current?.contains(target)) onClose()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [onClose, returnTo])
  return (
    <section
      ref={ref}
      role="dialog"
      aria-labelledby="income-filter-popover"
      className="absolute top-full left-0 z-30 mt-2 flex max-h-[min(640px,calc(100dvh-120px))] w-[360px] flex-col overflow-y-auto rounded-lg border border-line bg-surface p-5 shadow-lg"
    >
      <IncomeFilterContent currentMonth={currentMonth} onClose={onClose} variant="popover" />
    </section>
  )
}
