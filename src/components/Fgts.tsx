import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { FGTS_MAX, fgtsDue, fgtsLatest, sortFgts, type Fgts, type FgtsEntry } from '../data/fgts'
import { newId } from '../data/edits'
import { useData } from '../state'
import { useI18n } from '../i18n/I18nProvider'
import { formatDay, formatDayYear, formatMonthShort } from '../lib/dates'
import { formatMoney, isMoneyMasked, moneyInput, parseMoney, signOf } from '../lib/money'
import { Icon } from './Icon'
import { Sheet, useWidth } from './insights/parts'

// FGTS tracked by hand (src/data/fgts.ts): the section on Accounts, the line
// under net worth and the monthly reminder on Visão geral, and the sheets to
// update, correct and review the balance. Every amount goes through
// formatMoney, so privacy mode masks it; the chart is a [data-chart].

const tint = { background: 'color-mix(in srgb, var(--cat-teal) 16%, transparent)', color: 'color-mix(in srgb, var(--cat-teal) 75%, var(--ink))' }

/** The FGTS mark: a safe on a teal disc. */
function Mark({ size = 40 }: { size?: number }) {
  return (
    <span aria-hidden className="flex shrink-0 items-center justify-center rounded-full" style={{ ...tint, width: size, height: size }}>
      <Icon name="savings" className={size >= 40 ? 'size-5' : 'size-[18px]'} />
    </span>
  )
}

/** "+R$ 1.210,40" / "−R$ 1.755,88" (nothing to sign while values are hidden). */
const signed = (cents: number) => `${signOf(cents)}${formatMoney(Math.abs(cents))}`

const primary = 'inline-flex h-12 items-center justify-center gap-2 rounded-md bg-accent px-3.5 whitespace-nowrap text-[15px] font-medium text-surface active:opacity-80 disabled:opacity-40'
const outlineBase = 'inline-flex h-12 items-center justify-center gap-2 rounded-md border border-line bg-surface px-3.5 whitespace-nowrap text-[15px] font-medium hover:bg-track disabled:opacity-50'
const outline = `${outlineBase} text-ink`
const danger = 'inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-critical px-3.5 text-sm font-medium text-surface active:opacity-80 disabled:opacity-60'

function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange(v: boolean): void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`flex h-8 w-[52px] shrink-0 items-center rounded-full border-2 px-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${checked ? 'justify-end border-accent bg-accent' : 'border-muted bg-track'}`}
    >
      <span className={`rounded-full transition-all ${checked ? 'size-6 bg-surface' : 'size-4 bg-muted'}`} />
    </button>
  )
}

/** Which sheet is open: the update sheet (new, or correcting `entry`), or the history. */
type View = { kind: 'update'; entry?: FgtsEntry; back?: boolean } | { kind: 'history' } | null

