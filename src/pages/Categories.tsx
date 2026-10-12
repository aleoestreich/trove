import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useData } from '../state'
import type { Category, CategoryType, SpendingGroup, Subcategory } from '../data/types'
import { CATEGORY_COLORS, CATEGORY_COLOR_NAMES, CATEGORY_ICONS } from '../data/categoryCatalog'
import { cleanName, newId } from '../data/edits'
import { CategoryBadge, catInk, catTint, catVar } from '../components/CategoryBadge'
import { CategoryIcon, Icon } from '../components/Icon'
import { PageHeader } from '../components/ui'
import { useI18n } from '../i18n/I18nProvider'
import { useIsDesktop } from '../lib/useIsDesktop'
import { GroupSwatch } from '../components/balance/parts'
import { TargetSheet } from '../components/balance/TargetSheet'
import { CategoryGroupSheet, SubcategoryGroupSheet } from '../components/balance/GroupSheets'

/**
 * Categories tab: categories by type, each opening to its
 * subcategories, and the editor (?edit=<id>, or ?new) that opens full screen
 * on phones and beside the list on desktop.
 */
export function Categories() {
  const { categories, subcategories, balanceTarget } = useData()
  const { t } = useI18n()
  const g = t.spendingBalance
  const desktop = useIsDesktop()
  const [params, setParams] = useSearchParams()
  const type: CategoryType = params.get('type') === 'income' ? 'income' : 'expense'
  const editing = params.get('edit')
  const creating = params.has('new')
  const [open, setOpen] = useState<string | null>(null)
  const [targetOpen, setTargetOpen] = useState(false)
  const [picking, setPicking] = useState<Category | null>(null)

  const setParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) v === null ? next.delete(k) : next.set(k, v)
    setParams(next, { replace: !('edit' in changes || 'new' in changes) })
  }
  const closeEditor = () => setParam({ edit: null, new: null })
  const editorCategory = editing ? categories.find((c) => c.id === editing) : undefined
  const showEditor = creating || !!editorCategory

  const counts = { expense: categories.filter((c) => c.type === 'expense').length, income: categories.filter((c) => c.type === 'income').length }
  const list = categories.filter((c) => c.type === type)

  const editor = showEditor && (
    <CategoryEditor
      key={editorCategory?.id ?? 'new'}
      category={editorCategory}
      defaultType={type}
      onClose={closeEditor}
      onSaved={(c) => {
        setParam({ edit: null, new: null, type: c.type })
        setOpen(c.id)
      }}
    />
  )

  // Phones: the editor replaces the screen.
  if (showEditor && !desktop) return <div className="fixed inset-0 z-30 overflow-y-auto bg-page">{editor}</div>

  return (
    <>
      <PageHeader title={t.categoriesPage.title}>
        <NewButton onClick={() => setParam({ new: '1', edit: null })} />
      </PageHeader>
      <div className="flex items-start gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex items-center justify-between gap-3 lg:hidden">
            <h1 className="text-[22px] leading-7 font-medium text-ink">{t.categoriesPage.title}</h1>
            <NewButton onClick={() => setParam({ new: '1', edit: null })} />
          </div>

          <div role="tablist" aria-label={t.categoriesPage.typeAria} className="flex gap-1 rounded-md bg-track p-1">
            {(['expense', 'income'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={type === k}
                onClick={() => setParam({ type: k === 'expense' ? null : k })}
                className={`flex h-12 flex-1 items-center justify-center gap-1.5 rounded-[10px] text-sm font-medium lg:h-10 ${
                  type === k ? 'bg-surface text-ink shadow-sm' : 'text-ink-2'
                }`}
              >
                {k === 'expense' ? t.expenses : t.income}
                <span className="tabular text-xs text-muted">{counts[k]}</span>
              </button>
            ))}
          </div>

          {type === 'expense' && (
            <button
              type="button"
              onClick={() => setTargetOpen(true)}
              className="flex min-h-16 items-center gap-3 rounded-lg border border-line bg-surface py-3 pr-2 pl-4 text-left hover:bg-track"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="text-sm leading-5 text-ink">{g.cats.targetRow}</span>
                <span className="tabular text-xs leading-4 text-muted">{`${balanceTarget.essential} · ${balanceTarget.lifestyle} · ${balanceTarget.future}`}</span>
              </span>
              <span className="flex h-10 items-center px-2 text-sm font-medium text-accent">{g.cats.edit}</span>
            </button>
          )}

          {list.length === 0 && (
            <div className="rounded-lg border border-line bg-surface">
              <p className="p-4 text-sm text-muted">{t.categoriesPage.empty}</p>
            </div>
          )}
          {(type === 'expense'
            ? ([null, 'essential', 'lifestyle'] as const).map((group) => ({ group, items: list.filter((c) => (c.group ?? null) === group) }))
            : [{ group: undefined, items: list }]
          )
            .filter((x) => x.items.length > 0)
            .map(({ group, items }) => (
              <section key={group ?? String(group)} className="flex flex-col gap-2">
                {group !== undefined && (
                  <div className="flex items-center justify-between gap-2 px-1 pt-1">
                    <h2 className="flex items-center gap-2 text-[15px] leading-5 font-medium text-ink">
                      <GroupSwatch part={group ?? 'ungrouped'} />
                      {group ? g.groups[group] : g.groups.ungrouped}
                    </h2>
                    <span className="tabular text-xs text-muted">{items.length}</span>
                  </div>
                )}
                <div className={`flex flex-col overflow-hidden rounded-lg bg-surface ${group === null ? 'border-[1.5px] border-dashed border-line' : 'border border-line'}`}>
                  {items.map((c, i) => {
                    const subs = subcategories.filter((s) => s.categoryId === c.id)
                    return (
                      <CategoryRow
                        key={c.id}
                        category={c}
                        subs={subs}
                        otherGroup={c.type === 'expense' ? subs.filter((s) => s.group && s.group !== (c.group ?? null)).length : 0}
                        expanded={open === c.id}
                        selected={c.id === editing}
                        first={i === 0}
                        onToggle={() => setOpen(open === c.id ? null : c.id)}
                        onEdit={() => setParam({ edit: c.id, new: null })}
                        onPick={group === null ? () => setPicking(c) : undefined}
                      />
                    )
                  })}
                </div>
              </section>
            ))}
          <p className="px-1 text-[13px] leading-[18px] text-muted">
            {t.categoriesPage.listNote}
          </p>
        </div>
        {desktop && editor && <div className="sticky top-8 w-[624px] shrink-0">{editor}</div>}
      </div>
      {targetOpen && <TargetSheet onClose={() => setTargetOpen(false)} />}
      {picking && <CategoryGroupSheet category={picking} onClose={() => setPicking(null)} />}
    </>
  )
}

