import { useEffect, useId, useRef, useState } from 'react'
import type { Account } from '../data/types'
import { NICKNAME_MAX, cleanName } from '../data/edits'
import { useData } from '../state'
import { useI18n } from '../i18n/I18nProvider'
import { Icon } from './Icon'
import { InstitutionBadge } from './BankBadge'
import { Sheet } from './insights/parts'

/** What was saved, for the toast and Desfazer: the name before and after (null: the bank's). */
interface Renamed {
  accountId: string
  before: string | null
  after: string | null
  /** "Banco Exemplo · Conta corrente": what the account is called now. */
  shownAs: string
}

/** The pencil next to an account or card on Accounts (44px): opens the rename sheet. */
export function RenameButton({ account, label, bankLabel, className = '' }: { account: Account; label: string; bankLabel: string; className?: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [renamed, setRenamed] = useState<Renamed | null>(null)
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
      {open && (
        <RenameSheet
          account={account}
          bankLabel={bankLabel}
          onClose={() => setOpen(false)}
          onSaved={(r) => {
            setOpen(false)
            setRenamed(r)
          }}
        />
      )}
      {renamed && <RenamedToast key={`${renamed.accountId}|${renamed.after}`} renamed={renamed} onDone={() => setRenamed(null)} />}
    </>
  )
}

/**
 * The name set in Trove for an account or card ("Apelido"). Saved in the
 * database apart from the bank's data, so a sync never changes it. The
 * bank's name is shown for reference; empty, or "Usar o nome do banco",
 * goes back to it. Saving waits for the server: the sheet stays open,
 * locked, and shows an error if it fails, keeping what was typed.
 */
