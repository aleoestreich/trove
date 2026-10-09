import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { PLAN_NAME_MAX, PLAN_TYPES, pensionDue, pensionTotal, planDue, planLatest, sortPensionEntries, type Pension, type PensionEntry, type PensionPlan, type PlanType } from '../data/pension'
import { cleanName, newId } from '../data/edits'
import { useData } from '../state'
import { useI18n } from '../i18n/I18nProvider'
import { formatDay } from '../lib/dates'
import { formatMoney } from '../lib/money'
import { Icon } from './Icon'
import { Sheet } from './insights/parts'
import { BalanceChart, BalanceList, BalanceSheet, Confirm, Disc, FailedNote, FieldNote, OutOfTotalLine, Pill, Switch, btn, fieldClass, signed, useBalanceFields } from './ManualBalance'
import { SectionHead } from './Fgts'

// Previdência privada tracked by hand (src/data/pension.ts): the section on
// Accounts (one row per plan), the line under net worth, and the sheets to
// add, edit and review a plan and to update or correct its balance. The
// reminder on Visão geral is in BalancesReminder.tsx.

export const PlanMark = ({ size = 40 }: { size?: number }) => <Disc icon="piggy" tint="indigo" size={size} />

/** "PGBL" / "VGBL", outlined. */
export function TypeBadge({ type }: { type: PlanType | null }) {
  if (!type) return null
  return <span className="rounded-sm border border-line px-1.5 text-[11px] leading-4 font-bold tracking-wide text-ink-2">{type}</span>
}

/** Which sheet is open; `back` is where closing it returns. */
type View =
  | { kind: 'plan'; planId?: string; back?: View }
  | { kind: 'detail'; planId: string }
  | { kind: 'update'; planId: string; entry?: PensionEntry; back?: View }
  | { kind: 'choose' }
  | null

/** The plan sheets, opened from the section, the reminder or each other. */
export function usePensionSheets(): [(v: View) => void, ReactNode] {
  const { pension } = useData()
  const [view, setView] = useState<View>(null)
  const plan = view && 'planId' in view && view.planId ? pension.plans.find((p) => p.id === view.planId) : undefined
  const back = (v: View) => () => setView(v && 'back' in v ? (v.back ?? null) : null)
  let sheet: ReactNode = null
  if (view?.kind === 'plan') sheet = <PlanSheet key={view.planId ?? 'new'} plan={plan} onClose={back(view)} onDeleted={() => setView(null)} />
  else if (view?.kind === 'detail' && plan)
    sheet = (
      <DetailSheet
        plan={plan}
        onEdit={() => setView({ kind: 'plan', planId: plan.id, back: view })}
        onUpdate={(entry) => setView({ kind: 'update', planId: plan.id, entry, back: view })}
        onClose={() => setView(null)}
      />
    )
  else if (view?.kind === 'update' && plan) sheet = <UpdateSheet key={view.entry?.id ?? 'new'} plan={plan} entry={view.entry} onClose={back(view)} />
  else if (view?.kind === 'choose') sheet = <ChooseSheet onPick={(p) => setView({ kind: 'update', planId: p.id })} onClose={() => setView(null)} />
  return [setView, sheet]
}

/**
 * Accounts: "Previdência privada · Fora do total" below the FGTS. Off: the
 * switch (and how many plans are kept). On: the plans' latest balances added
 * up, one row per plan (its type, balance, date and change, or that it needs
 * an update) and "Adicionar plano"; outlined in accent when a plan is due.
 */
