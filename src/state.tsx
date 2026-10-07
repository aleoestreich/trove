import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Repository } from './data/repository'
import { errorMessage, SyncStartError } from './data/apiRepository'
import { problemFromCode, problemFromStatus, type SyncProblem } from './lib/syncProblems'
import { applyCardDays, readCardDays, saveCardDays, type CardDays } from './data/cardDays'
import { applyEdit, EditError, type Edit } from './data/edits'
import type { Account, Category, Institution, Snapshot, Subcategory, SyncInfo, SyncJob } from './data/types'
import { useI18n } from './i18n/I18nProvider'
import { messages } from './i18n/messages'
import { Button, EmptyState } from './components/ui'

interface AppData extends Snapshot {
  accountsById: Map<string, Account>
  categoriesById: Map<string, Category>
  subcategoriesById: Map<string, Subcategory>
  institutionsById: Map<string, Institution>
  /** Applies a change at once and saves it (see src/data/edits.ts). */
  edit(edit: Edit): void
  /** Set (or clear, with null) a card's closing and due days; saved on this device. */
  setCardDays(accountId: string, days: CardDays | null): void
}

const DataContext = createContext<AppData | null>(null)

/** How often the app checks a running sync. */
const POLL_MS = 1500

interface LoadState {
  error: string | null
  retry(): void
  /** Where the data came from, once loaded (for the "Demo data" badge). */
  source: Snapshot['source'] | null
}

const LoadContext = createContext<LoadState>({ error: null, retry() {}, source: null })

export interface SyncState {
  /** Connections and when they last synced; null for demo data with nothing to sync. */
  info: SyncInfo | null
  status: 'idle' | 'syncing'
  /** While syncing: which connection (1-based) of how many, and its bank's name when known. */
  progress: { index: number; total: number; name: string | null } | null
  /** Connections that failed in the latest sync (the others were saved), with why. */
  failed: { id: string; name: string | null; problem: SyncProblem }[]
  /** After a successful sync: new and updated transactions, for the snackbar. */
  result: { inserted: number; updated: number; at: number } | null
  /** Syncs every connection, or just `only` (Retry). */
  sync(only?: string[]): void
  dismissResult(): void
}

const SyncContext = createContext<SyncState>({
  info: null,
  status: 'idle',
  progress: null,
  failed: [],
  result: null,
  sync() {},
  dismissResult() {},
})

/** A save that failed (shown as a message; the data is reloaded). */
const EditErrorContext = createContext<{ message: string | null; dismiss(): void }>({ message: null, dismiss() {} })

/** A failed load as a message: the browser's own (fetch) errors are in English. */
const loadError = (e: unknown) => (e instanceof TypeError ? messages.errors.network : e instanceof Error ? e.message : String(e))

const byOrder = <T extends { sortOrder: number; name: string }>(a: T, b: T) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)

/**
 * Loads the snapshot for the whole app, applies edits and runs
 * syncs. The header and sidebar can read the source and sync state; pages go
 * inside `<DataGate>`, which shows the loading and error states.
 */
