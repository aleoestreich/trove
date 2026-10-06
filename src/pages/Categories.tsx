import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../state'
import type { Category, CategoryKind, Subcategory } from '../data/types'
import { Card, IconDisc, Overline, PageHeader } from '../components/ui'
import { Icon, categoryIcon, pickableCategoryIcons, type IconName } from '../components/Icon'
import { useI18n } from '../i18n/I18nProvider'

type OwnKind = Exclude<CategoryKind, 'transfer'>

/**
 * The owner's categories: subcategories under any income or expense category,
 * and categories of their own (name, type and icon). Transfers have no
 * subcategories: they never count as income or expenses.
 */
export function Categories() {
  const { categories, subcategories, categoryEditor } = useData()
  const { t, categoryName } = useI18n()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)

  const groups: { kind: OwnKind; label: string }[] = [
    { kind: 'expense', label: t.expenses },
    { kind: 'income', label: t.income },
  ]

  return (
    <>
      <PageHeader title={t.categoryEditor.title} subtitle={t.categoryEditor.intro} />
      <div className="flex flex-col gap-4 lg:max-w-[720px]">
        <div className="flex items-center gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/accounts'))}
            aria-label={t.close}
            className="-ml-2 flex size-12 items-center justify-center rounded-full text-ink-2 active:bg-track"
          >
            <Icon name="chevronLeft" className="size-5" />
          </button>
          <h1 className="text-[22px] leading-7 font-medium text-ink">{t.categoryEditor.title}</h1>
        </div>
        <p className="text-sm leading-5 text-muted lg:hidden">{t.categoryEditor.intro}</p>

        {creating ? (
          <CategoryForm
            submitLabel={t.categoryEditor.create}
            onCancel={() => setCreating(false)}
            onSubmit={(name, kind, icon) => {
              const ok = !!categoryEditor.addCategory(name, kind, icon)
              if (ok) setCreating(false)
              return ok
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex h-12 items-center justify-center gap-2 rounded-md border border-dashed border-line bg-surface text-[15px] font-medium text-accent active:bg-track"
          >
            <Icon name="plus" className="size-[18px]" strokeWidth={2} />
            {t.categoryEditor.newCategory}
          </button>
        )}

        {groups.map((g) => (
          <section key={g.kind} className="flex flex-col gap-2">
            <Overline className="px-1">{g.label}</Overline>
            {categories
              .filter((c) => c.kind === g.kind)
              .map((c) => (
                <CategoryCard key={c.id} category={c} name={categoryName(c)} subcategories={subcategories.filter((s) => s.categoryId === c.id)} />
              ))}
          </section>
        ))}
      </div>
    </>
  )
}

function CategoryCard({ category, name, subcategories }: { category: Category; name: string; subcategories: Subcategory[] }) {
  const { categoryEditor, categoriesById } = useData()
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)

  if (editing)
    return (
      <CategoryForm
        initial={{ name: category.name, kind: category.kind as OwnKind, icon: categoryIcon(category.id, categoriesById) }}
        lockKind
        submitLabel={t.categoryEditor.save}
        onCancel={() => setEditing(false)}
        onSubmit={(n, _kind, icon) => {
          const ok = categoryEditor.updateCategory(category.id, { name: n, icon })
          if (ok) setEditing(false)
          return ok
        }}
      />
    )

  return (
    <Card className="flex flex-col gap-3 !p-3.5">
      <div className="flex items-center gap-3">
        <IconDisc icon={categoryIcon(category.id, categoriesById)} size="sm" />
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-[15px] font-medium text-ink">{name}</span>
          {category.custom && (
            <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-accent-soft px-2 text-[11px] font-medium text-accent">
              {t.categoryEditor.yours}
            </span>
          )}
        </span>
        {category.custom && (
          <>
            <IconButton icon="pencil" label={`${t.categoryEditor.edit}: ${name}`} onClick={() => setEditing(true)} />
            <IconButton
              icon="trash"
              label={`${t.categoryEditor.delete}: ${name}`}
              onClick={() => window.confirm(t.categoryEditor.deleteCategory(name)) && categoryEditor.deleteCategory(category.id)}
            />
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {subcategories.map((s) =>
          renaming === s.id ? (
            <NameInput
              key={s.id}
              initial={s.name}
              submitLabel={t.categoryEditor.save}
              onCancel={() => setRenaming(null)}
              onSubmit={(n) => {
                const ok = categoryEditor.renameSubcategory(s.id, n)
                if (ok) setRenaming(null)
                return ok
              }}
            />
          ) : (
            <span key={s.id} className="inline-flex h-10 items-center rounded-full border border-line bg-surface text-sm text-ink-2">
              <button type="button" onClick={() => setRenaming(s.id)} className="h-full rounded-l-full pr-1 pl-3.5 hover:text-ink" aria-label={`${t.categoryEditor.edit}: ${s.name}`}>
                {s.name}
              </button>
              <button
                type="button"
                onClick={() => window.confirm(t.categoryEditor.deleteSubcategory(s.name)) && categoryEditor.deleteSubcategory(s.id)}
                className="flex h-full w-9 items-center justify-center rounded-r-full text-muted hover:text-critical"
                aria-label={`${t.categoryEditor.delete}: ${s.name}`}
              >
                <Icon name="close" className="size-4" strokeWidth={2} />
              </button>
            </span>
          ),
        )}
        {adding ? (
          <NameInput
            submitLabel={t.categoryEditor.add}
            placeholder={t.categoryEditor.subcategoryName}
            onCancel={() => setAdding(false)}
            onSubmit={(n) => !!categoryEditor.addSubcategory(category.id, n)}
            keepOpen
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-dashed border-line px-3.5 text-sm font-medium text-accent hover:bg-track"
          >
            <Icon name="plus" className="size-4" strokeWidth={2} />
            {t.categoryEditor.addSubcategory}
          </button>
        )}
      </div>
    </Card>
  )
}

function IconButton({ icon, label, onClick }: { icon: IconName; label: string; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-track active:bg-track"
    >
      <Icon name={icon} className="size-[18px]" />
    </button>
  )
}

/** A name field with Add/Save and Cancel; shows an error when the name is empty or taken. */
function NameInput({
  initial = '',
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
  keepOpen = false,
}: {
  initial?: string
  placeholder?: string
  submitLabel: string
  /** False when the name is empty or taken. */
  onSubmit(name: string): boolean
  onCancel(): void
  /** Stay open after adding, to add several in a row. */
  keepOpen?: boolean
}) {
  const { t } = useI18n()
  const [name, setName] = useState(initial)
  const [error, setError] = useState(false)
  return (
    <form
      className="flex w-full flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!onSubmit(name)) return setError(true)
        if (keepOpen) setName('')
      }}
    >
      <div className="flex gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(false)
          }}
          aria-label={placeholder ?? t.categoryEditor.name}
          aria-invalid={error}
          placeholder={placeholder}
          maxLength={40}
          className={`h-10 min-w-0 flex-1 rounded-md border bg-surface px-3 text-[15px] text-ink placeholder:text-muted ${error ? 'border-critical' : 'border-line'}`}
        />
        <button type="submit" className="h-10 shrink-0 rounded-md bg-accent px-4 text-sm font-medium text-surface">
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="h-10 shrink-0 px-1.5 text-sm font-medium text-ink-2">
          {t.categoryEditor.cancel}
        </button>
      </div>
      {error && <p className="text-xs text-critical">{t.categoryEditor.nameTaken}</p>}
    </form>
  )
}

