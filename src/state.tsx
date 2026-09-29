import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Repository } from './data/repository'
import type { Snapshot } from './data/seed'
import type { Account, Category, Institution } from './data/types'
import { useI18n } from './i18n/I18nProvider'

interface AppData extends Snapshot {
  accountsById: Map<string, Account>
  categoriesById: Map<string, Category>
  institutionsById: Map<string, Institution>
  setCategory(transactionId: string, categoryId: string): void
}

const DataContext = createContext<AppData | null>(null)

export function DataProvider({ repository, children }: { repository: Repository; children: ReactNode }) {
  const { t } = useI18n()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    repository.load().then(setSnapshot, (e) => setError(e instanceof Error ? e.message : String(e)))
  }, [repository])

  const setCategory = useCallback(
    (transactionId: string, categoryId: string) => {
      setSnapshot((s) =>
        s && {
          ...s,
          transactions: s.transactions.map((t) => (t.id === transactionId ? { ...t, categoryId } : t)),
        },
      )
      void repository.setTransactionCategory(transactionId, categoryId)
    },
    [repository],
  )

  const value = useMemo<AppData | null>(
    () =>
      snapshot && {
        ...snapshot,
        accountsById: new Map(snapshot.accounts.map((a) => [a.id, a])),
        categoriesById: new Map(snapshot.categories.map((c) => [c.id, c])),
        institutionsById: new Map(snapshot.institutions.map((i) => [i.id, i])),
        setCategory,
      },
    [snapshot, setCategory],
  )

  if (error) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 p-4">
        <p className="font-medium text-critical">{t.loadError}</p>
        <p className="text-sm break-words text-muted">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-11 self-start rounded-full bg-accent px-5 font-medium text-white focus-visible:outline-2 focus-visible:outline-accent"
        >
          {t.retry}
        </button>
      </div>
    )
  }
  if (!value) return <p className="p-4 text-muted">{t.loading}</p>
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): AppData {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData outside DataProvider')
  return ctx
}
