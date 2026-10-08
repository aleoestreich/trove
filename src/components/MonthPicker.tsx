import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatDay, formatMonth, formatMonthName } from '../lib/dates'
import { useIsDesktop } from '../lib/useIsDesktop'
import { useI18n } from '../i18n/I18nProvider'
import { Icon } from './Icon'

/** "outubro de 2026": the month as it reads in the picker's bar. */
export const monthTitle = (month: string) => `${formatMonthName(month)} de ${month.slice(0, 4)}`

/**
 * ‹ outubro de 2026 ⌄ ›: steps through `months` (oldest first), and the name
 * opens "Escolher mês": every month, grouped by year, with its number of
 * transactions, or "Salvo no servidor" for one not loaded yet (`counts`
 * has no entry). A bottom sheet on phones, a 320px popover on desktop.
 * Under the bar: "Mês atual · até hoje, 8 out." or "Mês fechado".
 */
export function MonthPicker({
  month,
  months,
  latest,
  today,
  counts,
  onChange,
}: {
  month: string
  months: string[]
  latest: string
  today: string
  counts: Map<string, number>
  onChange(m: string): void
}) {
  const { t } = useI18n()
  const o = t.overview
  const [open, setOpen] = useState(false)
  const desktop = useIsDesktop()
  const anchor = useRef<HTMLDivElement>(null)
  const i = months.indexOf(month)
  const btn = 'flex size-12 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-track active:bg-track disabled:text-line disabled:hover:bg-transparent'
  const pick = (m: string) => {
    setOpen(false)
    onChange(m)
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div ref={anchor} className="relative flex items-center rounded-md bg-page">
        <button type="button" className={btn} disabled={i <= 0} onClick={() => onChange(months[i - 1])} aria-label={t.previousMonth}>
          <Icon name="chevronLeft" className="size-[22px]" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={o.monthPicker.open(formatMonth(month))}
          className="flex h-12 min-w-0 flex-1 items-center justify-center gap-1 rounded-md text-[16px] text-ink hover:bg-track"
        >
          <span className="truncate">{monthTitle(month)}</span>
          <Icon name="chevronDown" className="size-[18px] shrink-0 text-ink-2" strokeWidth={2} />
        </button>
        <button type="button" className={btn} disabled={i < 0 || i >= months.length - 1} onClick={() => onChange(months[i + 1])} aria-label={t.nextMonth}>
          <Icon name="chevronRight" className="size-[22px]" strokeWidth={2} />
        </button>
        {open && desktop && (
          <MonthPopover onClose={() => setOpen(false)}>
            <MonthList month={month} months={months} latest={latest} counts={counts} onPick={pick} />
          </MonthPopover>
        )}
      </div>
      <p className="text-center text-xs leading-4 text-muted">{month === latest ? o.currentMonth(formatDay(today)) : o.closedMonth}</p>
      {open && !desktop && (
        <MonthSheet title={o.monthPicker.title} subtitle={o.monthPicker.subtitle} onClose={() => setOpen(false)}>
          <MonthList month={month} months={months} latest={latest} counts={counts} onPick={pick} />
        </MonthSheet>
      )}
    </div>
  )
}

/**
 * The months by year, newest first; the chosen one tinted with a check.
 * `all`: "Todos os meses" on top (Transações), chosen when `month` is "all".
 */