export function PensionSection() {
  const { pension, setPensionTracking, today } = useData()
  const { t } = useI18n()
  const v = t.pension
  const [open, sheet] = usePensionSheets()
  const head = useId()
  const total = pensionTotal(pension)
  const due = pensionDue(pension, today)

  return (
    <section aria-labelledby={head} className="flex flex-col gap-2">
      <SectionHead id={head} title={v.section} />

      {!pension.tracking ? (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4 lg:px-5">
          <div className="flex items-center gap-3">
            <PlanMark />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-base leading-[22px] text-ink">{v.trackLabel}</span>
              <span className="text-[13px] leading-[18px] text-ink-2">{v.trackNote}</span>
            </span>
            <Switch checked={false} label={v.trackLabel} onChange={setPensionTracking} />
          </div>
          {pension.plans.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs leading-4 text-ink-2">
              <Icon name="info" className="size-3.5 shrink-0 text-muted" />
              {v.keptNote(pension.plans.length)}
            </p>
          )}
        </div>
      ) : (
        <div className={`flex flex-col gap-3 rounded-lg border bg-surface p-4 lg:px-5 ${due.length ? 'border-accent/60' : 'border-line'}`}>
          <div className="flex items-center gap-3">
            <PlanMark />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-base leading-[22px] text-ink">{v.section}</span>
              <span className="text-[13px] leading-[18px] text-ink-2">{v.cardSub}</span>
            </span>
            <Switch checked label={v.trackLabel} onChange={setPensionTracking} />
          </div>

          {pension.plans.length === 0 ? (
            <div className="flex flex-col items-center gap-1 pt-1 text-center">
              <span aria-hidden className="mb-1 flex size-10 items-center justify-center rounded-full bg-track text-ink-2">
                <Icon name="piggy" className="size-5" />
              </span>
              <p className="text-base leading-[22px] text-ink">{v.emptyTitle}</p>
              <p className="text-[13px] leading-[18px] text-ink-2">{v.emptyNote}</p>
              <button type="button" onClick={() => open({ kind: 'plan' })} className={`${btn.primary} mt-3 w-full`}>
                <Icon name="plus" className="size-[18px]" strokeWidth={2} />
                {v.add}
              </button>
              <p className="mt-2 text-xs leading-4 text-ink-2">{v.trackNote}</p>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="tabular text-[32px] leading-10 font-bold tracking-[-0.02em] text-ink">{total ? formatMoney(total.total) : '—'}</span>
                <span className="shrink-0 text-[13px] leading-[18px] text-ink-2">{v.plans(pension.plans.length)}</span>
              </div>
              {due.length > 0 && (
                <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-accent-faint px-2.5 py-1 text-xs leading-4 font-medium text-accent">
                  <Icon name="calendar" className="size-3.5" />
                  {v.dueCount(due.length)}
                </span>
              )}
              <ul className="flex flex-col divide-y divide-line border-t border-line">
                {pension.plans.map((p) => (
                  <li key={p.id}>
                    <PlanRow plan={p} today={today} onOpen={() => open({ kind: 'detail', planId: p.id })} />
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => open({ kind: 'plan' })} className={`${btn.outlineBase} w-full text-accent`}>
                <Icon name="plus" className="size-[18px]" strokeWidth={2} />
                {v.add}
              </button>
              <p className="text-xs leading-4 text-ink-2">{v.totalNote}</p>
            </>
          )}
        </div>
      )}
      {sheet}
    </section>
  )
}

/** A plan on Accounts: name, type, latest balance and change; a badge when it needs an update. */
function PlanRow({ plan, today, onOpen }: { plan: PensionPlan; today: string; onOpen(): void }) {
  const { t } = useI18n()
  const v = t.pension
  const latest = planLatest(plan)
  const previous = sortPensionEntries(plan.entries)[1]
  const due = planDue(plan, today)
  return (
    <button type="button" onClick={onOpen} aria-label={v.open(plan.name)} className="flex w-full items-center gap-3 py-3 text-left">
      <PlanMark size={36} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-base leading-[22px] text-ink">{plan.name}</span>
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-4 text-ink-2">
          <TypeBadge type={plan.type} />
          <span className="whitespace-nowrap">{latest ? v.balanceOn(formatDay(latest.latest.date)) : v.noBalance}</span>
        </span>
        {latest?.change != null && previous && (
          <span className="text-xs leading-4 text-ink-2">
            <span className={`tabular ${latest.change >= 0 ? 'text-income' : ''}`}>{signed(latest.change)}</span> {v.changeSince(formatDay(previous.date))}
          </span>
        )}
        {due &&
          (latest ? (
            <span className="mt-1 inline-flex items-center gap-1 self-start rounded-full bg-accent-faint px-2 py-0.5 text-[11px] leading-[14px] font-medium whitespace-nowrap text-accent">
              <Icon name="calendar" className="size-3" />
              {v.badgeUpdate}
            </span>
          ) : (
            <span className="mt-1 self-start">
              <Pill>{v.badgeNew}</Pill>
            </span>
          ))}
      </span>
      <span className="tabular shrink-0 text-base text-ink">{latest ? formatMoney(latest.latest.balance) : '—'}</span>
      <Icon name="chevronRight" className="size-[18px] shrink-0 text-ink-2" />
    </button>
  )
}

/** Under net worth's tiles: "Previdência privada · 2 planos · saldos até 10 out. · R$ … · Fora do total". */
export function PensionNetWorthLine() {
  const { pension } = useData()
  const { t } = useI18n()
  const total = pensionTotal(pension)
  if (!pension.tracking || !total) return null
  return <OutOfTotalLine icon="piggy" tint="indigo" label={t.pension.netWorth.label} sub={t.pension.netWorth.sub(total.plans, formatDay(total.upTo))} amount={total.total} />
}

/** Whether net worth shows the previdência line. */
export const showsPensionLine = (pension: Pension) => pension.tracking && pensionTotal(pension) !== null

/**
 * "Adicionar plano" or "Editar plano": the name (up to 40 characters), the
 * type (optional) and, when adding, an optional first balance. Editing can
 * delete the plan with its history, after confirming in the sheet.
 */
function PlanSheet({ plan, onClose, onDeleted }: { plan?: PensionPlan; onClose(): void; onDeleted(): void }) {
  const { savePension } = useData()
  const { t } = useI18n()
  const s = t.pension.plan
  const ids = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const [id] = useState(() => plan?.id ?? newId())
  const [name, setName] = useState(plan?.name ?? '')
  const [nameTouched, setNameTouched] = useState(false)
  const [type, setType] = useState<PlanType | null>(plan?.type ?? null)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const first = useBalanceFields({ label: s.balanceLabel, hint: s.firstHint, optional: true, disabled: saving, focus: false })

  useEffect(() => {
    if (!plan) nameRef.current?.focus()
  }, [plan])

  const clean = cleanName(name)
  const nameError = !clean && (nameTouched || name !== '') ? s.nameEmpty : false
  const invalid = !clean || clean.length > PLAN_NAME_MAX || (!plan && first.invalid)

  const run = async (action: () => Promise<void>, done: () => void) => {
    setSaving(true)
    setFailed(false)
    try {
      await action()
      done()
    } catch {
      setFailed(true)
      setSaving(false)
    }
  }
  const save = () => {
    if (invalid || saving) {
      setNameTouched(true)
      first.touch()
      return
    }
    const balance = plan ? null : first.value()
    void run(async () => {
      await savePension({ op: 'savePensionPlan', plan: { id, name: clean, type } })
      if (balance) await savePension({ op: 'savePensionBalance', planId: id, entry: balance })
    }, onClose)
  }

  const footer = (
    <div className="-mx-4 mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 border-t border-line px-4 pt-3 md:-mx-6 md:px-6">
      <button type="button" onClick={onClose} disabled={saving || confirming} className={btn.outline}>
        {t.balance.cancel}
      </button>
      <button type="submit" form={`${ids}-form`} disabled={invalid || saving || confirming} aria-busy={saving} className={btn.primary}>
        {saving && <Icon name="sync" className="size-[18px] motion-safe:animate-spin" strokeWidth={2} />}
        {saving ? t.balance.saving : plan ? s.save : s.add}
      </button>
    </div>
  )

  return (
    <Sheet title={plan ? s.editTitle : s.addTitle} subtitle={s.subtitle} onClose={saving ? () => {} : onClose} footer={footer} width="md:max-w-[520px]">
      <form
        id={`${ids}-form`}
        className="mt-3 flex flex-col"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        {failed && <FailedNote text={s.failed} />}

        <label htmlFor={`${ids}-name`} className="mb-1.5 text-[13px] leading-[18px] text-ink-2">
          {s.nameLabel}
        </label>
        <span className={fieldClass(!!nameError, saving)}>
          <input
            ref={nameRef}
            id={`${ids}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setNameTouched(true)}
            maxLength={PLAN_NAME_MAX}
            placeholder={s.namePlaceholder}
            readOnly={saving}
            autoComplete="off"
            aria-invalid={!!nameError || undefined}
            aria-describedby={`${ids}-name-note`}
            className={`min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted ${saving ? 'text-ink-2' : 'text-ink'}`}
          />
        </span>
        <span className="flex justify-between gap-3">
          <FieldNote id={`${ids}-name-note`} error={nameError}>
            {s.nameHint}
          </FieldNote>
          <span className="tabular mt-1.5 shrink-0 text-xs leading-4 text-muted" aria-hidden>
            {name.length}/{PLAN_NAME_MAX}
          </span>
        </span>

        <span id={`${ids}-type`} className="mt-4 mb-1.5 text-[13px] leading-[18px] text-ink-2">
          {s.typeLabel} <span className="text-muted">· {s.optional}</span>
        </span>
        <div role="radiogroup" aria-labelledby={`${ids}-type`} className="grid grid-cols-3 gap-1 rounded-md bg-page p-1">
          {([null, ...PLAN_TYPES] as (PlanType | null)[]).map((option) => {
            const on = option === type
            return (
              <button
                key={option ?? 'none'}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={saving}
                onClick={() => setType(option)}
                className={`h-11 rounded-[6px] text-sm ${on ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
              >
                {option ?? s.typeNone}
              </button>
            )
          })}
        </div>
        <p className="mt-1.5 text-xs leading-4 text-muted">{s.typeHint}</p>

        {!plan && (
          <>
            <h3 className="label-caps mt-4 mb-2 border-t border-line pt-4">
              {s.firstBalance} <span className="normal-case">· {s.optional}</span>
            </h3>
            {first.node}
          </>
        )}

        {plan && (
          <>
            {plan.entries.length > 0 && (
              <p className="mt-4 flex items-start gap-1.5 text-xs leading-4 text-ink-2">
                <Icon name="info" className="mt-px size-3.5 shrink-0 text-muted" />
                {s.keepHistory(plan.entries.length)}
              </p>
            )}
            {confirming ? (
              <div className="mt-4">
                <Confirm text={s.deleteConfirm(plan.name)} yes={s.deleteYes} busy={saving} onYes={() => void run(() => savePension({ op: 'deletePensionPlan', id: plan.id }), onDeleted)} onNo={() => setConfirming(false)} />
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} disabled={saving} className={`mt-4 ${btn.dangerOutline}`}>
                <Icon name="trash" className="size-4" />
                {s.delete}
              </button>
            )}
          </>
        )}
      </form>
    </Sheet>
  )
}

