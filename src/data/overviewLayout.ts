/**
 * The Visão geral's layout: the order of its cards and the ones hidden.
 * Shared by the app and the server (src/data/edits.ts, server/db/categories.ts),
 * so it imports types only.
 */
import type { OverviewLayout, OverviewSection } from './types.js'

export type { OverviewLayout, OverviewSection }

/** Every card of the Visão geral, in the default (phone) order. */
export const OVERVIEW_SECTIONS: readonly OverviewSection[] = [
  'netWorth',
  'balance',
  'projection',
  'unusual',
  'recurring',
  'whereMoney',
  'comingUp',
  'incomeVsExpenses',
  'spendingByCategory',
  'averageIncome',
  'monthInDetail',
]

export const DEFAULT_LAYOUT: OverviewLayout = { order: [...OVERVIEW_SECTIONS], hidden: [] }

export const isSection = (v: unknown): v is OverviewSection => typeof v === 'string' && (OVERVIEW_SECTIONS as readonly string[]).includes(v)

/** A stored layout made whole: unknown or repeated cards dropped, cards it doesn't list (added later) at their default place. */
export function normalizeLayout(v: unknown): OverviewLayout {
  const x = (v ?? {}) as { order?: unknown; hidden?: unknown }
  const order = [...new Set(Array.isArray(x.order) ? x.order.filter(isSection) : [])]
  for (const [i, s] of OVERVIEW_SECTIONS.entries()) {
    if (order.includes(s)) continue
    // After the card that comes before it by default, or first.
    const before = OVERVIEW_SECTIONS.slice(0, i).reverse().find((p) => order.includes(p))
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, s)
  }
  const hidden = [...new Set(Array.isArray(x.hidden) ? x.hidden.filter(isSection) : [])]
  return { order, hidden: OVERVIEW_SECTIONS.filter((s) => hidden.includes(s)) }
}

/** Whether a value is a complete, valid layout (what an edit must carry). */
export function isLayout(v: unknown): v is OverviewLayout {
  const x = (v ?? {}) as { order?: unknown; hidden?: unknown }
  if (!Array.isArray(x.order) || !Array.isArray(x.hidden)) return false
  if (x.order.length !== OVERVIEW_SECTIONS.length || !x.order.every(isSection) || new Set(x.order).size !== x.order.length) return false
  return x.hidden.length <= OVERVIEW_SECTIONS.length && x.hidden.every(isSection) && new Set(x.hidden).size === x.hidden.length
}

export const isDefaultLayout = (l: OverviewLayout) => l.hidden.length === 0 && l.order.every((s, i) => s === OVERVIEW_SECTIONS[i])

/** The cards shown, in order. */
export const shownSections = (l: OverviewLayout) => l.order.filter((s) => !l.hidden.includes(s))

/** Moves a card one place up (−1) or down (+1). */
export function moveSection(l: OverviewLayout, s: OverviewSection, by: -1 | 1): OverviewLayout {
  const i = l.order.indexOf(s)
  const j = i + by
  if (i < 0 || j < 0 || j >= l.order.length) return l
  const order = [...l.order]
  ;[order[i], order[j]] = [order[j], order[i]]
  return { ...l, order }
}

/** Shows or hides a card. */
export function setSectionHidden(l: OverviewLayout, s: OverviewSection, hidden: boolean): OverviewLayout {
  const set = new Set(l.hidden)
  if (hidden) set.add(s)
  else set.delete(s)
  return { ...l, hidden: OVERVIEW_SECTIONS.filter((x) => set.has(x)) }
}

/**
 * Desktop widths (of 12 columns) for cards in a custom order: each keeps its
 * usual width, rows fill in order, and the last card of a row widens to the
 * end of it, so no row has a gap.
 */
export function fillRows(spans: number[], columns = 12): number[] {
  const out = [...spans]
  let used = 0
  for (let i = 0; i < out.length; i++) {
    if (used > 0 && used + out[i] > columns) {
      out[i - 1] += columns - used
      used = 0
    }
    used += out[i]
  }
  if (out.length) out[out.length - 1] += columns - used
  return out
}