function NewButton({ onClick }: { onClick(): void }) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-md bg-accent px-4 text-[15px] font-medium text-surface active:opacity-80 lg:h-11"
    >
      <Icon name="plus" className="size-[18px]" strokeWidth={2} />
      {t.categoriesPage.newCategory}
    </button>
  )
}

/** A category: badge, name, "n subcategories", chevron; opens to its subcategory chips, "+ Add" and "Edit category". */
function CategoryRow({
  category,
  subs,
  otherGroup,
  expanded,
  selected,
  first,
  onToggle,
  onEdit,
  onPick,
}: {
  category: Category
  subs: { id: string; name: string }[]
  /** Subcategories in another group than the category's. */
  otherGroup: number
  expanded: boolean
  selected: boolean
  first: boolean
  onToggle(): void
  onEdit(): void
  /** No group yet: "Escolher" one. */
  onPick?(): void
}) {
  const { t, categoryName } = useI18n()
  const { edit } = useData()
  const [adding, setAdding] = useState(false)
  const sub = t.categoriesPage.subCount(subs.length) + (otherGroup > 0 ? ` · ${t.spendingBalance.cats.otherGroup(otherGroup)}` : '')
  return (
    <div className={`${first ? '' : 'border-t border-line'} ${selected ? 'bg-accent-faint' : ''}`}>
      <div className="flex items-center">
        <button type="button" aria-expanded={expanded} onClick={onToggle} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left active:bg-track">
          <CategoryBadge category={category} size={40} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[15px] leading-5 font-medium text-ink">{categoryName(category)}</span>
            <span className="text-[13px] leading-[18px] text-muted">{onPick ? t.spendingBalance.cats.none : sub}</span>
          </span>
          {!onPick && <Icon name="chevronDown" className={`mr-4 size-5 shrink-0 text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />}
        </button>
        {onPick && (
          <>
            <button type="button" onClick={onPick} className="h-11 shrink-0 rounded-md border border-line bg-surface px-3 text-sm font-medium text-accent hover:bg-track">
              {t.spendingBalance.cats.pick}
            </button>
            <button type="button" aria-expanded={expanded} aria-label={categoryName(category)} onClick={onToggle} className="flex size-12 shrink-0 items-center justify-center text-muted">
              <Icon name="chevronDown" className={`size-5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          </>
        )}
      </div>
      {expanded && (
        <div className="flex flex-col gap-3 px-4 pb-4">
          <div className="flex flex-wrap gap-2">
            {subs.map((s) => (
              <span
                key={s.id}
                className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium"
                style={{ background: catTint(category.color, 12), color: catInk(category.color) }}
              >
                <span aria-hidden className="size-1.5 rounded-full" style={{ background: catVar(category.color) }} />
                {s.name}
              </span>
            ))}
            {!adding && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="inline-flex h-12 items-center gap-1 rounded-full border border-dashed border-line px-3.5 text-sm font-medium text-accent hover:bg-track"
              >
                <Icon name="plus" className="size-4" strokeWidth={2.2} />
                {t.categoriesPage.add}
              </button>
            )}
          </div>
          {adding && (
            <NameField
              placeholder={t.categoriesPage.addSubcategory}
              taken={(n) => subs.some((s) => sameName(s.name, n))}
              onSubmit={(name) => edit({ op: 'createSubcategory', subcategory: { id: newId(), categoryId: category.id, name } })}
              onCancel={() => setAdding(false)}
            />
          )}
          <button type="button" onClick={onEdit} className="-ml-3 inline-flex h-12 items-center gap-1.5 self-start rounded-md px-3 text-sm font-medium text-accent hover:bg-accent-faint">
            <Icon name="edit" className="size-4" />
            {t.categoriesPage.editCategory}
          </button>
        </div>
      )}
    </div>
  )
}