/** A plan: its latest balance and change, the chart and every balance; Editar plano and Atualizar saldo. */
function DetailSheet({ plan, onEdit, onUpdate, onClose }: { plan: PensionPlan; onEdit(): void; onUpdate(entry?: PensionEntry): void; onClose(): void }) {
  const { t } = useI18n()
  const d = t.pension.detail
  const entries = sortPensionEntries(plan.entries)
  const latest = planLatest(plan)

  const footer = (
    <div className="-mx-4 mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 border-t border-line px-4 pt-3 md:-mx-6 md:px-6">
      <button type="button" onClick={onEdit} className={btn.outline}>
        <Icon name="edit" className="size-[18px]" />
        {d.edit}
      </button>
      <button type="button" onClick={() => onUpdate()} className={btn.primary}>
        <Icon name="plus" className="size-[18px]" strokeWidth={2} />
        {latest ? d.update : d.inform}
      </button>
    </div>
  )

  return (
    <Sheet
      title={plan.name}
      lead={<PlanMark size={36} />}
      subtitle={
        <span className="flex items-center gap-1.5">
          <TypeBadge type={plan.type} />
          {d.subtitle}
        </span>
      }
      actions={
        <button type="button" onClick={onEdit} aria-label={d.edit} className="flex size-11 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-track">
          <Icon name="edit" className="size-[18px]" />
        </button>
      }
      onClose={onClose}
      footer={footer}
      width="md:max-w-[560px]"
    >
      {latest ? (
        <div className="mt-3 flex flex-col">
          <span className="tabular text-[32px] leading-10 font-bold tracking-[-0.02em] text-ink">{formatMoney(latest.latest.balance)}</span>
          <span className="text-[13px] leading-[18px] text-ink-2">{t.pension.balanceOn(formatDay(latest.latest.date))}</span>
          {latest.change !== null && entries[1] && (
            <span className="text-[13px] leading-[18px] text-ink-2">
              <span className={`tabular ${latest.change >= 0 ? 'text-income' : ''}`}>{signed(latest.change)}</span> {t.pension.changeSince(formatDay(entries[1].date))}
            </span>
          )}
          {entries.length > 1 && (
            <div className="mt-3">
              <BalanceChart entries={entries} tint="indigo" />
            </div>
          )}
          <BalanceList entries={entries} onEdit={(e) => onUpdate(e)} />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 py-8 text-center">
          <span aria-hidden className="mb-1 flex size-10 items-center justify-center rounded-full bg-track text-ink-2">
            <Icon name="calendar" className="size-5" />
          </span>
          <p className="text-base leading-[22px] text-ink">{d.emptyTitle}</p>
          <p className="text-[13px] leading-[18px] text-ink-2">{d.emptyNote}</p>
        </div>
      )}
    </Sheet>
  )
}