/** The update and history sheets, opened from the section, the reminder or each other. */
function useFgtsSheets(): [(v: View) => void, ReactNode] {
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
 * Accounts: "FGTS · Fora do total" below the banks. Off: the switch to start
 * (and, if there's a history, that it's kept). On: the balance, its date and
 * change, Histórico and Atualizar saldo; outlined in accent with "Atualize o
 * saldo deste mês" when the month's balance is due. No balance yet: an empty state.
 */
export function FgtsSection() {
  const { fgts, setFgtsTracking, today } = useData()
  const { t } = useI18n()
  const f = t.fgts
  const [open, sheet] = useFgtsSheets()
  const head = useId()
  const latest = fgtsLatest(fgts)
  const due = fgtsDue(fgts, today)
  const previous = sortFgts(fgts.entries)[1]

  return (
    <section aria-labelledby={head} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between px-1 pt-2">
        <h2 id={head} className="text-base leading-[22px] font-medium text-ink">
          {f.section}
        </h2>
        <span className="text-xs leading-4 text-muted">{f.outOfTotal}</span>
      </div>

      {!fgts.tracking ? (
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
        </div>
      ) : (
        <div className={`flex flex-col gap-3 rounded-lg border bg-surface p-4 lg:px-5 ${due && latest ? 'border-accent/60' : 'border-line'}`}>
          <div className="flex items-center gap-3">
            <Mark />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-base leading-[22px] text-ink">{f.section}</span>
              <span className="text-[13px] leading-[18px] text-ink-2">{f.cardSub}</span>
            </span>
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
                <span className="text-[13px] leading-[18px] text-ink-2">{f.balanceOn(formatDay(latest.latest.date))}</span>
                {latest.change !== null && previous && (
                  <span className="text-[13px] leading-[18px] text-ink-2">
                    <span className={`tabular ${latest.change >= 0 ? 'text-income' : ''}`}>{signed(latest.change)}</span> {f.changeSince(formatDay(previous.date))}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 min-[400px]:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                <button type="button" onClick={() => open({ kind: 'history' })} className={outline}>
                  <Icon name="calendar" className="size-[18px]" />
                  {f.history}
                </button>
                <button type="button" onClick={() => open({ kind: 'update' })} className={due ? primary : `${outlineBase} text-accent`}>
                  <Icon name="plus" className="size-[18px]" strokeWidth={2} />
                  {f.update}
                </button>
              </div>
              <p className="flex items-start gap-2.5 rounded-md bg-page px-3 py-2.5 text-[13px] leading-[18px] text-ink-2">
                <Icon name="info" className="mt-px size-4 shrink-0 text-muted" />
                {f.explain}
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1 pt-1 text-center">
              <span aria-hidden className="mb-1 flex size-10 items-center justify-center rounded-full bg-track text-ink-2">
                <Icon name="savings" className="size-5" />
              </span>
              <p className="text-base leading-[22px] text-ink">{f.emptyTitle}</p>
              <p className="text-[13px] leading-[18px] text-ink-2">{f.emptyNote}</p>
              <button type="button" onClick={() => open({ kind: 'update' })} className={`${primary} mt-3 w-full`}>
                <Icon name="plus" className="size-[18px]" strokeWidth={2} />
                {f.update}
              </button>
              <p className="mt-2 text-xs leading-4 text-ink-2">{f.explain}</p>
            </div>
          )}
        </div>
      )}
      {sheet}
    </section>
  )
}

/** Under net worth's tiles, dashed apart from what's added up: "FGTS · saldo em 22 set. · R$ … · Fora do total". */
export function FgtsNetWorthLine() {
  const { fgts } = useData()
  const { t } = useI18n()
  const latest = fgtsLatest(fgts)?.latest
  if (!fgts.tracking || !latest) return null
  return (
    <div className="flex items-center gap-3 rounded-md border border-dashed border-line px-3 py-2.5">
      <Mark size={32} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm leading-5 text-ink">{t.fgts.netWorth.label}</span>
        <span className="truncate text-xs leading-4 text-ink-2">{t.fgts.netWorth.sub(formatDay(latest.date))}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="tabular text-[15px] leading-5 text-ink">{formatMoney(latest.balance)}</span>
        <span className="rounded-full bg-track px-2 py-0.5 text-[11px] leading-[14px] text-ink-2">{t.fgts.outOfTotal}</span>
      </span>
    </div>
  )
}

/** Whether net worth shows the FGTS line (its note then says the FGTS isn't in the total). */
export const showsFgtsLine = (fgts: Fgts) => fgts.tracking && fgts.entries.length > 0

const LATER_KEY = 'trove.fgtsReminderLater'

/**
 * Visão geral, under the sync bar: "Hora de atualizar o saldo do FGTS" while
 * the month's balance is due (src/data/fgts.ts). "Agora não" hides it on this
 * device until the next day; saving the month's balance ends it.
 */
export function FgtsReminder({ className = '' }: { className?: string }) {
  const { fgts, today } = useData()
  const { t } = useI18n()
  const r = t.fgts.reminder
  const [later, setLater] = useState(() => {
    try {
      return localStorage.getItem(LATER_KEY)
    } catch {
      return null
    }
  })
  const [open, sheet] = useFgtsSheets()
  const latest = fgtsLatest(fgts)?.latest
  if (!fgtsDue(fgts, today) || later === today) return sheet
  return (
    <>
      <section role="status" className={`flex flex-col gap-2 rounded-lg border border-accent/40 bg-accent-faint p-3.5 lg:flex-row lg:items-end lg:p-4 ${className}`}>
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Mark size={36} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-base leading-[22px] text-ink">{r.title}</span>
            <span className="text-[13px] leading-[18px] text-ink-2">{latest ? r.last(formatDay(latest.date)) : r.first}</span>
          </span>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setLater(today)
              try {
                localStorage.setItem(LATER_KEY, today)
              } catch {
                // Storage unavailable: hidden until reload.
              }
            }}
            className="h-11 rounded-md px-3 text-sm font-medium text-ink-2 hover:bg-track"
          >
            {r.later}
          </button>
          <button type="button" onClick={() => open({ kind: 'update' })} className={`${primary} h-11 text-sm`}>
            <Icon name="plus" className="size-[18px]" strokeWidth={2} />
            {r.action}
          </button>
        </div>
      </section>
      {sheet}
    </>
  )
}

