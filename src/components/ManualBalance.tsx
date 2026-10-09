import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { FgtsEntry } from '../data/fgts'
import { FGTS_MAX } from '../data/fgts'
import { newId } from '../data/edits'
import { useData } from '../state'
import { useI18n } from '../i18n/I18nProvider'
import { formatDayYear, formatMonthShort } from '../lib/dates'
import { formatMoney, isMoneyMasked, moneyInput, parseMoney, signOf } from '../lib/money'
import { Icon, type IconName } from './Icon'
import { Sheet, useWidth } from './insights/parts'

// Pieces shared by the balances typed in by hand (FGTS and previdência
// privada): the icon disc, the switch, the balance and date fields, the update
// and correction sheet, the chart and the history list. Every amount goes
// through formatMoney, so privacy mode masks it; the chart is a [data-chart].

/** A balance on a day. */
export type BalanceEntry = FgtsEntry

/** The category token each kind is drawn in. */
export type Tint = 'teal' | 'indigo'

/** An icon on a disc tinted with a category colour (as category badges are). */
export function Disc({ icon, tint, size = 40 }: { icon: IconName; tint: Tint; size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, background: `color-mix(in srgb, var(--cat-${tint}) 16%, transparent)`, color: `color-mix(in srgb, var(--cat-${tint}) 72%, var(--ink))` }}
    >
      <Icon name={icon} className={size >= 40 ? 'size-5' : 'size-[18px]'} />
    </span>
  )
}

/** "+R$ 1.210,40" / "−R$ 1.755,88" (nothing to sign while values are hidden). */
export const signed = (cents: number) => `${signOf(cents)}${formatMoney(Math.abs(cents))}`

export const btn = {
  primary: 'inline-flex h-12 items-center justify-center gap-2 rounded-md bg-accent px-3.5 whitespace-nowrap text-[15px] font-medium text-surface active:opacity-80 disabled:opacity-40',
  outlineBase: 'inline-flex h-12 items-center justify-center gap-2 rounded-md border border-line bg-surface px-3.5 whitespace-nowrap text-[15px] font-medium hover:bg-track disabled:opacity-50',
  outline: 'inline-flex h-12 items-center justify-center gap-2 rounded-md border border-line bg-surface px-3.5 whitespace-nowrap text-[15px] font-medium text-ink hover:bg-track disabled:opacity-50',
  danger: 'inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-critical px-3.5 text-sm font-medium text-surface active:opacity-80 disabled:opacity-60',
  dangerOutline: 'inline-flex h-10 items-center gap-2 self-start rounded-md border border-critical/40 px-3.5 text-sm font-medium text-critical hover:bg-critical-soft',
  small: 'h-10 rounded-md border border-line bg-surface px-3.5 text-sm font-medium text-ink',
}

export function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange(v: boolean): void }) {
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

/** "Fora do total" and other small grey pills. */
export function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-track px-2 py-0.5 text-[11px] leading-[14px] whitespace-nowrap text-ink-2">{children}</span>
}

/** An inline "Are you sure?" box: the question, Cancelar and the destructive button. */
export function Confirm({ text, yes, busy, onYes, onNo }: { text: string; yes: string; busy: boolean; onYes(): void; onNo(): void }) {
  const { t } = useI18n()
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-md border border-critical/30 bg-critical-soft p-3">
      <p className="text-sm leading-5 text-ink">{text}</p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onNo} disabled={busy} className={btn.small}>
          {t.balance.cancel}
        </button>
        <button type="button" onClick={onYes} disabled={busy} aria-busy={busy} className={btn.danger}>
          <Icon name={busy ? 'sync' : 'trash'} className={`size-4 ${busy ? 'motion-safe:animate-spin' : ''}`} />
          {yes}
        </button>
      </div>
    </div>
  )
}

export function FailedNote({ text }: { text: string }) {
  return (
    <p role="alert" className="mb-3 flex items-start gap-2 rounded-md border border-critical/30 bg-critical-soft px-3 py-2.5 text-[13px] leading-[18px] text-ink">
      <Icon name="alert" className="mt-px size-4 shrink-0 text-critical" />
      {text}
    </p>
  )
}

/** A field's look: page-coloured, 56px, accent when focused, critical on an error. */
export const fieldClass = (error: boolean, disabled: boolean) =>
  `flex h-14 w-full items-center gap-2 rounded-md border px-3.5 text-left text-[18px] ${
    error ? 'border-2 border-critical px-[13px]' : 'border-line focus-within:border-2 focus-within:border-accent focus-within:px-[13px]'
  } ${disabled ? 'bg-page text-ink-2' : 'bg-page text-ink'}`

