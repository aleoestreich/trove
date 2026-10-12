import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useData } from '../../state'
import { useI18n } from '../../i18n/I18nProvider'
import { Icon } from '../Icon'
import { Sheet } from '../insights/parts'
import { TARGET_PRESETS, sameTarget } from '../../data/spendingBalance'
import type { BalanceTarget } from '../../data/types'
import { GROUP_FILL, GroupSwatch } from './parts'

/** Points per tap on − and +; holding goes one at a time. */
const STEP = 5
const HOLD_MS = 400
const REPEAT_MS = 120

/** A note under the sheet's options: a soft panel with an info icon. */
export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md bg-page px-3 py-2.5 text-[13px] leading-[18px] text-ink-2">
      <Icon name="info" className="mt-px size-[18px] shrink-0 text-ink-2" />
      <span>{children}</span>
    </div>
  )
}

/** A radio row: a circle, a title and a note (the whole row is the target). */
export function RadioRow({ checked, title, note, onSelect, divider = true }: { checked: boolean; title: ReactNode; note?: ReactNode; onSelect(): void; divider?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={`flex min-h-14 w-full items-center gap-3 py-2 text-left ${divider ? 'border-t border-line first:border-t-0' : ''}`}
    >
      <span aria-hidden className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${checked ? 'border-accent' : 'border-muted'}`}>
        {checked && <span className="size-2.5 rounded-full bg-accent" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="tabular text-[15px] leading-5 font-medium text-ink">{title}</span>
        {note && <span className="text-[13px] leading-[18px] text-ink-2">{note}</span>}
      </span>
    </button>
  )
}

const presetLabel = (p: BalanceTarget) => `${p.essential} · ${p.lifestyle} · ${p.future}`

/**
 * "Meta do equilíbrio": a ready-made split (50/30/20, 60/20/20, 70/20/10) or
 * a custom one. Custom: drag the two divisions on the bar, or − and + (5
 * points a tap, 1 at a time while held); Futuro keeps what's left, so the
 * sum is always 100%. A bottom sheet on phones, a 520px dialog on desktop.
 */
export function TargetSheet({ onClose }: { onClose(): void }) {
  const { t } = useI18n()
  const s = t.spendingBalance.targetSheet
  const g = t.spendingBalance.groups
  const { balanceTarget, saveBalanceTarget } = useData()
  const [target, setTarget] = useState(balanceTarget)
  const [custom, setCustom] = useState(!TARGET_PRESETS.some((p) => sameTarget(p, balanceTarget)))
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const set = (essential: number, lifestyle: number) => {
    const e = Math.max(0, Math.min(100, essential))
    const l = Math.max(0, Math.min(100 - e, lifestyle))
    setTarget({ essential: e, lifestyle: l, future: 100 - e - l })
    setFailed(false)
  }
  const save = async () => {
    setSaving(true)
    setFailed(false)
    try {
      await saveBalanceTarget(target)
      onClose()
    } catch {
      setFailed(true)
      setSaving(false)
    }
  }

  return (
    <Sheet
      title={s.title}
      subtitle={s.sub}
      onClose={onClose}
      width="md:max-w-[520px]"
      footer={
        <div className="mt-4 flex flex-col gap-2">
          {failed && (
            <p role="alert" className="text-[13px] leading-[18px] text-critical">
              {s.failed}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={onClose} className="h-12 rounded-md border border-line bg-surface text-[15px] font-medium text-accent hover:bg-track">
              {s.cancel}
            </button>
            <button type="button" onClick={save} disabled={saving || sameTarget(target, balanceTarget)} className="h-12 rounded-md bg-accent text-[15px] font-medium text-surface active:opacity-80 disabled:opacity-60">
              {s.save}
            </button>
          </div>
        </div>
      }
    >
      <div className="mt-3 flex flex-col gap-3">
        <TargetBar target={target} editable={custom} onChange={set} />
        <div className="grid grid-cols-3 gap-2 text-xs leading-4">
          {(['essential', 'lifestyle', 'future'] as const).map((k) => (
            <span key={k} className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-ink-2">{g[k]}</span>
              <b className="tabular text-[15px] leading-5 font-medium text-ink">{target[k]}%</b>
            </span>
          ))}
        </div>

        {custom ? (
          <>
            <div role="radiogroup" aria-label={s.title} className="flex flex-wrap gap-2">
              {TARGET_PRESETS.map((p) => (
                <Chip key={presetLabel(p)} on={false} onClick={() => (setTarget(p), setCustom(false), setFailed(false))}>
                  {presetLabel(p)}
                </Chip>
              ))}
              <Chip on onClick={() => {}}>
                {s.custom}
              </Chip>
            </div>
            <div className="flex flex-col">
              <Stepper label={g.essential} part="essential" value={target.essential} canUp={target.future > 0} onChange={(v) => set(v, target.lifestyle)} />
              <Stepper label={g.lifestyle} part="lifestyle" value={target.lifestyle} canUp={target.future > 0} onChange={(v) => set(target.essential, v)} />
              <div className="flex min-h-16 items-center gap-3 border-t border-line">
                <GroupSwatch part="future" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px] leading-5 font-medium text-ink">{g.future}</span>
                  <span className="text-xs leading-4 text-muted">{s.futureNote}</span>
                </span>
                <span className={`tabular pr-12 text-lg font-medium ${target.future === 0 ? 'text-muted' : 'text-ink'}`}>{target.future}%</span>
              </div>
            </div>
            {target.future === 0 ? <InfoNote>{s.atLimit}</InfoNote> : <p className="text-xs leading-4 text-muted">{s.help}</p>}
          </>
        ) : (
          <div role="radiogroup" aria-label={s.title} className="flex flex-col">
            {TARGET_PRESETS.map((p, i) => (
              <RadioRow key={presetLabel(p)} checked={sameTarget(p, target)} title={presetLabel(p)} note={s.presetNotes[i]} onSelect={() => (setTarget(p), setFailed(false))} />
            ))}
            <RadioRow checked={false} title={s.custom} note={s.customNote} onSelect={() => setCustom(true)} />
          </div>
        )}
      </div>
    </Sheet>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`tabular inline-flex h-10 items-center rounded-full border px-3.5 text-sm font-medium ${on ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-ink-2 hover:bg-track'}`}
    >
      {children}
    </button>
  )
}

/** The target as a bar; editable: two handles for the divisions (drag, or arrow keys). */
function TargetBar({ target, editable, onChange }: { target: BalanceTarget; editable: boolean; onChange(essential: number, lifestyle: number): void }) {
  const { t } = useI18n()
  const s = t.spendingBalance.targetSheet
  const bar = useRef<HTMLDivElement>(null)
  const dragging = useRef<0 | 1 | null>(null)
  const split = target.essential + target.lifestyle
  const at = (e: ReactPointerEvent) => {
    const r = bar.current!.getBoundingClientRect()
    return Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 100)
  }
  // The first division moves Essencial against Estilo de vida (Futuro stays); the second, Estilo de vida against Futuro.
  const move = (which: 0 | 1, v: number) => (which === 0 ? onChange(Math.min(v, split), split - Math.min(v, split)) : onChange(target.essential, Math.max(v, target.essential) - target.essential))
  const handle = (which: 0 | 1) => {
    const value = which === 0 ? target.essential : split
    const onKey = (e: KeyboardEvent) => {
      const d = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key]
      if (!d) return
      e.preventDefault()
      move(which, value + d * (e.shiftKey ? STEP : 1))
    }
    return (
      <span
        key={which}
        role="slider"
        tabIndex={0}
        aria-label={s.dividers[which]}
        aria-valuemin={which === 0 ? 0 : target.essential}
        aria-valuemax={which === 0 ? split : 100}
        aria-valuenow={value}
        aria-valuetext={`${value}%`}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          dragging.current = which
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => dragging.current === which && move(which, at(e))}
        onPointerUp={() => (dragging.current = null)}
        className="absolute top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent"
        style={{ left: `${value}%` }}
      >
        <span className="size-6 rounded-full border-2 border-ink bg-surface shadow-sm" />
      </span>
    )
  }
  return (
    <div role={editable ? 'group' : 'img'} aria-label={s.aria(target.essential, target.lifestyle, target.future)} className={`relative py-[5px] ${editable ? 'mx-3' : ''}`}>
      <div ref={bar} className="flex h-7 gap-0.5 overflow-hidden rounded-[9px] bg-surface">
        {(['essential', 'lifestyle', 'future'] as const)
          .filter((k) => target[k] > 0)
          .map((k) => (
            <span key={k} className="min-w-0" style={{ flex: `${target[k]} 1 0`, background: GROUP_FILL[k] }} />
          ))}
      </div>
      {editable && (
        <>
          {handle(0)}
          {handle(1)}
        </>
      )}
    </div>
  )
}

