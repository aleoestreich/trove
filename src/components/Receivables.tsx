import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useData } from '../state'
import { useI18n } from '../i18n/I18nProvider'
import { newId, type ReceivableEdit } from '../data/edits'
import {
  PERSON_MAX,
  canBeOwed,
  canRepay,
  isSettled,
  knownPeople,
  owedByPerson,
  owedOf,
  owedTotal,
  paymentsIn,
  received,
  receivablesOf,
  remaining,
  repaymentCandidates,
  usedOf,
  type Receivable,
} from '../data/receivables'
import type { Cents, Transaction } from '../data/types'
import { formatDay, formatDayYear } from '../lib/dates'
import { formatMoney, moneyInput, parseMoney } from '../lib/money'
import { Icon } from './Icon'
import { Card, Progress } from './ui'
import { Sheet } from './insights/parts'
import { btn, Confirm, FailedNote, FieldNote, fieldClass } from './ManualBalance'

// "A receber" (src/data/receivables.ts): the section in a transaction's
// details, the sheets that mark an expense as owed, record a payment back
// and show one receivable, and the Visão geral card. Every change waits for
// the server (saveReceivable); a failure keeps the sheet open with the reason.

/** Runs a save: busy while it lasts, the reason when it fails, closes when it's done. */
function useSaving(onDone: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }
  return { busy, error, run }
}

/** The R$ field (numeric keyboard): its text, and the cents when valid (from 1 cent up to `max`, and at least `min`). */
function useAmount(initial: Cents, max: Cents, min: Cents = 1) {
  const [text, setText] = useState(initial > 0 ? moneyInput(initial) : '')
  const [touched, setTouched] = useState(false)
  const cents = parseMoney(text)
  const valid = cents !== null && cents >= Math.max(1, min) && cents <= max
  return { text, setText, touched, setTouched, cents, valid, set: (c: Cents) => setText(moneyInput(c)) }
}

function AmountField({
  amount,
  label,
  hint,
  error,
  disabled,
  children,
}: {
  amount: ReturnType<typeof useAmount>
  label: string
  hint: string
  error: string
  disabled: boolean
  children?: ReactNode
}) {
  const ids = useId()
  const show = !amount.valid && (amount.touched || amount.text.trim() !== '')
  return (
    <div className="flex flex-col">
      <label htmlFor={`${ids}-amount`} className="mb-1.5 text-[13px] leading-[18px] text-ink-2">
        {label}
      </label>
      <span className={fieldClass(show, disabled)}>
        <span aria-hidden className="text-[16px] text-muted">
          R$
        </span>
        <input
          id={`${ids}-amount`}
          value={amount.text}
          onChange={(e) => amount.setText(e.target.value)}
          onBlur={() => amount.setTouched(true)}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          readOnly={disabled}
          aria-invalid={show || undefined}
          aria-describedby={`${ids}-amount-note`}
          className="tabular min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted"
        />
      </span>
      <FieldNote id={`${ids}-amount-note`} error={show && error}>
        {hint}
      </FieldNote>
      {children}
    </div>
  )
}

/** A day (the native picker behind the formatted day), never after today. */
function DateField({ label, value, max, disabled, onChange }: { label: string; value: string; max: string; disabled: boolean; onChange(v: string): void }) {
  const ids = useId()
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="mt-4 flex flex-col">
      <label htmlFor={`${ids}-date`} className="mb-1.5 text-[13px] leading-[18px] text-ink-2">
        {label}
      </label>
      <span className={`relative ${fieldClass(false, disabled)}`}>
        <span className="tabular flex-1 text-[16px]">{formatDayYear(value)}</span>
        <Icon name="calendar" className="size-5 text-ink-2" />
        <input
          ref={ref}
          id={`${ids}-date`}
          type="date"
          value={value}
          max={max}
          disabled={disabled}
          onChange={(e) => e.target.value && e.target.value <= max && onChange(e.target.value)}
          onClick={() => {
            try {
              ref.current?.showPicker()
            } catch {
              // Not supported: the field opens its own picker.
            }
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </span>
    </div>
  )
}

/** Cancelar and the primary button, under a sheet. */
function Footer({ form, label, busy, disabled, onCancel }: { form: string; label: string; busy: boolean; disabled: boolean; onCancel(): void }) {
  const { t } = useI18n()
  return (
    <div className="-mx-4 mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 border-t border-line px-4 pt-3 md:-mx-6 md:px-6">
      <button type="button" onClick={onCancel} disabled={busy} className={btn.outline}>
        {t.balance.cancel}
      </button>
      <button type="submit" form={form} disabled={disabled || busy} aria-busy={busy} className={btn.primary}>
        {busy && <Icon name="sync" className="size-[18px] motion-safe:animate-spin" strokeWidth={2} />}
        {busy ? t.balance.saving : label}
      </button>
    </div>
  )
}

/** A choice in a list of options (radio), with a check when chosen. */
function Choice({ on, onClick, children, disabled }: { on: boolean; onClick(): void; children: ReactNode; disabled: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-14 w-full items-center gap-3 rounded-md border px-3.5 py-2 text-left ${on ? 'border-2 border-accent bg-accent-faint px-[13px]' : 'border-line bg-surface hover:bg-track'}`}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</span>
      <span aria-hidden className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-accent bg-accent text-surface' : 'border-muted'}`}>
        {on && <Icon name="check" className="size-3" strokeWidth={3} />}
      </span>
    </button>
  )
}