export function FieldNote({ id, error, children }: { id: string; error?: string | false; children: ReactNode }) {
  return error ? (
    <span id={id} className="mt-1.5 flex items-center gap-1.5 text-xs leading-4 text-critical">
      <Icon name="alert" className="size-3.5 shrink-0" />
      {error}
    </span>
  ) : (
    <span id={id} className="mt-1.5 text-xs leading-4 text-muted">
      {children}
    </span>
  )
}

/**
 * The balance (R$, numeric keyboard) and the day it refers to (today by
 * default, never later). `optional`: an empty balance is fine (nothing is
 * saved). `focus`: the balance field takes the focus when shown.
 */
export function useBalanceFields({ entry, label, hint, optional = false, disabled, focus }: { entry?: BalanceEntry; label: string; hint: string; optional?: boolean; disabled: boolean; focus: boolean }) {
  const { today } = useData()
  const { t } = useI18n()
  const b = t.balance
  const ids = useId()
  const valueRef = useRef<HTMLInputElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(entry ? moneyInput(entry.balance) : '')
  const [touched, setTouched] = useState(false)
  const [date, setDate] = useState(entry?.date ?? today)

  // After the sheet's own focus (its effect runs first).
  useEffect(() => {
    if (focus) valueRef.current?.focus()
  }, [focus])

  const empty = text.trim() === ''
  const cents = parseMoney(text)
  const badValue = optional && empty ? false : cents === null || cents > FGTS_MAX
  const future = date > today
  const showValueError = badValue && (touched || !empty)
  const dateLabel = date === today ? b.today(formatDayYear(date)) : formatDayYear(date)

  const node = (
    <>
      <label htmlFor={`${ids}-value`} className="mb-1.5 text-[13px] leading-[18px] text-ink-2">
        {label}
      </label>
      <span className={fieldClass(showValueError, disabled)}>
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
          readOnly={disabled}
          aria-invalid={showValueError || undefined}
          aria-describedby={`${ids}-value-note`}
          className={`tabular min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted ${disabled ? 'text-ink-2' : 'text-ink'}`}
        />
      </span>
      <FieldNote id={`${ids}-value-note`} error={showValueError && b.balanceInvalid}>
        {hint}
      </FieldNote>

      <label htmlFor={`${ids}-date`} className="mt-4 mb-1.5 text-[13px] leading-[18px] text-ink-2">
        {b.dateLabel}
      </label>
      {/* The native date picker, behind the formatted day. */}
      <span className={`relative ${fieldClass(future, disabled)}`}>
        <span className="tabular flex-1 text-[16px]">{dateLabel}</span>
        <Icon name="calendar" className="size-5 text-ink-2" />
        <input
          ref={dateRef}
          id={`${ids}-date`}
          type="date"
          value={date}
          max={today}
          disabled={disabled}
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
      <FieldNote id={`${ids}-date-note`} error={future && b.dateFuture}>
        {b.dateHint}
      </FieldNote>
    </>
  )
  return {
    node,
    invalid: badValue || future,
    /** The balance to save: null when an optional one was left empty. */
    value: (): BalanceEntry | null => (empty && optional ? null : { id: entry?.id ?? newId(), date, balance: cents! }),
    touch: () => setTouched(true),
  }
}

/**
 * Updating a balance, or correcting `entry`: the fields above. Saving waits
 * for the server: the fields lock and the button spins; a failure keeps what
 * was typed. A correction can delete the entry, after confirming in the sheet.
 */
