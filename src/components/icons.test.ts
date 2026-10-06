import { describe, expect, it } from 'vitest'
import { CATEGORY_COLORS, CATEGORY_ICONS, DEFAULT_CATEGORIES } from '../data/categoryCatalog'
import catalog from '../assets/icons/categories/categories.json'
import { UI_ICONS, categoryIconFiles, uiIconFiles } from './Icon'
import { readFileSync } from 'node:fs'

describe('icon pack', () => {
  it('has a UI icon for every name in UI_ICONS, and the other way round', () => {
    expect([...uiIconFiles()].sort()).toEqual([...UI_ICONS].sort())
  })

  it('has a file for each of the 54 category icons, in the catalogue', () => {
    expect(CATEGORY_ICONS).toHaveLength(54)
    expect([...categoryIconFiles()].sort()).toEqual([...CATEGORY_ICONS].sort())
  })

  it('keeps the generated catalogue in sync with categories.json', () => {
    expect([...CATEGORY_COLORS]).toEqual(Object.keys(catalog.colors))
    expect([...CATEGORY_ICONS]).toEqual(catalog.icons.flatMap((g) => g.icons.map((i) => i.key)))
    expect(DEFAULT_CATEGORIES.map((c) => c.id)).toEqual(catalog.defaultCategories.map((c) => c.id))
  })

  it('defines a light and a dark token for every category colour', () => {
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
    for (const key of CATEGORY_COLORS) expect(css.match(new RegExp(`--cat-${key}:`, 'g'))).toHaveLength(3) // light, dark (media), dark (data-theme)
  })
})
