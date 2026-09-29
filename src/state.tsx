import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Repository } from './data/repository'
import type { Snapshot } from './data/seed'
import type { Account, Category, Institution } from './data/types'
import { useI18n } from './i18n/I18nProvider'
import { Button, EmptyState } from './components/ui'

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
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setError(null)
    repository.load().then(setSnapshot, (e) => {
      console.error(e)
      setError(String(e))
    })
  }, [repository, attempt])

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

  if (error)
    return (
      <EmptyState
        alert
        icon="cloudOff"
        title={t.loadErrorTitle}
        action={
          <Button icon="refresh" className="px-6" onClick={() => setAttempt((n) => n + 1)}>
            {t.tryAgain}
          </Button>
        }
      >
        {t.loadErrorBody}
      </EmptyState>
    )
  if (!value) return <LoadingSkeleton label={t.loading} />
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): AppData {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData outside DataProvider')
  return ctx
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
