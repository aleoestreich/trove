import { useState, type ReactNode } from 'react'
import { fgtsDue, fgtsLatest, sortFgts, type FgtsEntry } from '../data/fgts'
import { useData } from '../state'
import { useI18n } from '../i18n/I18nProvider'
import { formatDay } from '../lib/dates'
import { formatMoney } from '../lib/money'
import { Icon } from './Icon'
import { Sheet } from './insights/parts'
import { BalanceChart, BalanceList, BalanceSheet, Confirm, Disc, Switch, btn, signed } from './ManualBalance'

// FGTS tracked by hand (src/data/fgts.ts): its card on Accounts, and the
// sheets to update, correct and review the balance. The "Fora do total" group
// and section are in OutOfTotal.tsx; the reminder in BalancesReminder.tsx.

const Mark = ({ size = 40 }: { size?: number }) => <Disc icon="savings" tint="teal" size={size} />
export const FgtsMark = Mark

/** Which sheet is open: the update sheet (new, or correcting `entry`), or the history. */
type View = { kind: 'update'; entry?: FgtsEntry; back?: boolean } | { kind: 'history' } | null

/** The update and history sheets, opened from the section, the reminder or each other. */
export function useFgtsSheets(): [(v: View) => void, ReactNode] {
  const [view, setView] = useState<View>(null)
  const sheet =
    view?.kind === 'update' ? (
      <UpdateSheet key={view.entry?.id ?? 'new'} entry={view.entry} onClose={() => setView(view.back ? { kind: 'history' } : null)} />
    ) : view?.kind === 'history' ? (
      <HistorySheet onEdit={(entry) => setView({ kind: 'update', entry, back: true })} onUpdate={() => setView({ kind: 'update', back: true })} onClose={() => setView(null)} />
    ) : null
  return [setView, sheet]
}

/**
 * Accounts, in "Fora do total": the FGTS card. Off: the switch to start (and,
 * if there's a history, that it's kept). On: the balance, "Saldo em 22 set. ·
 * +R$ 1.210,40", Histórico and Atualizar saldo; outlined in accent with
 * "Atualize o saldo deste mês" when the month's balance is due. No balance
 * yet: an empty state.
 */
export function FgtsCard() {
  const { fgts, setFgtsTracking, today } = useData()
  const { t } = useI18n()
  const f = t.fgts
  const [open, sheet] = useFgtsSheets()
  const latest = fgtsLatest(fgts)
  const due = fgtsDue(fgts, today)

  if (!fgts.tracking)
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 lg:px-5">
        <div className="flex items-center gap-3">
          <Mark />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-base leading-[22px] text-ink">{f.trackLabel}</span>
            <span className="text-[13px] leading-[18px] text-ink-2">{f.trackNote}</span>
          </span>
          <Switch checked={false} label={f.trackLabel} onChange={setFgtsTracking} />
        </div>
        {fgts.entries.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs leading-4 text-ink-2">
            <Icon name="info" className="size-3.5 shrink-0 text-muted" />
            {f.keptNote(fgts.entries.length)}
          </p>
        )}
        {sheet}
      </div>
    )

  return (
    <div className={`flex flex-col gap-3 rounded-lg border bg-surface p-4 lg:px-5 ${due && latest ? 'border-accent/60' : 'border-line'}`}>
      <div className="flex items-center gap-3">
        <Mark />
        <span className="min-w-0 flex-1 text-base leading-[22px] text-ink">{f.section}</span>
        <Switch checked label={f.trackLabel} onChange={setFgtsTracking} />
      </div>

      {latest ? (
        <>
          {due && (
            <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-accent-faint px-2.5 py-1 text-xs leading-4 font-medium text-accent">
              <Icon name="calendar" className="size-3.5" />
              {f.due}
            </span>
          )}
          <div className="flex flex-col gap-0.5">
            <span className="tabular text-[32px] leading-10 font-bold tracking-[-0.02em] text-ink">{formatMoney(latest.latest.balance)}</span>
            <span className="text-[13px] leading-[18px] text-ink-2">
              {f.balanceOn(formatDay(latest.latest.date))}
              {latest.change !== null && (
                <>
                  {' · '}
                  <span className={`tabular ${latest.change >= 0 ? 'text-income' : ''}`}>{signed(latest.change)}</span>
                </>
              )}
            </span>
          </div>
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 min-[400px]:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <button type="button" onClick={() => open({ kind: 'history' })} className={btn.outline}>
              <Icon name="calendar" className="size-[18px]" />
              {f.history}
            </button>
            <button type="button" onClick={() => open({ kind: 'update' })} className={due ? btn.primary : `${btn.outlineBase} text-accent`}>
              <Icon name="plus" className="size-[18px]" strokeWidth={2} />
              {f.update}
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-1 pt-1 text-center">
          <span aria-hidden className="mb-1 flex size-10 items-center justify-center rounded-full bg-track text-ink-2">
            <Icon name="savings" className="size-5" />
          </span>
          <p className="text-base leading-[22px] text-ink">{f.emptyTitle}</p>
          <p className="text-[13px] leading-[18px] text-ink-2">{f.emptyNote}</p>
          <button type="button" onClick={() => open({ kind: 'update' })} className={`${btn.primary} mt-3 w-full`}>
            <Icon name="plus" className="size-[18px]" strokeWidth={2} />
            {f.update}
          </button>
        </div>
      )}
      {sheet}
    </div>
  )
}

