import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Repository } from './data/repository'
import { applyCardDays, readCardDays, saveCardDays, type CardDays } from './data/cardDays'
import type { Snapshot } from './data/seed'
import type { Account, Category, CategoryKind, Institution, Subcategory } from './data/types'
import * as userCategories from './data/userCategories'
import { useI18n } from './i18n/I18nProvider'
import { Button, EmptyState } from './components/ui'

interface AppData extends Snapshot {
  accountsById: Map<string, Account>
  categoriesById: Map<string, Category>
  institutionsById: Map<string, Institution>
  /** The owner's subcategories, under built-in and own categories. */
  subcategories: Subcategory[]
  subcategoriesById: Map<string, Subcategory>
  setCategory(transactionId: string, categoryId: string): void
  /** Set (or clear, with null) a transaction's subcategory; saved on this device. */
  setSubcategory(transactionId: string, subcategoryId: string | null): void
  /** Create, change and delete the owner's categories and subcategories; saved on this device. */
  categoryEditor: CategoryEditor
  /** Set (or clear, with null) a card's closing and due days; saved on this device. */
  setCardDays(accountId: string, days: CardDays | null): void
}

export interface CategoryEditor {
  /** The new category, or null when the name is empty or taken. */
  addCategory(name: string, kind: Exclude<CategoryKind, 'transfer'>, icon: string): Category | null
  updateCategory(id: string, changes: { name?: string; icon?: string }): boolean
  deleteCategory(id: string): void
  /** The new subcategory, or null when the name is empty or already in that category. */
  addSubcategory(categoryId: string, name: string): Subcategory | null
  renameSubcategory(id: string, name: string): boolean
  deleteSubcategory(id: string): void
}

const DataContext = createContext<AppData | null>(null)

interface LoadState {
  error: string | null
  retry(): void
  /** Where the data came from, once loaded (for the "Demo data" badge). */
  source: Snapshot['source'] | null
}

const LoadContext = createContext<LoadState>({ error: null, retry() {}, source: null })

/**
 * Loads the snapshot for the whole app. The header and sidebar can read its
 * source with `useDataSource()`; pages go inside `<DataGate>`, which shows the
 * loading and error states in the content area.
 */
