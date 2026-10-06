import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addCategory, addSubcategory, applyUserCategories, clearUserCategories, deleteCategory, deleteSubcategory, readUserCategories, renameSubcategory, saveSubcategory } from './userCategories'
import { applyOverrides, clearOverrides, saveOverride } from './overrides'
import { categories } from './categories'
import type { Snapshot, Transaction } from './types'

/** In-memory localStorage (tests run in Node). */
const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
})

const tx = (id: string, categoryId: string): Transaction => ({ id, accountId: 'a', date: '2026-10-01', description: 'POSTO EXEMPLO', amount: -150_00, categoryId, status: 'POSTED' })
const snapshot = (): Snapshot => ({ institutions: [], accounts: [], categories, transactions: [tx('t1', 'transport'), tx('t2', 'transport'), tx('t3', 'housing')], source: 'demo' })

beforeEach(() => {
  clearUserCategories()
  clearOverrides()
})

describe('subcategories', () => {
  it('adds subcategories to a built-in category and sets them on transactions', () => {
    const fuel = addSubcategory('transport', 'Combustível')!
    addSubcategory('transport', 'Estacionamento')
    saveSubcategory('t1', fuel.id)
    const out = applyUserCategories(snapshot())
    expect(out.subcategories.map((s) => s.name)).toEqual(['Combustível', 'Estacionamento'])
    expect(out.transactions.map((t) => t.subcategoryId ?? null)).toEqual([fuel.id, null, null])
  })

  it('refuses an empty name or one already used in the same category (any case)', () => {
    addSubcategory('transport', 'Multas')
    expect(addSubcategory('transport', '  multas ')).toBeNull()
    expect(addSubcategory('transport', '   ')).toBeNull()
    expect(addSubcategory('housing', 'Multas')).not.toBeNull()
  })

  it('ignores a subcategory once the transaction is in another category', () => {
    const fuel = addSubcategory('transport', 'Combustível')!
    saveSubcategory('t3', fuel.id) // t3 is Housing
    expect(applyUserCategories(snapshot()).transactions[2].subcategoryId).toBeUndefined()
  })

  it('renames, and deleting one leaves its transactions in the category', () => {
    const fuel = addSubcategory('transport', 'Combustivel')!
    expect(renameSubcategory(fuel.id, 'Combustível')).toBe(true)
    saveSubcategory('t1', fuel.id)
    deleteSubcategory(fuel.id)
    const out = applyUserCategories(snapshot())
    expect(out.subcategories).toEqual([])
    expect(out.transactions[0]).toMatchObject({ categoryId: 'transport' })
    expect(out.transactions[0].subcategoryId).toBeUndefined()
  })
})

describe('the owner’s own categories', () => {
  it('creates one with its type and icon, and refuses a name already used', () => {
    const pets = addCategory('Pets', 'expense', 'health', categories)!
    expect(pets).toMatchObject({ name: 'Pets', kind: 'expense', icon: 'health', custom: true })
    expect(addCategory('pets', 'expense', 'other', [...categories, pets])).toBeNull()
    expect(applyUserCategories(snapshot()).categories.at(-1)).toEqual(pets)
  })

  it('deleting one removes its subcategories and sends its transactions back to their original category', () => {
    const pets = addCategory('Pets', 'expense', 'health', categories)!
    const vet = addSubcategory(pets.id, 'Veterinário')!
    saveOverride('t1', pets.id)
    saveSubcategory('t1', vet.id)
    deleteCategory(pets.id)
    expect(readUserCategories()).toEqual({ categories: [], subcategories: [] })
    const out = applyUserCategories(applyOverrides(snapshot()))
    expect(out.transactions[0].categoryId).toBe('transport')
    expect(out.transactions[0].subcategoryId).toBeUndefined()
  })
})