export function BalanceSheet({
  title,
  subtitle,
  label,
  hint,
  entry,
  onSave,
  onDelete,
  onClose,
}: {
  title: string
  subtitle: string
  label: string
  hint: string
  entry?: BalanceEntry
  onSave(entry: BalanceEntry): Promise<void>
  onDelete(id: string): Promise<void>
  onClose(): void
}) {
  const { t } = useI18n()
  const b = t.balance
  const ids = useId()
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const fields = useBalanceFields({ entry, label, hint, disabled: saving, focus: !entry })

  const run = async (action: () => Promise<void>) => {
    setSaving(true)
    setFailed(false)
    try {
      await action()
      onClose()
    } catch {
      setFailed(true)
      setSaving(false)
    }
  }
  const save = () => {
    const value = fields.value()
    if (fields.invalid || saving || !value) return fields.touch()
    void run(() => onSave(value))
  }

  const footer = (
    <div className="-mx-4 mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 border-t border-line px-4 pt-3 md:-mx-6 md:px-6">
      <button type="button" onClick={onClose} disabled={saving || confirming} className={btn.outline}>
        {b.cancel}
      </button>
      <button type="submit" form={`${ids}-form`} disabled={fields.invalid || saving || confirming} aria-busy={saving} className={btn.primary}>
        {saving && <Icon name="sync" className="size-[18px] motion-safe:animate-spin" strokeWidth={2} />}
        {saving ? b.saving : entry ? b.saveCorrection : b.save}
      </button>
    </div>
  )

  return (
    <Sheet title={title} subtitle={subtitle} onClose={saving ? () => {} : onClose} footer={footer} width="md:max-w-[520px]">
      <form
        id={`${ids}-form`}
        className="mt-3 flex flex-col"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        {failed && <FailedNote text={b.failed} />}
        {entry && (
          <p className="mb-3 flex items-center gap-2.5 rounded-md bg-page px-3 py-2.5 text-[13px] leading-[18px] text-ink-2">
            <Icon name="edit" className="size-4 shrink-0" />
            {b.correcting(formatDayYear(entry.date))}
          </p>
        )}
        {fields.node}
        {entry &&
          (confirming ? (
            <div className="mt-4">
              <Confirm text={b.deleteConfirm(formatDayYear(entry.date))} yes={b.deleteYes} busy={saving} onYes={() => void run(() => onDelete(entry.id))} onNo={() => setConfirming(false)} />
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} disabled={saving} className={`mt-4 ${btn.dangerOutline}`}>
              <Icon name="trash" className="size-4" />
              {b.delete}
            </button>
          ))}
      </form>
    </Sheet>
  )
}

/** Every balance, newest first, with its change ("saque" when it went down); a row opens its correction. */
export function BalanceList({ entries, onEdit }: { entries: BalanceEntry[]; onEdit(entry: BalanceEntry): void }) {
  const { t } = useI18n()
  const b = t.balance
  return (
    <>
      <h3 className="label-caps mt-4 mb-1">{b.listLabel}</h3>
      <ul className="flex flex-col divide-y divide-line">
        {entries.map((e, i) => {
          const before = entries[i + 1]
          const change = before ? e.balance - before.balance : null
          return (
            <li key={e.id}>
              <button type="button" onClick={() => onEdit(e)} aria-label={b.edit(formatDayYear(e.date))} className="flex min-h-[60px] w-full items-center gap-3 py-2 text-left">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2 text-base leading-[22px] text-ink">
                    {formatDayYear(e.date)}
                    {i === 0 && <Pill>{b.latest}</Pill>}
                  </span>
                  <span className={`tabular text-[13px] leading-[18px] ${change === null ? 'text-muted' : change >= 0 ? 'text-income' : 'text-ink-2'}`}>
                    {change === null ? b.first : change >= 0 ? signed(change) : `${signed(change)} · ${b.withdrawal}`}
                  </span>
                </span>
                <span className="tabular shrink-0 text-base text-ink">{formatMoney(e.balance)}</span>
                <Icon name="chevronRight" className="size-[18px] shrink-0 text-ink-2" />
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

const CHART_H = 76

/** "Saldo ao longo do tempo": the balances (newest first) by date, filled below, the latest marked. */
export function BalanceChart({ entries, tint }: { entries: BalanceEntry[]; tint: Tint }) {
  const { t } = useI18n()
  const b = t.balance
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
  const color = `var(--cat-${tint})`
  return (
    <div className="flex flex-col gap-1 rounded-md bg-page px-3 pt-2.5 pb-2">
      <div className="flex justify-between gap-3 text-xs leading-4 text-ink-2">
        <span>{b.chartTitle}</span>
        <span className="tabular">{isMoneyMasked() ? b.chartCount(points.length) : b.chartSince(signed(last.balance - first.balance), formatMonthShort(first.date))}</span>
      </div>
      <div ref={ref} data-chart className="relative" style={{ height: CHART_H }}>
        {width > 0 && (
          <svg width={width} height={CHART_H} aria-hidden className="block">
            <path d={area} fill={`color-mix(in srgb, ${color} 16%, transparent)`} />
            <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={lx} cy={ly} r={4} fill={color} />
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

/** A dashed line under net worth's tiles, apart from what's added up: icon, name, note, amount, "Fora do total". */
export function OutOfTotalLine({ icon, tint, label, sub, amount }: { icon: IconName; tint: Tint; label: string; sub: string; amount: number }) {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-3 rounded-md border border-dashed border-line px-3 py-2.5">
      <Disc icon={icon} tint={tint} size={32} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm leading-5 text-ink">{label}</span>
        <span className="text-xs leading-4 text-ink-2">{sub}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="tabular text-[15px] leading-5 text-ink">{formatMoney(amount)}</span>
        <Pill>{t.balance.outOfTotal}</Pill>
      </span>
    </div>
  )
}
