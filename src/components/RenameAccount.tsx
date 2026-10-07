import { useId, useState } from 'react'
import type { Account } from '../data/types'
import { NAME_MAX, cleanName } from '../data/edits'
import { useData } from '../state'
import { useI18n } from '../i18n/I18nProvider'
import { Icon } from './Icon'
import { Button } from './ui'
import { Sheet } from './insights/parts'

/** The pencil next to an account or card on Accounts (44px): opens the rename sheet. */
export function RenameButton({ account, label, bankLabel, className = '' }: { account: Account; label: string; bankLabel: string; className?: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.accounts.rename.action(label)}
        aria-haspopup="dialog"
        className={`flex size-11 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-track focus-visible:outline-2 focus-visible:outline-accent ${className}`}
      >
        <Icon name="edit" className="size-[18px]" />
      </button>
      {open && <RenameSheet account={account} bankLabel={bankLabel} onClose={() => setOpen(false)} />}
    </>
  )
}

/**
 * A name for the account in Trove. Saved in the database apart from the
 * bank's data, so a sync never changes it; "Usar o nome do banco" removes it.
 */
function RenameSheet({ account, bankLabel, onClose }: { account: Account; bankLabel: string; onClose(): void }) {
  const { t } = useI18n()
  const { edit } = useData()
  const r = t.accounts.rename
  const id = useId()
  const [name, setName] = useState(account.nickname ?? bankLabel)
  const clean = cleanName(name)
  const tooLong = clean.length > NAME_MAX
  const save = (value: string | null) => {
    // The bank's own name, unchanged, needs nothing stored.
    edit({ op: 'renameAccount', accountId: account.id, name: value && value !== bankLabel ? value : null })
    onClose()
  }
  return (
    <Sheet title={account.type === 'CREDIT' ? r.titleCard : r.titleAccount} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!tooLong) save(clean || null)
        }}
      >
        <label htmlFor={id} className="mt-1 flex flex-col gap-1">
          <span className="text-xs leading-4 text-muted">{r.label}</span>
          <input
            id={id}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={NAME_MAX + 10}
            autoComplete="off"
            className="h-12 rounded-md border border-line bg-surface px-3 text-[15px] text-ink focus-visible:outline-2 focus-visible:outline-accent"
          />
        </label>
        {tooLong && <p className="text-xs text-critical">{r.tooLong(NAME_MAX)}</p>}
        <p className="text-xs leading-4 text-muted">
          {r.bankName(bankLabel)} · {r.note}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={tooLong}
            className="inline-flex h-12 items-center justify-center rounded-md bg-accent px-5 text-[15px] font-medium text-surface active:opacity-80 disabled:opacity-60"
          >
            {r.save}
          </button>
          <Button variant="secondary" onClick={onClose}>
            {r.cancel}
          </Button>
          {account.nickname && (
            <Button variant="text" onClick={() => save(null)}>
              {r.useBank}
            </Button>
          )}
        </div>
      </form>
    </Sheet>
  )
}
