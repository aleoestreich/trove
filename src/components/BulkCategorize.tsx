import { useEffect, useRef, useState } from 'react'
import type { PreviousCategory } from '../data/edits'
import { newId } from '../data/edits'
import type { Transaction } from '../data/types'
import { useData } from '../state'
import { formatMoney } from '../lib/money'
import { bulkPick, summarize } from '../lib/selection'
import { Icon } from './Icon'
import { CategoryBadge, catInk } from './CategoryBadge'
import { CategoryChip, SubcategoryPicker } from './TransactionSheet'
import { useI18n } from '../i18n/I18nProvider'

/** A bulk change that was saved: for the toast and Undo. */
export interface Applied {
  ids: string[]
  count: number
  /** "Categoria › Subcategoria" */
  label: string
  previous: PreviousCategory[]
}

/**
 * Bulk categorization: "Sem categoria" or a category of the selection's type
 * (a mixed selection can only be left without one), an optional subcategory,
 * a preview ("Como vai ficar"), and Cancel / Apply. Saved all at once; on
 * error nothing changed and a notice shows at the top.
 */
function BulkContent({
  txs,
  variant,
  onCancel,
  onApplied,
}: {
  txs: Transaction[]
  variant: 'sheet' | 'panel'
  onCancel(): void
  onApplied(applied: Applied): void
}) {
  const { categories, categoriesById, subcategories, subcategoriesById, categorizeMany, edit } = useData()
  const { t, categoryName } = useI18n()
  const summary = summarize(txs, categoriesById)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  // "Sem categoria": clears the category and subcategory (any selection, income and expenses mixed included).
  const [clearing, setClearing] = useState(false)
  const [subcategoryId, setSubcategoryId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const panel = variant === 'panel'
  const n = summary.count
  // Only while it fits the selection, which can change on desktop after the pick.
  const { category, sub } = bulkPick(
    summary.kind,
    categoryId ? categoriesById.get(categoryId) : undefined,
    subcategoryId ? subcategoriesById.get(subcategoryId) : undefined,
  )
  // Income and expenses together: only "Sem categoria" can apply; the categories show, disabled.
  const mixed = !summary.kind
  const clear = clearing || mixed
  const options = summary.kind ? categories.filter((c) => c.type === summary.kind) : categories
  // The subcategory is optional.
  const ready = (clear || !!category) && !saving

  const apply = async () => {
    if (!ready) return
    setSaving(true)
    setError(null)
    const ids = txs.map((x) => x.id)
    try {
      const result = clear ? await categorizeMany(ids, null, null) : await categorizeMany(ids, category!.id, sub?.id ?? null)
      const label = clear ? t.transactions.uncategorized : `${categoryName(category!)}${sub ? ` › ${sub.name}` : ''}`
      onApplied({ ids, count: result.updated, label, previous: result.previous })
    } catch {
      // Nothing was saved (the change is all or nothing); the selection stays.
      setError(t.bulk.failed)
      setSaving(false)
    }
  }

  return (
    <>
      <div className={`flex gap-3 ${panel ? 'items-start' : 'items-center py-1'}`}>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id={`bulk-${variant}-title`} className={`font-medium text-ink ${panel ? 'text-lg leading-6' : 'text-xl leading-[26px]'}`}>
            {t.bulk.categorizeN(n)}
          </h2>
          <span className="tabular text-[13px] leading-[18px] text-muted">
            {t.bulk.total} {formatMoney(summary.total, 'BRL', { signed: true })}
          </span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label={panel ? t.bulk.clearSelection : t.close}
          className={`flex shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-track active:bg-track ${panel ? '-mt-2 -mr-2 size-11' : '-mr-2 size-12'}`}
        >
          <Icon name="close" className={panel ? 'size-5' : 'size-[22px]'} strokeWidth={2} />
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 flex items-start gap-2.5 rounded-md border border-critical/30 bg-critical-soft px-3 py-2.5 text-[13px] leading-[18px] text-ink">
          <Icon name="alert" className="mt-px size-[18px] shrink-0 text-critical" />
          {error}
        </p>
      )}
      {mixed && (
        <p className="mt-2 flex items-start gap-2.5 rounded-md bg-page px-3 py-2.5 text-[13px] leading-[18px] text-ink">
          <Icon name="info" className="mt-px size-[18px] shrink-0 text-ink-2" />
          {t.bulk.mixedNote}
        </p>
      )}

      <h3 id={`bulk-${variant}-category`} className="label-caps pt-3 pb-2">
        {t.category}
      </h3>
      <div role="radiogroup" aria-labelledby={`bulk-${variant}-category`} className={`flex flex-wrap ${panel ? 'gap-1.5' : 'gap-2'}`}>
        <button
          type="button"
          role="radio"
          aria-checked={clear}
          onClick={() => {
            setClearing(true)
            setCategoryId(null)
            setSubcategoryId(null)
          }}
          className={`inline-flex items-center gap-1.5 rounded-full border border-dashed pr-3.5 pl-3 text-sm whitespace-nowrap ${panel ? 'h-9' : 'h-10'} ${
            clear ? 'border-accent bg-accent-faint font-medium text-accent' : 'border-line bg-surface text-ink-2 hover:bg-track'
          }`}
        >
          <Icon name={clear ? 'check' : 'tagOff'} className="size-4" strokeWidth={clear ? 2.2 : 1.9} />
          {t.bulk.uncategorize}
        </button>
        {options.map((c) => (
          <span key={c.id} className={mixed ? 'pointer-events-none opacity-40' : ''} aria-disabled={mixed || undefined}>
            <CategoryChip
              category={c}
              name={categoryName(c)}
              size={panel ? 36 : 40}
              on={!clear && c.id === category?.id}
              onClick={() => {
                if (mixed) return
                setClearing(false)
                if (c.id === category?.id) return
                setCategoryId(c.id)
                setSubcategoryId(null)
              }}
            />
          </span>
        ))}
      </div>

      {!clear &&
        (category ? (
          <>
            <SubcategoryPicker
              variant={`bulk-${variant}`}
              category={category}
              current={subcategoryId}
              small={panel}
              optional
              options={subcategories.filter((x) => x.categoryId === category.id)}
              // Tapping the chosen one again leaves them without a subcategory.
              onPick={(id) => setSubcategoryId((current) => (current === id ? null : id))}
              onAdd={(name) => {
                const id = newId()
                edit({ op: 'createSubcategory', subcategory: { id, categoryId: category.id, name } })
                setSubcategoryId(id)
              }}
            />
            {sub && <p className="mt-2 text-xs leading-4 text-muted">{t.bulk.tapAgain(sub.name)}</p>}
          </>
        ) : (
          <>
            <h3 className="label-caps pt-4 pb-1">
              {t.transactions.subcategory}
              <span className="tracking-normal normal-case"> · {t.bulk.optional}</span>
            </h3>
            <p className="text-[13px] leading-[18px] text-muted">{t.bulk.pickFirst}</p>
          </>
        ))}

      {(clear || category) && (
        <div className="mt-4 flex items-center gap-2.5 border-t border-line pt-3">
          <CategoryBadge category={clear ? null : category} size={panel ? 28 : 36} />
          <span className="flex min-w-0 flex-col gap-px">
            <span className="text-xs leading-4 text-muted">{t.bulk.resultLabel}</span>
            {clear ? (
              <span className="text-sm leading-5 font-medium text-ink">{t.bulk.clearResult(n)}</span>
            ) : (
              category && (
                <span className="truncate text-sm leading-5 font-medium" style={{ color: catInk(category.color, 70) }}>
                  {categoryName(category)}
                  {sub ? ` › ${sub.name}` : ` · ${t.bulk.noSubcategory}`}
                </span>
              )
            )}
          </span>
        </div>
      )}

      <div className={`mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 ${panel ? '' : '-mx-4 border-t border-line px-4 pt-3'}`}>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className={`border border-line bg-surface font-medium text-ink hover:bg-track disabled:opacity-60 ${panel ? 'h-11 rounded-sm text-sm' : 'h-12 rounded-md text-[15px]'}`}
        >
          {t.bulk.cancel}
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={!ready}
          aria-busy={saving}
          className={`inline-flex items-center justify-center gap-2 bg-accent font-medium text-surface disabled:opacity-40 ${panel ? 'h-11 rounded-sm text-sm' : 'h-12 rounded-md text-[15px]'}`}
        >
          {saving && <Icon name="sync" className="size-[18px] motion-safe:animate-spin" strokeWidth={2} />}
          {saving ? t.bulk.saving : clear ? t.bulk.remove(n) : t.bulk.apply(n)}
        </button>
      </div>
      {panel && <p className="mt-3 text-xs leading-[17px] text-muted">{t.bulk.panelNote}</p>}
    </>
  )
}

