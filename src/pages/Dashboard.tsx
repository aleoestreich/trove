import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useData } from '../state'
import type { OverviewSection, Transaction } from '../data/types'
import { fillRows, isDefaultLayout, shownSections } from '../data/overviewLayout'
import { closedMonth, showsClose } from '../data/monthClose'
import { CustomizeButton, OverviewLayoutSheet } from '../components/OverviewLayout'
import { MonthCloseCard, useMonthClose } from '../components/MonthClose'
import { NetWorthCard } from '../components/overview/NetWorth'
import { CommitmentsCard } from '../components/overview/Commitments'
import { ThisMonthCard } from '../components/overview/ThisMonth'
import { AlertsCard } from '../components/overview/Alerts'
import { TrendsCard } from '../components/overview/Trends'
import { MonthDetailCard } from '../components/overview/MonthDetail'
import { SyncBar } from '../components/SyncBar'
import { BalancesReminder } from '../components/BalancesReminder'
import { TransactionSheet } from '../components/TransactionSheet'
import { PageHeader } from '../components/ui'
import { formatFullDate } from '../lib/dates'
import { useI18n } from '../i18n/I18nProvider'
import { useIsDesktop } from '../lib/useIsDesktop'

/** Each card's usual width on desktop, of 12 columns (a custom layout fills its rows from these). */
const DESKTOP_SPAN: Record<OverviewSection, number> = {
  netWorth: 7,
  comingUp: 5,
  monthClose: 12,
  thisMonth: 12,
  alerts: 12,
  trends: 12,
  monthInDetail: 12,
}

/**
 * Visão geral: seven cards, each answering one question.
 * - Patrimônio: what do I have, and where? (with Compromissos beside it on desktop)
 * - Fechamento do mês: how did last month go? (the 1st to the 10th)
 * - Este mês: where is this month heading? (projection, Equilíbrio, 13º)
 * - Alertas: what needs my attention?
 * - Compromissos: what's already committed? (bills, installments, recurring)
 * - Tendências: how have the last months gone?
 * - Mês em detalhe: what happened this month so far?
 * Phones show them in the saved order. Desktop arranges the default order in
 * a 12-column grid; a custom order fills its rows in that order.
 */
export function Dashboard() {
  const { overviewLayout, today } = useData()
  const isDesktop = useIsDesktop()
  const { t } = useI18n()
  const [selected, setSelected] = useState<Transaction | null>(null)
  const [customizing, setCustomizing] = useState(false)
  // "Personalizar" goes in the app's mobile header.
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null)
  useEffect(() => setHeaderSlot(document.getElementById('header-actions')), [])

  // The month just closed: on the Visão geral in the first days of the next one.
  const close = useMonthClose(closedMonth(today))
  const closeShown = !!close && showsClose(today) && !overviewLayout.hidden.includes('monthClose')

  const sections: Record<OverviewSection, ReactNode> = {
    netWorth: <NetWorthCard className="lg:order-1 lg:col-span-7" />,
    comingUp: <CommitmentsCard className="lg:order-2 lg:col-span-5" />,
    monthClose: close && <MonthCloseCard close={close} />,
    thisMonth: <ThisMonthCard className="lg:order-4 lg:col-span-12" />,
    alerts: <AlertsCard closeShown={closeShown} className="lg:order-5 lg:col-span-12" />,
    trends: <TrendsCard className="lg:order-6 lg:col-span-12" />,
    monthInDetail: <MonthDetailCard onSelect={setSelected} className="lg:order-7 lg:col-span-12" />,
  }
  // The Fechamento takes no place outside the first days of the month (or without data).
  const shown = shownSections(overviewLayout).filter((x) => x !== 'monthClose' || closeShown)
  // A custom layout on desktop: the cards in its order, rows filled.
  const custom = !isDefaultLayout(overviewLayout)
  const spans = fillRows(shown.map((x) => DESKTOP_SPAN[x]))

  return (
    <>
      <PageHeader title={t.nav.overview} subtitle={t.overview.subtitle(formatFullDate(today))}>
        {isDesktop && <CustomizeButton onClick={() => setCustomizing(true)} />}
      </PageHeader>
      {!isDesktop && headerSlot && createPortal(<CustomizeButton compact onClick={() => setCustomizing(true)} />, headerSlot)}
      <SyncBar className="mb-3" />
      <BalancesReminder className="mb-3 lg:mb-5" />

      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-12 lg:gap-5">
        {custom
          ? shown.map((x, i) => (
              <div key={x} className="flex flex-col lg:[&>*]:flex-1" style={isDesktop ? { gridColumn: `span ${spans[i]}` } : undefined}>
                {sections[x]}
              </div>
            ))
          : shown.map((x) => <Fragment key={x}>{sections[x]}</Fragment>)}
        {shown.length === 0 && <p className="px-1 py-6 text-center text-sm leading-5 text-muted lg:col-span-12">{t.overview.layout.allHidden}</p>}
      </div>

      {customizing && <OverviewLayoutSheet onClose={() => setCustomizing(false)} />}
      {selected && <TransactionSheet key={selected.id} tx={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
