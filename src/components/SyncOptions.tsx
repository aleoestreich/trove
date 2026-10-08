import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SYNC_PERIODS, type Account, type SyncOptions as Options, type SyncPeriod } from '../data/types'
import { periodStart } from '../data/syncPeriod'
import { formatMonthName, toISO } from '../lib/dates'
import { accountLabel } from '../lib/accountLabel'
import { accountTypeLabels } from '../lib/accountType'
import { InstitutionBadge } from './BankBadge'
import { useSync } from '../state'
import { useI18n } from '../i18n/I18nProvider'
import { Icon } from './Icon'
import { SelectBox } from './SelectBox'

/**
 * Advanced sync: how far back (Padrão, 3 meses, 6 meses, 1 ano, Tudo) and
 * which accounts and cards. A bottom sheet on phones, a centred dialog on
 * wider screens. Esc and the scrim close it. Its sections never shrink: on a
 * short screen the sheet scrolls instead of cutting off the last options.
 */
export function SyncOptionsSheet({ onClose }: { onClose(): void }) {
  const { t } = useI18n()
  const a = t.sync.advanced
  const { accounts, institutions, sync } = useSync()
  const [period, setPeriod] = useState<SyncPeriod>('default')
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(accounts.map((x) => x.id)))
  const ref = useRef<HTMLElement>(null)

  // Focus moves in once, on open; Esc closes it.
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Accounts grouped by bank, in the order the banks come.
  const banks = useMemo(() => {
    const groups = new Map<string, Account[]>()
    for (const x of accounts) groups.set(x.institutionId, [...(groups.get(x.institutionId) ?? []), x])
    return [...groups].map(([id, list]) => ({ id, name: institutions.find((i) => i.id === id)?.name ?? '', accounts: list }))
  }, [accounts, institutions])

  const all = chosen.size === accounts.length
  const today = toISO(new Date())
  const note = (p: SyncPeriod) => {
    if (p === 'default') return a.defaultNote
    if (p === 'all') return a.allNote
    const from = periodStart(p, today)
    return a.since(formatMonthName(from), from.slice(0, 4))
  }
  const toggle = (id: string) =>
    setChosen((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const start = () => {
    if (chosen.size === 0) return
    const options: Options = { period, accountIds: all ? null : accounts.filter((x) => chosen.has(x.id)).map((x) => x.id) }
    sync(undefined, options)
    onClose()
  }

  const periods = (
    <div className="flex flex-col">
      <h3 id="sync-period" className="label-caps pb-1">
        {a.period}
      </h3>
      <div role="radiogroup" aria-labelledby="sync-period" className="flex flex-col divide-y divide-line">
        {SYNC_PERIODS.map((p) => {
          const on = p === period
          return (
            <button key={p} type="button" role="radio" aria-checked={on} onClick={() => setPeriod(p)} className="flex min-h-[60px] w-full items-center gap-3.5 py-2 text-left">
              <span aria-hidden className={`flex size-[22px] shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-accent' : 'border-muted'}`}>
                {on && <span className="size-2.5 rounded-full bg-accent" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[16px] leading-[22px] text-ink">{a.periods[p]}</span>
                <span className="text-[13px] leading-[18px] text-muted">{note(p)}</span>
              </span>
            </button>
          )
        })}
      </div>
      {(period === '1y' || period === 'all') && (
        <p className="mt-2 flex items-start gap-2.5 rounded-md bg-page px-3 py-2.5 text-[13px] leading-[18px] text-ink-2">
          <Icon name="calendar" className="mt-px size-4 shrink-0" />
          {a.longNote}
        </p>
      )}
    </div>
  )

  const accountsList = (
    <div className="flex flex-col">
      <h3 className="label-caps pb-1">{a.accounts}</h3>
      <CheckRow
        label={a.allAccounts}
        sub={a.selectedCount(chosen.size, accounts.length)}
        state={all ? 'on' : chosen.size === 0 ? 'off' : 'mixed'}
        onToggle={() => setChosen(new Set(all ? [] : accounts.map((x) => x.id)))}
      />
      {banks.map((bank) => {
        // What the bank calls each account, shown under a name set in Trove.
        const bankLabels = accountTypeLabels(
          bank.accounts.map(({ nickname: _n, ...x }) => x),
          t,
        )
        const institution = institutions.find((i) => i.id === bank.id)
        return (
          <div key={bank.id} role="group" aria-label={bank.name} className="border-t border-line pt-2.5">
            <p className="flex items-center gap-2.5 pb-1 text-[13px] leading-[18px] text-ink-2">
              {institution && <InstitutionBadge institution={institution} size={24} />}
              {bank.name}
            </p>
            <div className="pl-[34px]">
              {bank.accounts.map((x) => (
                <CheckRow key={x.id} label={accountLabel(x, t)} sub={x.nickname ? bankLabels.get(x.id) : undefined} state={chosen.has(x.id) ? 'on' : 'off'} onToggle={() => toggle(x.id)} />
              ))}
            </div>
          </div>
        )
      })}
      {chosen.size === 0 ? (
        <p role="alert" className="mt-2 flex items-center gap-2 text-[13px] leading-[18px] text-critical">
          <Icon name="alert" className="size-4 shrink-0" />
          {a.noneSelected}
        </p>
      ) : (
        !all && <p className="mt-2 text-xs leading-4 text-muted">{a.skippedNote}</p>
      )}
    </div>
  )

  // On top of everything, outside the sync bar's live region. Title and buttons stay put; the middle scrolls.
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-scrim md:items-center" onClick={onClose}>
      <section
        ref={ref}
        role="dialog"
        aria-modal
        aria-labelledby="sync-options-title"
        className="flex max-h-[92dvh] w-full max-w-[480px] flex-col rounded-t-xl bg-surface pb-[env(safe-area-inset-bottom)] md:rounded-xl lg:max-w-[800px] [&>*]:shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-[22px] items-center justify-center md:hidden" aria-hidden>
          <span className="h-1 w-8 rounded-full bg-line" />
        </div>
        <div className="flex items-center gap-3 px-4 pb-2 md:px-6 md:pt-5">
          <h2 id="sync-options-title" className="min-w-0 flex-1 text-xl leading-[26px] font-medium text-ink">
            {a.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="-mr-2 flex size-12 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-track active:bg-track"
          >
            <Icon name="close" className="size-[22px]" strokeWidth={2} />
          </button>
        </div>

        <div className="!shrink overflow-y-auto px-4 pt-2 pb-4 md:px-6 lg:grid lg:grid-cols-2 lg:gap-8">
          {periods}
          <div className="mt-4 lg:mt-0">{accountsList}</div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 border-t border-line px-4 pt-3 pb-4 md:px-6 lg:flex lg:justify-end">
          <button type="button" onClick={onClose} className="h-12 rounded-md border border-line bg-surface text-[15px] font-medium text-ink hover:bg-track lg:w-[140px]">
            {a.cancel}
          </button>
          <button
            type="button"
            onClick={start}
            disabled={chosen.size === 0}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-accent text-[15px] font-medium text-surface disabled:opacity-40 lg:w-[180px]"
          >
            <Icon name="sync" className="size-[18px]" />
            {a.start}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

function CheckRow({ label, sub, state, onToggle }: { label: string; sub?: string; state: 'on' | 'off' | 'mixed'; onToggle(): void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === 'mixed' ? 'mixed' : state === 'on'}
      onClick={onToggle}
      className="flex min-h-[52px] w-full items-center gap-3.5 py-1.5 text-left"
    >
      <SelectBox state={state} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[16px] leading-[22px] text-ink">{label}</span>
        {sub && <span className="truncate text-[13px] leading-[18px] text-muted">{sub}</span>}
      </span>
    </button>
  )
}
