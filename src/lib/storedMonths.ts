// Months stored on the server: the list of them, and fetching the ones older
// than what the app loaded (Transações' filters, Visão geral's month in detail).

import { useEffect, useMemo, useState } from 'react'
import { useData } from '../state'
import type { TransactionQuery } from '../data/transactionFilter'
import { lastMonths } from './dates'

/** Every month from `first` to `latest` (YYYY-MM), oldest first; just `latest` when `first` is later or missing. */
export function monthsBetween(first: string | undefined, latest: string): string[] {
  if (!first || first > latest) return [latest]
  const [y, m] = latest.split('-').map(Number)
  const count = (y - Number(first.slice(0, 4))) * 12 + (m - Number(first.slice(5, 7))) + 1
  return lastMonths(latest, count)
}

/**
 * Older months (Transações, Visão geral's month in detail): when "Todos os meses" or a month before the
 * loaded ones is chosen, fetches the stored transactions (with the other
 * filters) and adds them to the data. The search is debounced. Fetches each
 * query once per load.
 */
export function useStoredTransactions(query: TransactionQuery | null) {
  const { fetchTransactions, dataVersion } = useData()
  const [state, setState] = useState<{ key: string; status: 'loading' | 'done' | 'error'; retrying?: boolean } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const key = query ? `${dataVersion}|${JSON.stringify(query)}` : null
  const [debounced, setDebounced] = useState(key)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(key), 300)
    return () => clearTimeout(timer)
  }, [key])
  useEffect(() => {
    if (!debounced || !query || debounced !== key) return
    let cancelled = false
    // A retry after a failure keeps the error showing, as "Tentando…".
    setState((s) => ({ key: debounced, status: 'loading', retrying: s?.key === debounced && (s.status === 'error' || !!s.retrying) }))
    fetchTransactions(query).then(
      () => !cancelled && setState({ key: debounced, status: 'done' }),
      (e) => {
        console.error(e)
        if (!cancelled) setState({ key: debounced, status: 'error' })
      },
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key stands for the query
  }, [debounced, attempt])
  const status = !key ? 'done' : state?.key === key ? state.status : 'loading'
  const retrying = status === 'loading' && state?.key === key && !!state.retrying
  return { status, retrying, retry: () => setAttempt((n) => n + 1) }
}

/**
 * The months a picker offers (from the first stored one to the current one)
 * and the visible transactions in each. A month older than what's loaded
 * and not fetched yet has no count: it's "Salvo no servidor".
 */
export function useMonthCounts(latest: string): { months: string[]; counts: Map<string, number> } {
  const { allTransactions, storedMonths, loadedFrom } = useData()
  return useMemo(() => {
    const months = monthsBetween(storedMonths[0], latest)
    const counts = new Map<string, number>()
    for (const tx of allTransactions) if (!tx.hidden) counts.set(tx.date.slice(0, 7), (counts.get(tx.date.slice(0, 7)) ?? 0) + 1)
    for (const m of months) if (!counts.has(m) && !(loadedFrom && m < loadedFrom)) counts.set(m, 0)
    return { months, counts }
  }, [allTransactions, storedMonths, loadedFrom, latest])
}