const sameName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0

/** A name input that stays open to add several in a row; refuses empty and taken names. */
function NameField({
  placeholder,
  taken,
  onSubmit,
  onCancel,
}: {
  placeholder: string
  taken(name: string): boolean
  onSubmit(name: string): void
  onCancel?(): void
}) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        const n = cleanName(name)
        if (!n) return setError(t.categoriesPage.nameRequired)
        if (taken(n)) return setError(t.categoriesPage.nameTaken)
        onSubmit(n)
        setName('')
        setError(null)
      }}
    >
      <div className={`flex h-12 items-center gap-2 rounded-md border bg-surface pr-1 pl-3 ${error ? 'border-critical' : 'border-line'} focus-within:border-accent`}>
        <Icon name="plus" className="size-[18px] shrink-0 text-muted" />
        <input
          autoFocus={!!onCancel}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-invalid={!!error}
          maxLength={40}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
        />
        {name.trim() && (
          <button type="submit" className="h-10 shrink-0 rounded-[10px] px-3 text-sm font-medium text-accent hover:bg-accent-faint">
            {t.categoriesPage.add}
          </button>
        )}
        {onCancel && (
          <button type="button" onClick={onCancel} aria-label={t.close} className="flex size-10 shrink-0 items-center justify-center rounded-[10px] text-ink-2 hover:bg-track">
            <Icon name="close" className="size-[18px]" />
          </button>
        )}
      </div>
      {error && <p className="text-xs text-critical">{error}</p>}
    </form>
  )
}

