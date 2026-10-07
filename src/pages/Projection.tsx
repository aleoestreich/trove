import { useState } from 'react'
import { useData } from '../state'
import { useI18n } from '../i18n/I18nProvider'
import { Card } from '../components/ui'
import { Icon } from '../components/Icon'
import { formatDay, formatMonthName } from '../lib/dates'
import { formatCompactMoney, formatMoney } from '../lib/money'
import { bankName, describeEvent, joinList } from '../lib/insightText'
import { DEFAULT_PROJECTION_SETTINGS, projectionAccounts, type Projection as ProjectionData } from '../data/projection'
import type { Account, Institution } from '../data/types'
import { ProjectionChart, ProjectionLegend, Waterfall } from '../components/insights/ProjectionChart'
import { useLowNote, useProjectionLines } from '../components/insights/cards'
import { DetailHeader, Sheet, SwitchRow, capitalize } from '../components/insights/parts'
import { SelectBox } from '../components/SelectBox'

/**
 * "Previsão do fim do mês": the figure and the daily chart, how it adds up
 * (each value once), what's coming, and what the calculation counts.
 * Desktop: two columns.
 */
export function Projection() {
  const { insights, today } = useData()
  const { t } = useI18n()
  const p = t.insights.projection
  const projection = insights.projection
  return (
    <>
      <DetailHeader title={p.title} subtitle={p.subtitle(capitalize(formatMonthName(today.slice(0, 7))), formatDay(today))} />
      {projection ? (
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
          <div className="flex flex-col gap-3 lg:gap-5">
            <FigureCard projection={projection} />
            <HowCard projection={projection} />
          </div>
          <div className="flex flex-col gap-3 lg:gap-5">
            <EventsCard projection={projection} />
            <SettingsCard />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 lg:max-w-[560px]">
          <Card>
            <p className="text-sm leading-5 text-ink-2">{p.empty}</p>
          </Card>
          <SettingsCard />
        </div>
      )}
    </>
  )
}

function FigureCard({ projection }: { projection: ProjectionData }) {
  const { t } = useI18n()
  const p = t.insights.projection
  const lowNote = useLowNote(projection)
  return (
    <Card className="flex flex-col">
      <p className="text-[13px] leading-[18px] text-muted">{p.shouldRemain(formatDay(projection.endDate))}</p>
      <p className="tabular text-[34px] leading-[42px] font-bold tracking-[-0.02em] text-ink">{formatMoney(projection.end)}</p>
      <p className="tabular text-[13px] leading-[18px] text-ink-2">
        {p.range(formatCompactMoney(projection.range.min), formatCompactMoney(projection.range.max))}
      </p>
      <div className="mt-4">
        <ProjectionChart projection={projection} variant="full" />
      </div>
      <p className="mt-1.5 flex items-center gap-1.5 text-xs leading-4 text-ink-2">
        <span aria-hidden className="size-2 shrink-0 rounded-full border-2 border-critical" />
        {lowNote}
      </p>
      <div className="mt-2">
        <ProjectionLegend />
      </div>
    </Card>
  )
}

