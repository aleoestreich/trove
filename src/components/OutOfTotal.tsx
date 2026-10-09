import { useId, useState } from 'react'
import { fgtsLatest } from '../data/fgts'
import { pensionTotal } from '../data/pension'
import { useData } from '../state'
import { useI18n } from '../i18n/I18nProvider'
import { formatMoney } from '../lib/money'
import { Icon } from './Icon'
import { Disc } from './ManualBalance'
import { FgtsCard } from './Fgts'
import { PensionCard } from './Pension'

// "Fora do total": the balances typed in by hand (FGTS and previdência
// privada), never added to net worth. On Visão geral, a dashed group under the
// net worth tiles; on Accounts, the section with their cards.

/**
 * Under net worth's tiles: "Fora do total ⓘ" and one dashed box with a row
 * each for the FGTS and the previdência plans' total, when tracked and with a
 * balance. ⓘ says why they're left out.
 */
export function OutOfTotalGroup() {
  const { fgts, pension } = useData()
  const { t } = useI18n()
  const o = t.outOfTotal
  const [open, setOpen] = useState(false)
  const note = useId()
  const fgtsBalance = fgts.tracking ? fgtsLatest(fgts)?.latest.balance : undefined
  const pensionBalance = pension.tracking ? pensionTotal(pension)?.total : undefined
  if (fgtsBalance === undefined && pensionBalance === undefined) return null
  const why = fgtsBalance !== undefined && pensionBalance !== undefined ? o.whyBoth : fgtsBalance !== undefined ? o.whyFgts : o.whyPension

  const row = (icon: 'savings' | 'piggy', tint: 'teal' | 'indigo', label: string, amount: number) => (
    <div className="flex min-h-12 items-center gap-2.5 px-3">
      <Disc icon={icon} tint={tint} size={28} />
      <span className="min-w-0 flex-1 truncate text-sm leading-[19px] text-ink-2">{label}</span>
      <span className="tabular text-[15px] leading-5 font-medium whitespace-nowrap text-ink-2">{formatMoney(amount)}</span>
    </div>
  )
  return (
    <div role="group" aria-label={o.title} className="flex flex-col gap-1.5">
      <span className="flex items-center gap-0.5 text-xs leading-4 text-muted">
        {o.title}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={o.whyLabel}
          aria-expanded={open}
          aria-controls={note}
          className="-my-3 flex size-11 items-center justify-center rounded-full text-muted hover:text-ink-2"
        >
          <Icon name="info" className="size-3.5" />
        </button>
      </span>
      {open && (
        <p id={note} className="-mt-1 text-xs leading-4 text-ink-2">
          {why}
        </p>
      )}
      <div className="flex flex-col divide-y divide-dashed divide-line rounded-md border-[1.5px] border-dashed border-line">
        {fgtsBalance !== undefined && row('savings', 'teal', t.fgts.section, fgtsBalance)}
        {pensionBalance !== undefined && row('piggy', 'indigo', t.pension.section, pensionBalance)}
      </div>
    </div>
  )
}

/** Accounts: "Fora do total · Informados à mão", then the FGTS and previdência cards. */
export function OutOfTotalSection() {
  const { t } = useI18n()
  const head = useId()
  return (
    <section aria-labelledby={head} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-1 pt-2">
        <h2 id={head} className="text-base leading-[22px] font-medium text-ink">
          {t.outOfTotal.title}
        </h2>
        <span className="text-xs leading-4 text-muted">{t.outOfTotal.manual}</span>
      </div>
      <FgtsCard />
      <PensionCard />
    </section>
  )
}
