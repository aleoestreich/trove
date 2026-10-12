import { describe, expect, it } from 'vitest'
import { applyEdit, EditError, validateEdit } from './edits'
import { DEFAULT_LAYOUT, fillRows, OVERVIEW_SECTIONS, isDefaultLayout, isLayout, moveSection, normalizeLayout, setSectionHidden, shownSections } from './overviewLayout'
import type { OverviewLayout, Snapshot } from './types'

const custom = (): OverviewLayout => ({ order: ['balance', ...OVERVIEW_SECTIONS.filter((s) => s !== 'balance')], hidden: ['unusual'] })

describe('Visão geral layout', () => {
  it('starts in the default order with every card shown', () => {
    expect(normalizeLayout(undefined)).toEqual(DEFAULT_LAYOUT)
    expect(isDefaultLayout(DEFAULT_LAYOUT)).toBe(true)
    expect(shownSections(DEFAULT_LAYOUT)).toEqual(OVERVIEW_SECTIONS)
  })

  it('moves a card up or down, never past the ends', () => {
    const up = moveSection(DEFAULT_LAYOUT, 'projection', -1)
    expect(up.order.slice(0, 3)).toEqual(['netWorth', 'projection', 'balance'])
    expect(moveSection(up, 'projection', 1)).toEqual(DEFAULT_LAYOUT)
    expect(moveSection(DEFAULT_LAYOUT, 'netWorth', -1)).toBe(DEFAULT_LAYOUT)
    expect(moveSection(DEFAULT_LAYOUT, 'monthInDetail', 1)).toBe(DEFAULT_LAYOUT)
  })

  it('hides and shows cards, keeping their place', () => {
    let l = setSectionHidden(DEFAULT_LAYOUT, 'recurring', true)
    l = setSectionHidden(l, 'netWorth', true)
    expect(l.hidden).toEqual(['netWorth', 'recurring'])
    expect(l.order).toEqual(DEFAULT_LAYOUT.order)
    expect(shownSections(l)).not.toContain('recurring')
    expect(isDefaultLayout(l)).toBe(false)
    expect(setSectionHidden(setSectionHidden(l, 'recurring', false), 'netWorth', false)).toEqual(DEFAULT_LAYOUT)
  })

  it('makes a stored layout whole: unknown and repeated cards dropped, missing ones at their default place', () => {
    expect(normalizeLayout({ order: ['monthInDetail', 'old', 'netWorth', 'netWorth'], hidden: ['old', 'unusual', 'unusual'] })).toEqual({
      order: ['monthInDetail', 'netWorth', 'balance', 'projection', 'unusual', 'recurring', 'whereMoney', 'comingUp', 'incomeVsExpenses', 'spendingByCategory', 'averageIncome'],
      hidden: ['unusual'],
    })
    expect(normalizeLayout({ order: 'x', hidden: null })).toEqual(DEFAULT_LAYOUT)
    expect(normalizeLayout(custom())).toEqual(custom())
  })

  it('accepts only complete layouts as an edit', () => {
    expect(validateEdit({ op: 'setOverviewLayout', layout: { ...custom(), extra: 1 } })).toEqual({ op: 'setOverviewLayout', layout: custom() })
    expect(isLayout(custom())).toBe(true)
    const bad = [
      { order: OVERVIEW_SECTIONS.slice(1), hidden: [] },
      { order: [...OVERVIEW_SECTIONS.slice(1), 'netWorth', 'netWorth'], hidden: [] },
      { order: [...OVERVIEW_SECTIONS.slice(1), 'other'], hidden: [] },
      { order: [...OVERVIEW_SECTIONS], hidden: ['other'] },
      { order: [...OVERVIEW_SECTIONS], hidden: ['unusual', 'unusual'] },
      { order: [...OVERVIEW_SECTIONS] },
      null,
    ]
    for (const layout of bad) expect(() => validateEdit({ op: 'setOverviewLayout', layout }), JSON.stringify(layout)).toThrow(EditError)
  })

  it('applies the edit to the snapshot', () => {
    const s: Snapshot = { institutions: [], accounts: [], categories: [], subcategories: [], transactions: [], source: 'demo' }
    expect(applyEdit(s, { op: 'setOverviewLayout', layout: custom() }).overviewLayout).toEqual(custom())
  })

  it('fills desktop rows in order, widening the last card of each row', () => {
    expect(fillRows([8, 4, 7, 12, 6, 6])).toEqual([8, 4, 12, 12, 6, 6])
    expect(fillRows([7, 4, 4, 8])).toEqual([7, 5, 4, 8])
    expect(fillRows([4])).toEqual([12])
    expect(fillRows([])).toEqual([])
  })
})