/** "Atualizar saldo" / "Corrigir saldo" for a plan; its name and type in the subtitle. */
function UpdateSheet({ plan, entry, onClose }: { plan: PensionPlan; entry?: PensionEntry; onClose(): void }) {
  const { savePension } = useData()
  const { t } = useI18n()
  const u = t.pension.update
  return (
    <BalanceSheet
      title={entry ? u.editTitle : u.title}
      subtitle={plan.type ? `${plan.name} · ${plan.type}` : plan.name}
      label={u.balanceLabel}
      hint={u.balanceHint}
      entry={entry}
      onSave={(e) => savePension({ op: 'savePensionBalance', planId: plan.id, entry: e })}
      onDelete={(id) => savePension({ op: 'deletePensionBalance', planId: plan.id, id })}
      onClose={onClose}
    />
  )
}

/** "Qual plano atualizar?": the plans due for an update, from the reminder. */
function ChooseSheet({ onPick, onClose }: { onPick(plan: PensionPlan): void; onClose(): void }) {
  const { pension, today } = useData()
  const { t } = useI18n()
  const r = t.pension.reminder
  const due = pensionDue(pension, today)
  return (
    <Sheet title={r.chooseTitle} onClose={onClose}>
      <p className="mt-2 text-[13px] leading-[18px] text-ink-2">{r.chooseNote}</p>
      <ul className="mt-2 flex flex-col divide-y divide-line">
        {due.map((p) => {
          const latest = planLatest(p)?.latest
          return (
            <li key={p.id}>
              <button type="button" onClick={() => onPick(p)} className="flex min-h-[60px] w-full items-center gap-3 py-2 text-left">
                <PlanMark size={36} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2 text-base leading-[22px] text-ink">
                    {p.name}
                    <TypeBadge type={p.type} />
                  </span>
                  <span className="text-[13px] leading-[18px] text-ink-2">{latest ? r.lastOn(formatDay(latest.date)) : r.none}</span>
                </span>
                <Icon name="chevronRight" className="size-[18px] shrink-0 text-ink-2" />
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
