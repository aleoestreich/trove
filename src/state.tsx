import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Repository } from './data/repository'
import type { Snapshot } from './data/seed'
import type { Account, Category, Institution } from './data/types'

interface AppData extends Snapshot {
  accountsById: Map<string, Account>
  categoriesById: Map<string, Category>
  institutionsById: Map<string, Institution>
  setCategory(transactionId: string, categoryId: string): void
}

const DataContext = createContext<AppData | null>(null)

export function DataProvider({ repository, children }: { repository: Repository; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    repository.load().then(setSnapshot, (e) => setError(String(e)))
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

  if (error) return <p className="p-4 text-critical">Could not load data: {error}</p>
  if (!value) return <p className="p-4 text-muted">Loading…</p>
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): AppData {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData outside DataProvider')
  return ctx
}