/** Name, type (expense or income) and icon of a category the owner creates or edits. */
function CategoryForm({
  initial,
  lockKind = false,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: { name: string; kind: OwnKind; icon: IconName }
  /** Editing: the type stays (changing it would move past totals between income and expenses). */
  lockKind?: boolean
  submitLabel: string
  onSubmit(name: string, kind: OwnKind, icon: IconName): boolean
  onCancel(): void
}) {
  const { t } = useI18n()
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<OwnKind>(initial?.kind ?? 'expense')
  const [icon, setIcon] = useState<IconName>(initial?.icon ?? 'other')
  const [error, setError] = useState(false)
  const segment = (on: boolean) =>
    `flex h-10 flex-1 items-center justify-center rounded-[10px] text-sm font-medium ${on ? 'bg-surface text-ink shadow-sm' : 'text-ink-2'}`

  return (
    <Card className="!p-4">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!onSubmit(name, kind, icon)) setError(true)
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink-2">{t.categoryEditor.name}</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(false)
            }}
            aria-invalid={error}
            maxLength={40}
            className={`h-12 rounded-md border bg-surface px-3 text-[15px] text-ink ${error ? 'border-critical' : 'border-line'}`}
          />
          {error && <span className="text-xs text-critical">{t.categoryEditor.nameTaken}</span>}
        </label>

        {!lockKind && (
          <div className="flex flex-col gap-1.5">
            <span id="category-kind" className="text-[13px] font-medium text-ink-2">
              {t.categoryEditor.kind}
            </span>
            <div role="radiogroup" aria-labelledby="category-kind" className="flex gap-1 rounded-md bg-track p-1">
              {(['expense', 'income'] as const).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={segment(kind === k)}>
                  {k === 'expense' ? t.expenses : t.income}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span id="category-icon" className="text-[13px] font-medium text-ink-2">
            {t.categoryEditor.icon}
          </span>
          <div role="radiogroup" aria-labelledby="category-icon" className="grid grid-cols-6 gap-2">
            {pickableCategoryIcons.map((name, i) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={icon === name}
                aria-label={t.categoryEditor.iconN(i + 1)}
                onClick={() => setIcon(name)}
                className={`flex aspect-square items-center justify-center rounded-md border ${icon === name ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:bg-track'}`}
              >
                <Icon name={name} className="size-[22px]" />
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button type="submit" className="h-12 flex-1 rounded-md bg-accent text-[15px] font-medium text-surface">
            {submitLabel}
          </button>
          <button type="button" onClick={onCancel} className="h-12 flex-1 rounded-md border border-line text-[15px] font-medium text-ink-2">
            {t.categoryEditor.cancel}
          </button>
        </div>
      </form>
    </Card>
  )
}