/**
 * "Atualizar saldo do FGTS", or "Corrigir saldo do FGTS" for an entry: the
 * total (R$, numeric keyboard) and the day of the balance (today by default,
 * never later). Saving waits for the server: the fields lock and the button
 * spins; a failure keeps what was typed. A correction can delete the entry,
 * after confirming in the sheet.
 */
function UpdateSheet({ entry, onClose }: { entry?: FgtsEntry; onClose(): void }) {
  const { saveFgts, today } = useData()
  const { t } = useI18n()
  const s = t.fgts.sheet
  const ids = useId()
  const valueRef = useRef<HTMLInputElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(entry ? moneyInput(entry.balance) : '')
  const [touched, setTouched] = useState(false)
  const [date, setDate] = useState(entry?.date ?? today)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // A new balance starts in the value field (after the sheet's own focus).
  useEffect(() => {
    if (!entry) valueRef.current?.focus()
  }, [entry])

  const cents = parseMoney(text)
  const badValue = cents === null || cents > FGTS_MAX
  const future = date > today
  const showValueError = badValue && (touched || text !== '')
  const dateLabel = date === today ? s.today(formatDayYear(date)) : formatDayYear(date)

  const run = async (e: Parameters<typeof saveFgts>[0]) => {
    setSaving(true)
    setFailed(false)
    try {
      await saveFgts(e)
      onClose()
    } catch {
      setFailed(true)
      setSaving(false)
    }
  }
  const save = () => {
    if (badValue || future || saving) {
      setTouched(true)
      return
    }
    void run({ op: 'saveFgtsBalance', entry: { id: entry?.id ?? newId(), date, balance: cents! } })
  }

  const field = (error: boolean) =>
    `flex h-14 w-full items-center gap-2 rounded-md border px-3.5 text-left text-[18px] ${
      error ? 'border-2 border-critical px-[13px]' : 'border-line focus-within:border-2 focus-within:border-accent focus-within:px-[13px]'
    } ${saving ? 'bg-page text-ink-2' : 'bg-page text-ink'}`

  const footer = (
    <div className="-mx-4 mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 border-t border-line px-4 pt-3 md:-mx-6 md:px-6">
      <button type="button" onClick={onClose} disabled={saving || confirming} className={outline}>
        {s.cancel}
      </button>
      <button type="submit" form={`${ids}-form`} disabled={badValue || future || saving || confirming} aria-busy={saving} className={primary}>
        {saving && <Icon name="sync" className="size-[18px] motion-safe:animate-spin" strokeWidth={2} />}
        {saving ? s.saving : entry ? s.saveCorrection : s.save}
      </button>
    </div>
  )

  return (
    <Sheet title={entry ? s.editTitle : s.title} subtitle={s.subtitle} onClose={saving ? () => {} : onClose} footer={footer} width="md:max-w-[520px]">
      <form
        id={`${ids}-form`}
        className="mt-3 flex flex-col"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        {failed && (
          <p role="alert" className="mb-3 flex items-start gap-2 rounded-md border border-critical/30 bg-critical-soft px-3 py-2.5 text-[13px] leading-[18px] text-ink">
            <Icon name="alert" className="mt-px size-4 shrink-0 text-critical" />
            {s.failed}
          </p>
        )}
        {entry && (
          <p className="mb-3 flex items-center gap-2.5 rounded-md bg-page px-3 py-2.5 text-[13px] leading-[18px] text-ink-2">
            <Icon name="edit" className="size-4 shrink-0" />
            {s.correcting(formatDayYear(entry.date))}
          </p>
        )}

        <label htmlFor={`${ids}-value`} className="mb-1.5 text-[13px] leading-[18px] text-ink-2">
          {s.balanceLabel}
        </label>
        <span className={field(showValueError)}>
          <span aria-hidden className="text-[16px] text-muted">
            R$
          </span>
          <input
            ref={valueRef}
            id={`${ids}-value`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => setTouched(true)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            readOnly={saving}
            aria-invalid={showValueError || undefined}
            aria-describedby={`${ids}-value-note`}
            className={`tabular min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted ${saving ? 'text-ink-2' : 'text-ink'}`}
          />
        </span>
        {showValueError ? (
          <span id={`${ids}-value-note`} className="mt-1.5 flex items-center gap-1.5 text-xs leading-4 text-critical">
            <Icon name="alert" className="size-3.5 shrink-0" />
            {s.balanceInvalid}
          </span>
        ) : (
          <span id={`${ids}-value-note`} className="mt-1.5 text-xs leading-4 text-muted">
            {s.balanceHint}
          </span>
        )}

        <label htmlFor={`${ids}-date`} className="mt-4 mb-1.5 text-[13px] leading-[18px] text-ink-2">
          {s.dateLabel}
        </label>
        {/* The native date picker, behind the formatted day. */}
        <span className={`relative ${field(future)}`}>
          <span className="tabular flex-1 text-[16px]">{dateLabel}</span>
          <Icon name="calendar" className="size-5 text-ink-2" />
          <input
            ref={dateRef}
            id={`${ids}-date`}
            type="date"
            value={date}
            max={today}
            disabled={saving}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            onClick={() => {
              try {
                dateRef.current?.showPicker()
              } catch {
                // Not supported: the field opens its own picker.
              }
            }}
            aria-invalid={future || undefined}
            aria-describedby={`${ids}-date-note`}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </span>
        {future ? (
          <span id={`${ids}-date-note`} className="mt-1.5 flex items-center gap-1.5 text-xs leading-4 text-critical">
            <Icon name="alert" className="size-3.5 shrink-0" />
            {s.dateFuture}
          </span>
        ) : (
          <span id={`${ids}-date-note`} className="mt-1.5 text-xs leading-4 text-muted">
            {s.dateHint}
          </span>
        )}

        {entry &&
          (confirming ? (
            <div role="alert" className="mt-4 flex flex-col gap-3 rounded-md border border-critical/30 bg-critical-soft p-3">
              <p className="text-sm leading-5 text-ink">{s.deleteConfirm(formatDayYear(entry.date))}</p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setConfirming(false)} disabled={saving} className="h-10 rounded-md border border-line bg-surface px-3.5 text-sm font-medium text-ink">
                  {s.cancel}
                </button>
                <button type="button" onClick={() => void run({ op: 'deleteFgtsBalance', id: entry.id })} disabled={saving} className={danger}>
                  <Icon name="trash" className="size-4" />
                  {s.deleteYes}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={saving}
              className="mt-4 inline-flex h-10 items-center gap-2 self-start rounded-md border border-critical/40 px-3.5 text-sm font-medium text-critical hover:bg-critical-soft"
            >
              <Icon name="trash" className="size-4" />
              {s.delete}
            </button>
          ))}
      </form>
    </Sheet>
  )
}

