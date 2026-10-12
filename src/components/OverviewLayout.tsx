import { useState } from 'react'
import { useData } from '../state'
import { useI18n } from '../i18n/I18nProvider'
import { Icon } from './Icon'
import { Sheet } from './insights/parts'
import { DEFAULT_LAYOUT, isDefaultLayout, moveSection, setSectionHidden, shownSections, type OverviewLayout } from '../data/overviewLayout'

const sameLayout = (a: OverviewLayout, b: OverviewLayout) => a.order.join() === b.order.join() && a.hidden.join() === b.hidden.join()

/** "Personalizar": opens the sheet. An icon in the phone header (next to the privacy eye); a text button next to the desktop title. */
export function CustomizeButton({ onClick, compact = false }: { onClick(): void; compact?: boolean }) {
  const { t } = useI18n()
  const l = t.overview.layout
  if (compact)
    return (
      <button type="button" onClick={onClick} aria-label={l.title} className="flex size-11 items-center justify-center rounded-full text-ink-2 hover:bg-track active:bg-track">
        <Icon name="sliders" className="size-[22px]" />
      </button>
    )
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3.5 text-sm font-medium whitespace-nowrap text-accent hover:bg-track"
    >
      <Icon name="sliders" className="size-[18px]" />
      {l.open}
    </button>
  )
}

/**
 * The Visão geral's cards: each one moves up or down and shows or hides.
 * Saved in the database on "Salvar", so every device gets the same page.
 * A bottom sheet on phones, a centred dialog from tablets up.
 */
export function OverviewLayoutSheet({ onClose }: { onClose(): void }) {
  const { t } = useI18n()
  const l = t.overview.layout
  const { overviewLayout, saveOverviewLayout } = useData()
  const [layout, setLayout] = useState(overviewLayout)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const change = (next: OverviewLayout) => {
    setLayout(next)
    setFailed(false)
  }
  const save = async () => {
    setSaving(true)
    setFailed(false)
    try {
      await saveOverviewLayout(layout)
      onClose()
    } catch {
      setFailed(true)
      setSaving(false)
    }
  }
  const last = layout.order.length - 1

  return (
    <Sheet
      title={l.title}
      subtitle={l.sub}
      onClose={onClose}
      footer={
        <div className="sticky bottom-0 -mx-4 mt-2 flex flex-col gap-2 border-t border-line bg-surface px-4 pt-3 md:-mx-6 md:px-6">
          {failed && (
            <p role="alert" className="text-[13px] leading-[18px] text-critical">
              {l.failed}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={onClose} className="h-12 rounded-md border border-line bg-surface text-[15px] font-medium text-accent hover:bg-track">
              {l.cancel}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || sameLayout(layout, overviewLayout)}
              className="h-12 rounded-md bg-accent text-[15px] font-medium text-surface active:opacity-80 disabled:opacity-60"
            >
              {l.save}
            </button>
          </div>
        </div>
      }
    >
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="tabular text-xs leading-4 text-muted">{l.shownCount(shownSections(layout).length, layout.order.length)}</span>
        <button
          type="button"
          onClick={() => change(DEFAULT_LAYOUT)}
          disabled={isDefaultLayout(layout)}
          className="-mr-2 inline-flex h-11 items-center gap-1.5 rounded-sm px-2 text-sm font-medium text-accent hover:bg-accent-faint disabled:text-muted disabled:hover:bg-transparent"
        >
          <Icon name="undo" className="size-4" />
          {l.reset}
        </button>
      </div>
      <ol className="flex flex-col divide-y divide-line border-y border-line">
        {layout.order.map((x, i) => {
          const name = l.sections[x]
          const hidden = layout.hidden.includes(x)
          return (
            <li key={x} className="flex min-h-14 items-center gap-1">
              <button
                type="button"
                role="switch"
                aria-checked={!hidden}
                aria-label={l.show(name)}
                onClick={() => change(setSectionHidden(layout, x, !hidden))}
                className="-ml-1 flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-sm pl-1 text-left"
              >
                <span
                  aria-hidden
                  className={`flex h-7 w-[46px] shrink-0 items-center rounded-full border-2 px-[3px] transition-colors ${hidden ? 'border-muted bg-track' : 'justify-end border-accent bg-accent'}`}
                >
                  <span className={`rounded-full transition-all ${hidden ? 'size-3.5 bg-muted' : 'size-5 bg-surface'}`} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className={`text-[15px] leading-5 break-words ${hidden ? 'text-muted' : 'text-ink'}`}>{name}</span>
                  {hidden && <span className="text-xs leading-4 text-muted">{l.hiddenTag}</span>}
                </span>
              </button>
              <MoveButton icon="arrowUp" label={l.moveUp(name)} disabled={i === 0} onClick={() => change(moveSection(layout, x, -1))} />
              <MoveButton icon="arrowDown" label={l.moveDown(name)} disabled={i === last} onClick={() => change(moveSection(layout, x, 1))} />
            </li>
          )
        })}
      </ol>
    </Sheet>
  )
}

function MoveButton({ icon, label, disabled, onClick }: { icon: 'arrowUp' | 'arrowDown'; label: string; disabled: boolean; onClick(): void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 shrink-0 items-center justify-center rounded-md text-ink-2 hover:bg-track active:bg-track disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <Icon name={icon} className="size-5" strokeWidth={2} />
    </button>
  )
}
