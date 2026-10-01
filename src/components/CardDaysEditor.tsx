import { useId, useState } from 'react'
import type { Account } from '../data/types'
import { useData } from '../state'
import { useI18n } from '../i18n/I18nProvider'
import { Button } from './ui'
import { Icon } from './Icon'

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

/**
 * Under a card on Accounts: its closing and due days, which the owner can set
 * when the bank doesn't report them (or reports wrong ones). Saved on this
 * device; the bill and dates then follow them.
 */
export function CardDaysEditor({ account }: { account: Account }) {
  const { t } = useI18n()
  const { setCardDays } = useData()
  const ids = useId()
  const credit = account.creditData!
  const user = credit.userDays
  const bankHasDates = !user && Boolean(credit.balanceCloseDate)
  const [editing, setEditing] = useState(false)
  const [close, setClose] = useState(user?.close ?? Number(credit.balanceCloseDate?.slice(8, 10) ?? 1))
  const [due, setDue] = useState(user?.due ?? Number(credit.balanceDueDate?.slice(8, 10) ?? 10))

  if (!editing)
    return (
      <div className="flex flex-col gap-2 px-4 pb-4 lg:px-5">
        {!user && !bankHasDates && <p className="text-[13px] leading-[18px] text-ink-2">{t.accounts.cardDays.missing}</p>}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-sm text-left text-sm font-medium text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          <Icon name="installments" className="size-[18px]" strokeWidth={1.9} />
          {user ? (
            <span>
              <span className="text-ink-2">{t.accounts.cardDays.summary(user.close, user.due)}</span> · {t.accounts.cardDays.edit}
            </span>
          ) : (
            t.accounts.cardDays.set
          )}
        </button>
      </div>
    )

  const select = (id: string, label: string, value: number, onChange: (n: number) => void) => (
    <label htmlFor={id} className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-xs leading-4 text-muted">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="tabular h-12 rounded-md border border-line bg-surface px-3 text-[15px] text-ink focus-visible:outline-2 focus-visible:outline-accent"
      >
        {DAYS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="flex flex-col gap-3 border-t border-line bg-page px-4 py-4 lg:px-5">
      <div className="flex gap-3">
        {select(`${ids}-close`, t.accounts.cardDays.closeDay, close, setClose)}
        {select(`${ids}-due`, t.accounts.cardDays.dueDay, due, setDue)}
      </div>
      <p className="text-xs leading-4 text-muted">{t.accounts.cardDays.note}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            setCardDays(account.id, { close, due })
            setEditing(false)
          }}
        >
          {t.accounts.cardDays.save}
        </Button>
        <Button variant="secondary" onClick={() => setEditing(false)}>
          {t.accounts.cardDays.cancel}
        </Button>
        {user && (
          <Button
            variant="text"
            onClick={() => {
              setCardDays(account.id, null)
              setEditing(false)
            }}
          >
            {t.accounts.cardDays.useBank}
          </Button>
        )}
      </div>
    </div>
  )
}
