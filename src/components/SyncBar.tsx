import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDataSource, useEditError, useSync } from '../state'
import { daysBetween, formatShortDate, formatTime, toISO } from '../lib/dates'
import { isDeployed } from '../lib/useIsDesktop'
import { useI18n } from '../i18n/I18nProvider'
import { Icon, type IconName } from './Icon'
import { needsReconnect } from '../lib/syncProblems'
import { SyncOptionsSheet } from './SyncOptions'

/** After this many days without a sync, the bar says how long it's been. */
const STALE_DAYS = 7
/** localStorage key: the advanced sync tip was dismissed on this device. */
const TIP_KEY = 'trove.syncTipSeen'

const tipSeen = () => {
  try {
    return localStorage.getItem(TIP_KEY) === '1'
  } catch {
    return true
  }
}

/**
 * Sync status and the Sync button. Phones: a bar under the header on Overview
 * and Accounts (`bar`). Desktop: in the sidebar (`sidebar`).
 * States: synced (time; "agora" with what an advanced sync read), syncing
 * (bank, n of m, the period; locked "Aguarde" and a 3px progress bar),
 * failure (which banks, why, and "Tentar" for just those, with the same
 * options), a bank to reconnect in Meu Pluggy, stale (over 7 days), never
 * synced (demo data), not connected. Sync and the advanced sync's sliders
 * form one split button; the first time, a tip points at the sliders.
 */
