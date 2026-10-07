// Default category and subcategory names in the active language. The defaults
// are seeded once, in the language active on first run; a default that still
// has its seeded name (in either language) is shown in the active language.
// A renamed one, and any category or subcategory created in the app, shows
// its stored name.

import { DEFAULT_CATEGORIES } from './categoryCatalog.js'
import type { Category, Subcategory } from './types.js'

type Lang = 'en' | 'pt'

const same = (a: string, b: string) => a.trim().toLocaleLowerCase('pt-BR') === b.toLocaleLowerCase('pt-BR')
const byId = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c]))

export function localizeCategories(
  categories: Category[],
  subcategories: Subcategory[],
  lang: Lang,
): { categories: Category[]; subcategories: Subcategory[] } {
  return {
    categories: categories.map((c) => {
      const d = byId.get(c.id)
      return d && (same(c.name, d.name.en) || same(c.name, d.name.pt)) ? { ...c, name: d.name[lang] } : c
    }),
    subcategories: subcategories.map((s) => {
      // Default subcategories have generated IDs: matched by name within their default category.
      const d = byId.get(s.categoryId)?.subcategories.find((n) => same(s.name, n.en) || same(s.name, n.pt))
      return d ? { ...s, name: d[lang] } : s
    }),
  }
}