export function DataProvider({ repository, children }: { repository: Repository; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setError(null)
    repository.load().then(setSnapshot, (e) => {
      console.error(e)
      setError(e instanceof Error ? e.message : String(e))
    })
  }, [repository, attempt])

  // Bumped after each change to the owner's categories, so they're re-applied.
  const [categoriesVersion, setCategoriesVersion] = useState(0)
  const bump = useCallback(() => setCategoriesVersion((n) => n + 1), [])

  const setCategory = useCallback(
    (transactionId: string, categoryId: string) => {
      // A subcategory belongs to its category: moving the transaction clears it.
      userCategories.saveSubcategory(transactionId, null)
      bump()
      setSnapshot((s) =>
        s && {
          ...s,
          transactions: s.transactions.map((t) => (t.id === transactionId ? { ...t, categoryId } : t)),
        },
      )
      void repository.setTransactionCategory(transactionId, categoryId)
    },
    [repository, bump],
  )

  const setSubcategory = useCallback(
    (transactionId: string, subcategoryId: string | null) => {
      userCategories.saveSubcategory(transactionId, subcategoryId)
      bump()
    },
    [bump],
  )

  const reload = useCallback(() => {
    // Deleting a category can undo category changes, which the repository applied at load.
    void repository.load().then(setSnapshot, () => {})
  }, [repository])

  const categoryEditor = useMemo<CategoryEditor>(() => {
    const current = () => [...(snapshot?.categories ?? []), ...userCategories.readUserCategories().categories]
    const after = <T,>(result: T) => {
      bump()
      return result
    }
    return {
      addCategory: (name, kind, icon) => after(userCategories.addCategory(name, kind, icon, current())),
      updateCategory: (id, changes) => after(userCategories.updateCategory(id, changes, current())),
      deleteCategory: (id) => {
        userCategories.deleteCategory(id)
        bump()
        reload()
      },
      addSubcategory: (categoryId, name) => after(userCategories.addSubcategory(categoryId, name)),
      renameSubcategory: (id, name) => after(userCategories.renameSubcategory(id, name)),
      deleteSubcategory: (id) => after(userCategories.deleteSubcategory(id)),
    }
  }, [snapshot?.categories, bump, reload])

  const [cardDays, setCardDaysState] = useState(readCardDays)
  const setCardDays = useCallback((accountId: string, days: CardDays | null) => {
    saveCardDays(accountId, days)
    setCardDaysState(readCardDays())
  }, [])

  const value = useMemo<AppData | null>(() => {
    if (!snapshot) return null
    // The owner's categories, subcategories and each transaction's subcategory.
    const withCategories = userCategories.applyUserCategories(snapshot)
    // The owner's closing and due days replace the bank's dates for those cards.
    const accounts = applyCardDays(snapshot.accounts, cardDays)
    return {
      ...withCategories,
      accounts,
      accountsById: new Map(accounts.map((a) => [a.id, a])),
      categoriesById: new Map(withCategories.categories.map((c) => [c.id, c])),
      subcategoriesById: new Map(withCategories.subcategories.map((s) => [s.id, s])),
      institutionsById: new Map(snapshot.institutions.map((i) => [i.id, i])),
      setCategory,
      setSubcategory,
      categoryEditor,
      setCardDays,
    }
    // categoriesVersion: re-apply the owner's categories after a change.
  }, [snapshot, setCategory, setSubcategory, categoryEditor, cardDays, setCardDays, categoriesVersion])

  const load = useMemo<LoadState>(
    () => ({ error, retry: () => setAttempt((n) => n + 1), source: snapshot?.source ?? null }),
    [error, snapshot],
  )

  return (
    <LoadContext.Provider value={load}>
      <DataContext.Provider value={value}>{children}</DataContext.Provider>
    </LoadContext.Provider>
  )
}

/** Renders its children once the data has loaded; until then, a skeleton or the error. */
export function DataGate({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const { error, retry } = useContext(LoadContext)
  const data = useContext(DataContext)
  if (error)
    return (
      <EmptyState
        alert
        icon="cloudOff"
        title={t.loadErrorTitle}
        action={
          <Button icon="refresh" className="px-6" onClick={retry}>
            {t.tryAgain}
          </Button>
        }
      >
        {t.loadErrorBody}
        {/* The server's message (e.g. "Pluggy refused the credentials"); never contains amounts or credentials. */}
        <span className="mt-2 block text-[13px] leading-[18px] break-words text-muted">{error}</span>
      </EmptyState>
    )
  if (!data) return <LoadingSkeleton label={t.loading} />
  return <>{children}</>
}

export function useData(): AppData {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData outside DataGate')
  return ctx
}

/** "demo" or "pluggy" once loaded, null while loading or on error. */
export function useDataSource(): Snapshot['source'] | null {
  return useContext(LoadContext).source
}

/** Placeholder cards while data loads. */
function LoadingSkeleton({ label }: { label: string }) {
  const rows = [
    [62, 38],
    [48, 30],
    [70, 44],
    [55, 34],
  ]
  return (
    <div aria-busy="true" aria-label={label} className="flex flex-col gap-3">
      <section className="flex flex-col gap-2.5 rounded-lg border border-line bg-surface p-4">
        <div className="skeleton h-3 w-24 rounded-xs" />
        <div className="skeleton h-9 w-[210px] rounded-[10px]" />
        <div className="skeleton h-5 w-[140px] rounded-full" />
        <div className="skeleton mt-2 h-[120px] rounded-sm" />
      </section>
      <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4">
        <div className="skeleton h-3.5 w-40 rounded-[7px]" />
        {rows.map(([a, b], i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton size-9 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="skeleton h-3 rounded-xs" style={{ width: `${a}%` }} />
              <div className="skeleton h-2.5 rounded-[5px]" style={{ width: `${b}%` }} />
            </div>
            <div className="skeleton h-3.5 w-[72px] rounded-[7px]" />
          </div>
        ))}
      </section>
    </div>
  )
}