export function SyncBar({ variant = 'bar', className = '' }: { variant?: 'bar' | 'sidebar'; className?: string }) {
  const { t } = useI18n()
  const { info, status, progress, failed, sync, accounts, run, result } = useSync()
  const source = useDataSource()
  const [advanced, setAdvanced] = useState(false)
  const [tip, setTip] = useState(() => !tipSeen())
  if (!isDeployed() && !info) return null // local development: demo data, nothing to sync
  if (!source) return null

  const s = t.sync
  const side = variant === 'sidebar'
  const live = source === 'pluggy' && accounts.length > 0
  const periodLabel = run?.period && run.period !== 'default' ? s.advanced.periods[run.period] : null
  const runDetail = run ? [periodLabel, run.accountIds ? s.accountsCount(run.accountIds.length) : null].filter(Boolean).join(' · ') : ''

  let icon: IconName = 'cloudCheck'
  let tone: 'muted' | 'accent' | 'critical' | 'income' = 'muted'
  let message: string
  let detail: string | null = null
  let action: { label: string; icon: IconName; onClick?: () => void; to?: string; disabled?: boolean } | null = null
  /** Lines under the message: why each bank failed, or what to do. */
  let details: string[] = []
  const toReconnect = (info?.connections ?? []).filter((c) => needsReconnect(c.status))

  if (!info) {
    icon = 'plug'
    message = s.notConnected
    action = { label: s.connect, icon: 'plug', to: '/accounts' }
  } else if (status === 'syncing' && progress) {
    icon = 'refresh'
    tone = 'accent'
    message = s.syncing(progress.name)
    detail = [s.syncingDetail(progress.index, progress.total), periodLabel].filter(Boolean).join(' · ')
    action = { label: s.wait, icon: 'sync', disabled: true }
  } else if (failed.length > 0) {
    icon = 'alert'
    tone = 'critical'
    const names = failed.map((f) => f.name).filter(Boolean)
    const all = failed.length === info.connections.length || names.length < failed.length
    message = all ? s.failedAll : s.failed(names.join(', '), names.length)
    if (!all) detail = s.othersOk
    // One line per distinct reason; with several banks, each line names its bank.
    const reasons = [...new Map(failed.map((f) => [`${f.name}|${f.problem}`, f])).values()]
    const sameReason = new Set(reasons.map((f) => f.problem)).size === 1
    // The generic message already covers a network failure.
    details = sameReason
      ? reasons[0].problem === 'network' ? [] : [s.problems[reasons[0].problem]]
      : reasons.map((f) => (f.name ? s.problemFor(f.name, s.problems[f.problem]) : s.problems[f.problem]))
    // Retry only those banks, with the same period and accounts.
    action = { label: s.retryShort, icon: 'sync', onClick: () => sync(failed.map((f) => f.id), run ?? undefined) }
  } else if (toReconnect.length > 0 && source !== 'demo') {
    icon = 'alert'
    tone = 'critical'
    message = s.reconnect(toReconnect.map((c) => c.name ?? '?').join(', '))
    details = [s.reconnectNote]
    action = { label: s.syncNow, icon: 'sync', onClick: () => sync() }
  } else if (source === 'demo' || !info.lastSyncedAt) {
    icon = 'plug'
    message = s.neverSynced
    action = { label: s.syncNow, icon: 'sync', onClick: () => sync() }
  } else {
    const at = new Date(info.lastSyncedAt)
    const days = daysBetween(at, new Date())
    if (result && run) {
      icon = 'cloudCheck'
      tone = 'income'
      message = s.syncedNow
      detail = runDetail || null
    } else if (days > STALE_DAYS) {
      icon = 'cloudOff'
      message = s.stale(days)
    } else {
      message = days === 0 ? s.syncedToday(formatTime(at)) : days === 1 ? s.syncedYesterday(formatTime(at)) : s.syncedOn(formatShortDate(toISO(at)), formatTime(at))
    }
    action = { label: s.syncNow, icon: 'sync', onClick: () => sync() }
  }

  const syncing = status === 'syncing' && progress
  const options = live && !!action && !action.to
  const openAdvanced = () => {
    setAdvanced(true)
    dismissTip()
  }
  const dismissTip = () => {
    setTip(false)
    try {
      localStorage.setItem(TIP_KEY, '1')
    } catch {
      // Not stored: shown again next time.
    }
  }
  const toneText = { muted: 'text-muted', accent: 'text-accent', critical: 'text-critical', income: 'text-income' }[tone]

  // Sync + sliders: one bordered split button (the sliders only for live data with accounts).
  const button =
    action &&
    (action.to ? (
      <Link to={action.to} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap text-accent hover:bg-accent-faint">
        <Icon name={action.icon} className="size-[18px]" />
        {action.label}
      </Link>
    ) : (
      <span className={`relative inline-flex shrink-0 items-stretch overflow-hidden rounded-md border border-line bg-surface ${side ? 'w-full' : ''}`}>
        <button
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
          className={`inline-flex h-11 items-center justify-center gap-1.5 px-3 text-sm font-medium whitespace-nowrap ${side ? 'flex-1' : ''} ${
            action.disabled ? 'text-muted' : 'text-accent hover:bg-accent-faint'
          }`}
        >
          <Icon name={action.icon} className={`size-[18px] ${action.disabled ? 'motion-safe:animate-spin' : ''}`} />
          {action.label}
        </button>
        {options && !action.disabled && (
          <button
            type="button"
            onClick={openAdvanced}
            aria-label={s.advanced.open}
            title={s.advanced.open}
            className="flex w-11 items-center justify-center border-l border-line text-accent hover:bg-accent-faint"
          >
            <Icon name="sliders" className="size-[18px]" />
          </button>
        )}
      </span>
    ))

  return (
    <div
      className={`relative rounded-md border ${tone === 'critical' ? 'border-critical/40 bg-critical-soft' : 'border-line bg-surface'} ${side ? '' : 'lg:hidden'} ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className={`flex min-h-14 gap-2 ${side ? 'flex-col items-stretch p-3' : 'items-center py-1.5 pr-1.5 pl-3.5'}`}>
        <div className={`flex min-w-0 flex-1 items-center gap-2.5 ${toneText}`}>
          <Icon name={icon} className={`size-[18px] shrink-0 ${syncing ? 'motion-safe:animate-spin' : ''}`} />
          <span className="flex min-w-0 flex-col">
            <span className={`min-w-0 text-[13px] leading-[18px] ${tone === 'muted' ? 'text-ink-2' : 'text-ink'} ${syncing ? 'truncate' : ''}`}>{message}</span>
            {detail && <span className="truncate text-xs leading-4 text-muted">{detail}</span>}
          </span>
        </div>
        {details.length > 0 && side && <Details lines={details} />}
        {button}
        {side && options && !action?.disabled && (
          <button type="button" onClick={openAdvanced} className="-ml-1 inline-flex h-10 items-center gap-2 self-start rounded-sm px-1 text-left text-[13px] font-medium whitespace-nowrap text-accent hover:bg-accent-faint">
            <Icon name="sliders" className="size-4" />
            {s.advanced.open}
          </button>
        )}
      </div>
      {details.length > 0 && !side && (
        <div className="-mt-1 pr-3.5 pb-3 pl-[42px]">
          <Details lines={details} />
        </div>
      )}
      {syncing && (
        <div
          role="progressbar"
          aria-label={s.progress}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.index - 1}
          className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden rounded-b-md bg-track"
        >
          <div className="h-[3px] bg-accent transition-[width]" style={{ width: `${((progress.index - 0.5) / progress.total) * 100}%` }} />
        </div>
      )}
      {/* First time only, on phones: what the sliders are. */}
      {tip && options && !side && !syncing && (
        <div role="note" className="absolute top-[calc(100%+8px)] right-0 z-20 w-[220px] rounded-md bg-ink p-3 text-page shadow-lg">
          <span aria-hidden className="absolute -top-1.5 right-4 size-3 rotate-45 bg-ink" />
          <p className="text-[13px] leading-[18px] font-medium">{s.tip.title}</p>
          <p className="text-[13px] leading-[18px] opacity-80">{s.tip.body}</p>
          <div className="mt-1 flex justify-end">
            <button type="button" onClick={dismissTip} className="-mr-1 h-9 rounded-sm px-2 text-[13px] font-bold">
              {s.tip.ok}
            </button>
          </div>
        </div>
      )}
      {advanced && <SyncOptionsSheet onClose={() => setAdvanced(false)} />}
    </div>
  )
}

function Details({ lines }: { lines: string[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {lines.map((l) => (
        <li key={l} className="text-xs leading-[17px] text-ink-2">
          {l}
        </li>
      ))}
    </ul>
  )
}

/**
 * Snackbar for 4 s: "Synced · 14 new, 2 updated transactions" with View, or a
 * change that couldn't be saved. Above the tab bar on phones.
 */
export function Snackbar() {
  const { t } = useI18n()
  const { result, dismissResult } = useSync()
  const editError = useEditError()
  const navigate = useNavigate()
  const { run } = useSync()
  const message = editError.message ? t.sync.saveFailed : result ? t.sync.doneTitle : null
  const periodLabel = run?.period && run.period !== 'default' ? t.sync.advanced.periods[run.period] : null
  const detail = !editError.message && result ? [periodLabel, t.sync.newCount(result.inserted)].filter(Boolean).join(' · ') : null
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => (editError.message ? editError.dismiss() : dismissResult()), 4000)
    return () => clearTimeout(timer)
  }, [message, editError, dismissResult])

  if (!message) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(86px+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-[480px] px-4 lg:bottom-6 lg:left-[248px] lg:mx-0 lg:max-w-[440px] lg:px-6">
      <div role="status" className="pointer-events-auto flex min-h-12 w-full items-center gap-2.5 rounded-md bg-ink pr-1 pl-4 text-page shadow-lg">
        <Icon name={editError.message ? 'alert' : 'check'} className="size-[18px] shrink-0" strokeWidth={2} />
        <span className="flex min-w-0 flex-1 flex-col py-2">
          <span className="text-sm leading-5 font-medium">{message}</span>
          {detail && <span className="truncate text-[13px] leading-[18px] opacity-80">{detail}</span>}
        </span>
        {!editError.message && (
          <button
            type="button"
            onClick={() => {
              dismissResult()
              navigate('/transactions')
            }}
            className="h-12 shrink-0 rounded-md px-3 text-sm font-bold opacity-90"
          >
            {t.sync.view}
          </button>
        )}
      </div>
    </div>
  )
}
