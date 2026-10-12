import { useMemo, useState } from 'react'
import { useData } from '../../state'
import { useI18n } from '../../i18n/I18nProvider'
import { Sheet } from '../insights/parts'
import { InfoNote, RadioRow } from './TargetSheet'
import type { Category, SpendingGroup, Subcategory } from '../../data/types'
import { formatMonthName, lastMonths, monthKey } from '../../lib/dates'
import { formatMoney } from '../../lib/money'

/** Cancelar and Salvar, with the failure above them. */
function Buttons({ saving, failed, disabled, onCancel, onSave }: { saving: boolean; failed: string | null; disabled: boolean; onCancel(): void; onSave(): void }) {
  const { t } = useI18n()
  const c = t.spendingBalance.cats
  return (
    <div className="mt-4 flex flex-col gap-2">
      {failed && (
        <p role="alert" className="text-[13px] leading-[18px] text-critical">
          {failed}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={onCancel} className="h-12 rounded-md border border-line bg-surface text-[15px] font-medium text-accent hover:bg-track">
          {c.cancel}
        </button>
        <button type="button" onClick={onSave} disabled={saving || disabled} className="h-12 rounded-md bg-accent text-[15px] font-medium text-surface active:opacity-80 disabled:opacity-60">
          {c.save}
        </button>
      </div>
    </div>
  )
}

/** Saves through `run` (server first); keeps the sheet open with the message when it fails. */
function useSave(run: () => Promise<void>, onClose: () => void): [boolean, string | null, () => Promise<void>] {
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  return [
    saving,
    failed,
    async () => {
      setSaving(true)
      setFailed(null)
      try {
        await run()
        onClose()
      } catch (e) {
        setFailed(e instanceof Error ? e.message : String(e))
        setSaving(false)
      }
    },
  ]
}

/** "Grupo de Pets": Essencial or Estilo de vida, for a category with none yet ("Escolher"). */
export function CategoryGroupSheet({ category, onClose }: { category: Category; onClose(): void }) {
  const { t } = useI18n()
  const b = t.spendingBalance
  const { saveCategoryGroups } = useData()
  const [group, setGroup] = useState<SpendingGroup | null>(category.group ?? null)
  const [saving, failed, save] = useSave(() => saveCategoryGroups([{ categoryId: category.id, group }]), onClose)
  return (
    <Sheet
      title={b.cats.pickTitle(category.name)}
      subtitle={b.cats.pickSub}
      onClose={onClose}
      footer={<Buttons saving={saving} failed={failed} disabled={!group || group === (category.group ?? null)} onCancel={onClose} onSave={save} />}
    >
      <div role="radiogroup" aria-label={b.cats.field} className="mt-2 flex flex-col">
        {(['essential', 'lifestyle'] as const).map((g) => (
          <RadioRow key={g} checked={group === g} title={b.groups[g]} note={b.org.help[g]} onSelect={() => setGroup(g)} />
        ))}
      </div>
    </Sheet>
  )
}

/**
 * "Grupo de Apps de corrida": the same as its category (and changing with
 * it), or always Essencial, or always Estilo de vida. Says how much the
 * subcategory had last month, the part that moves.
 */
export function SubcategoryGroupSheet({ subcategory, category, onClose }: { subcategory: Subcategory; category: Category; onClose(): void }) {
  const { t } = useI18n()
  const b = t.spendingBalance
  const c = b.cats
  const { saveSubcategoryGroup, allTransactions, today } = useData()
  const [group, setGroup] = useState<SpendingGroup | null>(subcategory.group ?? null)
  const [saving, failed, save] = useSave(() => saveSubcategoryGroup(subcategory.id, group), onClose)
  const lastMonth = lastMonths(monthKey(today), 2)[0]
  const spent = useMemo(
    () => allTransactions.filter((x) => !x.hidden && !x.transfer && x.subcategoryId === subcategory.id && monthKey(x.date) === lastMonth).reduce((s, x) => s - x.amount, 0),
    [allTransactions, subcategory.id, lastMonth],
  )
  return (
    <Sheet
      title={c.subTitle(subcategory.name)}
      subtitle={c.subSub(category.name)}
      onClose={onClose}
      footer={<Buttons saving={saving} failed={failed} disabled={group === (subcategory.group ?? null)} onCancel={onClose} onSave={save} />}
    >
      <div className="mt-2 flex flex-col gap-3">
        <div role="radiogroup" aria-label={c.field} className="flex flex-col">
          <RadioRow checked={group === null} title={c.same(category.name)} note={c.sameNote(category.group ? b.groups[category.group] : null)} onSelect={() => setGroup(null)} />
          {(['essential', 'lifestyle'] as const).map((g) => (
            <RadioRow key={g} checked={group === g} title={b.groups[g]} note={c.always(b.groups[g])} onSelect={() => setGroup(g)} />
          ))}
        </div>
        {spent > 0 && <InfoNote>{c.subInfo(subcategory.name, formatMonthName(lastMonth), formatMoney(spent))}</InfoNote>}
      </div>
    </Sheet>
  )
}