function RenameSheet({ account, bankLabel, onClose, onSaved }: { account: Account; bankLabel: string; onClose(): void; onSaved(r: Renamed): void }) {
  const { t } = useI18n()
  const { renameAccount, institutionsById } = useData()
  const r = t.accounts.rename
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const institution = institutionsById.get(account.institutionId)
  const [name, setName] = useState(account.nickname ?? '')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const clean = cleanName(name)
  // The bank's own name, typed back in, needs nothing stored.
  const value = clean && clean !== bankLabel ? clean : null
  const changed = value !== (account.nickname ?? null)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  const save = async () => {
    if (!changed || saving) return
    setSaving(true)
    setFailed(false)
    try {
      await renameAccount(account.id, value)
      onSaved({ accountId: account.id, before: account.nickname ?? null, after: value, shownAs: `${institution?.name ?? ''} · ${value ?? bankLabel}` })
    } catch {
      setFailed(true)
      setSaving(false)
    }
  }

  const footer = (
    <div className="-mx-4 mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 border-t border-line px-4 pt-3 md:-mx-6 md:flex md:justify-end md:px-6 md:pt-4">
      <button
        type="button"
        onClick={onClose}
        disabled={saving}
        className="h-12 rounded-md border border-line bg-surface text-[15px] font-medium text-ink hover:bg-track disabled:opacity-60 md:h-11 md:w-[140px] md:text-sm"
      >
        {r.cancel}
      </button>
      <button
        type="submit"
        form={`${id}-form`}
        disabled={!changed || saving}
        aria-busy={saving}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-accent text-[15px] font-medium text-surface disabled:opacity-40 md:h-11 md:w-[160px] md:text-sm"
      >
        {saving && <Icon name="sync" className="size-[18px] motion-safe:animate-spin" strokeWidth={2} />}
        {saving ? r.saving : r.save}
      </button>
    </div>
  )

  return (
    <Sheet title={r.title} onClose={saving ? () => {} : onClose} footer={footer}>
      <form
        id={`${id}-form`}
        className="mt-2 flex flex-col"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        {failed && (
          <p role="alert" className="mb-3 flex items-start gap-2 rounded-md border border-critical/30 bg-critical-soft px-3 py-2.5 text-[13px] leading-[18px] text-ink">
            <Icon name="alert" className="mt-px size-4 shrink-0 text-critical" />
            {r.failed}
          </p>
        )}
        <div className="flex flex-col gap-1.5 rounded-md bg-page px-3 py-2.5">
          <span className="label-caps">{r.bankNameLabel}</span>
          <span className="flex min-w-0 items-center gap-2.5">
            {institution && <InstitutionBadge institution={institution} size={32} />}
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[15px] leading-5 text-ink">{bankLabel}</span>
              <span className="truncate text-xs leading-4 text-muted">
                {institution?.name} · {bankLabel.toLocaleLowerCase('pt-BR')}
              </span>
            </span>
          </span>
        </div>

        <label htmlFor={id} className="mt-4 mb-1.5 text-[13px] leading-[18px] text-ink-2">
          {r.label}
        </label>
        <span className="relative flex">
          <input
            ref={input}
            id={id}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={bankLabel}
            maxLength={NICKNAME_MAX}
            readOnly={saving}
            autoComplete="off"
            aria-describedby={`${id}-note`}
            className={`h-12 w-full rounded-md border bg-surface pr-12 pl-3.5 text-[16px] text-ink outline-none placeholder:text-muted focus:border-2 focus:border-accent focus:pl-[13px] ${
              saving ? 'border-line bg-page text-ink-2' : 'border-line'
            }`}
          />
          {name && !saving && (
            <button
              type="button"
              onClick={() => {
                setName('')
                input.current?.focus()
              }}
              aria-label={r.clear}
              className="absolute top-0.5 right-0.5 flex size-11 items-center justify-center rounded-md text-ink-2 hover:bg-track"
            >
              <Icon name="close" className="size-[18px]" />
            </button>
          )}
        </span>
        <span id={`${id}-note`} className="mt-1.5 flex justify-between gap-3 text-xs leading-4 text-muted">
          <span>{clean ? r.note : r.emptyNote}</span>
          <span className="tabular shrink-0" aria-hidden>
            {name.length}/{NICKNAME_MAX}
          </span>
        </span>
        {name && !saving && (
          <button
            type="button"
            onClick={() => {
              setName('')
              input.current?.focus()
            }}
            className="mt-2 -ml-2 inline-flex h-11 items-center gap-1.5 self-start rounded-md px-2 text-sm font-medium text-accent hover:bg-accent-faint"
          >
            <Icon name="undo" className="size-[18px]" />
            {r.useBank}
          </button>
        )}
      </form>
    </Sheet>
  )
}

/** After a rename: "Apelido salvo" / "Nome do banco restaurado", what it's called now, and Desfazer, for 6 s. */
function RenamedToast({ renamed, onDone }: { renamed: Renamed; onDone(): void }) {
  const { t } = useI18n()
  const { renameAccount } = useData()
  const r = t.accounts.rename
  const [undoing, setUndoing] = useState(false)
  useEffect(() => {
    if (undoing) return
    const timer = setTimeout(onDone, 6000)
    return () => clearTimeout(timer)
  }, [undoing, onDone])
  const undo = async () => {
    setUndoing(true)
    await renameAccount(renamed.accountId, renamed.before).catch(() => {})
    onDone()
  }
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(86px+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-[480px] px-3 lg:bottom-6 lg:left-[248px] lg:mx-0 lg:max-w-[440px] lg:px-6">
      <div role="status" className="pointer-events-auto flex min-h-14 w-full items-center gap-2.5 rounded-md bg-ink py-1.5 pr-1 pl-4 text-page shadow-lg">
        <Icon name="check" className="size-[18px] shrink-0" strokeWidth={2} />
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="text-sm leading-[19px] font-medium">{renamed.after ? r.saved : r.restored}</span>
          <span className="truncate text-[13px] leading-[18px] opacity-80">{renamed.shownAs}</span>
        </span>
        <button type="button" onClick={undo} disabled={undoing} className="h-11 shrink-0 rounded-sm px-3 text-sm font-bold disabled:opacity-60">
          {r.undo}
        </button>
      </div>
    </div>
  )
}
