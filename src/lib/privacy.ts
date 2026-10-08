// Privacy mode ("Ocultar valores"): for opening Trove in public. Amounts,
// percentages, charts and transaction descriptions are blurred on screen
// (index.css, `:root[data-privacy]`). Saved on this device only; when the
// device can't store it, the mode still works until the page reloads.

import { useSyncExternalStore } from 'react'

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

/** Sets the attribute the CSS keys on. Called once before the first render, so nothing shows unblurred. */
export function applyPrivacy() {
  if (on) document.documentElement.dataset.privacy = 'on'
  else delete document.documentElement.dataset.privacy
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