/** − value + for a group: a tap moves 5 points (to the next multiple of 5), holding moves 1 at a time. */
function Stepper({ label, part, value, canUp, onChange }: { label: string; part: 'essential' | 'lifestyle'; value: number; canUp: boolean; onChange(v: number): void }) {
  const { t } = useI18n()
  const s = t.spendingBalance.targetSheet
  const btn =
    'flex size-11 shrink-0 items-center justify-center rounded-md border border-line text-ink-2 hover:bg-track disabled:text-line disabled:hover:bg-transparent touch-none select-none'
  return (
    <div className="flex min-h-16 items-center gap-3 border-t border-line">
      <GroupSwatch part={part} />
      <span className="min-w-0 flex-1 truncate text-[15px] leading-5 font-medium text-ink">{label}</span>
      <HoldButton className={btn} label={s.decrease(label)} disabled={value <= 0} onStep={(fine) => onChange(fine ? value - 1 : Math.ceil(value / STEP) * STEP - STEP)}>
        <Icon name="minus" className="size-5" strokeWidth={2} />
      </HoldButton>
      <span className="tabular w-[52px] text-center text-lg font-medium text-ink">{value}%</span>
      <HoldButton className={btn} label={s.increase(label)} disabled={!canUp} onStep={(fine) => onChange(fine ? value + 1 : Math.floor(value / STEP) * STEP + STEP)}>
        <Icon name="plus" className="size-5" strokeWidth={2} />
      </HoldButton>
    </div>
  )
}

/** A button that steps once on a tap, and repeatedly in fine steps while held. */
function HoldButton({ className, label, disabled, onStep, children }: { className: string; label: string; disabled: boolean; onStep(fine: boolean): void; children: ReactNode }) {
  const step = useRef(onStep)
  useEffect(() => {
    step.current = onStep
  }, [onStep])
  const timer = useRef<number | null>(null)
  const held = useRef(false)
  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => stop, [])
  useEffect(() => {
    if (disabled) stop()
  }, [disabled])
  const repeat = () => {
    step.current(true)
    timer.current = window.setTimeout(repeat, REPEAT_MS)
  }
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className={className}
      onPointerDown={() => {
        held.current = false
        timer.current = window.setTimeout(() => {
          held.current = true
          repeat()
        }, HOLD_MS)
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      // A tap (or Enter/Space) steps 5; a hold already stepped one at a time.
      onClick={() => {
        if (!held.current) step.current(false)
        held.current = false
      }}
    >
      {children}
    </button>
  )
}
