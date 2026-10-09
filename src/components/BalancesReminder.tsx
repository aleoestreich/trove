import { useState } from 'react'
import { fgtsDue, fgtsLatest } from '../data/fgts'
import { pensionDue, planLatest } from '../data/pension'
import { useData } from '../state'
import { useI18n } from '../i18n/I18nProvider'
import { formatDay } from '../lib/dates'
import { Icon } from './Icon'
import { FgtsMark, useFgtsSheets } from './Fgts'
import { PlanMark, usePensionSheets } from './Pension'
import { btn } from './ManualBalance'

const LATER_KEY = 'trove.balancesReminderLater'

/**
 * Visão geral, under the sync bar: the balances typed in by hand that are due
 * for an update. The FGTS from the 20th of a month without its balance (or a
 * month after the latest); a previdência plan a month after its latest (or
 * with none). One of them: its own card; both: one card with a row and an
 * "Atualizar" each. With several plans due, "Atualizar saldo" asks which.
 * "Agora não" hides it on this device until the next day.
 */
export function BalancesReminder({ className = '' }: { className?: string }) {
  const { fgts, pension, today } = useData()
  const { t } = useI18n()
  const [later, setLater] = useState(() => {
    try {
      return localStorage.getItem(LATER_KEY)
    } catch {
      return null
    }
  })
  const [openFgts, fgtsSheet] = useFgtsSheets()
  const [openPension, pensionSheet] = usePensionSheets()
  const sheets = (
    <>
      {fgtsSheet}
      {pensionSheet}
    </>
  )

  const fgtsIsDue = fgtsDue(fgts, today)
  const plans = pensionDue(pension, today)
  if ((!fgtsIsDue && plans.length === 0) || later === today) return sheets

  const fgtsLast = fgtsLatest(fgts)?.latest
  const updateFgts = () => openFgts({ kind: 'update' })
  const updatePlans = () => (plans.length === 1 ? openPension({ kind: 'update', planId: plans[0].id }) : openPension({ kind: 'choose' }))
  const dismiss = (
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
      {t.fgts.reminder.later}
    </button>
  )
  const card = `flex flex-col gap-2 rounded-lg border border-accent/40 bg-accent-faint p-3.5 lg:p-4 ${className}`

  // Both: one card, a row each.
  if (fgtsIsDue && plans.length > 0) {
    const b = t.balancesReminder
    const one = plans.length === 1 ? plans[0] : null
    const row = (mark: React.ReactNode, title: string, sub: string, onUpdate: () => void) => (
      <div className="flex items-center gap-3 py-2">
        {mark}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-base leading-[22px] text-ink">{title}</span>
          <span className="text-[13px] leading-[18px] text-ink-2">{sub}</span>
        </span>
        <button type="button" onClick={onUpdate} aria-label={`${b.update} ${title}`} className="h-11 shrink-0 rounded-md border border-line bg-surface px-3 text-sm font-medium text-accent hover:bg-track">
          {b.update}
        </button>
      </div>
    )
    return (
      <>
        <section role="status" className={card}>
          <span className="flex flex-col gap-0.5">
            <span className="text-base leading-[22px] font-medium text-ink">{b.title}</span>
            <span className="text-[13px] leading-[18px] text-ink-2">{b.note}</span>
          </span>
          <div className="flex flex-col divide-y divide-accent/20">
            {row(<FgtsMark size={36} />, t.fgts.section, fgtsLast ? b.fgtsSub(formatDay(fgtsLast.date)) : t.fgts.reminder.first, updateFgts)}
            {one
              ? row(<PlanMark size={36} />, one.name, planLatest(one) ? b.planLate : b.planNew, updatePlans)
              : row(<PlanMark size={36} />, b.plansLabel, b.plansLate(plans.length), updatePlans)}
          </div>
          <div className="flex justify-end">{dismiss}</div>
        </section>
        {sheets}
      </>
    )
  }

  // One of them.
  const r = t.fgts.reminder
  const p = t.pension.reminder
  const one = plans.length === 1 ? plans[0] : null
  const [mark, title, sub, onUpdate] = fgtsIsDue
    ? [<FgtsMark size={36} />, r.title, fgtsLast ? r.last(formatDay(fgtsLast.date)) : r.first, updateFgts]
    : [<PlanMark size={36} />, p.title, one ? (planLatest(one) ? p.oneLate(one.name) : p.oneNew(one.name)) : p.many(plans.length), updatePlans]
  return (
    <>
      <section role="status" className={`${card} lg:flex-row lg:items-end`}>
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {mark}
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-base leading-[22px] text-ink">{title}</span>
            <span className="text-[13px] leading-[18px] text-ink-2">{sub}</span>
          </span>
        </div>
        <div className="flex items-center justify-end gap-2">
          {dismiss}
          <button type="button" onClick={onUpdate} className={`${btn.primary} h-11 text-sm`}>
            <Icon name="plus" className="size-[18px]" strokeWidth={2} />
            {r.action}
          </button>
        </div>
      </section>
      {sheets}
    </>
  )
}
