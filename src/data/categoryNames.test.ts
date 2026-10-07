import { describe, expect, it } from 'vitest'
import { localizeCategories } from './categoryNames'
import type { Category, Subcategory } from './types'

const cat = (id: string, name: string): Category => ({ id, name, type: 'expense', color: 'green', icon: 'heart', sortOrder: 0 }) as Category
const sub = (id: string, categoryId: string, name: string): Subcategory => ({ id, categoryId, name, sortOrder: 0 }) as Subcategory

describe('category names', () => {
  const categories = [cat('health', 'Saúde'), cat('home', 'Casa da praia'), cat('a1b2', 'Pets')]
  const subcategories = [sub('s1', 'health', 'Farmácia'), sub('s2', 'health', 'Terapia em grupo'), sub('s3', 'home', 'Rent')]

  it('shows default names in the active language, whichever language seeded them', () => {
    const en = localizeCategories(categories, subcategories, 'en')
    expect(en.categories.map((c) => c.name)).toEqual(['Health', 'Casa da praia', 'Pets'])
    expect(en.subcategories.map((s) => s.name)).toEqual(['Pharmacy', 'Terapia em grupo', 'Rent'])
    const pt = localizeCategories(en.categories, en.subcategories, 'pt')
    expect(pt.categories.map((c) => c.name)).toEqual(['Saúde', 'Casa da praia', 'Pets'])
    expect(pt.subcategories.map((s) => s.name)).toEqual(['Farmácia', 'Terapia em grupo', 'Aluguel'])
  })

  it('keeps renamed defaults and created categories as stored', () => {
    const { categories: out } = localizeCategories([cat('home', 'Casa da praia'), cat('x', 'Health')], [], 'pt')
    expect(out.map((c) => c.name)).toEqual(['Casa da praia', 'Health'])
  })
})