/**
 * Phones: the bulk sheet over a scrim. Focus moves into it on open; the
 * caller returns it to the "Categorizar" button on close. Esc closes it.
 */
export function BulkSheet({ txs, onClose, onApplied }: { txs: Transaction[]; onClose(): void; onApplied(applied: Applied): void }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-scrim md:items-center" onClick={onClose}>
      <section
        ref={ref}
        role="dialog"
        aria-modal
        aria-labelledby="bulk-sheet-title"
        className="flex max-h-[92dvh] w-full max-w-[480px] flex-col overflow-y-auto [&>*]:shrink-0 rounded-t-[28px] bg-surface px-4 pb-[calc(16px+env(safe-area-inset-bottom))] md:rounded-[28px] md:pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-[22px] shrink-0 items-center justify-center md:hidden" aria-hidden>
          <span className="h-1 w-8 rounded-full bg-line" />
        </div>
        <BulkContent txs={txs} variant="sheet" onCancel={onClose} onApplied={onApplied} />
      </section>
    </div>
  )
}

/** Desktop: the bulk panel, in place of the details panel while 2+ rows are selected. */
export function BulkPanel({ txs, onClear, onApplied }: { txs: Transaction[]; onClear(): void; onApplied(applied: Applied): void }) {
  return (
    <aside
      aria-labelledby="bulk-panel-title"
      className="sticky top-8 flex max-h-[calc(100dvh-64px)] w-[300px] shrink-0 flex-col self-start overflow-y-auto rounded-lg border border-line bg-surface p-5 xl:w-[380px]"
    >
      <BulkContent txs={txs} variant="panel" onCancel={onClear} onApplied={onApplied} />
    </aside>
  )
}

