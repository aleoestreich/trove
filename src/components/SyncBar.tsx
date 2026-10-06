import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDataSource, useEditError, useSync } from '../state'
import { daysBetween, formatShortDate, formatTime, toISO } from '../lib/dates'
import { isDeployed } from '../lib/useIsDesktop'
import { useI18n } from '../i18n/I18nProvider'
import { Icon, type IconName } from './Icon'
import { needsReconnect } from '../lib/syncProblems'

/** After this many days without a sync, the bar says how long it's been. */
const STALE_DAYS = 7

/**
 * Sync status and the Sync button. Phones: a bar under the header on Overview
 * and Accounts (`bar`). Desktop: in the sidebar (`sidebar`).
 * States: synced (time), syncing (bank n of m, progress), failure (with the
 * reason per bank, and Retry), a bank to reconnect in Meu Pluggy, stale (over
 * 7 days), never synced (demo data), not connected.
 */
export function SyncBar({ variant = 'bar', className = '' }: { variant?: 'bar' | 'sidebar'; className?: string }) {
  const { t } = useI18n()
  const { info, status, progress, failed, sync } = useSync()
  const source = useDataSource()
  if (!isDeployed() && !info) return null // local development: demo data, nothing to sync
  if (!source) return null

  let icon: IconName = 'cloudCheck'
  let tone = 'text-muted'
  let message: string
  let action: { label: string; icon: IconName; onClick?: () => void; to?: string; disabled?: boolean } | null = null
  /** Lines under the message: why each bank failed, or what to do. */
  let details: string[] = []
  const toReconnect = (info?.connections ?? []).filter((c) => needsReconnect(c.status))

  if (!info) {
    icon = 'plug'
    message = t.sync.notConnected
    action = { label: t.sync.connect, icon: 'plug', to: '/accounts' }
  } else if (status === 'syncing' && progress) {
    icon = 'sync'
    tone = 'text-accent'
    message = t.sync.syncing(progress.name, progress.index, progress.total)
    action = { label: t.sync.syncingButton, icon: 'sync', disabled: true }
  } else if (failed.length > 0) {
    icon = 'alert'
    tone = 'text-critical'
    const names = failed.map((f) => f.name).filter(Boolean)
    message = failed.length === info.connections.length || names.length < failed.length ? t.sync.failedAll : t.sync.failed(names.join(', '), names.length)
    // One line per distinct reason; with several banks, each line names its bank.
    const reasons = [...new Map(failed.map((f) => [`${f.name}|${f.problem}`, f])).values()]
    const sameReason = new Set(reasons.map((f) => f.problem)).size === 1
    // The generic message already covers a network failure.
    details = sameReason
      ? reasons[0].problem === 'network' ? [] : [t.sync.problems[reasons[0].problem]]
      : reasons.map((f) => (f.name ? t.sync.problemFor(f.name, t.sync.problems[f.problem]) : t.sync.problems[f.problem]))
    action = { label: t.sync.retry, icon: 'sync', onClick: () => sync(failed.map((f) => f.id)) }
  } else if (toReconnect.length > 0 && source !== 'demo') {
    icon = 'alert'
    tone = 'text-critical'
    message = t.sync.reconnect(toReconnect.map((c) => c.name ?? '?').join(', '))
    details = [t.sync.reconnectNote]
    action = { label: t.sync.syncNow, icon: 'sync', onClick: () => sync() }
  } else if (source === 'demo' || !info.lastSyncedAt) {
    icon = 'plug'
    message = t.sync.neverSynced
    action = { label: t.sync.syncNow, icon: 'sync', onClick: () => sync() }
  } else {
    const at = new Date(info.lastSyncedAt)
    const days = daysBetween(at, new Date())
    if (days > STALE_DAYS) {
      icon = 'cloudOff'
      message = t.sync.stale(days)
    } else {
      message =
        days === 0 ? t.sync.syncedToday(formatTime(at)) : days === 1 ? t.sync.syncedYesterday(formatTime(at)) : t.sync.syncedOn(formatShortDate(toISO(at)), formatTime(at))
    }
    action = { label: t.sync.syncNow, icon: 'sync', onClick: () => sync() }
  }

  const syncing = status === 'syncing' && progress
  const side = variant === 'sidebar'
  const button =
    action &&
    (action.to ? (
      <Link to={action.to} className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap text-accent hover:bg-accent-faint lg:h-11">
        <Icon name={action.icon} className="size-[18px]" />
        {action.label}
      </Link>
    ) : (
      <button
        type="button"
        onClick={action.onClick}
        disabled={action.disabled}
        className={`inline-flex h-12 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap lg:h-11 ${
          action.disabled ? 'text-muted' : 'text-accent hover:bg-accent-faint'
        }`}
      >
        <Icon name={action.icon} className="size-[18px]" />
        {/* While syncing, phones show the icon only: the message already says it. */}
        <span className={action.disabled && !side ? 'sr-only min-[440px]:not-sr-only' : ''}>{action.label}</span>
      </button>
    ))

  return (
    <div className={`overflow-hidden rounded-md border border-line bg-surface ${side ? '' : 'lg:hidden'} ${className}`} role="status" aria-live="polite">
      <div className={`flex min-h-12 gap-2 ${side ? 'flex-col items-stretch p-3 pb-1' : 'items-center pr-1 pl-3.5'}`}>
        <div className={`flex min-w-0 flex-1 items-center gap-2 ${tone}`}>
          <Icon name={icon} className={`size-[18px] shrink-0 ${syncing ? 'motion-safe:animate-spin' : ''}`} />
          <span className={`min-w-0 text-[13px] leading-[18px] ${tone === 'text-muted' ? '' : 'text-ink'}`}>{message}</span>
        </div>
        {details.length > 0 && side && <Details lines={details} />}
        {button && <div className={side ? '-ml-3' : ''}>{button}</div>}
      </div>
      {details.length > 0 && !side && (
        <div className="-mt-1 pr-3.5 pb-3 pl-[42px]">
          <Details lines={details} />
        </div>
      )}
      {syncing && (
        <div
          role="progressbar"
          aria-label={t.sync.progress}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.index - 1}
          className="h-[3px] bg-track"
        >
          <div className="h-[3px] bg-accent transition-[width]" style={{ width: `${((progress.index - 0.5) / progress.total) * 100}%` }} />
        </div>
      )}
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
  const message = editError.message ? t.sync.saveFailed : result ? t.sync.done(result.inserted, result.updated) : null

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
        <span className="min-w-0 flex-1 py-2 text-sm leading-5">{message}</span>
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