export function MonthList({
  month,
  months,
  latest,
  counts,
  onPick,
  all,
}: {
  month: string
  months: string[]
  latest: string
  counts: Map<string, number>
  onPick(m: string): void
  all?: { label: string; note: string }
}) {
  const { t } = useI18n()
  const p = t.overview.monthPicker
  const years = [...new Set(months.map((m) => m.slice(0, 4)))].sort().reverse()
  const row = (on: boolean) => `flex min-h-14 items-center gap-3 rounded-md px-2 py-1.5 text-left ${on ? 'bg-accent-faint' : 'hover:bg-track'}`
  return (
    <div className="flex flex-col">
      {all && (
        <button type="button" aria-current={month === 'all' || undefined} onClick={() => onPick('all')} className={row(month === 'all')}>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={`text-[15px] leading-5 ${month === 'all' ? 'text-accent' : 'text-ink'}`}>{all.label}</span>
            <span className="text-[13px] leading-[18px] text-muted">{all.note}</span>
          </span>
          {month === 'all' && <Icon name="check" className="size-[18px] shrink-0 text-accent" strokeWidth={2.2} />}
        </button>
      )}
      {years.map((y) => (
        <div key={y} role="group" aria-label={y} className="flex flex-col gap-1">
          <p className="px-2 pt-2 pb-1 text-xs leading-4 text-muted">{y}</p>
          {months
            .filter((m) => m.startsWith(y))
            .reverse()
            .map((m) => {
              const on = m === month
              const n = counts.get(m)
              return (
                <button
                  key={m}
                  type="button"
                  aria-current={on || undefined}
                  onClick={() => onPick(m)}
                  className={row(on)}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={`text-[15px] leading-5 ${on ? 'text-accent' : 'text-ink'}`}>{formatMonth(m)}</span>
                    <span className="inline-flex items-center gap-1 text-[13px] leading-[18px] text-muted">
                      {n === undefined ? (
                        <>
                          <Icon name="cloudCheck" className="size-3.5" />
                          {p.onServer}
                        </>
                      ) : m === latest ? (
                        `${p.current} · ${p.count(n)}`
                      ) : (
                        p.count(n)
                      )}
                    </span>
                  </span>
                  {on && <Icon name="check" className="size-[18px] shrink-0 text-accent" strokeWidth={2.2} />}
                </button>
              )
            })}
        </div>
      ))}
    </div>
  )
}

/** Phones: the month list in a bottom sheet over a scrim; Esc and the scrim close it. */
export function MonthSheet({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose(): void; children: React.ReactNode }) {
  const { t } = useI18n()
  useEscape(onClose)
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-scrim" onClick={onClose}>
      <section
        role="dialog"
        aria-modal
        aria-labelledby="month-picker-title"
        className="flex max-h-[85dvh] w-full max-w-[480px] flex-col rounded-t-xl bg-surface pb-[calc(8px+env(safe-area-inset-bottom))] [&>*]:shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-[22px] items-center justify-center" aria-hidden>
          <span className="h-1 w-8 rounded-full bg-line" />
        </div>
        <div className="flex items-start gap-3 px-4 pb-1">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 id="month-picker-title" className="text-xl leading-[26px] font-medium text-ink">
              {title}
            </h2>
            <span className="text-[13px] leading-[18px] text-ink-2">{subtitle}</span>
          </span>
          <button type="button" onClick={onClose} aria-label={t.close} autoFocus className="-mr-2 flex size-12 items-center justify-center rounded-full text-ink-2 hover:bg-track">
            <Icon name="close" className="size-[22px]" strokeWidth={2} />
          </button>
        </div>
        <div className="!shrink overflow-y-auto px-2 pb-2">{children}</div>
      </section>
    </div>,
    document.body,
  )
}

/**
 * Desktop: a 320px popover under its anchor (the parent, which must be
 * positioned), scrolling; Esc or a click outside the anchor closes it.
 * `align`: centred under the anchor, or from its left edge.
 */
export function MonthPopover({ onClose, children, align = 'center' }: { onClose(): void; children: React.ReactNode; align?: 'center' | 'left' }) {
  const ref = useRef<HTMLDivElement>(null)
  useEscape(onClose)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.parentElement!.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])
  return (
    <div
      ref={ref}
      role="dialog"
      className={`absolute top-[calc(100%+6px)] z-30 max-h-[480px] w-[320px] overflow-y-auto rounded-lg border border-line bg-surface p-2 shadow-lg ${align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0'}`}
    >
      {children}
    </div>
  )
}

function useEscape(onClose: () => void) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
