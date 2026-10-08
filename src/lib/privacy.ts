// Privacy mode ("Ocultar valores"): for opening Trove in public. Every
// amount and percentage reads "R$ •••••" (the formatters in money.ts), with
// no sign or green/red; charts become one generic pattern labelled "Gráfico
// oculto", without legends; progress bars show no proportion (index.css,
// `:root[data-privacy]`). Names and categories stay. The screens remount on
// a change (App.tsx), so everything is formatted again. Saved on this device
// only; when the device can't store it, the mode still works until the page
// reloads.

import { useSyncExternalStore } from 'react'
import { messages } from '../i18n/messages'
import { setMoneyMasked } from './money'

const KEY = 'trove.privacy'
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
}

let on = typeof window === 'undefined' ? false : read()

/** Masks the formatters and sets the attribute the CSS keys on. Called once before the first render, so nothing shows unmasked. */
export function applyPrivacy() {
  setMoneyMasked(on)
  const root = document.documentElement
  root.style.setProperty('--chart-hidden-label', JSON.stringify(messages.privacy.chartHidden))
  if (on) root.dataset.privacy = 'on'
  else delete root.dataset.privacy
}

export function setPrivacy(value: boolean) {
  on = value
  try {
    if (value) localStorage.setItem(KEY, 'on')
    else localStorage.removeItem(KEY)
  } catch {
    // Not stored (private window, blocked storage): it still applies now.
  }
  applyPrivacy()
  for (const l of listeners) l()
}

/** Whether values are hidden, and the switch. */
export function usePrivacy(): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => on,
  )
  return [value, setPrivacy]
}