/**
 * Marks part or all of an expense as owed by someone, or changes who and how
 * much (`receivable`). The amount goes up to what no one owes yet, and never
 * below what was already paid back.
 */
export function ReceivableFormSheet({ tx, receivable, onClose }: { tx: Transaction; receivable?: Receivable; onClose(): void }) {
  const { receivables, saveReceivable } = useData()
  const { t } = useI18n()
  const f = t.receivables.form
  const ids = useId()
  const max = -tx.amount - owedOf(receivables, tx.id, receivable?.id)
  const min = receivable ? received(receivable) : 1
  const amount = useAmount(receivable?.amount ?? max, max, min)
  const [person, setPerson] = useState(receivable?.person ?? '')
  const [personTouched, setPersonTouched] = useState(false)
  const name = person.trim().replace(/\s+/g, ' ')
  const people = knownPeople(receivables)
  const { busy, error, run } = useSaving(onClose)
  const half = Math.round(-tx.amount / 2)

  const submit = () => {
    setPersonTouched(true)
    amount.setTouched(true)
    if (!name || !amount.valid || busy) return
    void run(() => saveReceivable({ op: 'saveReceivable', receivable: { id: receivable?.id ?? newId(), transactionId: tx.id, person: name, amount: amount.cents! } }))
  }

  return (
    <Sheet
      title={receivable ? f.editTitle : f.newTitle}
      subtitle={`${tx.description} · ${formatMoney(-tx.amount)}`}
      onClose={busy ? () => {} : onClose}
      footer={<Footer form={`${ids}-form`} label={f.save} busy={busy} disabled={false} onCancel={onClose} />}
      width="md:max-w-[520px]"
    >
      <form
        id={`${ids}-form`}
        className="mt-3 flex flex-col"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {error && <FailedNote text={error} />}
        <label htmlFor={`${ids}-person`} className="mb-1.5 text-[13px] leading-[18px] text-ink-2">
          {f.person}
        </label>
        <span className={fieldClass(personTouched && !name, busy)}>
          <input
            id={`${ids}-person`}
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            onBlur={() => setPersonTouched(true)}
            list={`${ids}-people`}
            maxLength={PERSON_MAX}
            autoComplete="off"
            autoCapitalize="words"
            placeholder={f.personPlaceholder}
            readOnly={busy}
            aria-invalid={(personTouched && !name) || undefined}
            aria-describedby={personTouched && !name ? `${ids}-person-note` : undefined}
            className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-muted"
          />
        </span>
        <datalist id={`${ids}-people`}>
          {people.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        {personTouched && !name && (
          <FieldNote id={`${ids}-person-note`} error={f.personRequired}>
            {null}
          </FieldNote>
        )}

        <div className="mt-4" />
        <AmountField
          amount={amount}
          label={f.amount}
          hint={f.amountHint(formatMoney(max))}
          error={amount.cents !== null && amount.cents < min && amount.cents > 0 ? f.amountBelowReceived(formatMoney(min)) : f.amountInvalid(formatMoney(max))}
          disabled={busy}
        >
          <div className="mt-2 flex gap-2">
            {[
              [f.all, max],
              [f.half, half],
            ]
              .filter(([, c]) => (c as number) >= Math.max(1, min) && (c as number) <= max)
              .filter(([, c], i, list) => list.findIndex(([, d]) => d === c) === i)
              .map(([label, c]) => (
                <button
                  key={label as string}
                  type="button"
                  disabled={busy}
                  onClick={() => amount.set(c as number)}
                  aria-pressed={amount.cents === c}
                  className={`h-10 rounded-full border px-3.5 text-sm font-medium ${amount.cents === c ? 'border-accent bg-accent-faint text-accent' : 'border-line bg-surface text-ink-2 hover:bg-track'}`}
                >
                  {label as string}
                </button>
              ))}
          </div>
        </AmountField>
      </form>
    </Sheet>
  )
}

/**
 * Records a payment back of `receivable`: from one of the money that came in
 * after it (the ones matching what's owed first), or typed in by hand with
 * its day. The amount goes up to what's still owed (and what came in).
 */
export function PaymentSheet({ receivable, onClose }: { receivable: Receivable; onClose(): void }) {
  const { receivables, allTransactions, saveReceivable, today } = useData()
  const { t } = useI18n()
  const p = t.receivables.payment
  const ids = useId()
  const owed = remaining(receivable)
  const candidates = repaymentCandidates(receivables, receivable, allTransactions).slice(0, 5)
  const [choice, setChoice] = useState<string>(candidates[0]?.tx.id ?? 'hand')
  const chosen = candidates.find((c) => c.tx.id === choice)
  const max = chosen ? Math.min(owed, chosen.free) : owed
  const amount = useAmount(max, max)
  const [date, setDate] = useState(today)
  const { busy, error, run } = useSaving(onClose)

  const pick = (id: string) => {
    setChoice(id)
    const c = candidates.find((x) => x.tx.id === id)
    amount.set(c ? Math.min(owed, c.free) : owed)
  }
  const submit = () => {
    amount.setTouched(true)
    if (!amount.valid || busy) return
    const payment = { id: newId(), date: chosen ? chosen.tx.date : date, amount: amount.cents!, transactionId: chosen?.tx.id ?? null }
    void run(() => saveReceivable({ op: 'saveReceivablePayment', receivableId: receivable.id, payment }))
  }

  return (
    <Sheet
      title={p.title}
      subtitle={`${receivable.person} · ${t.receivables.left(formatMoney(owed))}`}
      onClose={busy ? () => {} : onClose}
      footer={<Footer form={`${ids}-form`} label={p.save} busy={busy} disabled={false} onCancel={onClose} />}
      width="md:max-w-[520px]"
    >
      <form
        id={`${ids}-form`}
        className="mt-3 flex flex-col"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {error && <FailedNote text={error} />}
        <h3 id={`${ids}-came`} className="label-caps pb-2">
          {p.cameIn}
        </h3>
        <div role="radiogroup" aria-labelledby={`${ids}-came`} className="flex flex-col gap-2">
          {candidates.map(({ tx, free }) => (
            <Choice key={tx.id} on={choice === tx.id} onClick={() => pick(tx.id)} disabled={busy}>
              <span className="truncate text-[15px] leading-5 font-medium text-ink">{tx.description}</span>
              <span className="tabular text-xs leading-4 text-muted">
                {formatDay(tx.date)} · {formatMoney(free)}
              </span>
            </Choice>
          ))}
          <Choice on={choice === 'hand'} onClick={() => pick('hand')} disabled={busy}>
            <span className="text-[15px] leading-5 font-medium text-ink">{p.byHandOption}</span>
            <span className="text-xs leading-4 text-muted">{p.byHandNote}</span>
          </Choice>
          {candidates.length === 0 && <p className="text-xs leading-4 text-muted">{p.noCandidates}</p>}
        </div>

        <div className="mt-4">
          <AmountField amount={amount} label={p.amount} hint={p.amountHint(formatMoney(max))} error={p.amountInvalid(formatMoney(max))} disabled={busy} />
        </div>
        {!chosen && <DateField label={p.date} value={date} max={today} disabled={busy} onChange={setDate} />}
      </form>
    </Sheet>
  )
}

/**
 * Money that came in (`tx`) as a payment back: whose (the open receivables,
 * the ones matching it first) and how much of it, up to what they still owe.
 */
export function RepaySheet({ tx, onClose }: { tx: Transaction; onClose(): void }) {
  const { receivables, allTransactions, saveReceivable } = useData()
  const { t } = useI18n()
  const p = t.receivables.payment
  const ids = useId()
  const free = tx.amount - usedOf(receivables, tx.id)
  const open = receivables
    .filter((r) => !isSettled(r))
    .sort((a, b) => Number(remaining(b) === free) - Number(remaining(a) === free) || b.date.localeCompare(a.date))
  const [choice, setChoice] = useState<string | null>(open[0]?.id ?? null)
  const chosen = open.find((r) => r.id === choice)
  const max = chosen ? Math.min(remaining(chosen), free) : free
  const amount = useAmount(max, max)
  const { busy, error, run } = useSaving(onClose)
  const description = (r: Receivable) => allTransactions.find((x) => x.id === r.transactionId)?.description ?? t.receivables.unknownTransaction

  const submit = () => {
    amount.setTouched(true)
    if (!chosen || !amount.valid || busy) return
    void run(() => saveReceivable({ op: 'saveReceivablePayment', receivableId: chosen.id, payment: { id: newId(), date: tx.date, amount: amount.cents!, transactionId: tx.id } }))
  }

  return (
    <Sheet
      title={p.who}
      subtitle={p.whoSub(formatMoney(free))}
      onClose={busy ? () => {} : onClose}
      footer={open.length ? <Footer form={`${ids}-form`} label={p.save} busy={busy} disabled={!chosen} onCancel={onClose} /> : undefined}
      width="md:max-w-[520px]"
    >
      {open.length === 0 ? (
        <p className="mt-3 text-sm leading-5 text-ink-2">{p.none}</p>
      ) : (
        <form
          id={`${ids}-form`}
          className="mt-3 flex flex-col"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          {error && <FailedNote text={error} />}
          <div role="radiogroup" aria-label={p.who} className="flex flex-col gap-2">
            {open.map((r) => (
              <Choice
                key={r.id}
                on={choice === r.id}
                disabled={busy}
                onClick={() => {
                  setChoice(r.id)
                  amount.set(Math.min(remaining(r), free))
                }}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[15px] leading-5 font-medium text-ink">{r.person}</span>
                  <span className="tabular shrink-0 text-sm font-medium text-ink">{formatMoney(remaining(r))}</span>
                </span>
                <span className="truncate text-xs leading-4 text-muted">
                  {description(r)} · {formatDay(r.date)}
                </span>
              </Choice>
            ))}
          </div>
          <div className="mt-4">
            <AmountField amount={amount} label={p.amount} hint={p.amountHint(formatMoney(max))} error={p.amountInvalid(formatMoney(max))} disabled={busy} />
          </div>
        </form>
      )}
    </Sheet>
  )
}

/**
 * One receivable: what's owed and paid back, the payments (each can be
 * deleted), and the actions: record a payment, "Recebi tudo", edit, delete.
 * The sheets it opens take its place, and come back to it.
 */
export function ReceivableSheet({ id, onClose }: { id: string; onClose(): void }) {
  const { receivables, allTransactions, saveReceivable, today } = useData()
  const { t } = useI18n()
  const d = t.receivables.detail
  const r = receivables.find((x) => x.id === id)
  const [view, setView] = useState<'detail' | 'pay' | 'edit'>('detail')
  const [confirming, setConfirming] = useState(false)
  const { busy, error, run } = useSaving(() => {})

  // Deleted (here or by a reload): nothing left to show.
  useEffect(() => {
    if (!r) onClose()
  }, [r, onClose])
  if (!r) return null

  const tx = allTransactions.find((x) => x.id === r.transactionId)
  const left = remaining(r)
  if (view === 'pay') return <PaymentSheet receivable={r} onClose={() => setView('detail')} />
  if (view === 'edit' && tx) return <ReceivableFormSheet tx={tx} receivable={r} onClose={() => setView('detail')} />

  const save = (e: ReceivableEdit) => run(() => saveReceivable(e))
  const description = (txId: string | null) => (txId ? (allTransactions.find((x) => x.id === txId)?.description ?? t.receivables.unknownTransaction) : null)

  return (
    <Sheet
      title={r.person}
      subtitle={`${tx?.description ?? t.receivables.unknownTransaction} · ${formatDay(r.date)}`}
      onClose={busy ? () => {} : onClose}
      width="md:max-w-[520px]"
    >
      {error && <div className="mt-3"><FailedNote text={error} /></div>}
      <div className="mt-4 flex flex-col gap-2">
        <span className="tabular text-[28px] leading-9 font-bold tracking-[-0.02em] text-ink">{formatMoney(r.amount)}</span>
        <Progress value={(received(r) / r.amount) * 100} tone="income" label={t.receivables.progress(r.person)} />
        <div className="flex justify-between gap-3 text-[13px] leading-[18px]">
          <span className="flex flex-col">
            <span className="text-muted">{d.receivedLabel}</span>
            <span className="tabular font-medium text-ink">{formatMoney(received(r))}</span>
          </span>
          <span className="flex flex-col items-end text-right">
            <span className="text-muted">{d.leftLabel}</span>
            <span className="tabular font-medium text-ink">{left > 0 ? formatMoney(left) : t.receivables.paidBack}</span>
          </span>
        </div>
      </div>

      {left > 0 && (
        <div className="mt-4 flex flex-col gap-2 md:grid md:grid-cols-2">
          <button type="button" disabled={busy} onClick={() => setView('pay')} className={btn.primary}>
            <Icon name="plus" className="size-[18px]" strokeWidth={2} />
            {d.addPayment}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save({ op: 'saveReceivablePayment', receivableId: r.id, payment: { id: newId(), date: today, amount: left, transactionId: null } })}
            className={`${btn.outline} text-accent`}
          >
            <Icon name="check" className="size-[18px]" strokeWidth={2} />
            {d.receivedAll}
          </button>
        </div>
      )}

      <h3 className="label-caps pt-5 pb-1">{d.payments}</h3>
      {r.payments.length === 0 ? (
        <p className="py-2 text-[13px] leading-[18px] text-muted">{d.noPayments}</p>
      ) : (
        <ul className="flex flex-col">
          {r.payments.map((p) => (
            <li key={p.id} className="flex min-h-14 items-center gap-3 border-b border-line last:border-b-0">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm leading-[19px] text-ink">{p.transactionId ? d.fromTransaction(description(p.transactionId)!) : d.byHand}</span>
                <span className="text-xs leading-4 text-muted">{formatDay(p.date)}</span>
              </span>
              <span className="tabular text-sm font-medium whitespace-nowrap text-income">{formatMoney(p.amount)}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void save({ op: 'deleteReceivablePayment', receivableId: r.id, id: p.id })}
                aria-label={`${d.deletePayment} · ${formatDay(p.date)}`}
                className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-track"
              >
                <Icon name="trash" className="size-[18px]" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-3">
        {confirming ? (
          <Confirm
            text={d.confirmDelete}
            yes={d.deleteYes}
            busy={busy}
            onNo={() => setConfirming(false)}
            onYes={() => void save({ op: 'deleteReceivable', id: r.id })}
          />
        ) : (
          <div className="flex gap-2">
            {tx && (
              <button type="button" disabled={busy} onClick={() => setView('edit')} className={btn.small}>
                {d.edit}
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => setConfirming(true)} className={btn.dangerOutline}>
              <Icon name="trash" className="size-4" />
              {d.delete}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  )
}

/** A receivable as a row: who, and what's left (or "Devolvido"). Opens it. */
function ReceivableRow({ r, label, onOpen }: { r: Receivable; label: string; onOpen(): void }) {
  const { t } = useI18n()
  const left = remaining(r)
  return (
    <button type="button" onClick={onOpen} className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2 text-left hover:bg-track active:bg-track">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] leading-5 font-medium text-ink">{label}</span>
        <span className="tabular text-xs leading-4 text-muted">{left > 0 ? t.receivables.leftOf(formatMoney(left), formatMoney(r.amount)) : t.receivables.paidBack}</span>
      </span>
      <Icon name="chevronRight" className="size-[18px] shrink-0 text-muted" />
    </button>
  )
}

/**
 * "A receber" in a transaction's details. An expense: who owes part of it,
 * and "Paguei por alguém" while some of it is owed by no one. Money in: the
 * payments back it carries, and "É uma devolução" while some of it is free
 * and someone owes something. Transfers have neither.
 */
export function ReceivableSection({ tx }: { tx: Transaction }) {
  const { receivables } = useData()
  const { t } = useI18n()
  const s = t.receivables.sheet
  const [sheet, setSheet] = useState<{ kind: 'add' } | { kind: 'repay' } | { kind: 'open'; id: string } | null>(null)
  const owes = canBeOwed(tx)
  const repays = canRepay(tx)
  if (!owes && !repays) return null

  const mine = owes ? receivablesOf(receivables, tx.id) : []
  const back = repays ? paymentsIn(receivables, tx.id) : []
  const canAdd = owes ? owedOf(receivables, tx.id) < -tx.amount : usedOf(receivables, tx.id) < tx.amount && receivables.some((r) => !isSettled(r))
  if (!canAdd && mine.length === 0 && back.length === 0) return null
  const close = () => setSheet(null)

  return (
    <>
      {(mine.length > 0 || back.length > 0) && <h3 className="label-caps pt-4 pb-2">{s.section}</h3>}
      <div className={`divide-y divide-line overflow-hidden rounded-md border border-line ${mine.length > 0 || back.length > 0 ? '' : 'mt-4'}`}>
        {mine.map((r) => (
          <ReceivableRow key={r.id} r={r} label={r.person} onOpen={() => setSheet({ kind: 'open', id: r.id })} />
        ))}
        {back.map(({ receivable, payment }) => (
          <button
            key={payment.id}
            type="button"
            onClick={() => setSheet({ kind: 'open', id: receivable.id })}
            className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2 text-left hover:bg-track active:bg-track"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[15px] leading-5 font-medium text-ink">{s.repaidBy(receivable.person)}</span>
              <span className="tabular text-xs leading-4 text-muted">{formatMoney(payment.amount)}</span>
            </span>
            <Icon name="chevronRight" className="size-[18px] shrink-0 text-muted" />
          </button>
        ))}
        {canAdd && (
          <button
            type="button"
            onClick={() => setSheet({ kind: owes ? 'add' : 'repay' })}
            className="flex min-h-16 w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-track active:bg-track"
          >
            <Icon name={owes ? 'piggy' : 'undo'} className="size-[22px] shrink-0 text-ink-2" strokeWidth={1.8} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[15px] leading-5 font-medium text-ink">{owes ? (mine.length ? s.addMore : s.add) : s.repay}</span>
              <span className="text-xs leading-[17px] text-muted">{owes ? s.addNote : s.repayNote}</span>
            </span>
          </button>
        )}
      </div>
      {sheet?.kind === 'add' && <ReceivableFormSheet tx={tx} onClose={close} />}
      {sheet?.kind === 'repay' && <RepaySheet tx={tx} onClose={close} />}
      {sheet?.kind === 'open' && <ReceivableSheet id={sheet.id} onClose={close} />}
    </>
  )
}

/** On the Visão geral (only while someone owes something): the total, and who owes most. Opens the page. */
export function ReceivablesCard() {
  const { receivables } = useData()
  const { t } = useI18n()
  const c = t.receivables.card
  const people = owedByPerson(receivables)
  return (
    <Card className="relative flex flex-col gap-3 lg:order-5 lg:col-span-12">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base leading-[22px] font-medium text-ink">
          {/* The whole card opens the page. */}
          <Link to="/receivables" className="after:absolute after:inset-0 after:rounded-lg after:content-['']">
            {c.title}
          </Link>
        </h2>
        <Icon name="chevronRight" className="size-[18px] shrink-0 text-muted" />
      </div>
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-start lg:gap-8">
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] leading-[18px] text-muted">
            {c.total} · {t.receivables.people(people.length)}
          </span>
          <span className="tabular text-[28px] leading-9 font-bold tracking-[-0.02em] text-ink">{formatMoney(owedTotal(receivables))}</span>
        </div>
        <ul className="flex flex-col border-t border-line lg:border-t-0">
          {people.slice(0, 3).map((p) => (
            <li key={p.person} className="flex min-h-11 items-center justify-between gap-3 border-b border-line last:border-b-0">
              <span className="truncate text-sm leading-[19px] text-ink">{p.person}</span>
              <span className="tabular text-sm font-medium whitespace-nowrap text-ink">{formatMoney(p.remaining)}</span>
            </li>
          ))}
          {people.length > 3 && <li className="pt-2 text-xs leading-4 text-muted">{c.more(people.length - 3)}</li>}
        </ul>
      </div>
    </Card>
  )
}