/**
 * After a bulk change: "N transações atualizadas", "Categoria › Subcategoria"
 * and Undo, for 6 s. Above the tab bar on phones, at the bottom of the content
 * area on desktop.
 */
export function UndoToast({ applied, onDone }: { applied: Applied; onDone(): void }) {
  const { restoreCategories } = useData()
  const { t } = useI18n()
  const [state, setState] = useState<'shown' | 'undoing' | 'undone' | 'failed'>('shown')
  useEffect(() => {
    if (state === 'undoing') return
    const timer = setTimeout(onDone, state === 'undone' ? 3000 : 6000)
    return () => clearTimeout(timer)
  }, [state, onDone])

  const undo = async () => {
    setState('undoing')
    try {
      await restoreCategories(applied.previous)
      setState('undone')
    } catch {
      setState('failed')
    }
  }

  const done = state === 'undone'
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(86px+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-[480px] px-3 lg:bottom-6 lg:left-[248px] lg:mx-0 lg:max-w-[440px] lg:px-6">
      <div role="status" className="pointer-events-auto flex min-h-14 w-full items-center gap-2.5 rounded-md bg-ink py-1.5 pr-1 pl-4 text-page shadow-lg">
        <Icon name={state === 'failed' ? 'alert' : 'check'} className="size-[18px] shrink-0" strokeWidth={2} />
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="text-sm leading-[19px] font-medium">
            {done ? t.bulk.undone : state === 'failed' ? t.bulk.undoFailed : t.bulk.updated(applied.count)}
          </span>
          {!done && state !== 'failed' && <span className="truncate text-[13px] leading-[18px] opacity-80">{applied.label}</span>}
        </span>
        {!done && (
          <button
            type="button"
            onClick={undo}
            disabled={state === 'undoing'}
            className="h-11 shrink-0 rounded-sm px-3 text-sm font-bold disabled:opacity-60"
          >
            {t.bulk.undo}
          </button>
        )}
      </div>
    </div>
  )
}