function HowCard({ projection }: { projection: ProjectionData }) {
  const { t } = useI18n()
  const { accounts, institutions } = useData()
  const p = t.insights.projection
  const lines = useProjectionLines(projection)
  const b = projection.breakdown
  const bills = projection.events.filter((e) => e.kind === 'bill')
  const recurring = projection.events.filter((e) => e.kind === 'recurring')
  const salary = projection.events.find((e) => e.kind === 'salary')
  const notes: Record<string, string> = {
    saldo: p.notes.saldo(joinList(projection.accountIds.map((id) => accountLabel(id, accounts, institutions)))),
    receitas:
      b.receitasPrevistas > 0
        ? p.notes.receitas(salary ? Number(salary.date.slice(8, 10)) : projection.salary.day, projection.settings.includeFreelance)
        : p.notes.receitasNone,
    faturas: bills.length
      ? p.notes.faturas(joinList(bills.map((e) => (e.kind === 'bill' ? bankName(e.accountId, accounts, institutions) : ''))), formatMoney(b.parcelasDentroDasFaturas))
      : p.notes.faturasNone,
    recorrentes: recurring.length ? p.notes.recorrentes(shortList(recurring.map((e) => describeEvent(e, accounts, institutions).name), p.andMore)) : p.notes.recorrentesNone,
    diaADia: projection.settings.includeDaily ? p.notes.diaADia(formatMoney(projection.dailyAverage)) : p.notes.diaADiaOff,
  }
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base leading-[22px] font-medium text-ink">{p.howTitle}</h2>
        <p className="text-[13px] leading-[18px] text-muted">{p.howSub}</p>
      </div>
      <Waterfall projection={projection} />
      <dl className="border-t border-line">
        {lines.map((l) => (
          <div key={l.key} className="flex min-h-[52px] items-center justify-between gap-3 border-b border-line py-1.5">
            <dt className="flex min-w-0 flex-col gap-px">
              <span className="text-sm leading-[19px] text-ink">{l.label}</span>
              <span className="text-xs leading-4 text-muted">{notes[l.key]}</span>
            </dt>
            <dd className={`tabular text-sm font-medium whitespace-nowrap ${l.income ? 'text-income' : 'text-ink'}`}>{l.value}</dd>
          </div>
        ))}
        <div className="flex min-h-11 items-center justify-between gap-3">
          <dt className="text-sm font-medium text-ink">{p.lines.total}</dt>
          <dd className="tabular text-[15px] font-bold text-ink">{formatMoney(projection.end)}</dd>
        </div>
      </dl>
    </Card>
  )
}

/** Up to 2 names, then how many more: "Unimed, Aluguel e mais 4". */
function shortList(names: string[], andMore: (names: string, n: number) => string): string {
  const unique = [...new Set(names)]
  return unique.length <= 2 ? joinList(unique) : andMore(unique.slice(0, 2).join(', '), unique.length - 2)
}

/** "Nubank" or, with several accounts at one bank, "Nubank · Conta corrente". */
function accountLabel(id: string, accounts: Account[], institutions: Institution[]): string {
  const account = accounts.find((a) => a.id === id)
  if (!account) return ''
  const bank = bankName(id, accounts, institutions)
  const sameBank = accounts.filter((a) => a.type === 'BANK' && a.institutionId === account.institutionId).length > 1
  return sameBank ? `${bank} · ${account.name}` : bank
}

