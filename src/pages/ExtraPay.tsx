import { useEffect, useId, useRef, useState } from 'react'
import { useData } from '../state'
import { useI18n } from '../i18n/I18nProvider'
import { Card } from '../components/ui'
import { Icon } from '../components/Icon'
import { DetailHeader, Sheet, SwitchRow } from '../components/insights/parts'
import { Confirm, FailedNote, FieldNote, btn, fieldClass } from '../components/ManualBalance'
import { monthTitle, useExtraPayPlan, usePaymentName } from '../components/ExtraPay'
import { newId } from '../data/edits'
import { FIRST_PART_MONTHS, SALARY_MAX, SOLD_DAYS, VACATION_DAYS, VACATIONS_MAX, vacationEnd, vacationPay, vacationPayday } from '../data/extraPay'
import type { ExtraPay as Settings, Vacation } from '../data/types'
import { addDays, daysInMonth, formatDay, formatDayYear } from '../lib/dates'
import { formatMoney, moneyInput, parseMoney } from '../lib/money'

/**
 * "13º e férias" (CLT): the switch, then, when on, the payments of the next
 * 12 months, the planned vacations and how it's calculated. Every change is
 * saved at once, in the database (the same on every device).
 */
export function ExtraPay() {
  const { t } = useI18n()
  const x = t.extraPay
  const { extraPay, saveExtraPay } = useData()
  const [failed, setFailed] = useState(false)
  const save = async (next: Settings) => {
    setFailed(false)
    try {
      await saveExtraPay(next)
    } catch {
      setFailed(true)
    }
  }
  return (
    <>
      <DetailHeader title={x.title} subtitle={x.sub} />
      {failed && <FailedNote text={x.failed} />}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
        <div className="flex flex-col gap-3 lg:gap-5">
          <Card className="flex flex-col !py-1">
            <SwitchRow label={x.switchLabel} note={x.switchNote} checked={extraPay.enabled} onChange={(enabled) => save({ ...extraPay, enabled })} />
          </Card>
          {extraPay.enabled ? <NextCard /> : <p className="px-1 text-[13px] leading-[18px] text-muted">{x.offText}</p>}
        </div>
        {extraPay.enabled && (
          <div className="flex flex-col gap-3 lg:gap-5">
            <VacationsCard save={save} />
            <HowCard save={save} />
          </div>
        )}
      </div>
    </>
  )
}

/** The next 12 months: each payment and each smaller salary, by date, and what comes in on top. */
function NextCard() {
  const { t } = useI18n()
  const x = t.extraPay
  const { payments, cuts, salary, total } = useExtraPayPlan()
  const name = usePaymentName()
  const rows = [
    ...payments.map((p) => ({
      key: `${p.kind}-${p.date}`,
      date: p.date,
      name: name(p),
      meta: p.kind === 'thirteenth' ? x.thirteenthMeta(p.part) : x.vacationMeta(p.days, p.sold),
      amount: p.amount,
    })),
    ...cuts.map((c) => ({ key: `cut-${c.month}`, date: `${c.month}-${daysInMonth(c.month)}`, name: x.salaryCut(monthTitle(c.month)), meta: x.salaryCutMeta(c.days), amount: -c.amount })),
  ].sort((a, b) => a.date.localeCompare(b.date))
  return (
    <Card className="flex flex-col !pb-1">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base leading-[22px] font-medium text-ink">{x.nextTitle}</h2>
        <p className="text-[13px] leading-[18px] text-muted">{x.nextSub}</p>
      </div>
      {!salary ? (
        <p className="py-3 text-sm leading-5 text-ink-2">{t.extraPay.card.noSalary}</p>
      ) : rows.length === 0 ? (
        <p className="py-3 text-sm leading-5 text-ink-2">{x.nextNone}</p>
      ) : (
        <>
          <ul className="mt-2">
            {rows.map((r, i) => {
              const cut = r.key.startsWith('cut-')
              const [day, month] = formatDay(r.date).split(' ')
              return (
                <li key={r.key} className={`flex min-h-[60px] items-center gap-3 py-1.5 ${i ? 'border-t border-line' : ''}`}>
                  <span className="flex w-10 shrink-0 flex-col items-center leading-none">
                    {cut ? <Icon name="calendar" className="size-5 text-ink-2" /> : <span className="tabular text-base font-bold text-ink">{day}</span>}
                    <span className="text-[11px] text-muted">{month}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="text-sm leading-[19px] font-medium text-ink">{r.name}</span>
                    <span className="text-xs leading-4 text-muted">{r.meta}</span>
                  </span>
                  <span className={`tabular text-sm font-medium whitespace-nowrap ${r.amount > 0 ? 'text-income' : 'text-ink'}`}>{formatMoney(r.amount, 'BRL', { signed: true })}</span>
                </li>
              )
            })}
          </ul>
          <p className="tabular border-t border-line py-3 text-[13px] leading-[18px] text-ink-2">{x.total(formatMoney(total - cuts.reduce((s, c) => s + c.amount, 0)))}</p>
        </>
      )}
    </Card>
  )
}