function Section({ label, id, children }: { label: string; id?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <span id={id} className="label-caps">
        {label}
      </span>
      {children}
    </section>
  )
}

/**
 * The category editor: preview and name, type, colour, icon, subcategories
 * (add, remove, link from another category) and Delete. Name, type, colour
 * and icon are saved with Save; subcategory changes save at once.
 */
function CategoryEditor({
  category,
  defaultType,
  onClose,
  onSaved,
}: {
  category?: Category
  defaultType: CategoryType
  onClose(): void
  onSaved(category: Category): void
}) {
  const { t } = useI18n()
  const { categories, subcategories, transactions, edit } = useData()
  const g = t.spendingBalance
  const [name, setName] = useState(category?.name ?? '')
  const [type, setType] = useState<CategoryType>(category?.type ?? defaultType)
  const [group, setGroup] = useState<SpendingGroup | null>(category?.group ?? null)
  const [subSheet, setSubSheet] = useState<Subcategory | null>(null)
  const [color, setColor] = useState(category?.color ?? 'blue')
  const [icon, setIcon] = useState(category?.icon ?? 'more')
  const [error, setError] = useState<string | null>(null)
  // New category: subcategories are kept here and created with it.
  const [pending, setPending] = useState<string[]>([])

  const subs = category ? subcategories.filter((s) => s.categoryId === category.id) : pending.map((n, i) => ({ id: `pending-${i}`, name: n }))
  const txCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const tx of transactions) if (tx.subcategoryId) m.set(tx.subcategoryId, (m.get(tx.subcategoryId) ?? 0) + 1)
    return m
  }, [transactions])
  const linkable = category ? subcategories.filter((s) => s.categoryId !== category.id) : []
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? ''

  const save = () => {
    const n = cleanName(name)
    if (!n) return setError(t.categoriesPage.nameRequired)
    if (categories.some((c) => c.id !== category?.id && sameName(c.name, n))) return setError(t.categoriesPage.nameTaken)
    // The group goes with an expense category only (an income one loses it).
    const newGroup = type === 'expense' ? group : null
    if (category) {
      edit({ op: 'updateCategory', id: category.id, changes: { name: n, type, color, icon } })
      if (type === 'expense' && newGroup !== (category.group ?? null)) edit({ op: 'setCategoryGroups', groups: [{ categoryId: category.id, group: newGroup }] })
      onSaved({ ...category, name: n, type, color, icon, group: newGroup })
    } else {
      const id = newId()
      edit({ op: 'createCategory', category: { id, name: n, type, color, icon } })
      if (newGroup) edit({ op: 'setCategoryGroups', groups: [{ categoryId: id, group: newGroup }] })
      for (const s of pending) edit({ op: 'createSubcategory', subcategory: { id: newId(), categoryId: id, name: s } })
      onSaved({ id, name: n, type, color, icon, sortOrder: 0, group: newGroup })
    }
  }

  const segment = (on: boolean) => `flex h-12 lg:h-10 flex-1 items-center justify-center rounded-[10px] text-sm font-medium ${on ? 'bg-surface text-ink shadow-sm' : 'text-ink-2'}`

  return (
    <div className="flex min-h-full flex-col bg-page lg:min-h-0 lg:rounded-lg lg:border lg:border-line lg:bg-surface">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-1 bg-page pr-3 pl-1 pt-[env(safe-area-inset-top)] lg:static lg:rounded-t-lg lg:bg-surface lg:px-3 lg:pt-2">
        <button type="button" onClick={onClose} aria-label={t.close} className="flex size-12 items-center justify-center rounded-full text-ink-2 hover:bg-track">
          <Icon name="close" className="size-[22px]" strokeWidth={2} />
        </button>
        <h1 className="flex-1 truncate text-lg font-medium text-ink">{category ? t.categoriesPage.editTitle : t.categoriesPage.newTitle}</h1>
        <button type="button" onClick={save} className="h-12 rounded-md bg-accent px-5 text-[15px] font-medium text-surface active:opacity-80 lg:h-11">
          {t.categoriesPage.save}
        </button>
      </header>

      <div className="flex flex-col gap-6 px-4 pt-3 pb-10 lg:px-5 lg:pb-6">
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="flex size-16 shrink-0 items-center justify-center rounded-full"
            style={{ background: catTint(color), color: catInk(color) }}
          >
            <CategoryIcon icon={icon} className="size-7" strokeWidth={1.8} />
          </span>
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[13px] font-medium text-ink-2">{t.categoriesPage.name}</span>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              maxLength={40}
              aria-invalid={!!error}
              className={`h-12 rounded-md border bg-surface px-3 text-[15px] text-ink outline-none focus:border-accent ${error ? 'border-critical' : 'border-line'}`}
            />
            {error && <span className="text-xs text-critical">{error}</span>}
          </label>
        </div>

        <Section label={t.categoriesPage.type} id="cat-type">
          <div role="radiogroup" aria-labelledby="cat-type" className="flex gap-1 rounded-md bg-track p-1">
            {(['expense', 'income'] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={type === k} onClick={() => setType(k)} className={segment(type === k)}>
                {k === 'expense' ? t.categoriesPage.expense : t.categoriesPage.income}
              </button>
            ))}
          </div>
        </Section>

        {type === 'expense' && (
          <Section label={g.cats.field} id="cat-group">
            <div role="radiogroup" aria-labelledby="cat-group" className="flex gap-1 rounded-md bg-track p-1">
              {(['essential', 'lifestyle'] as const).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={group === k} onClick={() => setGroup(k)} className={`${segment(group === k)} gap-1.5`}>
                  {group === k && <GroupSwatch part={k} size={8} className="rounded-[2px]" />}
                  {g.groups[k]}
                </button>
              ))}
            </div>
            <span className="text-xs leading-[17px] text-muted">{group ? g.cats.fieldHelp : g.cats.none}</span>
          </Section>
        )}

        <Section label={t.categoriesPage.color} id="cat-color">
          <div role="radiogroup" aria-labelledby="cat-color" className="grid grid-cols-6 justify-items-center lg:grid-cols-12">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={CATEGORY_COLOR_NAMES[c].pt}
                onClick={() => setColor(c)}
                className="flex size-12 items-center justify-center rounded-full"
              >
                <span
                  className="flex size-8 items-center justify-center rounded-full text-white"
                  style={{ background: catVar(c), boxShadow: color === c ? `0 0 0 2px var(--page), 0 0 0 4px ${catVar(c)}` : undefined }}
                >
                  {color === c && <Icon name="check" className="size-4" strokeWidth={2.6} />}
                </span>
              </button>
            ))}
          </div>
        </Section>

        <Section label={t.categoriesPage.icon} id="cat-icon">
          <div role="radiogroup" aria-labelledby="cat-icon" className="grid grid-cols-6 gap-1 lg:grid-cols-12">
            {CATEGORY_ICONS.map((key) => {
              const on = icon === key
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={t.categoriesPage.iconNames[key] ?? key}
                  onClick={() => setIcon(key)}
                  className={`flex h-12 items-center justify-center rounded-md ${on ? 'border-[1.5px]' : 'border border-transparent text-ink-2 hover:bg-track'}`}
                  style={on ? { borderColor: catVar(color), background: catTint(color), color: catInk(color) } : undefined}
                >
                  <CategoryIcon icon={key} className="size-[22px]" />
                </button>
              )
            })}
          </div>
        </Section>

        <Section label={t.categoriesPage.subcategories}>
          <div className="flex flex-col overflow-hidden rounded-md border border-line bg-surface">
            {subs.length === 0 && <p className="px-3.5 py-3 text-sm text-muted">{t.categoriesPage.noSubcategories}</p>}
            {subs.map((s, i) => (
              <div key={s.id} className={`flex min-h-12 items-center gap-2.5 pr-1 pl-3.5 ${i > 0 ? 'border-t border-line' : ''}`}>
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: catVar(color) }} />
                <span className="flex min-w-0 flex-1 flex-col py-1">
                  <span className="truncate text-[15px] text-ink">{s.name}</span>
                  {category && (
                    <span className="flex min-w-0 items-center gap-x-1.5 whitespace-nowrap text-xs text-muted">
                      <span className="tabular">{t.categoriesPage.transactionsN(txCount.get(s.id) ?? 0)}</span>
                      {category.type === 'expense' && 'categoryId' in s && (
                        <button
                          type="button"
                          onClick={() => setSubSheet(s as Subcategory)}
                          aria-label={`${g.cats.subTitle(s.name)}: ${(s as Subcategory).group ? g.groups[(s as Subcategory).group!] : g.cats.followsCategory}`}
                          className="-my-2 inline-flex h-10 min-w-0 items-center gap-1 rounded-sm px-1 hover:bg-track"
                        >
                          <span aria-hidden>·</span>
                          {(s as Subcategory).group ? (
                            <span className="inline-flex items-center gap-1 font-medium text-ink">
                              <GroupSwatch part={(s as Subcategory).group!} size={8} className="rounded-[2px]" />
                              {g.groups[(s as Subcategory).group!]}
                            </span>
                          ) : (
                            <span className="truncate">{g.cats.followsCategory}</span>
                          )}
                          <Icon name="chevronRight" className="size-3.5 shrink-0" />
                        </button>
                      )}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  aria-label={t.categoriesPage.remove(s.name)}
                  onClick={() => {
                    if (!category) return setPending(pending.filter((_, j) => `pending-${j}` !== s.id))
                    if (window.confirm(t.categoriesPage.deleteSubConfirm(s.name))) edit({ op: 'deleteSubcategory', id: s.id })
                  }}
                  className="flex size-12 shrink-0 items-center justify-center rounded-md text-muted hover:text-critical"
                >
                  <Icon name="close" className="size-[18px]" />
                </button>
              </div>
            ))}
          </div>
          {category?.type === 'expense' && subs.length > 0 && <span className="text-xs leading-[17px] text-muted">{g.cats.subNote}</span>}
          <NameField
            placeholder={t.categoriesPage.addSubcategory}
            taken={(n) => subs.some((s) => sameName(s.name, n))}
            onSubmit={(n) => (category ? edit({ op: 'createSubcategory', subcategory: { id: newId(), categoryId: category.id, name: n } }) : setPending([...pending, n]))}
          />
        </Section>

        {category && linkable.length > 0 && (
          <Section label={t.categoriesPage.link} id="cat-link">
            <label className="relative flex h-12 items-center gap-2 rounded-md border border-line bg-surface px-3 text-muted">
              <Icon name="link" className="size-[18px] shrink-0" />
              <span className="flex-1 truncate text-[15px]">{t.categoriesPage.linkPlaceholder}</span>
              <Icon name="chevronDown" className="size-[18px] shrink-0" />
              <select
                aria-labelledby="cat-link"
                value=""
                onChange={(e) => e.target.value && edit({ op: 'linkSubcategory', id: e.target.value, categoryId: category.id })}
                className="absolute inset-0 cursor-pointer opacity-0"
              >
                <option value="">{t.categoriesPage.linkPlaceholder}</option>
                {linkable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {catName(s.categoryId)} › {s.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-xs leading-[17px] text-muted">{t.categoriesPage.linkNote}</span>
          </Section>
        )}

        {category && (
          <button
            type="button"
            onClick={() => {
              if (!window.confirm(t.categoriesPage.deleteConfirm(category.name))) return
              edit({ op: 'deleteCategory', id: category.id })
              onClose()
            }}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-line bg-surface text-[15px] font-medium text-critical hover:bg-critical-soft"
          >
            <Icon name="trash" className="size-[18px]" />
            {t.categoriesPage.deleteCategory}
          </button>
        )}
      </div>
      {subSheet && category && <SubcategoryGroupSheet subcategory={subSheet} category={category} onClose={() => setSubSheet(null)} />}
    </div>
  )
}
