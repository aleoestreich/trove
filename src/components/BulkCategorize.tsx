import { useEffect, useRef, useState } from 'react'
import type { PreviousCategory } from '../data/edits'
import { newId } from '../data/edits'
import type { Transaction } from '../data/types'
import { useData } from '../state'
import { formatMoney } from '../lib/money'
import { bulkPick, summarize } from '../lib/selection'
import { Icon } from './Icon'
import { CategoryBadge, catInk, catVar } from './CategoryBadge'
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
 * Bulk categorization: what the selection is filed under today, the category
 * (of the selection's type), the required subcategory, a preview, and
 * Cancel / Apply. Saved all at once; on error the message shows under the buttons.
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
  const options = summary.kind ? categories.filter((c) => c.type === summary.kind) : []
  const ready = (clearing || (!!category && !!sub)) && !saving

  const apply = async () => {
    if (!ready) return
    setSaving(true)
    setError(null)
    const ids = txs.map((x) => x.id)
    try {
      const result = clearing ? await categorizeMany(ids, null, null) : await categorizeMany(ids, category!.id, sub!.id)
      const label = clearing ? t.transactions.uncategorized : `${categoryName(category!)} › ${sub!.name}`
      onApplied({ ids, count: result.updated, label, previous: result.previous })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
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

      <div className={`mt-2.5 flex flex-col gap-2 bg-page px-3 py-2.5 ${panel ? 'rounded-sm' : 'rounded-md'}`}>
        <span className="text-xs leading-4 text-muted">{t.bulk.current}</span>
        <div className="flex flex-wrap gap-1.5">
          {summary.current.map((g) => {
            const c = g.categoryId ? categoriesById.get(g.categoryId) : undefined
            const s = g.subcategoryId ? subcategoriesById.get(g.subcategoryId) : undefined
            return (
              <span
                key={`${g.categoryId}|${g.subcategoryId}`}
                className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-surface pr-2.5 pl-2 font-medium whitespace-nowrap ${panel ? 'h-[26px] text-xs' : 'h-7 text-[13px]'} ${c ? '' : 'text-ink-2'}`}
                style={c ? { color: catInk(c.color, 70) } : undefined}
              >
                <span
                  aria-hidden
                  className={`size-2 shrink-0 rounded-full ${c ? '' : 'border-[1.5px] border-dashed border-muted'}`}
                  style={c ? { background: catVar(c.color) } : undefined}
                />
                {c ? `${categoryName(c)}${s ? ` › ${s.name}` : ''}` : t.transactions.uncategorized}
                <span className="tabular font-normal text-muted">· {g.count}</span>
              </span>
            )
          })}
        </div>
      </div>

      <h3 id={`bulk-${variant}-category`} className={`label-caps pb-2 ${panel ? 'pt-4' : 'pt-4'}`}>
        {t.category}
      </h3>
      <div role="radiogroup" aria-labelledby={`bulk-${variant}-category`} className={`flex flex-wrap ${panel ? 'gap-1.5' : 'gap-2'}`}>
        <button
          type="button"
          role="radio"
          aria-checked={clearing}
          onClick={() => {
            setClearing(true)
            setCategoryId(null)
            setSubcategoryId(null)
          }}
          className={`inline-flex items-center gap-2 rounded-full border pr-3.5 pl-1.5 text-sm font-medium whitespace-nowrap ${panel ? 'h-9' : 'h-10'} ${
            clearing ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-ink-2 hover:bg-track'
          }`}
        >
          <CategoryBadge category={null} size={panel ? 24 : 28} />
          {t.bulk.uncategorize}
        </button>
        {summary.kind &&
          options.map((c) => (
            <CategoryChip
              key={c.id}
              category={c}
              name={categoryName(c)}
              size={panel ? 36 : 40}
              on={!clearing && c.id === category?.id}
              onClick={() => {
                setClearing(false)
                if (c.id === category?.id) return
                setCategoryId(c.id)
                setSubcategoryId(null)
              }}
            />
          ))}
      </div>
      {!summary.kind && <p className="mt-2 text-[13px] leading-[18px] text-muted">{t.bulk.mixedNote}</p>}

      {category && !clearing && (
        <SubcategoryPicker
          variant={`bulk-${variant}`}
          category={category}
          current={subcategoryId}
          small={panel}
          options={subcategories.filter((x) => x.categoryId === category.id)}
          onPick={setSubcategoryId}
          onAdd={(name) => {
            const id = newId()
            edit({ op: 'createSubcategory', subcategory: { id, categoryId: category.id, name } })
            setSubcategoryId(id)
          }}
        />
      )}

      <div className="mt-4 flex items-center gap-2.5 border-t border-line pt-3">
        <CategoryBadge category={clearing ? null : category} size={panel ? 28 : 36} />
        <span className="flex min-w-0 flex-col gap-px">
          <span className="text-xs leading-4 text-muted">{t.bulk.resultLabel(n)}</span>
          {clearing ? (
            <span className="text-sm leading-5 font-medium text-ink-2">
              {t.bulk.uncategorize} <span className="font-normal text-muted">· {t.bulk.uncategorizeNote}</span>
            </span>
          ) : category ? (
            <span className="truncate text-sm leading-5 font-medium" style={{ color: catInk(category.color, 70) }}>
              {categoryName(category)} › {sub ? sub.name : <span className="font-normal text-muted">{t.bulk.pickSubcategory}</span>}
            </span>
          ) : (
            <span className="text-sm leading-5 text-muted">{t.bulk.pickCategory}</span>
          )}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={`border border-line bg-surface font-medium text-ink hover:bg-track ${panel ? 'h-11 rounded-sm text-sm' : 'h-12 rounded-md text-[15px]'}`}
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
          {saving && <Icon name="sync" className="size-[18px] animate-spin" strokeWidth={2} />}
          {saving ? t.bulk.saving : t.bulk.apply(n)}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[13px] leading-[18px] text-critical">
          {error}
        </p>
      )}
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
        className="flex max-h-[92dvh] w-full max-w-[480px] flex-col overflow-y-auto rounded-t-[28px] bg-surface px-4 pb-[calc(16px+env(safe-area-inset-bottom))] md:rounded-[28px] md:pt-4"
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
      className="sticky top-8 flex max-h-[calc(100dvh-64px)] w-[300px] shrink-0 flex-col self-start overflow-y-auto rounded-lg border border-line bg-surface p-5 xl:w-[360px]"
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