/** The planned vacations, earliest first; each opens its sheet. */
function VacationsCard({ save }: { save(next: Settings): Promise<void> }) {
  const { t } = useI18n()
  const x = t.extraPay
  const { extraPay, today } = useData()
  const [editing, setEditing] = useState<Vacation | 'new' | null>(null)
  return (
    <Card className="flex flex-col gap-1">
      <h2 className="text-base leading-[22px] font-medium text-ink">{x.vacationsTitle}</h2>
      {extraPay.vacations.length === 0 ? (
        <p className="py-2 text-sm leading-5 text-ink-2">{x.vacationsNone}</p>
      ) : (
        <ul>
          {extraPay.vacations.map((v, i) => {
            const range = x.vacationRange(formatDayYear(v.start), formatDayYear(vacationEnd(v)))
            const past = vacationEnd(v) < today
            return (
              <li key={v.id} className={i ? 'border-t border-line' : ''}>
                <button type="button" onClick={() => setEditing(v)} aria-label={x.edit(range)} className="flex min-h-14 w-full items-center gap-3 py-1.5 text-left">
                  <Icon name="calendar" className="size-5 shrink-0 text-ink-2" />
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className={`text-sm leading-[19px] font-medium ${past ? 'text-muted' : 'text-ink'}`}>{range}</span>
                    <span className="text-xs leading-4 text-muted">{past ? x.vacationPast : x.vacationDays(v.days, v.sold)}</span>
                  </span>
                  <Icon name="chevronRight" className="size-5 shrink-0 text-ink-2" strokeWidth={2} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {extraPay.vacations.length < VACATIONS_MAX && (
        <button type="button" onClick={() => setEditing('new')} className={`${btn.outline} mt-1 self-start !text-accent`}>
          <Icon name="plus" className="size-[18px]" />
          {x.add}
        </button>
      )}
      {editing && (
        <VacationSheet
          vacation={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (v) => {
            await save({ ...extraPay, vacations: [...extraPay.vacations.filter((o) => o.id !== v.id), v].sort((a, b) => a.start.localeCompare(b.start)) })
            setEditing(null)
          }}
          onRemove={async (id) => {
            await save({ ...extraPay, vacations: extraPay.vacations.filter((o) => o.id !== id) })
            setEditing(null)
          }}
        />
      )}
    </Card>
  )
}

/** The salary the estimates use, and when the 13º's 1st part comes; each a row that opens its sheet. */
function HowCard({ save }: { save(next: Settings): Promise<void> }) {
  const { t } = useI18n()
  const x = t.extraPay
  const { extraPay } = useData()
  const { detected } = useExtraPayPlan()
  const [sheet, setSheet] = useState<'salary' | 'firstPart' | null>(null)
  const salaryValue = extraPay.salary ? x.salarySet(formatMoney(extraPay.salary)) : detected ? x.salaryDetected(formatMoney(detected)) : x.salaryMissing
  const firstPart = x.firstPartValue(extraPay.firstPart === 'vacation' ? null : monthTitle(`2026-${String(extraPay.firstPart).padStart(2, '0')}`))
  const row = (label: string, value: string, open: () => void, divider = false) => (
    <button type="button" onClick={open} aria-haspopup="dialog" className={`flex min-h-16 w-full items-center gap-3 py-2 text-left ${divider ? 'border-t border-line' : ''}`}>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm leading-[19px] font-medium text-ink">{label}</span>
        <span className={`tabular text-xs leading-4 ${!extraPay.salary && !detected && label === x.salaryLabel ? 'text-critical' : 'text-muted'}`}>{value}</span>
      </span>
      <Icon name="chevronRight" className="size-5 shrink-0 text-ink-2" strokeWidth={2} />
    </button>
  )
  return (
    <Card className="flex flex-col">
      <h2 className="mb-1 text-base leading-[22px] font-medium text-ink">{x.howTitle}</h2>
      {row(x.salaryLabel, salaryValue, () => setSheet('salary'))}
      {row(x.firstPartLabel, firstPart, () => setSheet('firstPart'), true)}
      <p className="mt-2 flex items-start gap-2.5 rounded-md bg-page px-3 py-2.5 text-[13px] leading-[18px] text-ink-2">
        <Icon name="info" className="mt-px size-4 shrink-0" />
        {x.note}
      </p>
      {sheet === 'salary' && (
        <SalarySheet
          value={extraPay.salary}
          detected={detected}
          onClose={() => setSheet(null)}
          onSave={async (salary) => {
            await save({ ...extraPay, salary })
            setSheet(null)
          }}
        />
      )}
      {sheet === 'firstPart' && (
        <FirstPartSheet
          value={extraPay.firstPart}
          onClose={() => setSheet(null)}
          onApply={async (firstPart) => {
            await save({ ...extraPay, firstPart })
            setSheet(null)
          }}
        />
      )}
    </Card>
  )
}

/** The net monthly salary: typed in, or back to the forecast's average. */
function SalarySheet({ value, detected, onClose, onSave }: { value: number | null; detected: number | null; onClose(): void; onSave(v: number | null): Promise<void> }) {
  const { t } = useI18n()
  const s = t.extraPay.salarySheet
  const ids = useId()
  const [text, setText] = useState(() => moneyInput(value ?? detected ?? 0))
  const [touched, setTouched] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.select(), [])
  const cents = parseMoney(text)
  const invalid = cents === null || cents <= 0 || cents > SALARY_MAX
  return (
    <Sheet
      title={s.title}
      subtitle={s.sub}
      onClose={onClose}
      footer={
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className={`${btn.outline} !text-accent`}>
            {s.cancel}
          </button>
          <button type="button" disabled={invalid} onClick={() => onSave(cents)} className={btn.primary}>
            {s.save}
          </button>
        </div>
      }
    >
      <label htmlFor={`${ids}-salary`} className="mt-3 mb-1.5 text-[13px] leading-[18px] font-medium text-ink-2">
        {s.field}
      </label>
      <div className={fieldClass(touched && invalid, false)}>
        <span className="text-ink-2">R$</span>
        <input
          ref={ref}
          id={`${ids}-salary`}
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={(touched && invalid) || undefined}
          aria-describedby={`${ids}-note`}
          className="tabular min-w-0 flex-1 bg-transparent outline-none"
        />
      </div>
      <FieldNote id={`${ids}-note`} error={touched && invalid && s.invalid}>
        {s.hint(detected ? formatMoney(detected) : null)}
      </FieldNote>
      {value !== null && detected && (
        <button type="button" onClick={() => onSave(null)} className="mt-2 -ml-2 inline-flex h-11 items-center gap-1.5 self-start rounded-sm px-2 text-sm font-medium text-accent hover:bg-accent-faint">
          <Icon name="undo" className="size-4" />
          {s.useDetected}
        </button>
      )}
    </Sheet>
  )
}

/** When the 13º's 1st part comes: with the vacation pay, or by the 30th of a month from February to November. */
function FirstPartSheet({ value, onClose, onApply }: { value: Settings['firstPart']; onClose(): void; onApply(v: Settings['firstPart']): Promise<void> }) {
  const { t } = useI18n()
  const s = t.extraPay.firstPartSheet
  const [draft, setDraft] = useState(value)
  const options: { v: Settings['firstPart']; label: string; note?: string }[] = [
    ...[...FIRST_PART_MONTHS].reverse().map((m) => ({ v: m as Settings['firstPart'], label: s.byDay(monthTitle(`2026-${String(m).padStart(2, '0')}`)) })),
    { v: 'vacation', label: s.withVacation, note: s.withVacationNote },
  ]
  return (
    <Sheet
      title={s.title}
      subtitle={s.sub}
      onClose={onClose}
      footer={
        <button type="button" onClick={() => onApply(draft)} disabled={draft === value} className={`${btn.primary} mt-3`}>
          {s.apply}
        </button>
      }
    >
      <div role="radiogroup" aria-label={s.title} className="mt-2 flex flex-col divide-y divide-line">
        {options.map((o) => {
          const on = o.v === draft
          return (
            <button key={String(o.v)} type="button" role="radio" aria-checked={on} onClick={() => setDraft(o.v)} className="flex min-h-[52px] w-full items-center gap-3.5 py-1.5 text-left">
              <span aria-hidden className={`flex size-[22px] shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-accent' : 'border-muted'}`}>
                {on && <span className="size-2.5 rounded-full bg-accent" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] leading-5 text-ink">{o.label}</span>
                {o.note && <span className="text-xs leading-4 text-muted">{o.note}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}

/** A vacation period: the first day off, the days off (5–30, up to 20 when selling 10), selling 10 days, and what it pays. */
function VacationSheet({ vacation, onClose, onSave, onRemove }: { vacation: Vacation | null; onClose(): void; onSave(v: Vacation): Promise<void>; onRemove(id: string): Promise<void> }) {
  const { t } = useI18n()
  const s = t.extraPay.vacationSheet
  const ids = useId()
  const { today } = useData()
  const { salary } = useExtraPayPlan()
  const [start, setStart] = useState(vacation?.start ?? addDays(today, 30))
  const [days, setDays] = useState(vacation?.days ?? 30)
  const [sold, setSold] = useState(vacation?.sold ?? false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const maxDays = sold ? VACATION_DAYS.max - SOLD_DAYS : VACATION_DAYS.max
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(start)
  const draft: Vacation = { id: vacation?.id ?? newId(), start, days: Math.min(days, maxDays), sold }
  const run = async (f: () => Promise<void>) => {
    setBusy(true)
    try {
      await f()
    } finally {
      setBusy(false)
    }
  }
  const stepper = (label: string, icon: 'minus' | 'plus', disabled: boolean, by: number) => (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={() => setDays((d) => Math.min(maxDays, Math.max(VACATION_DAYS.min, d + by)))}
      className="flex size-12 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink hover:bg-track disabled:opacity-40"
    >
      <Icon name={icon} className="size-5" strokeWidth={2} />
    </button>
  )
  return (
    <Sheet
      title={vacation ? s.editTitle : s.addTitle}
      onClose={onClose}
      footer={
        <div className="mt-4 flex flex-col gap-3">
          {confirming && vacation ? (
            <Confirm text={s.removeConfirm} yes={s.remove} busy={busy} onNo={() => setConfirming(false)} onYes={() => run(() => onRemove(vacation.id))} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={onClose} className={`${btn.outline} !text-accent`}>
                  {s.cancel}
                </button>
                <button type="button" disabled={!validDate || busy} onClick={() => run(() => onSave(draft))} className={btn.primary}>
                  {s.save}
                </button>
              </div>
              {vacation && (
                <button type="button" onClick={() => setConfirming(true)} className={btn.dangerOutline}>
                  <Icon name="trash" className="size-4" />
                  {s.remove}
                </button>
              )}
            </>
          )}
        </div>
      }
    >
      <label htmlFor={`${ids}-start`} className="mt-3 mb-1.5 text-[13px] leading-[18px] font-medium text-ink-2">
        {s.start}
      </label>
      <div className={fieldClass(!validDate, false)}>
        <input
          id={`${ids}-start`}
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          aria-invalid={!validDate || undefined}
          aria-describedby={`${ids}-start-note`}
          className="tabular min-w-0 flex-1 bg-transparent text-[16px] outline-none"
        />
      </div>
      <FieldNote id={`${ids}-start-note`} error={!validDate && s.invalidDate}>
        {s.startHint}
      </FieldNote>

      <span id={`${ids}-days`} className="mt-4 mb-1.5 text-[13px] leading-[18px] font-medium text-ink-2">
        {s.days}
      </span>
      <div role="group" aria-labelledby={`${ids}-days`} className="flex items-center gap-3">
        {stepper(s.fewer, 'minus', draft.days <= VACATION_DAYS.min, -1)}
        <output aria-live="polite" className="tabular flex-1 text-center text-[22px] leading-7 font-bold text-ink">
          {draft.days}
        </output>
        {stepper(s.more, 'plus', draft.days >= maxDays, 1)}
      </div>
      {validDate && <span className="mt-1.5 text-center text-xs leading-4 text-muted">{s.daysNote(formatDayYear(addDays(start, draft.days)))}</span>}

      <div className="mt-3 border-t border-line">
        <SwitchRow label={s.sold} note={s.soldNote} checked={sold} onChange={setSold} />
      </div>
      {validDate && salary && (
        <p className="tabular mt-1 flex items-start gap-2.5 rounded-md bg-income-soft px-3 py-2.5 text-[13px] leading-[18px] text-ink">
          <Icon name="calendar" className="mt-px size-4 shrink-0 text-income" />
          {s.preview(formatDay(vacationPayday(draft)), formatMoney(vacationPay(draft, salary)))}
        </p>
      )}
    </Sheet>
  )
}