export function DataProvider({ repository, children }: { repository: Repository; children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [editError, setEditError] = useState<string | null>(null)

  const load = useCallback(() => repository.load().then(setSnapshot), [repository])

  useEffect(() => {
    setError(null)
    load().catch((e) => {
      console.error(e)
      setError(loadError(e))
    })
  }, [load, attempt])

  // Edits are applied at once, then saved in order; a failed save reloads what's stored.
  const queue = useRef(Promise.resolve())
  const edit = useCallback(
    (e: Edit) => {
      try {
        setSnapshot((s) => s && applyEdit(s, e))
      } catch (err) {
        setEditError(errorMessage(err instanceof EditError ? err.code : undefined))
        return
      }
      queue.current = queue.current
        .then(() => repository.edit(e))
        .catch((err) => {
          setEditError(err instanceof EditError ? errorMessage(err.code) : err instanceof Error ? err.message : String(err))
          return load().catch(() => {})
        })
    },
    [repository, load],
  )

  const [cardDays, setCardDaysState] = useState(readCardDays)
  const setCardDays = useCallback((accountId: string, days: CardDays | null) => {
    saveCardDays(accountId, days)
    setCardDaysState(readCardDays())
  }, [])

  // Sync runs on the server in the background (it continues with the app
  // closed); the app polls the job, then reloads from the database.
  const [job, setJob] = useState<SyncJob | null>(null)
  const [result, setResult] = useState<SyncState['result']>(null)
  const [startError, setStartError] = useState<{ ids: string[]; problem: SyncProblem } | null>(null)
  const polling = useRef(false)

  const follow = useCallback(
    async (initial: SyncJob, announce: boolean) => {
      setJob(initial)
      if (polling.current || initial.done) return
      polling.current = true
      let current = initial
      try {
        while (!current.done) {
          await new Promise((r) => setTimeout(r, POLL_MS))
          current = (await repository.syncStatus()) ?? { ...current, done: true }
          setJob(current)
        }
      } catch (e) {
        console.error(e)
      } finally {
        polling.current = false
      }
      await load().catch((e) => setError(loadError(e)))
      const ok = current.items.filter((i) => i.status === 'ok')
      if (announce && ok.length === current.items.length) {
        setResult({ inserted: ok.reduce((s, i) => s + i.inserted, 0), updated: ok.reduce((s, i) => s + i.updated, 0), at: Date.now() })
      }
    },
    [repository, load],
  )

  // A sync started earlier (e.g. before the app was closed) may still be running: follow it.
  const hasConnections = !!snapshot?.sync
  useEffect(() => {
    if (!hasConnections) return
    // The latest sync: follow it if it's still running; if it ended with
    // failures (e.g. while the app was closed), show them until a sync succeeds.
    repository.syncStatus().then(
      (j) => {
        if (j && !j.done) void follow(j, true)
        else if (j?.items.some((i) => i.status === 'failed')) setJob(j)
      },
      () => {},
    )
  }, [hasConnections, repository, follow])

  const sync = useCallback(
    async (only?: string[]) => {
      if (polling.current) return
      setStartError(null)
      setResult(null)
      try {
        await follow(await repository.startSync(only), true)
      } catch (e) {
        console.error(e)
        setStartError({
          ids: only ?? (snapshot?.sync?.connections ?? []).map((c) => c.id),
          problem: e instanceof SyncStartError ? problemFromStatus(e.status) : 'unknown',
        })
      }
    },
    [repository, follow, snapshot?.sync],
  )

  const syncing = useMemo<Pick<SyncState, 'status' | 'progress' | 'failed' | 'result'>>(() => {
    const names = new Map((snapshot?.sync?.connections ?? []).map((c) => [c.id, c.name]))
    if (startError)
      return { status: 'idle', progress: null, failed: startError.ids.map((id) => ({ id, name: names.get(id) ?? null, problem: startError.problem })), result: null }
    if (!job) return { status: 'idle', progress: null, failed: [], result }
    const failed = job.items
      .filter((i) => i.status === 'failed')
      .map((i) => ({ id: i.connectionId, name: i.name ?? names.get(i.connectionId) ?? null, problem: problemFromCode(i.error) }))
    if (job.done) return { status: 'idle', progress: null, failed, result }
    const finished = job.items.filter((i) => i.status === 'ok' || i.status === 'failed').length
    const current = job.items.find((i) => i.status === 'running') ?? job.items.find((i) => i.status === 'queued')
    return {
      status: 'syncing',
      progress: {
        index: Math.min(finished + 1, job.items.length),
        total: job.items.length,
        name: current ? (current.name ?? names.get(current.connectionId) ?? null) : null,
      },
      failed: [],
      result: null,
    }
  }, [job, result, startError, snapshot?.sync])

  const syncState = useMemo<SyncState>(
    () => ({
      info: snapshot?.sync ?? null,
      ...syncing,
      sync: (only) => void sync(only),
      dismissResult: () => setResult(null),
    }),
    [snapshot?.sync, syncing, sync],
  )

  const value = useMemo<AppData | null>(() => {
    if (!snapshot) return null
    // Closing and due days set by hand replace the bank's dates for those cards.
    const accounts = applyCardDays(snapshot.accounts, cardDays)
    const categories = [...snapshot.categories].sort(byOrder)
    const subcategories = [...snapshot.subcategories].sort(byOrder)
    return {
      ...snapshot,
      accounts,
      categories,
      subcategories,
      accountsById: new Map(accounts.map((a) => [a.id, a])),
      categoriesById: new Map(categories.map((c) => [c.id, c])),
      subcategoriesById: new Map(subcategories.map((s) => [s.id, s])),
      institutionsById: new Map(snapshot.institutions.map((i) => [i.id, i])),
      edit,
      setCardDays,
    }
  }, [snapshot, edit, cardDays, setCardDays])

  const loadState = useMemo<LoadState>(
    () => ({ error, retry: () => setAttempt((n) => n + 1), source: snapshot?.source ?? null }),
    [error, snapshot],
  )
  const editErrorState = useMemo(() => ({ message: editError, dismiss: () => setEditError(null) }), [editError])

  return (
    <LoadContext.Provider value={loadState}>
      <SyncContext.Provider value={syncState}>
        <EditErrorContext.Provider value={editErrorState}>
          <DataContext.Provider value={value}>{children}</DataContext.Provider>
        </EditErrorContext.Provider>
      </SyncContext.Provider>
    </LoadContext.Provider>
  )
}

/** Sync state and actions (header bar, sidebar, snackbar). */
export function useSync(): SyncState {
  return useContext(SyncContext)
}

/** The last save that failed, if any. */
export function useEditError() {
  return useContext(EditErrorContext)
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
        {/* Why it failed, in Portuguese (see loadError); never amounts or credentials. */}
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