/** "Atualizar saldo do FGTS", or "Corrigir saldo do FGTS" for an entry. */
function UpdateSheet({ entry, onClose }: { entry?: FgtsEntry; onClose(): void }) {
  const { saveFgts } = useData()
  const { t } = useI18n()
  const s = t.fgts.sheet
  return (
    <BalanceSheet
      title={entry ? s.editTitle : s.title}
      subtitle={s.subtitle}
      label={s.balanceLabel}
      hint={s.balanceHint}
      entry={entry}
      onSave={(e) => saveFgts({ op: 'saveFgtsBalance', entry: e })}
      onDelete={(id) => saveFgts({ op: 'deleteFgtsBalance', id })}
      onClose={onClose}
    />
  )
}

/**
 * "Histórico do FGTS": the balance over time (a simple area chart) and every
 * balance, newest first; a row opens its correction. "Apagar histórico" asks
 * first, in the sheet. At the bottom, why the FGTS is left out of the total.
 */
function HistorySheet({ onEdit, onUpdate, onClose }: { onEdit(entry: FgtsEntry): void; onUpdate(): void; onClose(): void }) {
  const { fgts, saveFgts } = useData()
  const { t } = useI18n()
  const l = t.fgts.list
  const entries = sortFgts(fgts.entries)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const clear = async () => {
    setBusy(true)
    setFailed(false)
    try {
      await saveFgts({ op: 'clearFgtsHistory' })
      setConfirming(false)
    } catch {
      setFailed(true)
    }
    setBusy(false)
  }

  const footer = (
    <div className="-mx-6 mt-4 hidden grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 border-t border-line px-6 pt-3 md:grid">
      <button type="button" onClick={onClose} className={btn.outline}>
        {l.close}
      </button>
      <button type="button" onClick={onUpdate} className={btn.primary}>
        <Icon name="plus" className="size-[18px]" strokeWidth={2} />
        {t.fgts.update}
      </button>
    </div>
  )

  return (
    <Sheet title={l.title} subtitle={l.subtitle} onClose={onClose} footer={entries.length ? footer : undefined} width="md:max-w-[560px]">
      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-6 text-center">
          <span aria-hidden className="mb-1 flex size-10 items-center justify-center rounded-full bg-track text-ink-2">
            <Icon name="calendar" className="size-5" />
          </span>
          <p className="text-base leading-[22px] text-ink">{l.emptyTitle}</p>
          <p className="text-[13px] leading-[18px] text-ink-2">{l.emptyNote}</p>
          <button type="button" onClick={onUpdate} className={`${btn.primary} mt-3 h-11 text-sm`}>
            <Icon name="plus" className="size-[18px]" strokeWidth={2} />
            {t.fgts.update}
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col">
          {entries.length > 1 && <BalanceChart entries={entries} tint="teal" />}
          <BalanceList entries={entries} onEdit={onEdit} />
          {failed && (
            <p role="alert" className="mt-2 flex items-start gap-2 text-[13px] leading-[18px] text-critical">
              <Icon name="alert" className="mt-px size-4 shrink-0" />
              {t.balance.failed}
            </p>
          )}
          {confirming ? (
            <div className="mt-3">
              <Confirm text={l.clearConfirm} yes={l.clearYes} busy={busy} onYes={() => void clear()} onNo={() => setConfirming(false)} />
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="mt-2 -ml-2 inline-flex h-11 items-center gap-2 self-start rounded-md px-2 text-sm font-medium text-critical hover:bg-critical-soft">
              <Icon name="trash" className="size-4" />
              {l.clear}
            </button>
          )}
          <p className="mt-3 flex items-start gap-2 text-xs leading-4 text-ink-2">
            <Icon name="info" className="mt-px size-3.5 shrink-0 text-muted" />
            {t.fgts.explain}
          </p>
        </div>
      )}
    </Sheet>
  )
}