/**
 * "Histórico do FGTS": the balance over time (a simple area chart) and every
 * balance, newest first, with its change ("saque" when it went down); a row
 * opens its correction. "Apagar histórico" asks first, in the sheet.
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
      <button type="button" onClick={onClose} className={outline}>
        {l.close}
      </button>
      <button type="button" onClick={onUpdate} className={primary}>
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
          <button type="button" onClick={onUpdate} className={`${primary} mt-3 h-11 text-sm`}>
            <Icon name="plus" className="size-[18px]" strokeWidth={2} />
            {t.fgts.update}
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col">
          {entries.length > 1 && <Chart entries={entries} />}
          <h3 className="label-caps mt-4 mb-1">{l.label}</h3>
          <ul className="flex flex-col divide-y divide-line">
            {entries.map((e, i) => {
              const before = entries[i + 1]
              const change = before ? e.balance - before.balance : null
              return (
                <li key={e.id}>
                  <button type="button" onClick={() => onEdit(e)} aria-label={l.edit(formatDayYear(e.date))} className="flex min-h-[60px] w-full items-center gap-3 py-2 text-left">
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-2 text-base leading-[22px] text-ink">
                        {formatDayYear(e.date)}
                        {i === 0 && <span className="rounded-full bg-track px-2 py-0.5 text-[11px] leading-[14px] text-ink-2">{l.latest}</span>}
                      </span>
                      <span className={`tabular text-[13px] leading-[18px] ${change === null ? 'text-muted' : change >= 0 ? 'text-income' : 'text-ink-2'}`}>
                        {change === null ? l.first : change >= 0 ? signed(change) : `${signed(change)} · ${l.withdrawal}`}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-base text-ink">{formatMoney(e.balance)}</span>
                    <Icon name="chevronRight" className="size-[18px] shrink-0 text-ink-2" />
                  </button>
                </li>
              )
            })}
          </ul>
          {failed && (
            <p role="alert" className="mt-2 flex items-start gap-2 text-[13px] leading-[18px] text-critical">
              <Icon name="alert" className="mt-px size-4 shrink-0" />
              {t.fgts.sheet.failed}
            </p>
          )}
          {confirming ? (
            <div role="alert" className="mt-3 flex flex-col gap-3 rounded-md border border-critical/30 bg-critical-soft p-3">
              <p className="text-sm leading-5 text-ink">{l.clearConfirm}</p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="h-10 rounded-md border border-line bg-surface px-3.5 text-sm font-medium text-ink">
                  {t.fgts.sheet.cancel}
                </button>
                <button type="button" onClick={() => void clear()} disabled={busy} aria-busy={busy} className={danger}>
                  <Icon name={busy ? 'sync' : 'trash'} className={`size-4 ${busy ? 'motion-safe:animate-spin' : ''}`} />
                  {l.clearYes}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="mt-2 -ml-2 inline-flex h-11 items-center gap-2 self-start rounded-md px-2 text-sm font-medium text-critical hover:bg-critical-soft">
              <Icon name="trash" className="size-4" />
              {l.clear}
            </button>
          )}
        </div>
      )}
    </Sheet>
  )
}

const CHART_H = 76

/** "Saldo ao longo do tempo": the balances by date, filled below, the latest marked. */
function Chart({ entries }: { entries: FgtsEntry[] }) {
  const { t } = useI18n()
  const l = t.fgts.list
  const [ref, width] = useWidth<HTMLDivElement>()
  const points = [...entries].reverse() // oldest first
  const first = points[0]
  const last = points[points.length - 1]
  const x0 = Date.parse(first.date)
  const span = Math.max(1, Date.parse(last.date) - x0)
  const min = Math.min(...points.map((p) => p.balance))
  const max = Math.max(...points.map((p) => p.balance))
  const range = Math.max(1, max - min)
  const pad = 6
  const xy = points.map((p) => [pad + ((Date.parse(p.date) - x0) / span) * Math.max(0, width - 2 * pad), pad + (1 - (p.balance - min) / range) * (CHART_H - 2 * pad)] as const)
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)},${CHART_H} L${xy[0][0].toFixed(1)},${CHART_H} Z`
  const [lx, ly] = xy[xy.length - 1]
  return (
    <div className="flex flex-col gap-1 rounded-md bg-page px-3 pt-2.5 pb-2">
      <div className="flex justify-between gap-3 text-xs leading-4 text-ink-2">
        <span>{l.chartTitle}</span>
        <span className="tabular">{isMoneyMasked() ? l.chartCount(points.length) : l.chartSince(signed(last.balance - first.balance), formatMonthShort(first.date))}</span>
      </div>
      <div ref={ref} data-chart className="relative" style={{ height: CHART_H }}>
        {width > 0 && (
          <svg width={width} height={CHART_H} aria-hidden className="block">
            <path d={area} fill="color-mix(in srgb, var(--cat-teal) 16%, transparent)" />
            <path d={line} fill="none" stroke="var(--cat-teal)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={lx} cy={ly} r={4} fill="var(--cat-teal)" />
          </svg>
        )}
      </div>
      <div className="flex justify-between text-[11px] leading-[14px] text-muted" aria-hidden>
        <span>{formatMonthShort(first.date)}</span>
        <span>{formatMonthShort(last.date)}</span>
      </div>
    </div>
  )
}