function EventsCard({ projection }: { projection: ProjectionData }) {
  const { t } = useI18n()
  const { accounts, institutions } = useData()
  const p = t.insights.projection
  return (
    <Card className="flex flex-col !pb-1">
      <h2 className="mb-1 text-base leading-[22px] font-medium text-ink">{p.nextTitle}</h2>
      {projection.events.length === 0 && <p className="pb-3 text-sm text-muted">{p.nextNone}</p>}
      <ul>
        {projection.events.map((e, i) => {
          const d = describeEvent(e, accounts, institutions)
          const [day, month] = formatDay(e.date).split(' ')
          return (
            <li key={i} className={`flex min-h-[52px] items-center gap-3 ${i ? 'border-t border-line' : ''}`}>
              <span className="flex w-10 shrink-0 flex-col items-center leading-none">
                <span className="tabular text-base font-bold text-ink">{day}</span>
                <span className="text-[11px] text-muted">{month}</span>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="truncate text-sm leading-[19px] font-medium text-ink">{d.name}</span>
                <span className="truncate text-xs leading-4 text-muted">{d.meta}</span>
              </span>
              <span className={`tabular text-sm font-medium whitespace-nowrap ${e.amount > 0 ? 'text-income' : 'text-ink'}`}>
                {formatMoney(e.amount, 'BRL', { signed: e.amount > 0 })}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/** "O que entra no cálculo": the accounts (a picker) and two switches; every change recalculates at once. */
function SettingsCard() {
  const { t } = useI18n()
  const { accounts, institutions, projectionSettings, saveProjectionSettings } = useData()
  const p = t.insights.projection
  const settings = projectionSettings ?? DEFAULT_PROJECTION_SETTINGS
  const chosen = projectionAccounts(accounts, settings)
  const [picking, setPicking] = useState(false)
  const names = joinList(chosen.map((id) => accountLabel(id, accounts, institutions)))
  return (
    <Card className="flex flex-col !pb-1">
      <h2 className="mb-1 text-base leading-[22px] font-medium text-ink">{p.settingsTitle}</h2>
      <button type="button" onClick={() => setPicking(true)} aria-haspopup="dialog" className="flex min-h-16 items-center gap-3 py-2 text-left">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm leading-[19px] font-medium text-ink">{p.accountsLabel}</span>
          <span className="text-xs leading-4 text-muted">{settings.accountIds ? names : `${names} · ${p.accountsDefault}`}</span>
        </span>
        <Icon name="chevronRight" className="size-5 shrink-0 text-ink-2" strokeWidth={2} />
      </button>
      <SwitchRow
        divider
        label={p.dailyLabel}
        note={p.dailyNote}
        checked={settings.includeDaily}
        onChange={(v) => saveProjectionSettings({ ...settings, includeDaily: v })}
      />
      <SwitchRow
        divider
        label={p.freelanceLabel}
        note={p.freelanceNote}
        checked={settings.includeFreelance}
        onChange={(v) => saveProjectionSettings({ ...settings, includeFreelance: v })}
      />
      {picking && (
        <AccountPicker
          chosen={chosen}
          onClose={() => setPicking(false)}
          onApply={(ids) => {
            saveProjectionSettings({ ...settings, accountIds: ids })
            setPicking(false)
          }}
        />
      )}
    </Card>
  )
}

/** The bank accounts, with a box each; at least one stays chosen. */
function AccountPicker({ chosen, onClose, onApply }: { chosen: string[]; onClose(): void; onApply(ids: string[]): void }) {
  const { t } = useI18n()
  const { accounts, institutions } = useData()
  const p = t.insights.projection
  const [draft, setDraft] = useState(() => new Set(chosen))
  const banks = accounts.filter((a) => a.type === 'BANK')
  const toggle = (id: string) =>
    setDraft((d) => {
      const next = new Set(d)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  return (
    <Sheet
      title={p.accountsLabel}
      onClose={onClose}
      footer={
        <>
          {draft.size === 0 && <p className="mt-2 text-xs text-critical">{p.atLeastOne}</p>}
          <button
            type="button"
            disabled={draft.size === 0}
            onClick={() => onApply(banks.filter((a) => draft.has(a.id)).map((a) => a.id))}
            className="mt-3 h-12 shrink-0 rounded-md bg-accent text-[15px] font-medium text-surface active:opacity-80 disabled:opacity-60"
          >
            {p.apply}
          </button>
        </>
      }
    >
      <p className="text-[13px] leading-[18px] text-muted">{p.accountsSheetNote}</p>
      <ul className="mt-2 flex flex-col">
        {banks.map((a, i) => {
          const on = draft.has(a.id)
          return (
            <li key={a.id} className={i ? 'border-t border-line' : ''}>
              <label className="flex min-h-14 cursor-pointer items-center gap-3">
                <input type="checkbox" checked={on} onChange={() => toggle(a.id)} className="peer sr-only" />
                <span className="rounded-[7px] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                  <SelectBox state={on ? 'on' : 'off'} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className="truncate text-[15px] leading-5 font-medium text-ink">{bankName(a.id, accounts, institutions)}</span>
                  <span className="truncate text-xs leading-4 text-muted">{a.name}</span>
                </span>
                <span className="tabular text-[13px] text-ink-2">
                  {a.foreign ? formatMoney(a.foreign.balance, a.foreign.currency) : formatMoney(a.balance)}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
